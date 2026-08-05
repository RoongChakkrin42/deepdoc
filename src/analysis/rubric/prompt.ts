import { MAX_TOTAL_SCORE, RUBRIC } from './rubric';

/**
 * Steers *how* the model grades. Kept separate from the rubric text so the
 * grading policy can change without touching the criteria themselves.
 */
export const SYSTEM_INSTRUCTION = [
  'คุณคือผู้ประเมินคุณภาพการบริหารความเสี่ยงของส่วนงานในจุฬาลงกรณ์มหาวิทยาลัย',
  'หน้าที่ของคุณคือให้คะแนนโครงการตามเกณฑ์ที่กำหนด โดยพิจารณาจากเอกสารโครงการและไฟล์หลักฐานที่แนบมาเท่านั้น',
  '',
  'หลักการให้คะแนน:',
  '- ให้คะแนนจากหลักฐานที่ปรากฏจริงในเอกสารเท่านั้น ห้ามสันนิษฐานหรือเติมข้อมูลที่ไม่มีในเอกสาร',
  '- ถ้าไม่มีไฟล์หลักฐานสำหรับเกณฑ์ข้อใด ให้ถือว่าข้อนั้นไม่มีหลักฐาน และหักคะแนนตามความสำคัญของข้อนั้น',
  '- ในช่อง comment ให้ระบุให้ชัดเจนว่าพบหลักฐานอะไร (อ้างชื่อไฟล์หรือหัวข้อในเอกสาร) หรือขาดหลักฐานอะไร',
  '- ให้คะแนนอย่างสม่ำเสมอและตรงไปตรงมา ไม่ให้คะแนนสูงเกินจริงเพียงเพราะเอกสารมีจำนวนมาก',
  '- ตอบเป็นภาษาไทยทั้งหมด',
].join('\n');

/** Renders the rubric into the prompt. Derived from `rubric.ts`, never hand-written. */
export function buildRubricPrompt(): string {
  const dimensions = RUBRIC.map((dimension) => {
    const criteria = dimension.criteria
      .map(
        (criterion) =>
          `  ${criterion.code}) ${criterion.title}\n     หลักฐานที่ต้องแสดง: ${criterion.evidenceRequirement}`,
      )
      .join('\n');

    return [
      `มิติที่ ${dimension.index}: ${dimension.title} (คะแนนเต็ม ${dimension.weight} คะแนน)`,
      criteria,
    ].join('\n');
  }).join('\n\n');

  return [
    `เกณฑ์การประเมิน คะแนนรวมเต็ม ${MAX_TOTAL_SCORE} คะแนน แบ่งเป็น ${RUBRIC.length} มิติ ดังนี้`,
    '',
    dimensions,
    '',
    'คะแนนของแต่ละมิติต้องอยู่ระหว่าง 0 ถึงคะแนนเต็มของมิตินั้น',
    'ให้ประเมินครบทุกมิติตามลำดับ โดยใช้ index ตรงกับหมายเลขมิติ',
  ].join('\n');
}
