import { Schema, Type } from '@google/genai';
import { RUBRIC } from './rubric';

/**
 * The JSON shape Gemini is constrained to via `responseSchema`.
 *
 * The original implementation asked for JSON in prose and then scraped the
 * reply with `/\{[\s\S]*\}/` + `JSON.parse`, which broke whenever the model
 * wrapped the object in prose or emitted a trailing comma. Structured output
 * makes the shape a contract enforced by the API instead.
 *
 * Note what is *not* requested: the overall score. Summing the five dimension
 * scores is arithmetic, and the server does it — models get it wrong often
 * enough that a total which disagrees with its own parts is a real failure mode.
 */
export const ANALYSIS_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description:
        'บทสรุปภาพรวมของโครงการความยาวประมาณ 1 หน้า ในรูปแบบ Markdown ภาษาไทย',
    },
    overallComment: {
      type: Type.STRING,
      description: 'สรุปเหตุผลการให้คะแนนโดยรวม ความยาว 1-2 ประโยค ภาษาไทย',
    },
    dimensions: {
      type: Type.ARRAY,
      description: `ผลการประเมินครบทั้ง ${RUBRIC.length} มิติ เรียงตามลำดับมิติที่ 1 ถึง ${RUBRIC.length}`,
      minItems: String(RUBRIC.length),
      maxItems: String(RUBRIC.length),
      items: {
        type: Type.OBJECT,
        properties: {
          index: {
            type: Type.INTEGER,
            description: `หมายเลขมิติ (1-${RUBRIC.length})`,
          },
          score: {
            type: Type.INTEGER,
            description:
              'คะแนนที่ได้ในมิตินี้ ต้องไม่เกินคะแนนเต็มของมิติตามที่ระบุในเกณฑ์',
          },
          comment: {
            type: Type.STRING,
            description:
              'เหตุผลของคะแนน อ้างอิงหลักฐานที่พบหรือระบุหลักฐานที่ขาดไปอย่างเฉพาะเจาะจง',
          },
        },
        required: ['index', 'score', 'comment'],
        propertyOrdering: ['index', 'score', 'comment'],
      },
    },
  },
  required: ['summary', 'overallComment', 'dimensions'],
  propertyOrdering: ['summary', 'overallComment', 'dimensions'],
};

/** The raw object Gemini returns, before the server validates and totals it. */
export interface RawAnalysisResponse {
  summary: string;
  overallComment: string;
  dimensions: { index: number; score: number; comment: string }[];
}
