import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
  Type,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

/**
 * Parses a JSON string field from a multipart body and validates it against a
 * DTO class.
 *
 * A multipart body cannot carry nested objects, so submitter details arrive as
 * a JSON string in the `data` field. The original code ran a bare `JSON.parse`
 * with no validation, so a malformed body produced a 500 and a submission with
 * missing fields was stored happily.
 */
@Injectable()
export class ParseJsonPipe<T extends object>
  implements PipeTransform<string, T>
{
  constructor(private readonly dtoClass: Type<T>) {}

  transform(value: string, metadata: ArgumentMetadata): T {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new BadRequestException(
        `Field "${metadata.data ?? 'data'}" is required and must be a JSON string`,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new BadRequestException(
        `Field "${metadata.data ?? 'data'}" is not valid JSON`,
      );
    }

    const instance = plainToInstance(this.dtoClass, parsed);
    const errors = validateSync(instance as object, {
      whitelist: true,
      forbidNonWhitelisted: false,
    });

    if (errors.length > 0) {
      throw new BadRequestException(
        errors.flatMap((error) => Object.values(error.constraints ?? {})),
      );
    }

    return instance;
  }
}
