import {
  Controller,
  Request,
  Post,
  UseGuards,
  UploadedFiles,
  UseInterceptors,
  HttpStatus,
  Get,
  Query,
} from '@nestjs/common';
import { AppService } from './app.service';
import { AuthGuard } from '@nestjs/passport';
import { AuthConsumer } from 'src/comsume.schema';
import {
  FilesInterceptor,
  FileFieldsInterceptor,
} from '@nestjs/platform-express';
import * as multer from 'multer';
import * as pdfParse from 'pdf-parse';

const evidencenumber = [
  { name: 'evidence11' },
  { name: 'evidence12' },
  { name: 'evidence13' },
  { name: 'evidence14' },
  { name: 'evidence21' },
  { name: 'evidence22' },
  { name: 'evidence23' },
  { name: 'evidence31' },
  { name: 'evidence41' },
  { name: 'evidence42' },
  { name: 'evidence51' },
  { name: 'evidence52' },
];

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

  // @UseGuards(AuthGuard('jwt'))
  // @Post('analyze')
  // @UseInterceptors(
  //   FilesInterceptor('files', 50, {
  //     storage: multer.memoryStorage(),
  //     fileFilter: (req, file, cb) => {
  //       if (file.mimetype !== 'application/pdf') {
  //         return cb(new Error('Only PDFs are allowed'), false);
  //       }
  //       cb(null, true);
  //     },
  //   }),
  // )
  // async analyze(
  //   @UploadedFiles() files: Express.Multer.File[],
  //   @Request() req: any,
  // ) {
  //   let projects: any = [];
  //   for (const file of files) {
  //     const data = await pdfParse(file.buffer);
  //     projects.push({ text: data.text, name: file.originalname });
  //   }
  //   const response = await this.appService.analyzeText(projects, req.user);
  //   return response;
  // }

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
  async uploadFiles(@UploadedFiles() files, @Request() req: any) {
    try {
      const dataJSON = await JSON.parse(req.body.data)
      const createdProject = await this.appService.uploadFile(
        files.project[0],
        '',
        dataJSON,
      );
      for (let i = 0; i < evidencenumber.length; i++) {
        const evidenceFiles = files[evidencenumber[i].name];
        for (let j = 0; j < evidenceFiles.length; j++) {
          const element = evidenceFiles[j];
          await this.appService.uploadFile(element, createdProject._id, {});
        }
      }
      return { status: HttpStatus.CREATED };
    } catch (error) {
      console.log(error);
      return { status: HttpStatus.BAD_REQUEST, error: error };
    }
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('resultlist')
  async resultlist(@Request() req: any, @Query('year') year: string) {
    return this.appService.resultlist({ year });
  }
}
