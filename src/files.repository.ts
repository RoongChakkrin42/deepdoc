// user.service.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Result, UploadedProject } from './file.schema';
import { GetObjectCommand } from '@aws-sdk/client-s3';

@Injectable()
export class FileRepository {
  constructor(@InjectModel('File') private fileModel: Model<UploadedProject>) {}

  async findOne(project: string) {
    return await this.fileModel.findOne({_id: project});
  }

  async findMany(year: string) {
    const startDate = new Date(`${year}-01-01T00:00:00.000Z`);
    const endDate = new Date(`${year}-12-31T23:59:59.999Z`);
    return await this.fileModel.find({
      uploadedAt: {
        $gte: startDate,
        $lte: endDate
      }
    });
  }

  async create(data: {
    key: string;
    filename: string;
    mimetype: string;
    size: number;
    result: Result;
  }) {
    return await this.fileModel.create(data);
  }

  async updateOne(
    data: {
      key: string;
      filename: string;
      mimetype: string;
      size: number;
    },
    project: string,
  ) {
    return await this.fileModel.findOneAndUpdate({_id: project}, {$push: {evidence: data}}, { returnDocument: 'after' });
  }

}
