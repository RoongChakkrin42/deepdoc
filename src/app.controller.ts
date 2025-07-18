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
import { FilesInterceptor, FileFieldsInterceptor } from '@nestjs/platform-express';
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

  @Post('uploadFiles')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'evidence11', maxCount: 5 },
        { name: 'evidence12', maxCount: 5 },
        { name: 'evidence13', maxCount: 5 },
        { name: 'evidence14', maxCount: 5 },
        { name: 'evidence21', maxCount: 5 },
        { name: 'evidence22', maxCount: 5 },
        { name: 'evidence23', maxCount: 5 },
        { name: 'evidence31', maxCount: 5 },
        { name: 'evidence41', maxCount: 5 },
        { name: 'evidence42', maxCount: 5 },
        { name: 'evidence51', maxCount: 5 },
        { name: 'evidence52', maxCount: 5 },
        { name: 'project', maxCount: 1 },
      ],
      {
        storage: multer.memoryStorage(),
        fileFilter: (req, file, cb) => {
          if (file.mimetype !== 'application/pdf') {
            return cb(new Error('Only PDFs are allowed'), false);
          }
          cb(null, true);
        },
      },
    ),
  )
  async uploadFiles(
    @UploadedFiles() files,
  ) {
    try {
      // const uploadResults = await Promise.all(
      //   evidences11.map((file) =>
      //     this.appService.uploadFile(
      //       file.originalname,
      //       file.buffer,
      //       file.mimetype,
      //     ),
      //   ),
      // );
      console.log(files.evidence11)
      return { status: HttpStatus.ACCEPTED };
    } catch (error) {
      console.log(error);
      return { status: HttpStatus.BAD_REQUEST, error: error };
    }
  }
}
