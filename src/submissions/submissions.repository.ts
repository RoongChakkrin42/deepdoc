import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AnalysisResult,
  AnalysisStatus,
  StoredFile,
  Submission,
  SubmissionDocument,
  Submitter,
} from './schemas/submission.schema';

export interface CreateSubmissionData {
  submitter: Submitter;
  report: StoredFile;
  status: AnalysisStatus;
}

@Injectable()
export class SubmissionsRepository {
  constructor(
    @InjectModel(Submission.name)
    private readonly model: Model<SubmissionDocument>,
  ) {}

  create(data: CreateSubmissionData): Promise<SubmissionDocument> {
    return this.model.create(data);
  }

  findById(id: string): Promise<SubmissionDocument | null> {
    return this.model.findById(id).exec();
  }

  /**
   * Every submission for a calendar year, best score first.
   *
   * Unlike the original query this does not filter on the presence of a score:
   * pending and failed submissions have to stay visible, otherwise a failed
   * analysis disappears without anyone noticing.
   */
  findByYear(year: number): Promise<SubmissionDocument[]> {
    return this.model
      .find({
        createdAt: {
          $gte: new Date(Date.UTC(year, 0, 1)),
          $lt: new Date(Date.UTC(year + 1, 0, 1)),
        },
      })
      .sort({ 'analysis.overallScore': -1, createdAt: -1 })
      .exec();
  }

  markProcessing(id: string): Promise<SubmissionDocument | null> {
    return this.model
      .findByIdAndUpdate(
        id,
        {
          status: AnalysisStatus.Processing,
          lastAttemptAt: new Date(),
          $inc: { attempts: 1 },
        },
        { new: true },
      )
      .exec();
  }

  saveResult(
    id: string,
    analysis: AnalysisResult,
  ): Promise<SubmissionDocument | null> {
    return this.model
      .findByIdAndUpdate(
        id,
        { status: AnalysisStatus.Completed, analysis, failureReason: null },
        { new: true },
      )
      .exec();
  }

  markFailed(id: string, reason: string): Promise<SubmissionDocument | null> {
    return this.model
      .findByIdAndUpdate(
        id,
        { status: AnalysisStatus.Failed, failureReason: reason },
        { new: true },
      )
      .exec();
  }

  resetForRetry(id: string): Promise<SubmissionDocument | null> {
    return this.model
      .findByIdAndUpdate(
        id,
        { status: AnalysisStatus.Pending, failureReason: null, attempts: 0 },
        { new: true },
      )
      .exec();
  }

  /** Submissions left mid-flight by a crash or redeploy. */
  findStuck(): Promise<SubmissionDocument[]> {
    return this.model
      .find({
        status: { $in: [AnalysisStatus.Pending, AnalysisStatus.Processing] },
      })
      .sort({ createdAt: 1 })
      .exec();
  }
}
