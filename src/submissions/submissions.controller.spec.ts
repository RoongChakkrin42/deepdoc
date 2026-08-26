import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { AllExceptionsFilter } from '../common/filters/all-exceptions.filter';
import { RUBRIC } from '../analysis/rubric/rubric';
import { AnalysisStatus } from './schemas/submission.schema';
import { SubmissionsController } from './submissions.controller';
import { SubmissionsService } from './submissions.service';

const TEST_SECRET = 'test-secret-that-is-long-enough';

/**
 * Exercises the real routing, the real JWT guard and the real validation
 * pipeline with the service mocked out, so the HTTP contract is covered
 * without needing MongoDB, S3 or Gemini.
 */
describe('SubmissionsController (HTTP)', () => {
  let app: INestApplication;
  let jwt: JwtService;

  const service = {
    getFormSchema: jest.fn(),
    create: jest.fn(),
    list: jest.fn(),
    retry: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule, JwtModule.register({ secret: TEST_SECRET })],
      controllers: [SubmissionsController],
      providers: [
        JwtStrategy,
        { provide: SubmissionsService, useValue: service },
        {
          provide: ConfigService,
          useValue: { get: () => TEST_SECRET },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  const accessToken = () =>
    jwt.sign({ sub: 'u1', username: 'reviewer', type: 'access' });

  const refreshToken = () =>
    jwt.sign({ sub: 'u1', username: 'reviewer', type: 'refresh' });

  describe('GET /submissions/form-schema', () => {
    it('is public and returns the rubric', async () => {
      service.getFormSchema.mockReturnValue({
        projectField: 'project',
        maxTotalScore: 100,
        dimensions: RUBRIC,
      });

      const response = await request(app.getHttpServer())
        .get('/submissions/form-schema')
        .expect(200);

      expect(response.body.dimensions).toHaveLength(RUBRIC.length);
      expect(response.body.projectField).toBe('project');
    });
  });

  describe('GET /submissions', () => {
    it('rejects a request with no token', async () => {
      await request(app.getHttpServer()).get('/submissions').expect(401);
      expect(service.list).not.toHaveBeenCalled();
    });

    it('rejects a refresh token used as a bearer credential', async () => {
      await request(app.getHttpServer())
        .get('/submissions')
        .set('Authorization', `Bearer ${refreshToken()}`)
        .expect(401);
    });

    it('defaults to the current year', async () => {
      service.list.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get('/submissions')
        .set('Authorization', `Bearer ${accessToken()}`)
        .expect(200);

      expect(service.list).toHaveBeenCalledWith(new Date().getFullYear());
    });

    it('coerces the year query parameter to a number', async () => {
      service.list.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get('/submissions?year=2025')
        .set('Authorization', `Bearer ${accessToken()}`)
        .expect(200);

      expect(service.list).toHaveBeenCalledWith(2025);
    });

    it('rejects an out-of-range year', async () => {
      await request(app.getHttpServer())
        .get('/submissions?year=1900')
        .set('Authorization', `Bearer ${accessToken()}`)
        .expect(400);
    });
  });

  describe('POST /submissions', () => {
    it('is public but rejects a malformed data field', async () => {
      await request(app.getHttpServer())
        .post('/submissions')
        .field('data', 'not-json')
        .expect(400);

      expect(service.create).not.toHaveBeenCalled();
    });

    it('rejects submitter details that fail validation', async () => {
      const response = await request(app.getHttpServer())
        .post('/submissions')
        .field(
          'data',
          JSON.stringify({
            name: '',
            projectName: 'x',
            department: 'y',
            email: 'not-an-email',
            phone: '123',
          }),
        )
        .expect(400);

      expect(response.body.message).toContain('อีเมลไม่ถูกต้อง');
      expect(service.create).not.toHaveBeenCalled();
    });

    it('accepts a valid submission with 202', async () => {
      service.create.mockResolvedValue({
        id: 'abc',
        status: AnalysisStatus.Pending,
      });

      const response = await request(app.getHttpServer())
        .post('/submissions')
        .field(
          'data',
          JSON.stringify({
            name: 'สมชาย ใจดี',
            projectName: 'โครงการทดสอบ',
            department: 'คณะวิศวกรรมศาสตร์',
            email: 'somchai@example.com',
            phone: '02-123-4567',
          }),
        );

      expect({ status: response.status, body: response.body }).toEqual({
        status: 202,
        body: { id: 'abc', status: 'pending' },
      });
      expect(service.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST /submissions/:id/retry', () => {
    it('requires authentication', async () => {
      await request(app.getHttpServer())
        .post('/submissions/abc/retry')
        .expect(401);
    });

    it('accepts an authenticated retry with 202', async () => {
      service.retry.mockResolvedValue({
        id: 'abc',
        status: AnalysisStatus.Pending,
      });

      await request(app.getHttpServer())
        .post('/submissions/abc/retry')
        .set('Authorization', `Bearer ${accessToken()}`)
        .expect(202);

      expect(service.retry).toHaveBeenCalledWith('abc');
    });
  });
});
