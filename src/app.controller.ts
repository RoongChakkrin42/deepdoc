import {
  Controller,
  Request,
  Post,
  UseGuards,
  UploadedFiles,
  UseInterceptors,
  HttpStatus,
} from '@nestjs/common';
import { AppService } from './app.service';
import { AuthGuard } from '@nestjs/passport';
import { AuthConsumer } from 'src/comsume.schema';
import { FilesInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
import * as pdfParse from 'pdf-parse';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @UseGuards(AuthGuard('local'))
  @Post('login')
  async login(@Request() req: any) {
    return this.appService.login(req.body);
  }

  @Post('register')
  async register(@Request() req: AuthConsumer) {
    const response = await this.appService.register(
      req.body.username,
      req.body.password,
    );
    return response;
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('analyze')
  @UseInterceptors(
    FilesInterceptor('files', 50, {
      storage: multer.memoryStorage(),
      fileFilter: (req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
          return cb(new Error('Only PDFs are allowed'), false);
        }
        cb(null, true);
      },
    }),
  )
  async analyze(
    @UploadedFiles() files: Express.Multer.File[],
    @Request() req: any,
  ) {
    let projects: any = [];
    for (const file of files) {
      const data = await pdfParse(file.buffer);
      projects.push({ text: data.text, name: file.originalname });
    }
    const response = await this.appService.analyzeText(projects, req.user);
    return response;
  }

  @Post()
  @UseInterceptors(
    FilesInterceptor('files', 6, {
      storage: multer.memoryStorage(),
      fileFilter: (req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
          return cb(new Error('Only PDFs are allowed'), false);
        }
        cb(null, true);
      },
    }),
  )
  async uploadFiles(@UploadedFiles() files: Express.Multer.File[]) {
    try {
      const uploadResults = await Promise.all(
        files.map((file) =>
          this.appService.uploadFile(
            file.originalname,
            file.buffer,
            file.mimetype,
          ),
        ),
      );
      return { status: HttpStatus.ACCEPTED, ...uploadResults };
    } catch (error) {
      return HttpStatus.BAD_REQUEST;
    }
  }
}
