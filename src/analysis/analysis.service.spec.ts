import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../common/config/env.validation';
import { AnalysisResponseError, AnalysisService } from './analysis.service';
import { RUBRIC } from './rubric/rubric';

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

/** A well-formed reply that awards every dimension its full weight. */
const perfectScore = () =>
  JSON.stringify({
    summary: '# สรุปโครงการ',
    overallComment: 'ครบถ้วน',
    dimensions: RUBRIC.map((dimension) => ({
      index: dimension.index,
      score: dimension.weight,
      comment: `ครบตามเกณฑ์มิติที่ ${dimension.index}`,
    })),
  });

const input = (evidenceCount = 0) => ({
  projectName: 'โครงการทดสอบ',
  report: { filename: 'report.pdf', buffer: Buffer.from('report-bytes') },
  evidence: Array.from({ length: evidenceCount }, (_, i) => ({
    criterionCode: RUBRIC[0].criteria[0].code,
    filename: `evidence-${i}.pdf`,
    buffer: Buffer.from(`evidence-bytes-${i}`),
  })),
});

describe('AnalysisService', () => {
  let service: AnalysisService;

  beforeEach(() => {
    generateContent.mockReset();
    service = new AnalysisService(config);
  });

  it('totals the dimension scores itself rather than trusting the model', async () => {
    generateContent.mockResolvedValue({ text: perfectScore() });

    const result = await service.analyze(input());

    expect(result.overallScore).toBe(100);
    expect(result.dimensions).toHaveLength(RUBRIC.length);
    expect(result.model).toBe(CONFIG.GEMINI_MODEL);
  });

  it('clamps an out-of-range score and records why', async () => {
    generateContent.mockResolvedValue({
      text: JSON.stringify({
        summary: 's',
        overallComment: 'c',
        dimensions: RUBRIC.map((dimension) => ({
          index: dimension.index,
          // 999 for the first dimension, 0 for the rest.
          score: dimension.index === 1 ? 999 : 0,
          comment: 'x',
        })),
      }),
    });

    const result = await service.analyze(input());

    expect(result.dimensions[0].score).toBe(RUBRIC[0].weight);
    expect(result.overallScore).toBe(RUBRIC[0].weight);
    expect(result.notes.join(' ')).toContain('อยู่นอกช่วง');
  });

  it('rejects a response that omits a dimension', async () => {
    generateContent.mockResolvedValue({
      text: JSON.stringify({
        summary: 's',
        overallComment: 'c',
        dimensions: [{ index: 1, score: 10, comment: 'x' }],
      }),
    });

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

  it('sends the report and every evidence PDF as inline data', async () => {
    generateContent.mockResolvedValue({ text: perfectScore() });

    await service.analyze(input(3));

    const request = generateContent.mock.calls[0][0];
    const parts = request.contents[0].parts;
    const pdfParts = parts.filter(
      (part: { inlineData?: unknown }) => part.inlineData,
    );

    // 1 report + 3 evidence files.
    expect(pdfParts).toHaveLength(4);
    expect(request.config.responseMimeType).toBe('application/json');
    expect(request.config.responseSchema).toBeDefined();
  });

  it('labels criteria that have no evidence attached', async () => {
    generateContent.mockResolvedValue({ text: perfectScore() });

    await service.analyze(input());

    const text = generateContent.mock.calls[0][0].contents[0].parts
      .map((part: { text?: string }) => part.text ?? '')
      .join('\n');

    expect(text).toContain('ไม่มีไฟล์หลักฐานแนบมาสำหรับข้อนี้');
  });
});
