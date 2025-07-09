// user.service.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UploadedFile } from './file.schema';

@Injectable()
export class FileRepository {
  constructor(@InjectModel('File') private fileModel: Model<UploadedFile>) {}

  async create(meta: {
    key: string;
    signedUrl: string;
    filename: string;
    mimetype: string;
    size: number;
  }) {
    return await this.fileModel.create(meta);
  }
}
