// user.service.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from 'src/user.schema';

@Injectable()
export class UserRepository {
  constructor(@InjectModel('User') private userModel: Model<User>) {}

  async findOne(username: string) {
    return this.userModel.findOne({ "username": username });
  }

  async create(username: string, hashedPassword: string): Promise<User> {
    return this.userModel.create({ username, password: hashedPassword });
  }
}
