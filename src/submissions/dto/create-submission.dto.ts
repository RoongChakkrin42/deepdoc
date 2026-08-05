import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const trim = () =>
  Transform(({ value }): unknown =>
    typeof value === 'string' ? value.trim() : value,
  );

/**
 * The submitter details that ride along with the multipart upload.
 *
 * The browser sends them as a JSON string in the `data` field, because a
 * multipart body cannot carry nested objects. `SubmissionsController` parses
 * that string and validates the result against this class.
 */
export class CreateSubmissionDto {
  @trim()
  @IsString()
  @IsNotEmpty({ message: 'กรุณากรอกชื่อผู้ส่ง' })
  @MaxLength(200)
  name: string;

  @trim()
  @IsString()
  @IsNotEmpty({ message: 'กรุณากรอกชื่อโครงการ' })
  @MaxLength(300)
  projectName: string;

  @trim()
  @IsString()
  @IsNotEmpty({ message: 'กรุณากรอกคณะหรือสังกัด' })
  @MaxLength(200)
  department: string;

  @trim()
  @IsEmail({}, { message: 'อีเมลไม่ถูกต้อง' })
  @MaxLength(200)
  email: string;

  @trim()
  @IsString()
  @Matches(/^[0-9+\-\s()]{6,20}$/, { message: 'เบอร์โทรศัพท์ไม่ถูกต้อง' })
  phone: string;
}
