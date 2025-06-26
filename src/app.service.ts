import { HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UserRepository } from 'src/users.repository';
import { first, seccond, third, fourth, fifth } from './score';
import { GoogleGenerativeAI, Part } from '@google/generative-ai';

// auth/auth.service.ts
@Injectable()
export class AppService {
  constructor(
    private userRepository: UserRepository,
    private jwtService: JwtService,
  ) {}

  async validateUser(username: string, password: string): Promise<any> {
    const user = await this.userRepository.findOne(username);
    if (user && (await bcrypt.compare(password, user.password))) {
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  async login(user: any) {
    const payload = { username: user.username, sub: user.userId };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }

  async register(username: string, password: string) {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await this.userRepository.findOne(username);
    if (user) {
      console.log("error")
      return HttpStatus.BAD_REQUEST;
    } else {
      console.log("pass")
      const result = await this.userRepository.create(username, hashedPassword);
      if (result) return HttpStatus.CREATED;
    }
    return HttpStatus.BAD_REQUEST;
  }

  async analyzeText(projects: any[]) {
    try {
      // const ai = new GoogleGenAI({ apiKey: process.env.APIKEY });
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
              โปรดตอบกลับ **เฉพาะในรูปแบบ JSON เป็นอาร์เรย์ของอ็อบเจ็กต์ที่มีจำนวนเท่ากับชื่อไฟล์**\n
              โดยแต่ละอ็อบเจ็กต์ต้องมีฟิลด์ดังนี้\n
              - text_name: ชื่อของไฟล์\n
              - first_score: คะแนนสำหรับมิติที่ 1\n
              - seccond_score: คะแนนสำหรับมิติที่ 2\n
              - third_score: คะแนนสำหรับมิติที่ 3\n
              - fourth_score: คะแนนสำหรับมิติที่ 4\n
              - fifth_score: คะแนนสำหรับมิติที่ 5\n
              - overall_scoreซ คะแนนรวม เต็ม 100 (จำนวนเต็ม)\n
              - overall_reason: สรุปสั้นๆ ประมาณ 1-2 บรรทัด\n
              แต่ละโครงการจะถูกคั่นด้วยตัวอักษร "=============================="\n
              ตัวอย่างผลลัพธ์ที่ต้องการ:\n
              [
                {
                  "text_name": "โครงการส่งเสริมการอ่านในโรงเรียนชนบท",
                  "first_score": 18,
                  "seccond_score": 15,
                  "third_score": 20,
                  "fourth_score": 17,
                  "fifth_score": 19,
                  "overall_score": 89,
                  "overall_reason": "โครงการมีความชัดเจน ครอบคลุม และมีการดำเนินงานที่เป็นรูปธรรม เหมาะสมกับกลุ่มเป้าหมาย"
                },
                {
                  "text_name": "โครงการลดขยะพลาสติกในชุมชนเมือง",
                  "first_score": 14,
                  "seccond_score": 13,
                  "third_score": 16,
                  "fourth_score": 15,
                  "fifth_score": 14,
                  "overall_score": 72,
                  "overall_reason": "แนวคิดโครงการดีและมีเป้าหมายที่สำคัญ แต่ขาดรายละเอียดและการวางแผนในเชิงปฏิบัติ"
                }
              ]
              *จุดเริ่มต้น*\n`,
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
      const match = textData.match(/\[[\s\S]*\]/);
      if (match) {
        const jsonString = match[0];
        const resultData = JSON.parse(jsonString);
        return resultData;
      } else {
        throw Error('match not found');
      }
    } catch (error) {
      console.log(error);
      throw Error(error);
    }
  }
}
