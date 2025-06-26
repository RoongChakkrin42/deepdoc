import {
  Controller,
  Request,
  Post,
  UseGuards,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { AppService } from './app.service';
import { AuthGuard } from '@nestjs/passport';
import { AuthConsumer } from 'src/comsume.schema';
import { FilesInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
import * as pdfParse from 'pdf-parse';


@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService
  ) {}

  @UseGuards(AuthGuard('local'))
  @Post('login')
  async login(@Request() req: any) {
    return this.appService.login(req.user);
  }

  @Post('register')
  async register(@Request() req: AuthConsumer) {
    const response = await this.appService.register(
      req.body.username,
      req.body.password,
    );
    return { statusCode: response };
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('analyze')
  @UseInterceptors(
    FilesInterceptor('files', 50, {
      storage: multer.memoryStorage(), // <== store in memory, not disk
      fileFilter: (req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
          return cb(new Error('Only PDFs are allowed'), false);
        }
        cb(null, true);
      },
    }),
  )
  async analyze(@UploadedFiles() files: Express.Multer.File[]) {
    for (const file of files) {
      const data = await pdfParse(file.buffer);
      console.log(data.text); // extracted text
    }
    return { message: 'Files processed in memory' };
  }
}
