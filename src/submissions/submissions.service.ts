import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnalysisService } from '../analysis/analysis.service';
import {
  AWARD_TIERS,
  LEVEL_IDS_DESCENDING,
  levelById,
  MAX_TOTAL_SCORE,
  PROJECT_FIELD,
  RUBRIC,
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

/** Shape returned to the client — a presigned URL is added, the key is not exposed. */
export interface SubmissionView {
  id: string;
  submitter: CreateSubmissionDto;
  status: AnalysisStatus;
  createdAt: Date;
  attempts: number;
  failureReason: string | null;
  report: { filename: string; url: string };
  analysis: SubmissionDocument['analysis'];
}

const RETRY_BASE_DELAY_MS = 2_000;

/** How long a shutdown waits for in-flight analyses before giving up on them. */
const DRAIN_TIMEOUT_MS = 90_000;

@Injectable()
export class SubmissionsService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(SubmissionsService.name);
  private readonly maxAttempts: number;

  /** Background runs that have not settled yet. Drained on shutdown. */
  private readonly inFlight = new Set<Promise<void>>();

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
      this.track(this.runAnalysis(String(submission._id)));
    }
  }

  /**
   * Waits for analyses already running before letting the process exit.
   *
   * Grading is fire-and-forget, so without this every redeploy kills whatever
   * was mid-Gemini and strands the document in `processing`. It is recovered on
   * the next boot — by paying for the entire analysis a second time. Waiting a
   * minute or two is cheaper than that, and `enableShutdownHooks()` in
   * `main.ts` is what causes this to be called at all.
   *
   * The timeout is the point of `Promise.race`: a run wedged on a hung request
   * must not hold the pod past its termination grace period, or the kubelet
   * SIGKILLs it and the drain achieves nothing.
   */
  async onApplicationShutdown(signal?: string): Promise<void> {
    if (this.inFlight.size === 0) {
      return;
    }

    this.logger.log(
      `${signal ?? 'Shutdown'}: draining ${this.inFlight.size} analysis run(s)`,
    );

    const drained = await Promise.race([
      Promise.allSettled([...this.inFlight]).then(() => true),
      this.sleep(DRAIN_TIMEOUT_MS).then(() => false),
    ]);

    if (drained) {
      this.logger.log('All analysis runs finished');
    } else {
      this.logger.warn(
        `Gave up after ${DRAIN_TIMEOUT_MS / 1000}s with ${this.inFlight.size} run(s) still going; they will be resumed on the next boot`,
      );
    }
  }

  /** Registers a background run so `onApplicationShutdown` can wait for it. */
  private track(run: Promise<void>): void {
    this.inFlight.add(run);
    void run.finally(() => this.inFlight.delete(run));
  }

  /**
   * What the client renders: one upload field plus the rubric it will be graded
   * against. The rubric travels with the form so a submitter can see, before
   * uploading, exactly which fifteen things the report has to cover — it is a
   * single document now, and nothing else prompts them to include all of it.
   */
  getFormSchema() {
    return {
      projectField: PROJECT_FIELD,
      maxTotalScore: MAX_TOTAL_SCORE,
      levels: LEVEL_IDS_DESCENDING.map((id) => {
        const level = levelById(id)!;
        return {
          id: level.id,
          label: level.label,
          english: level.english,
          band: level.band,
        };
      }),
      awardTiers: AWARD_TIERS.map((tier) => ({
        id: tier.id,
        label: tier.label,
        minScore: tier.minScore,
        description: tier.description,
      })),
      dimensions: RUBRIC.map((dimension) => ({
        index: dimension.index,
        title: dimension.title,
        focus: dimension.focus,
        weight: dimension.weight,
        criteria: dimension.criteria.map((criterion) => ({
          code: criterion.code,
          title: criterion.title,
          evidenceRequirement: criterion.evidenceRequirement,
          checks: [...criterion.checks],
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
      throw new BadRequestException('กรุณาแนบไฟล์รายงาน (PDF)');
    }

    // Upload before creating the document, so a submission never exists
    // pointing at an object that failed to store.
    const reportFile: StoredFile = {
      key: await this.storage.upload(report.buffer, report.mimetype),
      filename: report.originalname,
      mimetype: report.mimetype,
      size: report.size,
    };

    const submission = await this.repository.create({
      submitter: dto,
      report: reportFile,
      status: AnalysisStatus.Pending,
    });

    this.logger.log(
      `Stored submission ${String(submission._id)} ("${dto.projectName}")`,
    );

    // Deliberately not awaited: grading takes tens of seconds and the browser
    // is holding a multipart upload open. The client polls for the result.
    this.track(this.runAnalysis(String(submission._id)));

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
    this.track(this.runAnalysis(id));

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
        });

        await this.repository.saveResult(id, outcome);
        this.logger.log(
          `Submission ${id} scored ${outcome.overallScore}/${MAX_TOTAL_SCORE} (${outcome.award.label}) on attempt ${attempt}`,
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
      analysis: doc.analysis,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Field definitions handed to multer. A submission is one report PDF: the
 * earlier fifteen per-criterion evidence fields asked a submitter to split
 * their work into an upload matrix nobody actually files it in.
 */
export const UPLOAD_FIELDS = [{ name: PROJECT_FIELD, maxCount: 1 }];
