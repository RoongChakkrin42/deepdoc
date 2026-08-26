import { GoogleGenAI, Part } from '@google/genai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../common/config/env.validation';
import { buildRubricPrompt, SYSTEM_INSTRUCTION } from './rubric/prompt';
import {
  ANALYSIS_RESPONSE_SCHEMA,
  RawAnalysisResponse,
  RawCriterionAssessment,
} from './rubric/response.schema';
import {
  awardTierFor,
  levelById,
  levelForScore,
  RUBRIC,
  RubricLevelId,
} from './rubric/rubric';

export interface AnalysisFile {
  filename: string;
  buffer: Buffer;
}

export interface AnalysisInput {
  projectName: string;
  /** The single report PDF. It is the only evidence the grader gets. */
  report: AnalysisFile;
}

/** One rubric criterion as graded. */
export interface CriterionScore {
  code: string;
  title: string;
  level: RubricLevelId;
  levelLabel: string;
  /** Representative points for the chosen level, 0-100. */
  score: number;
  /** Text the model lifted out of the report to support the level. */
  evidenceFound: string[];
  /** Rubric checks the model could not find in the report. */
  missing: string[];
  comment: string;
}

export interface DimensionScore {
  index: number;
  title: string;
  /** Percentage weight of this dimension. */
  weight: number;
  /** Mean of the dimension's criterion scores, 0-100. */
  score: number;
  /** `score` after weighting, i.e. the points this dimension adds to the total. */
  weightedScore: number;
  /** The published band `score` falls into. */
  level: RubricLevelId;
  levelLabel: string;
  criteria: CriterionScore[];
}

export interface AnalysisOutcome {
  summary: string;
  /** Weighted total, 0-100. */
  overallScore: number;
  overallComment: string;
  award: { id: string; label: string; description: string };
  dimensions: DimensionScore[];
  model: string;
  analyzedAt: Date;
  /** Anything the reviewer should know about how this run was assembled. */
  notes: string[];
}

/** Raised when a response is structurally unusable; the caller may retry. */
export class AnalysisResponseError extends Error {}

/** base64 inflates payloads by 4/3; the request budget applies to the encoded size. */
const encodedSize = (bytes: number) => Math.ceil(bytes / 3) * 4;

const round2 = (value: number) => Math.round(value * 100) / 100;

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);
  private readonly ai: GoogleGenAI;
  private readonly model: string;
  private readonly payloadBudget: number;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.ai = new GoogleGenAI({
      apiKey: config.get('GEMINI_API_KEY', { infer: true }),
    });
    this.model = config.get('GEMINI_MODEL', { infer: true });
    this.payloadBudget =
      config.get('GEMINI_MAX_PAYLOAD_MB', { infer: true }) * 1024 * 1024;
  }

  /**
   * Scores one submission from its single report PDF.
   *
   * The model returns a maturity level per criterion and no numbers at all.
   * Turning those levels into a score, averaging them per dimension, applying
   * the official weights and picking the award tier all happen here, so a
   * result can never show a total that disagrees with the parts it is made of.
   */
  async analyze(input: AnalysisInput): Promise<AnalysisOutcome> {
    const encoded = encodedSize(input.report.buffer.length);
    if (encoded > this.payloadBudget) {
      throw new Error(
        `ไฟล์รายงาน "${input.report.filename}" ใหญ่เกินกว่าที่ส่งให้ Gemini ได้ในคำขอเดียว (${Math.round(encoded / 1024 / 1024)} MB หลังเข้ารหัส เกินเพดาน ${Math.round(this.payloadBudget / 1024 / 1024)} MB)`,
      );
    }

    this.logger.log(
      `Analysing "${input.projectName}" (${input.report.filename}) via ${this.model}`,
    );

    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: [{ role: 'user', parts: this.buildParts(input) }],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: ANALYSIS_RESPONSE_SCHEMA,
        // Grading should be reproducible, not creative. The original used 1.0.
        // Measured at 0.2, two runs over an identical submission returned 46
        // and 26 out of 100 — every dimension shifted the same direction, so
        // the model was re-picking how strictly to read the rubric, not adding
        // per-dimension noise. 0 does not make this fully deterministic, but it
        // removes the sampling contribution; asking for a level rather than a
        // number removes most of the rest. See the README's Known limitations.
        temperature: 0,
      },
    });

    const text = response.text;
    if (!text) {
      throw new AnalysisResponseError(
        `Model returned no text (finishReason: ${response.candidates?.[0]?.finishReason ?? 'unknown'})`,
      );
    }

    let raw: RawAnalysisResponse;
    try {
      raw = JSON.parse(text) as RawAnalysisResponse;
    } catch (error) {
      throw new AnalysisResponseError(
        `Model returned malformed JSON despite responseSchema: ${(error as Error).message}`,
      );
    }

    return this.score(raw);
  }

  /** Lays out the request: the rubric, then the report itself. */
  private buildParts(input: AnalysisInput): Part[] {
    return [
      { text: buildRubricPrompt() },
      {
        text: `\n=== เอกสารที่ต้องประเมิน ===\nชื่อผลงาน: ${input.projectName}\nชื่อไฟล์: ${input.report.filename}`,
      },
      {
        inlineData: {
          mimeType: 'application/pdf',
          data: input.report.buffer.toString('base64'),
        },
      },
    ];
  }

  /**
   * Turns the model's levels into the scored result.
   *
   * Every arithmetic step is here rather than in the prompt: level -> points,
   * points -> dimension mean, mean -> weighted contribution, contributions ->
   * total -> award tier. Each figure is rounded before the next step consumes
   * it, so the total is exactly the sum of the numbers shown beside it.
   */
  private score(raw: RawAnalysisResponse): AnalysisOutcome {
    if (!Array.isArray(raw.criteria)) {
      throw new AnalysisResponseError('Response has no criteria array');
    }

    const notes: string[] = [];
    const byCode = new Map<string, RawCriterionAssessment>();
    for (const assessment of raw.criteria) {
      const code = String(assessment?.code ?? '').trim();
      if (!code) continue;
      if (byCode.has(code)) {
        notes.push(
          `โมเดลตอบเกณฑ์ข้อ ${code} ซ้ำมากกว่าหนึ่งครั้ง ระบบใช้คำตอบแรกและละที่เหลือ`,
        );
        continue;
      }
      byCode.set(code, assessment);
    }

    const knownCodes = new Set(
      RUBRIC.flatMap((dimension) =>
        dimension.criteria.map((criterion) => criterion.code),
      ),
    );
    for (const code of byCode.keys()) {
      if (!knownCodes.has(code)) {
        notes.push(`โมเดลตอบเกณฑ์ข้อ ${code} ซึ่งไม่มีอยู่ในเกณฑ์ ระบบละทิ้ง`);
      }
    }

    const dimensions = RUBRIC.map((dimension) => {
      const criteria = dimension.criteria.map((criterion) =>
        this.scoreCriterion(criterion.code, criterion.title, byCode, notes),
      );

      const mean =
        criteria.reduce((sum, criterion) => sum + criterion.score, 0) /
        criteria.length;
      const score = round2(mean);
      const band = levelForScore(score);

      return {
        index: dimension.index,
        title: dimension.title,
        weight: dimension.weight,
        score,
        weightedScore: round2((score * dimension.weight) / 100),
        level: band.id,
        levelLabel: band.label,
        criteria,
      };
    });

    const overallScore = round2(
      dimensions.reduce((sum, dimension) => sum + dimension.weightedScore, 0),
    );
    const tier = awardTierFor(overallScore);

    return {
      summary: String(raw.summary ?? '').trim(),
      overallScore,
      overallComment: String(raw.overallComment ?? '').trim(),
      award: {
        id: tier.id,
        label: tier.label,
        description: tier.description,
      },
      dimensions,
      model: this.model,
      analyzedAt: new Date(),
      notes,
    };
  }

  private scoreCriterion(
    code: string,
    title: string,
    byCode: Map<string, RawCriterionAssessment>,
    notes: string[],
  ): CriterionScore {
    const assessment = byCode.get(code);
    if (!assessment) {
      throw new AnalysisResponseError(`Response is missing criterion ${code}`);
    }

    const level = levelById(String(assessment.level ?? ''));
    if (!level) {
      throw new AnalysisResponseError(
        `Criterion ${code} has an unknown level "${String(assessment.level)}"`,
      );
    }

    const evidenceFound = toStringList(assessment.evidenceFound);

    // The prompt makes "no evidence" and "inadequate" the same thing. A higher
    // level with nothing quoted means the model scored on impression, which the
    // reviewer should see rather than have silently folded into the total.
    if (level.id !== 'inadequate' && evidenceFound.length === 0) {
      notes.push(
        `เกณฑ์ข้อ ${code} ได้ระดับ "${level.label}" แต่โมเดลไม่ได้ยกข้อความหลักฐานจากเอกสารมาประกอบ ควรตรวจสอบด้วยตนเอง`,
      );
    }

    return {
      code,
      title,
      level: level.id,
      levelLabel: level.label,
      score: level.score,
      evidenceFound,
      missing: toStringList(assessment.missing),
      comment:
        String(assessment.justification ?? '').trim() ||
        'ไม่มีคำอธิบายจากโมเดล',
    };
  }
}

const toStringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map((entry) => String(entry ?? '').trim()).filter(Boolean)
    : [];
