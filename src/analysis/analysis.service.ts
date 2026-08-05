import { GoogleGenAI, Part } from '@google/genai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../common/config/env.validation';
import { buildRubricPrompt, SYSTEM_INSTRUCTION } from './rubric/prompt';
import {
  ANALYSIS_RESPONSE_SCHEMA,
  RawAnalysisResponse,
} from './rubric/response.schema';
import { RUBRIC, RUBRIC_CRITERIA } from './rubric/rubric';

export interface AnalysisFile {
  filename: string;
  buffer: Buffer;
}

export interface AnalysisInput {
  projectName: string;
  report: AnalysisFile;
  /** Evidence PDFs keyed by the rubric criterion they were uploaded for. */
  evidence: (AnalysisFile & { criterionCode: string })[];
}

export interface AnalysisOutcome {
  summary: string;
  overallScore: number;
  overallComment: string;
  dimensions: {
    index: number;
    title: string;
    score: number;
    maxScore: number;
    comment: string;
  }[];
  model: string;
  analyzedAt: Date;
  /** Anything the reviewer should know about how this run was assembled. */
  notes: string[];
}

/** Raised when a response is structurally unusable; the caller may retry. */
export class AnalysisResponseError extends Error {}

/** base64 inflates payloads by 4/3; the request budget applies to the encoded size. */
const encodedSize = (bytes: number) => Math.ceil(bytes / 3) * 4;

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
   * Scores one submission.
   *
   * Both the report *and* every evidence PDF go to the model as inline data.
   * The rubric asks for documentary proof on every criterion, so grading the
   * report alone — which is what the first version did — asks the model to
   * judge evidence it was never shown.
   */
  async analyze(input: AnalysisInput): Promise<AnalysisOutcome> {
    const { parts, notes } = this.buildParts(input);

    this.logger.log(
      `Analysing "${input.projectName}" with ${input.evidence.length - notes.length} evidence file(s) via ${this.model}`,
    );

    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: [{ role: 'user', parts }],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: ANALYSIS_RESPONSE_SCHEMA,
        // Grading should be reproducible, not creative. The original used 1.0.
        // Measured at 0.2, two runs over an identical submission returned 46
        // and 26 out of 100 — every dimension shifted the same direction, so
        // the model was re-picking how strictly to read the rubric, not adding
        // per-dimension noise. 0 does not make this fully deterministic, but it
        // removes the sampling contribution. See the README's Known limitations.
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

    return this.normalise(raw, notes);
  }

  /**
   * Lays out the request: rubric, then the report, then evidence grouped by
   * criterion, each PDF introduced by a text part so the model knows which
   * criterion the bytes that follow are meant to prove.
   */
  private buildParts(input: AnalysisInput): { parts: Part[]; notes: string[] } {
    const parts: Part[] = [{ text: buildRubricPrompt() }];
    const notes: string[] = [];

    parts.push({
      text: `\n=== เอกสารโครงการ ===\nชื่อโครงการ: ${input.projectName}\nชื่อไฟล์: ${input.report.filename}`,
    });
    parts.push(this.pdfPart(input.report.buffer));

    let used = encodedSize(input.report.buffer.length);
    const byCriterion = new Map<
      string,
      (AnalysisFile & { criterionCode: string })[]
    >();
    for (const file of input.evidence) {
      const bucket = byCriterion.get(file.criterionCode) ?? [];
      bucket.push(file);
      byCriterion.set(file.criterionCode, bucket);
    }

    for (const criterion of RUBRIC_CRITERIA) {
      const files = byCriterion.get(criterion.code) ?? [];

      if (files.length === 0) {
        parts.push({
          text: `\n=== หลักฐานข้อ ${criterion.code} (${criterion.title}) ===\nไม่มีไฟล์หลักฐานแนบมาสำหรับข้อนี้`,
        });
        continue;
      }

      for (const file of files) {
        const cost = encodedSize(file.buffer.length);

        if (used + cost > this.payloadBudget) {
          // Surfaced to the reviewer rather than dropped quietly.
          notes.push(
            `ไฟล์หลักฐาน "${file.filename}" (ข้อ ${criterion.code}) ไม่ได้ถูกส่งให้ AI เนื่องจากคำขอเกินขนาดสูงสุดที่ Gemini รับได้`,
          );
          this.logger.warn(
            `Skipped ${file.filename} for criterion ${criterion.code}: payload budget exhausted`,
          );
          continue;
        }

        parts.push({
          text: `\n=== หลักฐานข้อ ${criterion.code} (${criterion.title}) ===\nชื่อไฟล์: ${file.filename}`,
        });
        parts.push(this.pdfPart(file.buffer));
        used += cost;
      }
    }

    return { parts, notes };
  }

  private pdfPart(buffer: Buffer): Part {
    return {
      inlineData: {
        mimeType: 'application/pdf',
        data: buffer.toString('base64'),
      },
    };
  }

  /**
   * Validates the model's numbers against the rubric and computes the total
   * server-side, so a submission can never show a total that disagrees with
   * the dimension scores it is made of.
   */
  private normalise(
    raw: RawAnalysisResponse,
    notes: string[],
  ): AnalysisOutcome {
    if (!Array.isArray(raw.dimensions)) {
      throw new AnalysisResponseError('Response has no dimensions array');
    }

    const scored = RUBRIC.map((dimension) => {
      const match = raw.dimensions.find((d) => d.index === dimension.index);

      if (!match) {
        throw new AnalysisResponseError(
          `Response is missing dimension ${dimension.index}`,
        );
      }

      const score = Number(match.score);
      if (!Number.isFinite(score)) {
        throw new AnalysisResponseError(
          `Dimension ${dimension.index} has a non-numeric score`,
        );
      }

      const clamped = Math.min(
        Math.max(Math.round(score), 0),
        dimension.weight,
      );
      if (clamped !== score) {
        notes.push(
          `คะแนนมิติที่ ${dimension.index} ที่โมเดลให้ (${score}) อยู่นอกช่วง 0-${dimension.weight} จึงถูกปรับเป็น ${clamped}`,
        );
      }

      return {
        index: dimension.index,
        title: dimension.title,
        score: clamped,
        maxScore: dimension.weight,
        comment: String(match.comment ?? '').trim() || 'ไม่มีคำอธิบายจากโมเดล',
      };
    });

    return {
      summary: String(raw.summary ?? '').trim(),
      overallScore: scored.reduce((total, d) => total + d.score, 0),
      overallComment: String(raw.overallComment ?? '').trim(),
      dimensions: scored,
      model: this.model,
      analyzedAt: new Date(),
      notes,
    };
  }
}
