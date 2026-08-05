import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './user.schema';

@Injectable()
export class UsersRepository {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  findByUsername(username: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ username }).exec();
  }

  /** `password` is `select: false`, so credential checks must ask for it explicitly. */
  findByUsernameWithPassword(username: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ username }).select('+password').exec();
  }

  create(username: string, passwordHash: string): Promise<UserDocument> {
    return this.userModel.create({ username, password: passwordHash });
  }

  countAll(): Promise<number> {
    return this.userModel.estimatedDocumentCount().exec();
  }
}
