import { BadRequestException, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AnalysisModule } from '../analysis/analysis.module';
import { EnvironmentVariables } from '../common/config/env.validation';
import { StorageModule } from '../storage/storage.module';
import { Submission, SubmissionSchema } from './schemas/submission.schema';
import { SubmissionsController } from './submissions.controller';
import { SubmissionsRepository } from './submissions.repository';
import { SubmissionsService } from './submissions.service';

/** A submission is one report PDF and nothing else. */
const MAX_FILES_PER_REQUEST = 1;

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Submission.name, schema: SubmissionSchema },
    ]),
    StorageModule,
    AnalysisModule,
    // Registered here rather than on the interceptor so the limits come from
    // validated config instead of a literal buried in a decorator.
    MulterModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        storage: memoryStorage(),
        limits: {
          fileSize: config.get('MAX_UPLOAD_MB', { infer: true }) * 1024 * 1024,
          files: MAX_FILES_PER_REQUEST,
        },
        fileFilter: (_req, file, callback) => {
          if (file.mimetype !== 'application/pdf') {
            callback(
              new BadRequestException(
                `รองรับเฉพาะไฟล์ PDF เท่านั้น (${file.originalname})`,
              ),
              false,
            );
            return;
          }
          callback(null, true);
        },
      }),
    }),
  ],
  controllers: [SubmissionsController],
  providers: [SubmissionsService, SubmissionsRepository],
})
export class SubmissionsModule {}
