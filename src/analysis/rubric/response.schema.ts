import { Schema, Type } from '@google/genai';
import { LEVEL_IDS_DESCENDING, RUBRIC_CRITERIA } from './rubric';

const CRITERION_CODES = RUBRIC_CRITERIA.map((criterion) => criterion.code);

/**
 * The JSON shape Gemini is constrained to via `responseSchema`.
 *
 * The original implementation asked for JSON in prose and then scraped the
 * reply with `/\{[\s\S]*\}/` + `JSON.parse`, which broke whenever the model
 * wrapped the object in prose or emitted a trailing comma. Structured output
 * makes the shape a contract enforced by the API instead.
 *
 * Note what is *not* requested: any number at all. The model picks one of five
 * named maturity levels per criterion; the server turns levels into points,
 * averages them per dimension, applies the official weights and derives the
 * award tier. Models get arithmetic wrong often enough that a total which
 * disagrees with its own parts is a real failure mode — and a free-form score
 * is also the single largest source of run-to-run drift.
 */
export const ANALYSIS_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description:
        'บทสรุปภาพรวมของผลงานความยาวประมาณ 1 หน้า ในรูปแบบ Markdown ภาษาไทย ครอบคลุมจุดแข็งและจุดที่ต้องพัฒนา',
    },
    criteria: {
      type: Type.ARRAY,
      description: `ผลการประเมินครบทั้ง ${CRITERION_CODES.length} เกณฑ์ย่อย เรียงตามลำดับ ${CRITERION_CODES.join(', ')}`,
      minItems: String(CRITERION_CODES.length),
      maxItems: String(CRITERION_CODES.length),
      items: {
        type: Type.OBJECT,
        properties: {
          code: {
            type: Type.STRING,
            format: 'enum',
            enum: [...CRITERION_CODES],
            description: 'รหัสเกณฑ์ย่อย เช่น 1.2',
          },
          evidenceFound: {
            type: Type.ARRAY,
            description:
              'ข้อความที่คัดลอกจากเอกสารซึ่งใช้เป็นหลักฐานของเกณฑ์ข้อนี้ ไม่เกิน 3 ข้อความ ถ้าไม่พบให้เป็นอาร์เรย์ว่าง',
            maxItems: '3',
            items: { type: Type.STRING },
          },
          missing: {
            type: Type.ARRAY,
            description:
              'รายการ "สิ่งที่ต้องตรวจให้ได้" ของเกณฑ์ข้อนี้ที่ยังหาไม่พบในเอกสาร ถ้าครบทุกข้อให้เป็นอาร์เรย์ว่าง',
            items: { type: Type.STRING },
          },
          level: {
            type: Type.STRING,
            format: 'enum',
            enum: [...LEVEL_IDS_DESCENDING],
            description: 'ระดับที่เลือกตามบันไดการเลือกระดับ',
          },
          justification: {
            type: Type.STRING,
            description:
              'เหตุผลของระดับที่เลือก ระบุสิ่งที่ครบและสิ่งที่ขาดอย่างเฉพาะเจาะจง ภาษาไทย',
          },
        },
        required: [
          'code',
          'evidenceFound',
          'missing',
          'level',
          'justification',
        ],
        propertyOrdering: [
          'code',
          'evidenceFound',
          'missing',
          'level',
          'justification',
        ],
      },
    },
    overallComment: {
      type: Type.STRING,
      description: 'สรุปเหตุผลการประเมินโดยรวม ความยาว 2-3 ประโยค ภาษาไทย',
    },
  },
  required: ['summary', 'criteria', 'overallComment'],
  propertyOrdering: ['summary', 'criteria', 'overallComment'],
};

/** One criterion as the model returns it, before the server validates it. */
export interface RawCriterionAssessment {
  code: string;
  evidenceFound: string[];
  missing: string[];
  level: string;
  justification: string;
}

/** The raw object Gemini returns, before the server scores and totals it. */
export interface RawAnalysisResponse {
  summary: string;
  criteria: RawCriterionAssessment[];
  overallComment: string;
}
