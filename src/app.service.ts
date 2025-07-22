import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UserRepository } from 'src/users.repository';
import { first, seccond, third, fourth, fifth } from './score';
import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { FileRepository } from './files.repository';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as pdfParse from 'pdf-parse';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);
  private s3: S3Client;
  private bucket: string;
  constructor(
    private userRepository: UserRepository,
    private jwtService: JwtService,
    private fileRepository: FileRepository,
  ) {
    this.bucket = process.env.BUCKETNAME!;
    this.s3 = new S3Client({
      region: process.env.AWSREGION!,
      credentials: {
        accessKeyId: process.env.ACCESSKEYID!,
        secretAccessKey: process.env.SECRETACCESSKEY!,
      },
      maxAttempts: 3, // Retry up to 3 times
    });
  }

  async validateUser(username: string, password: string): Promise<any> {
    const user = await this.userRepository.findOne(username);
    if (user && (await bcrypt.compare(password, user.password))) {
      // const { password, ...result } = user;
      return user;
    }
    return null;
  }

  async login(user: any) {
    const payload = { username: user.username };
    return {
      access_token: this.jwtService.sign(payload, { expiresIn: '2h' }),
      refresh_token: this.jwtService.sign(payload, { expiresIn: '1d' }),
    };
  }

  async register(username: string, password: string) {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await this.userRepository.findOne(username);
    if (user) {
      this.logger.log('User existed!');
      return HttpStatus.BAD_REQUEST;
    } else {
      const result = await this.userRepository.create(username, hashedPassword);
      if (result) return HttpStatus.CREATED;
    }
    return HttpStatus.BAD_REQUEST;
  }

  async analyzeText(file: Express.Multer.File, id: any) {
    try {
      this.logger.log('analyzing...');
      const data = await pdfParse(file.buffer);
      const genAI = new GoogleGenerativeAI(process.env.APIKEY!);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const contents: any = [
        {
          role: 'user',
          parts: [
            {
              text: ` ชื่อไฟล์: ${file.originalname}\n${data.text}\n==============================`,
            },
          ],
        },
      ];
      contents.unshift({
        role: 'user',
        parts: [
          {
            text: `คุณคือผู้เชี่ยวชาญในการประเมินผลงาน ให้คะแนนโครงการที่ได้รับ\n
              โดยให้คะแนนเต็ม 100 คะแนน โดยใช้เกณฑ์ 5 ข้อต่อไปนี้ \n
              ${first}\n
              ${seccond}\n
              ${third}\n
              ${fourth}\n
              ${fifth}\n
              โปรดตอบกลับ **เฉพาะในรูปแบบ JSON**\n
              โดยแต่ละอ็อบเจ็กต์ต้องมีฟิลด์ดังนี้\n
              - file_name: ชื่อของไฟล์\n
              - first_score: คะแนนสำหรับมิติที่ 1\n
              - first_reason: เหตุผลในการให้คะแนนสำหรับมิติที่ 1\n
              - second_score: คะแนนสำหรับมิติที่ 2\n
              - second_reason: เหตุผลในการให้คะแนนสำหรับมิติที่ 2\n
              - third_score: คะแนนสำหรับมิติที่ 3\n
              - third_reason: เหตุผลในการให้คะแนนสำหรับมิติที่ 3\n
              - fourth_score: คะแนนสำหรับมิติที่ 4\n
              - fourth_reason: เหตุผลในการให้คะแนนสำหรับมิติที่ 4\n
              - fifth_score: คะแนนสำหรับมิติที่ 5\n
              - fifth_reason: เหตุผลในการให้คะแนนสำหรับมิติที่ 5\n
              - overall_score คะแนนรวม เต็ม 100 (จำนวนเต็ม)\n
              - overall_reason: สรุปการให้คะแนนสั้นๆ ประมาณ 1-2 บรรทัด\n
              - project_summary: บทอธิบายสรุปภาพรวมของโครงการ ประมาณ 1 หน้า

              ตัวอย่างผลลัพธ์ที่ต้องการ:\n
              {
                file_name: "โครงการส่งเสริมการอ่านในโรงเรียนชนบท.pdf",
                first_score: 18,
                first_reason: "โครงการมีการแต่งตั้งและสื่อสารความรับผิดชอบด้านการบริหารความเสี่ยง แต่ขาดการฝึกอบรมด้านการบริหารความเสี่ยง"
                second_score: 15,
                second_reason: "โครงการมีแผนบริหารความเสี่ยงของส่วนงาน/หน่วยงาน แต่ขาดการถ่ายทอดแผนบริหารความเสี่ยงไปยังส่วนงาน/หน่วยงานย่อยหรือผู้รับผิดชอบ"
                third_score: 20,
                third_reason: "โครงการมีการรายงานผลการบริหารความเสี่ยง แต่ไม่มีการติดตามความเสี่ยงอย่างสม่ำเสมอ"
                fourth_score: 17,
                fourth_reason: "โครงการมีกิจกรรมสร้างความตระหนักด้านความเสี่ยง แต่ขาดการยกย่องความพยายามด้านการบริหารความเสี่ยง"
                fifth_score: 19,
                fifth_reason: "โครงการมีบทเรียนที่ได้รับและแนวปฏิบัติที่ดี แต่ไม่มีการปรับปรุงกระบวนการบริหารความเสี่ยง"
                overall_score: 89,
                overall_reason: "โครงการมีความชัดเจน ครอบคลุม และมีการดำเนินงานที่เป็นรูปธรรม เหมาะสมกับกลุ่มเป้าหมาย"
                project_summary: "**บทสรุปอธิบายภาพรวมของโครงการ ประมาณ 1 หน้า**"
              }

              *จุดเริ่มต้นโครงการ*\n`,
          },
        ],
      });
      const result = await model.generateContent({
        contents: contents,
        generationConfig: {
          temperature: 1,
        },
      });
      const textData = result.response.text();
      const match = textData.match(/\{[\s\S]*\}/);
      if (match) {
        const jsonString = match[0];
        const resultData = JSON.parse(jsonString);
        this.fileRepository.updateOneResult(resultData, id)
        this.logger.log('Result updated.');
        // return { ...resultData };
      } else {
        throw Error('match not found');
      }
    } catch (error) {
      this.logger.log('Analyze error', error);
      throw Error(error);
    }
  }

  // Helper method for S3 uploads with retry logic
  private async uploadToS3(
    key: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<void> {
    const putCommand = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });

    // Implement retry with exponential backoff
    let retries = 0;
    const maxRetries = 3;
    let success = false;

    while (!success && retries < maxRetries) {
      try {
        await this.s3.send(putCommand);
        success = true;
        // this.logger.log(`S3 upload successful after ${retries} retries`);
      } catch (err) {
        retries++;
        if (retries >= maxRetries) {
          this.logger.error(`S3 upload failed after ${maxRetries} attempts`);
          throw err;
        }
        const delay = Math.pow(2, retries) * 1000; // Exponential backoff
        this.logger.warn(
          `S3 upload attempt ${retries} failed, retrying in ${delay}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  async uploadFile(file: any, id: string, data: any) {
    try {
      if (file.fieldname == 'project') {
        this.logger.log('Uploading project...');
        const key = `deepdocument-${Date.now()}`;
        // upload to S3 using helper method
        await this.uploadToS3(key, file.buffer, file.mimetype);
        // save in DB
        this.logger.log('Creating database infomation...');
        const created = await this.fileRepository.create({
          key: key,
          filename: file.originalname,
          mimetype: file.mimetype,
          size: file.buffer.length,
          result: null,
          studentData: data,
        });
        this.logger.log(`Created document with ID: ${created._id}`);
        this.analyzeText(file, created._id);
        return created;
      } else {
        this.logger.log(`Uploading ${file.fieldname}...`);
        const key = `deepdocument-${Date.now()}`;
        // upload to S3 using helper method
        await this.uploadToS3(key, file.buffer, file.mimetype);
        // update DB
        await this.fileRepository.updateOneEvidence(
          {
            key: key,
            filename: file.originalname,
            mimetype: file.mimetype,
            size: file.buffer.length,
            fileGroup: file.fieldname,
          },
          id,
        );
      }
      return;
    } catch (error) {
      this.logger.error(`Upload failed: ${error.message}`, error.stack);
      return error;
    }
  }

  async resultlist(year: any) {
    const rawDatas = await this.fileRepository.findMany(year);
    let returnData: any = [];
    for (let i = 0; i < rawDatas.length; i++) {
      let project = rawDatas[i];
      const signedUrl1 = await getSignedUrl(
        this.s3,
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: project.key,
        }),
        { expiresIn: 21600 },
      );
      project['url'] = signedUrl1;
      for (let j = 0; j < project.evidence.length; j++) {
        let evidence = project.evidence[j];
        const signedUrl2 = await getSignedUrl(
          this.s3,
          new GetObjectCommand({
            Bucket: this.bucket,
            Key: evidence.key,
          }),
          { expiresIn: 21600 },
        );
        evidence['url'] = signedUrl2;
      }
      returnData.push(project);
    }
    return returnData;
  }
}
