import { Schema, Document } from 'mongoose';

export interface UploadedProject extends Document {
  key: string;
  filename: string;
  mimetype: string;
  size: number;
  uploadedAt: Date;
  evidence: UploadedFile[];
  result: Result[];
}

export interface Result extends Document {
  file_name: string;
  first_score: number;
  first_reson: string;
  second_score: number;
  second_reson: string;
  third_score: number;
  third_reson: string;
  fourth_score: number;
  fourth_reson: string;
  fifth_score: number;
  fifth_reson: string;
  overall_score: number;
  overall_reason: string;
  project_summary: string;
}

export interface UploadedFile extends Document {
  key: string;
  filename: string;
  mimetype: string;
  size: number;
  uploadedAt: Date;
}

export const UploadedFileSchema = new Schema<UploadedProject>({
  key: { type: String, required: true },
  filename: { type: String, required: true },
  mimetype: { type: String, required: true },
  size: { type: Number, required: true },
  uploadedAt: { type: Date, default: Date.now },
  evidence: { type: [Schema.Types.ObjectId], ref: 'UploadedFile', default: [] },
});
