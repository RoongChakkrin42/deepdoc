import { HttpStatus, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from 'bcrypt';
import { UserRepository } from "src/users.repository";

// auth/auth.service.ts
@Injectable()
export class AppService {
  constructor(
    private userRepository: UserRepository,
    private jwtService: JwtService
  ) {}

  async validateUser(username: string, password: string): Promise<any> {
    const user = await this.userRepository.findOne(username);
    if (user && await bcrypt.compare(password, user.password)) {
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
}
