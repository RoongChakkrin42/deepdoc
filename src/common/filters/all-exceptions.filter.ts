import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { MulterError } from 'multer';

interface ErrorBody {
  statusCode: number;
  message: string;
  path: string;
  timestamp: string;
}

/**
 * Turns every uncaught error into a consistent JSON body with an accurate HTTP
 * status. Previously the upload handler swallowed failures and returned
 * `{ status: 400 }` inside a `201 Created` response, so the client reported
 * success for submissions that had partly failed.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, message } = this.describe(exception);

    // `status` is a plain number, so compare against one rather than against
    // the HttpStatus enum member.
    if (status >= (HttpStatus.INTERNAL_SERVER_ERROR as number)) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}: ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.url} -> ${status}: ${message}`,
      );
    }

    const body: ErrorBody = {
      statusCode: status,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    response.status(status).json(body);
  }

  private describe(exception: unknown): { status: number; message: string } {
    if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      const message =
        typeof payload === 'string'
          ? payload
          : (((payload as Record<string, unknown>).message as string) ??
            exception.message);
      return { status: exception.getStatus(), message: this.flatten(message) };
    }

    if (exception instanceof MulterError) {
      // File too large, too many files, unexpected field name, ...
      return {
        status: HttpStatus.BAD_REQUEST,
        message: `Upload rejected (${exception.code})${exception.field ? ` on field "${exception.field}"` : ''}`,
      };
    }

    if (exception instanceof Error) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: exception.message,
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    };
  }

  private flatten(message: unknown): string {
    return Array.isArray(message) ? message.join('; ') : String(message);
  }
}
