import { Schema, Document } from 'mongoose';

export interface UploadedFile extends Document {
  key: string;
  url: string;
  filename: string;
  mimetype: string;
  size: number;
  uploadedAt: Date;
}

export const UploadedFileSchema = new Schema<UploadedFile>({
  key: { type: String, required: true },
  url: { type: String, required: true },
  filename: { type: String, required: true },
  mimetype: { type: String, required: true },
  size: { type: Number, required: true },
  uploadedAt: { type: Date, default: Date.now },
});
