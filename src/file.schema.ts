import { Schema, Document } from 'mongoose';

export interface UploadedProject extends Document {
  key: string;
  filename: string;
  mimetype: string;
  size: number;
  uploadedAt: Date;
  evidence: UploadedFile[];
  result: Result;
  studentData: StudentData;
  url: string;
}

export interface StudentData extends Document {
  name: string;
  department: string;
  email: string;
  phone: string;
}

export interface Result extends Document {
  file_name: string;
  first_score: number;
  first_reason: string;
  second_score: number;
  second_reason: string;
  third_score: number;
  third_reason: string;
  fourth_score: number;
  fourth_reason: string;
  fifth_score: number;
  fifth_reason: string;
  overall_score: number;
  overall_reason: string;
  project_summary: string;
}

export interface UploadedFile extends Document {
  key: string;
  filename: string;
  mimetype: string;
  size: number;
  fileGroup: string;
  uploadedAt: Date;
  url: string;
}

export const UploadedFileSchema = new Schema<UploadedProject>({
  key: { type: String, required: true },
  filename: { type: String, required: true },
  mimetype: { type: String, required: true },
  size: { type: Number, required: true },
  uploadedAt: { type: Date, default: Date.now, required: true },
  evidence: {
    type: [Schema.Types.Mixed],
    ref: 'UploadedFile',
    default: [],
    required: true,
  },
  result: { type: Schema.Types.Mixed, ref: 'Result', required: true },
  studentData: { type: Schema.Types.Mixed, required: true },
  url: { type: String, required: false },
});
