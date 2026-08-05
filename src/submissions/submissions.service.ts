import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnalysisService } from '../analysis/analysis.service';
import {
  EVIDENCE_FIELDS,
  PROJECT_FIELD,
  RUBRIC,
  RUBRIC_CRITERIA,
} from '../analysis/rubric/rubric';
import { EnvironmentVariables } from '../common/config/env.validation';
import { StorageService } from '../storage/storage.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import {
  AnalysisStatus,
  StoredFile,
  SubmissionDocument,
} from './schemas/submission.schema';
import { SubmissionsRepository } from './submissions.repository';

export type UploadedFiles = Record<string, Express.Multer.File[] | undefined>;

/** Shape returned to the client — presigned URLs are added, keys are not exposed. */
export interface SubmissionView {
  id: string;
  submitter: CreateSubmissionDto;
  status: AnalysisStatus;
  createdAt: Date;
  attempts: number;
  failureReason: string | null;
  report: { filename: string; url: string };
  evidence: {
    criterionCode: string | null;
    criterionTitle: string | null;
    filename: string;
    url: string;
  }[];
  analysis: SubmissionDocument['analysis'];
}

const RETRY_BASE_DELAY_MS = 2_000;

@Injectable()
export class SubmissionsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SubmissionsService.name);
  private readonly maxAttempts: number;

  constructor(
    private readonly repository: SubmissionsRepository,
    private readonly storage: StorageService,
    private readonly analysis: AnalysisService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.maxAttempts = config.get('ANALYSIS_MAX_ATTEMPTS', { infer: true });
  }

  /**
   * Analyses run in the background, so a crash or redeploy mid-run would strand
   * a submission in `processing` forever. On boot, anything still unfinished is
   * picked back up.
   */
  async onApplicationBootstrap(): Promise<void> {
    const stuck = await this.repository.findStuck();
    if (stuck.length === 0) {
      return;
    }

    this.logger.log(`Resuming ${stuck.length} unfinished analysis run(s)`);
    for (const submission of stuck) {
      void this.runAnalysis(String(submission._id));
    }
  }

  /** The form definition the client renders from — keeps the rubric in one place. */
  getFormSchema() {
    return {
      projectField: PROJECT_FIELD,
      maxTotalScore: RUBRIC.reduce((sum, d) => sum + d.weight, 0),
      dimensions: RUBRIC.map((dimension) => ({
        index: dimension.index,
        title: dimension.title,
        weight: dimension.weight,
        criteria: dimension.criteria.map((criterion) => ({
          code: criterion.code,
          field: criterion.field,
          title: criterion.title,
          evidenceRequirement: criterion.evidenceRequirement,
        })),
      })),
    };
  }

  async create(
    dto: CreateSubmissionDto,
    files: UploadedFiles,
  ): Promise<{ id: string; status: AnalysisStatus }> {
    const report = files[PROJECT_FIELD]?.[0];
    if (!report) {
      throw new BadRequestException('กรุณาแนบไฟล์สรุปโครงการ (PDF)');
    }

    // Upload the report and every evidence file before creating the document,
    // so a submission never exists pointing at objects that failed to store.
    const reportFile: StoredFile = {
      key: await this.storage.upload(report.buffer, report.mimetype),
      filename: report.originalname,
      mimetype: report.mimetype,
      size: report.size,
    };

    const evidence: StoredFile[] = [];
    for (const criterion of RUBRIC_CRITERIA) {
      for (const file of files[criterion.field] ?? []) {
        evidence.push({
          key: await this.storage.upload(file.buffer, file.mimetype),
          filename: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          criterionCode: criterion.code,
        });
      }
    }

    const submission = await this.repository.create({
      submitter: dto,
      report: reportFile,
      evidence,
      status: AnalysisStatus.Pending,
    });

    this.logger.log(
      `Stored submission ${String(submission._id)} ("${dto.projectName}") with ${evidence.length} evidence file(s)`,
    );

    // Deliberately not awaited: grading takes tens of seconds and the browser
    // is holding a multipart upload open. The client polls for the result.
    void this.runAnalysis(String(submission._id));

    return { id: String(submission._id), status: AnalysisStatus.Pending };
  }

  async list(year: number): Promise<SubmissionView[]> {
    const submissions = await this.repository.findByYear(year);
    return Promise.all(submissions.map((doc) => this.toView(doc)));
  }

  async retry(id: string): Promise<{ id: string; status: AnalysisStatus }> {
    const submission = await this.repository.findById(id);
    if (!submission) {
      throw new NotFoundException(`Submission ${id} not found`);
    }
    if (submission.status === AnalysisStatus.Processing) {
      throw new BadRequestException('การวิเคราะห์กำลังทำงานอยู่');
    }

    await this.repository.resetForRetry(id);
    void this.runAnalysis(id);

    return { id, status: AnalysisStatus.Pending };
  }

  /**
   * Runs the analysis with bounded retries, then records the outcome.
   * Never throws: it is invoked without `await`, so an escaping rejection
   * would become an unhandled promise rejection.
   */
  async runAnalysis(id: string): Promise<void> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        const submission = await this.repository.markProcessing(id);
        if (!submission) {
          this.logger.error(`Submission ${id} vanished before analysis`);
          return;
        }

        const outcome = await this.analysis.analyze({
          projectName: submission.submitter.projectName,
          report: {
            filename: submission.report.filename,
            buffer: await this.storage.download(submission.report.key),
          },
          evidence: await Promise.all(
            submission.evidence.map(async (file) => ({
              criterionCode: file.criterionCode ?? '',
              filename: file.filename,
              buffer: await this.storage.download(file.key),
            })),
          ),
        });

        await this.repository.saveResult(id, outcome);
        this.logger.log(
          `Submission ${id} scored ${outcome.overallScore}/100 on attempt ${attempt}`,
        );
        return;
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(
          `Analysis attempt ${attempt}/${this.maxAttempts} failed for ${id}: ${lastError.message}`,
        );

        if (attempt < this.maxAttempts) {
          await this.sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
        }
      }
    }

    const reason = lastError?.message ?? 'Unknown analysis failure';
    await this.repository.markFailed(id, reason);
    this.logger.error(
      `Submission ${id} failed after ${this.maxAttempts} attempts: ${reason}`,
    );
  }

  private async toView(doc: SubmissionDocument): Promise<SubmissionView> {
    const titleByCode = new Map(
      RUBRIC_CRITERIA.map((criterion) => [criterion.code, criterion.title]),
    );

    return {
      id: String(doc._id),
      submitter: doc.submitter,
      status: doc.status,
      createdAt: doc.createdAt,
      attempts: doc.attempts,
      failureReason: doc.failureReason,
      report: {
        filename: doc.report.filename,
        url: await this.storage.getDownloadUrl(doc.report.key),
      },
      evidence: await Promise.all(
        doc.evidence.map(async (file) => ({
          criterionCode: file.criterionCode ?? null,
          criterionTitle: file.criterionCode
            ? (titleByCode.get(file.criterionCode) ?? null)
            : null,
          filename: file.filename,
          url: await this.storage.getDownloadUrl(file.key),
        })),
      ),
      analysis: doc.analysis,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/** Field definitions handed to multer — derived, never hand-maintained. */
export const UPLOAD_FIELDS = [
  { name: PROJECT_FIELD, maxCount: 1 },
  ...EVIDENCE_FIELDS.map((name) => ({ name, maxCount: 5 })),
];
