import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MongooseModule } from '@nestjs/mongoose';
import { LocalStrategy } from './strategies/local.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UserSchema } from './user.schema';
import { UserRepository } from './users.repository';
import { ConfigModule } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { UploadedFile, UploadedFileSchema } from './file.schema';
import { FileRepository } from './files.repository';

@Module({
  imports: [
    ConfigModule.forRoot(),
    MongooseModule.forRoot(process.env.DATABASEURL!),
    MongooseModule.forFeature([
      { name: 'User', schema: UserSchema },
      { name: 'File', schema: UploadedFileSchema },
    ]),
    PassportModule,
    JwtModule.register({
      secret: process.env.JWTSECRET,
      signOptions: { expiresIn: '2h' },
    }),
    MulterModule.register({
      dest: './uploads',
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    LocalStrategy,
    JwtStrategy,
    UserRepository,
    FileRepository
  ],
})
export class AppModule {}
