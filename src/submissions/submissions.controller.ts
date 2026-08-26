import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JsonBody } from '../common/decorators/json-body.decorator';
import { ParseJsonPipe } from '../common/pipes/parse-json.pipe';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { ListSubmissionsDto } from './dto/list-submissions.dto';
import { AnalysisStatus } from './schemas/submission.schema';
import {
  SubmissionsService,
  SubmissionView,
  UPLOAD_FIELDS,
  UploadedFiles as Files,
} from './submissions.service';

@Controller('submissions')
export class SubmissionsController {
  constructor(private readonly submissions: SubmissionsService) {}

  /**
   * Describes the upload form. The client renders its fields from this, so the
   * rubric in `analysis/rubric/rubric.ts` stays the only place criteria are
   * defined — previously the same 12 field names were duplicated across the
   * controller, the multer config and the React form.
   */
  @Get('form-schema')
  getFormSchema() {
    return this.submissions.getFormSchema();
  }

  /**
   * Public on purpose: submitters are students, not accounts. Rate limited and
   * validated instead. See the README's Security notes before deploying.
   */
  @Throttle({ default: { limit: 5, ttl: 60 * 60_000 } })
  @UseInterceptors(FileFieldsInterceptor(UPLOAD_FIELDS))
  @HttpCode(HttpStatus.ACCEPTED)
  @Post()
  create(
    @UploadedFiles() files: Files,
    @JsonBody('data', new ParseJsonPipe(CreateSubmissionDto))
    dto: CreateSubmissionDto,
  ): Promise<{ id: string; status: AnalysisStatus }> {
    return this.submissions.create(dto, files ?? {});
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  list(@Query() query: ListSubmissionsDto): Promise<SubmissionView[]> {
    return this.submissions.list(query.year ?? new Date().getFullYear());
  }

  /** Re-runs a failed analysis without needing the submitter to upload again. */
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  @Post(':id/retry')
  retry(
    @Param('id') id: string,
  ): Promise<{ id: string; status: AnalysisStatus }> {
    return this.submissions.retry(id);
  }
}
