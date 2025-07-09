// file.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class UploadedFile extends Document {
  @Prop({ required: true }) key: string;
  @Prop() signedUrl: string;
  @Prop() filename: string;
  @Prop() mimetype: string;
  @Prop() size: number;
  @Prop({ default: Date.now }) uploadedAt: Date;
}

export const UploadedFileSchema = SchemaFactory.createForClass(UploadedFile);
