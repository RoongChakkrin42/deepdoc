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

  // async findExistingOne(email: string) {
  //   const currentYear = new Date().getFullYear();
  //   const startDate = new Date(`${currentYear}-01-01T00:00:00.000Z`);
  //   const endDate = new Date(`${currentYear}-12-31T23:59:59.999Z`);
  //   return await this.fileModel.findOne({$and:[{"studentData.email": email},{uploadedAt: {
  //       $gte: startDate,
  //       $lte: endDate
  //     }}]});
  // }

  async findMany(data: any) {
    const startDate = new Date(`${data.year}-01-01T00:00:00.000Z`);
    const endDate = new Date(`${data.year}-12-31T23:59:59.999Z`);
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
    studentData: any;
  }) {
    return await this.fileModel.create(data);
  }

  async updateOne(
    data: {
      key: string;
      filename: string;
      mimetype: string;
      size: number;
      fileGroup: string;
    },
    project: string,
  ) {
    // Create a new evidence document first
    const evidenceData = {
      key: data.key,
      filename: data.filename,
      mimetype: data.mimetype,
      size: data.size,
      fileGroup: data.fileGroup,
      uploadedAt: new Date()
    };
    
    // Add the evidence directly (schema will handle the conversion)
    return await this.fileModel.findByIdAndUpdate(
      project, 
      { $push: { evidence: evidenceData } },
      { new: true } // equivalent to returnDocument: 'after'
    );
  }

}
