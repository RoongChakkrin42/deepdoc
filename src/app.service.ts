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
    if (user) return HttpStatus.BAD_REQUEST;
    const result = await this.userRepository.create(username, hashedPassword);
    if (result) return HttpStatus.CREATED;
    return HttpStatus.BAD_REQUEST;
  }

  async analyzeText(projects: any[]) {
    try {
      // const ai = new GoogleGenAI({ apiKey: process.env.APIKEY });
      const genAI = new GoogleGenerativeAI(process.env.APIKEY!);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const contents: any = projects.map((project) => ({
        role: 'user',
        parts: [project],
      }));
      // contents.unshift({
      //   role: 'user',
      //   parts: [
      //     {
      //       text: `Score each of the following text out of 100 based on quality, coherence, and depth. give me the array of result in json form. (text_name, quality_score, coherence_score, depth_score, overall_score,  field is required.)`,
      //     },
      //   ],
      // });
      contents.unshift({
        role: 'user',
        parts: [
          {
            text: `
          จงให้คะแนนแต่ละข้อความ เต็ม 100 คะแนน โดยใช้เกณฑ์ 5 ข้อต่อไปนี้ 

          ${first}
          ${seccond}
          ${third}
          ${fourth}
          ${fifth}

          ให้คะแนนแต่ละข้อความ แล้วเก็บคะแนนในรูปแบบ json (array of object) โดยมี field ดังนี้ text_name, first_score, seccond_score, third_score, fourth_score, fifth_score, overall_score and overall_reason
          `,
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
        throw Error('match not found')
      }
    } catch (error) {
      console.log(error);
    }
  }
}
