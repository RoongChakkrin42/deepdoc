import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export enum AnalysisStatus {
  /** Files stored, waiting for the analyser to pick it up. */
  Pending = 'pending',
  /** A Gemini call is in flight. */
  Processing = 'processing',
  /** Scored successfully. */
  Completed = 'completed',
  /** Every attempt failed; `failureReason` explains why. */
  Failed = 'failed',
}

@Schema({ _id: false })
export class StoredFile {
  @Prop({ required: true })
  key: string;

  @Prop({ required: true })
  filename: string;

  @Prop({ required: true })
  mimetype: string;

  @Prop({ required: true })
  size: number;

  /** Rubric criterion this file was uploaded as evidence for, e.g. `2.3`. */
  @Prop()
  criterionCode?: string;
}
export const StoredFileSchema = SchemaFactory.createForClass(StoredFile);

@Schema({ _id: false })
export class DimensionScore {
  @Prop({ required: true })
  index: number;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  score: number;

  @Prop({ required: true })
  maxScore: number;

  @Prop({ required: true })
  comment: string;
}
export const DimensionScoreSchema =
  SchemaFactory.createForClass(DimensionScore);

@Schema({ _id: false })
export class AnalysisResult {
  /** Markdown overview of the project. */
  @Prop({ required: true })
  summary: string;

  @Prop({ required: true })
  overallScore: number;

  @Prop({ required: true })
  overallComment: string;

  @Prop({ type: [DimensionScoreSchema], default: [] })
  dimensions: DimensionScore[];

  /** Which model produced this, so old results stay interpretable. */
  @Prop({ required: true })
  model: string;

  @Prop({ required: true })
  analyzedAt: Date;

  /**
   * Caveats about the run itself — evidence dropped for payload size, scores
   * clamped into range. Shown to the reviewer so nothing is silently lost.
   */
  @Prop({ type: [String], default: [] })
  notes: string[];
}
export const AnalysisResultSchema =
  SchemaFactory.createForClass(AnalysisResult);

@Schema({ _id: false })
export class Submitter {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true })
  projectName: string;

  @Prop({ required: true, trim: true })
  department: string;

  @Prop({ required: true, trim: true, lowercase: true })
  email: string;

  @Prop({ required: true, trim: true })
  phone: string;
}
export const SubmitterSchema = SchemaFactory.createForClass(Submitter);

@Schema({ timestamps: true, collection: 'submissions' })
export class Submission {
  @Prop({ type: SubmitterSchema, required: true })
  submitter: Submitter;

  /** The project report PDF. */
  @Prop({ type: StoredFileSchema, required: true })
  report: StoredFile;

  /** Supporting evidence PDFs, tagged with the criterion they belong to. */
  @Prop({ type: [StoredFileSchema], default: [] })
  evidence: StoredFile[];

  @Prop({
    type: String,
    enum: AnalysisStatus,
    default: AnalysisStatus.Pending,
    index: true,
  })
  status: AnalysisStatus;

  @Prop({ type: AnalysisResultSchema, default: null })
  analysis: AnalysisResult | null;

  /**
   * Populated when `status` is `failed`.
   *
   * `type` is explicit on every nullable field: a `string | null` union erases
   * to `Object` in the emitted decorator metadata, and @nestjs/mongoose throws
   * `CannotDetermineTypeError` at import time when it cannot infer the type.
   */
  @Prop({ type: String, default: null })
  failureReason: string | null;

  @Prop({ type: Number, default: 0 })
  attempts: number;

  @Prop({ type: Date, default: null })
  lastAttemptAt: Date | null;

  // Supplied by `timestamps: true`; declared so TypeScript knows about them.
  createdAt: Date;
  updatedAt: Date;
}

export type SubmissionDocument = HydratedDocument<Submission>;
export const SubmissionSchema = SchemaFactory.createForClass(Submission);

// The results page lists one year at a time, best score first.
SubmissionSchema.index({ createdAt: -1 });
SubmissionSchema.index({ 'analysis.overallScore': -1 });
