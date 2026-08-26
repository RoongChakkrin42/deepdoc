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
}
export const StoredFileSchema = SchemaFactory.createForClass(StoredFile);

@Schema({ _id: false })
export class CriterionScore {
  /** Rubric criterion code, e.g. `2.3`. */
  @Prop({ required: true })
  code: string;

  @Prop({ required: true })
  title: string;

  /** One of the five official maturity levels, e.g. `mature`. */
  @Prop({ required: true })
  level: string;

  @Prop({ required: true })
  levelLabel: string;

  /** Representative points for the level, 0-100. */
  @Prop({ required: true })
  score: number;

  /** Text the model quoted out of the report to support the level. */
  @Prop({ type: [String], default: [] })
  evidenceFound: string[];

  /** Rubric checks the model could not find in the report. */
  @Prop({ type: [String], default: [] })
  missing: string[];

  @Prop({ required: true })
  comment: string;
}
export const CriterionScoreSchema =
  SchemaFactory.createForClass(CriterionScore);

@Schema({ _id: false })
export class DimensionScore {
  @Prop({ required: true })
  index: number;

  @Prop({ required: true })
  title: string;

  /** Percentage weight of this dimension in the total. */
  @Prop({ required: true })
  weight: number;

  /** Mean of the dimension's criterion scores, 0-100. */
  @Prop({ required: true })
  score: number;

  /** Points this dimension contributes to the total, i.e. `score * weight / 100`. */
  @Prop({ required: true })
  weightedScore: number;

  @Prop({ required: true })
  level: string;

  @Prop({ required: true })
  levelLabel: string;

  @Prop({ type: [CriterionScoreSchema], default: [] })
  criteria: CriterionScore[];
}
export const DimensionScoreSchema =
  SchemaFactory.createForClass(DimensionScore);

/** The award tier the total falls into, resolved server-side from the rubric. */
@Schema({ _id: false })
export class AwardTier {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  label: string;

  @Prop({ required: true })
  description: string;
}
export const AwardTierSchema = SchemaFactory.createForClass(AwardTier);

@Schema({ _id: false })
export class AnalysisResult {
  /** Markdown overview of the project. */
  @Prop({ required: true })
  summary: string;

  /** Weighted total, 0-100. May carry decimals — the dimensions are averages. */
  @Prop({ required: true })
  overallScore: number;

  @Prop({ required: true })
  overallComment: string;

  @Prop({ type: AwardTierSchema, required: true })
  award: AwardTier;

  @Prop({ type: [DimensionScoreSchema], default: [] })
  dimensions: DimensionScore[];

  /** Which model produced this, so old results stay interpretable. */
  @Prop({ required: true })
  model: string;

  @Prop({ required: true })
  analyzedAt: Date;

  /**
   * Caveats about the run itself — a level awarded without a supporting quote,
   * a criterion the model answered twice. Shown to the reviewer so nothing is
   * silently lost.
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

  /** The report PDF. It is the only file a submission carries. */
  @Prop({ type: StoredFileSchema, required: true })
  report: StoredFile;

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
