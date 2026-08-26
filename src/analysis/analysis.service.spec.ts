import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../common/config/env.validation';
import { AnalysisResponseError, AnalysisService } from './analysis.service';
import { RUBRIC, RUBRIC_CRITERIA } from './rubric/rubric';

const generateContent = jest.fn();

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent },
  })),
  Type: {
    OBJECT: 'OBJECT',
    STRING: 'STRING',
    ARRAY: 'ARRAY',
    INTEGER: 'INTEGER',
    NUMBER: 'NUMBER',
  },
}));

const CONFIG = {
  GEMINI_API_KEY: 'test-key',
  GEMINI_MODEL: 'gemini-3.6-flash',
  GEMINI_MAX_PAYLOAD_MB: 18,
} as const;

const config = {
  get: (key: keyof typeof CONFIG) => CONFIG[key],
} as unknown as ConfigService<EnvironmentVariables, true>;

/** A well-formed reply putting every criterion at `level`. */
const reply = (level: string, overrides: Record<string, string> = {}) =>
  JSON.stringify({
    summary: '# สรุปผลงาน',
    overallComment: 'ครบถ้วน',
    criteria: RUBRIC_CRITERIA.map((criterion) => ({
      code: criterion.code,
      evidenceFound: [`ข้อความหลักฐานของข้อ ${criterion.code}`],
      missing: [],
      level: overrides[criterion.code] ?? level,
      justification: `เหตุผลของข้อ ${criterion.code}`,
    })),
  });

const input = () => ({
  projectName: 'ผลงานทดสอบ',
  report: { filename: 'report.pdf', buffer: Buffer.from('report-bytes') },
});

describe('AnalysisService', () => {
  let service: AnalysisService;

  beforeEach(() => {
    generateContent.mockReset();
    service = new AnalysisService(config);
  });

  it('scores levels itself rather than asking the model for numbers', async () => {
    generateContent.mockResolvedValue({ text: reply('mature') });

    const result = await service.analyze(input());

    // Every level scores at its band midpoint, so uniform grading lands on it.
    expect(result.overallScore).toBe(80);
    expect(result.award.id).toBe('recognition');
    expect(result.dimensions).toHaveLength(RUBRIC.length);
    expect(result.model).toBe(CONFIG.GEMINI_MODEL);
  });

  it('awards the top tier only when every criterion is outstanding', async () => {
    generateContent.mockResolvedValue({ text: reply('outstanding') });

    const result = await service.analyze(input());

    expect(result.overallScore).toBe(95);
    expect(result.award.id).toBe('excellence');
  });

  it('keeps the total equal to the sum of the weighted dimensions', async () => {
    const overrides = Object.fromEntries(
      RUBRIC[0].criteria.map((criterion) => [criterion.code, 'inadequate']),
    );
    generateContent.mockResolvedValue({ text: reply('mature', overrides) });

    const result = await service.analyze(input());

    const summed = result.dimensions.reduce(
      (total, dimension) => total + dimension.weightedScore,
      0,
    );
    expect(result.overallScore).toBe(summed);
    // Dimension 1 at 15/100 with a weight of 20, the rest at 80/100.
    expect(result.dimensions[0].score).toBe(15);
    expect(result.dimensions[0].weightedScore).toBe(3);
    expect(result.overallScore).toBe(67);
    expect(result.award.id).toBe('improvement');
  });

  it('averages a dimension over its own criteria', async () => {
    const [first, ...rest] = RUBRIC[1].criteria;
    generateContent.mockResolvedValue({
      text: reply('mature', {
        [first.code]: 'developing',
        ...Object.fromEntries(rest.map((c) => [c.code, 'outstanding'])),
      }),
    });

    const result = await service.analyze(input());

    // (60 + 95 + 95) / 3
    expect(result.dimensions[1].score).toBe(83.33);
    expect(result.dimensions[1].level).toBe('mature');
    expect(result.dimensions[1].criteria).toHaveLength(
      RUBRIC[1].criteria.length,
    );
  });

  it('flags a level awarded without a supporting quote', async () => {
    const raw = JSON.parse(reply('mature')) as {
      criteria: { evidenceFound: string[] }[];
    };
    raw.criteria[0].evidenceFound = [];
    generateContent.mockResolvedValue({ text: JSON.stringify(raw) });

    const result = await service.analyze(input());

    expect(result.notes.join(' ')).toContain(RUBRIC_CRITERIA[0].code);
    expect(result.notes.join(' ')).toContain('ไม่ได้ยกข้อความหลักฐาน');
    // Recorded, not silently corrected — the level still counts.
    expect(result.dimensions[0].criteria[0].score).toBe(80);
  });

  it('rejects a response that omits a criterion', async () => {
    const raw = JSON.parse(reply('mature')) as { criteria: unknown[] };
    raw.criteria = raw.criteria.slice(1);
    generateContent.mockResolvedValue({ text: JSON.stringify(raw) });

    await expect(service.analyze(input())).rejects.toBeInstanceOf(
      AnalysisResponseError,
    );
  });

  it('rejects a level that is not one of the five', async () => {
    generateContent.mockResolvedValue({ text: reply('excellent') });

    await expect(service.analyze(input())).rejects.toBeInstanceOf(
      AnalysisResponseError,
    );
  });

  it('rejects an empty response so the caller can retry', async () => {
    generateContent.mockResolvedValue({ text: undefined, candidates: [] });

    await expect(service.analyze(input())).rejects.toBeInstanceOf(
      AnalysisResponseError,
    );
  });

  it('sends the report as inline data alongside the rubric', async () => {
    generateContent.mockResolvedValue({ text: reply('mature') });

    await service.analyze(input());

    const request = generateContent.mock.calls[0][0];
    const parts = request.contents[0].parts;

    expect(
      parts.filter((part: { inlineData?: unknown }) => part.inlineData),
    ).toHaveLength(1);
    expect(request.config.responseMimeType).toBe('application/json');
    expect(request.config.responseSchema).toBeDefined();
    expect(request.config.temperature).toBe(0);
  });

  it('puts every criterion and the university framework in the prompt', async () => {
    generateContent.mockResolvedValue({ text: reply('mature') });

    await service.analyze(input());

    const text = generateContent.mock.calls[0][0].contents[0].parts
      .map((part: { text?: string }) => part.text ?? '')
      .join('\n');

    RUBRIC_CRITERIA.forEach((criterion) => {
      expect(text).toContain(criterion.code);
      criterion.checks.forEach((check) => expect(text).toContain(check));
    });
    expect(text).toContain('Cybersecurity and Data Privacy');
  });

  it('refuses a report larger than the request budget instead of sending nothing', async () => {
    const oversized = {
      projectName: 'ผลงานใหญ่',
      report: {
        filename: 'huge.pdf',
        buffer: Buffer.alloc(19 * 1024 * 1024),
      },
    };

    await expect(service.analyze(oversized)).rejects.toThrow('ใหญ่เกิน');
    expect(generateContent).not.toHaveBeenCalled();
  });
});
