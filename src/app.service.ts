import { HttpStatus, Injectable } from '@nestjs/common';
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

@Injectable()
export class AppService {
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
      access_token: this.jwtService.sign(payload),
    };
  }

  async register(username: string, password: string) {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await this.userRepository.findOne(username);
    if (user) {
      console.log('error');
      return HttpStatus.BAD_REQUEST;
    } else {
      console.log('pass');
      const result = await this.userRepository.create(username, hashedPassword);
      if (result) return HttpStatus.CREATED;
    }
    return HttpStatus.BAD_REQUEST;
  }

  async analyzeText(projects: any[], user: any) {
    try {
      const genAI = new GoogleGenerativeAI(process.env.APIKEY!);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const contents: any = projects.map((project) => ({
        role: 'user',
        parts: [
          {
            text: ` ชื่อไฟล์: ${project.name}\n${project.text}\n==============================`,
          },
        ],
      }));
      contents.unshift({
        role: 'user',
        parts: [
          {
            text: `คุณคือผู้เชี่ยวชาญในการประเมินผลงาน ให้คะแนนแต่ละโครงการจากรายการโครงการที่ได้รับ\n
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
              - first_reson: เหตุผลในการให้คะแนนสำหรับมิติที่ 1\n
              - second_score: คะแนนสำหรับมิติที่ 2\n
              - second_reson: เหตุผลในการให้คะแนนสำหรับมิติที่ 2\n
              - third_score: คะแนนสำหรับมิติที่ 3\n
              - third_reson: เหตุผลในการให้คะแนนสำหรับมิติที่ 3\n
              - fourth_score: คะแนนสำหรับมิติที่ 4\n
              - fourth_reson: เหตุผลในการให้คะแนนสำหรับมิติที่ 4\n
              - fifth_score: คะแนนสำหรับมิติที่ 5\n
              - fifth_reson: เหตุผลในการให้คะแนนสำหรับมิติที่ 5\n
              - overall_score คะแนนรวม เต็ม 100 (จำนวนเต็ม)\n
              - overall_reason: สรุปการให้คะแนนสั้นๆ ประมาณ 1-2 บรรทัด\n
              - project_summary: บทอธิบายสรุปภาพรวมของโครงการ ประมาณ 1 หน้า

              ตัวอย่างผลลัพธ์ที่ต้องการ:\n
              {
                file_name: "โครงการส่งเสริมการอ่านในโรงเรียนชนบท.pdf",
                first_score: 18,
                first_reson: "โครงการมีการแต่งตั้งและสื่อสารความรับผิดชอบด้านการบริหารความเสี่ยง แต่ขาดการฝึกอบรมด้านการบริหารความเสี่ยง"
                second_score: 15,
                second_reson: "โครงการมีแผนบริหารความเสี่ยงของส่วนงาน/หน่วยงาน แต่ขาดการถ่ายทอดแผนบริหารความเสี่ยงไปยังส่วนงาน/หน่วยงานย่อยหรือผู้รับผิดชอบ"
                third_score: 20,
                third_reson: "โครงการมีการรายงานผลการบริหารความเสี่ยง แต่ไม่มีการติดตามความเสี่ยงอย่างสม่ำเสมอ"
                fourth_score: 17,
                fourth_reson: "โครงการมีกิจกรรมสร้างความตระหนักด้านความเสี่ยง แต่ขาดการยกย่องความพยายามด้านการบริหารความเสี่ยง"
                fifth_score: 19,
                fifth_reson: "โครงการมีบทเรียนที่ได้รับและแนวปฏิบัติที่ดี แต่ไม่มีการปรับปรุงกระบวนการบริหารความเสี่ยง"
                overall_score 89,
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
          temperature: 0.5,
        },
      });
      const textData = result.response.text();
      const match = textData.match(/\{[\s\S]*\}/);
      if (match) {
        const jsonString = match[0];
        const resultData = JSON.parse(jsonString);
        const refreshToken = await this.login(user);
        return { ...resultData, ...refreshToken };
      } else {
        throw Error('match not found');
      }
    } catch (error) {
      console.log(error);
      throw Error(error);
    }
  }

  async uploadFile(filename: string, buffer: Buffer, mimetype: string) {
    try {
      const key = `${Date.now()}-${filename}`;
      // upload to S3
      const putCommand = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimetype,
      });
      await this.s3.send(putCommand).then(() => console.log(key+" uploaded."));
      // save in DB
const getCommand = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      const url = await getSignedUrl(this.s3, getCommand);
      await this.fileRepository.create({
        key,
        url,
        filename,
        mimetype,
        size: buffer.length,
      }).then(() => console.log(key+" url saved."));
      return { filename, message: 'Upload successful.' };
    } catch (error) {
      console.log(error);
      return { filename, message: 'Upload failed.' };
    }
  }
}
