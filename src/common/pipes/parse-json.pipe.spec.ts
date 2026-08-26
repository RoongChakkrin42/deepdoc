import { BadRequestException, ArgumentMetadata } from '@nestjs/common';
import { CreateSubmissionDto } from '../../submissions/dto/create-submission.dto';
import { ParseJsonPipe } from './parse-json.pipe';

const META: ArgumentMetadata = { type: 'body', data: 'data' };

const VALID = {
  name: 'สมชาย ใจดี',
  projectName: 'โครงการทดสอบ',
  department: 'คณะวิศวกรรมศาสตร์',
  email: 'somchai@example.com',
  phone: '02-123-4567',
};

describe('ParseJsonPipe', () => {
  const pipe = new ParseJsonPipe(CreateSubmissionDto);

  it('parses and returns a populated DTO instance', () => {
    const result = pipe.transform(JSON.stringify(VALID), META);

    expect(result).toBeInstanceOf(CreateSubmissionDto);
    expect(result).toEqual(VALID);
  });

  it('trims surrounding whitespace', () => {
    const result = pipe.transform(
      JSON.stringify({ ...VALID, name: '  สมชาย ใจดี  ' }),
      META,
    );

    expect(result.name).toBe('สมชาย ใจดี');
  });

  it('rejects a non-JSON string', () => {
    expect(() => pipe.transform('not-json', META)).toThrow(BadRequestException);
  });

  it('rejects an empty field', () => {
    expect(() => pipe.transform('', META)).toThrow(BadRequestException);
  });

  it('rejects a bad email with the Thai message', () => {
    // BadRequestException carries the array payload in its response body, not
    // in `message`, so assert on the response rather than the error string.
    expect.assertions(2);
    try {
      pipe.transform(JSON.stringify({ ...VALID, email: 'nope' }), META);
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        message: expect.arrayContaining(['อีเมลไม่ถูกต้อง']),
      });
    }
  });

  it('rejects a missing required field', () => {
    const withoutDepartment = { ...VALID };
    delete (withoutDepartment as Partial<typeof VALID>).department;

    expect(() =>
      pipe.transform(JSON.stringify(withoutDepartment), META),
    ).toThrow(BadRequestException);
  });
});
