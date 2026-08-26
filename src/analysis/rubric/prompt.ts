import { renderFramework } from './framework';
import { LEVEL_IDS_DESCENDING, levelById, RUBRIC } from './rubric';

/**
 * Steers *how* the model grades. Kept separate from the rubric text so the
 * grading policy can change without touching the criteria themselves.
 *
 * The policy is deliberately procedural. An earlier version asked for a free
 * integer per dimension against nothing but the criterion titles, and two runs
 * over the same submission came back 20 points apart — the model was re-picking
 * how strictly to read the rubric each time. Three things pin it down:
 *
 *  1. Quote before judging. `evidenceFound` has to hold text lifted out of the
 *     report, so a level is a reading of the document rather than an impression
 *     of it.
 *  2. Count what the rubric counts. "อย่างน้อย 2 ช่องทาง" is arithmetic, not
 *     taste, and `checks` in the rubric spells out every such threshold.
 *  3. Choose a level, never a number. The five official descriptors are the
 *     only options, and the ladder below fixes what separates them.
 */
export const SYSTEM_INSTRUCTION = [
  'คุณคือกรรมการประเมินรางวัล Chula Risk Management Excellence (RMEx) Award ของศูนย์บริหารความเสี่ยง จุฬาลงกรณ์มหาวิทยาลัย',
  'คุณจะได้รับเอกสารรายงานผลการวางระบบบริหารความเสี่ยงของส่วนงาน/หน่วยงาน จำนวน 1 ไฟล์ ซึ่งเป็นหลักฐานเพียงชิ้นเดียวที่คุณมี',
  '',
  'ให้ประเมินทีละเกณฑ์ย่อย โดยทำ 3 ขั้นตอนนี้ตามลำดับกับทุกข้อ:',
  '1. ค้นหาข้อความในเอกสารที่เกี่ยวข้องกับเกณฑ์ข้อนั้น แล้วคัดลอกข้อความจริงลงในช่อง evidenceFound (คัดลอกตามที่เขียนไว้ ไม่ต้องเรียบเรียงใหม่ ข้อละไม่เกิน 3 ข้อความ) ถ้าไม่พบข้อความที่เกี่ยวข้องเลย ให้ evidenceFound เป็นอาร์เรย์ว่าง',
  '2. ตรวจรายการ "สิ่งที่ต้องตรวจให้ได้" ของข้อนั้นทีละบรรทัด ว่าข้อความที่คัดมาครอบคลุมครบหรือไม่ ข้อไหนที่เป็นการนับ (เช่น อย่างน้อย 2 ช่องทาง, ปีละ 2 ครั้ง) ต้องนับได้จริงจากข้อความ',
  '3. เลือกระดับจาก 5 ระดับตามบันไดด้านล่าง แล้วอธิบายเหตุผลในช่อง justification โดยอ้างสิ่งที่ครบและสิ่งที่ขาด',
  '',
  'บันไดการเลือกระดับ (ใช้กับทุกเกณฑ์เหมือนกัน):',
  '- inadequate: ไม่พบข้อความใดในเอกสารที่เกี่ยวข้องกับเกณฑ์ข้อนี้เลย',
  '- beginning: กล่าวถึงเรื่องนี้ แต่ลอย ๆ ไม่มีรายละเอียดที่ตรวจสอบได้ (ไม่มีชื่อเฉพาะ วันที่ จำนวน หรือผู้รับผิดชอบ)',
  '- developing: มีรายละเอียดที่ตรวจสอบได้บ้าง แต่ยังไม่ครบทุกรายการใน "สิ่งที่ต้องตรวจให้ได้"',
  '- mature: ครบทุกรายการใน "สิ่งที่ต้องตรวจให้ได้" และเงื่อนไขเชิงจำนวนนับได้ครบ',
  '- outstanding: ครบทุกรายการ และยังมีผลลัพธ์เชิงประจักษ์เกินกว่าที่เกณฑ์ขอ เช่น ตัวเลขผลลัพธ์ การเปรียบเทียบก่อน-หลัง หรือการเชื่อมโยงเข้ากับระบบอื่นขององค์กรอย่างเป็นระบบ',
  '',
  'กฎที่ห้ามละเมิด:',
  '- ถ้าไม่มีตัวเลขผลลัพธ์หรือหลักฐานเชิงประจักษ์ที่วัดได้ ระดับสูงสุดที่ให้ได้คือ mature',
  '- เอกสารอาจอ้างถึงไฟล์แนบหรือ QR Code ที่คุณไม่ได้รับ ให้ตัดสินจากรายละเอียดที่บรรยายไว้ในเอกสารเท่านั้น ถ้าบรรยายเจาะจงพอ (เช่น เลขที่คำสั่ง วันที่ ครั้งที่ประชุม จำนวนผู้เข้าร่วม) ให้นับเป็นหลักฐานที่ตรวจสอบได้ แต่ถ้าเป็นเพียงการอ้างชื่อไฟล์แนบโดยไม่บรรยายเนื้อหา ระดับสูงสุดที่ให้ได้คือ developing',
  '- ให้คะแนนแต่ละเกณฑ์อย่างอิสระต่อกัน ห้ามยกระดับข้อหนึ่งเพราะข้ออื่นทำได้ดี และห้ามใช้ข้อความเดียวกันเป็นหลักฐานหลักของหลายข้อถ้าเนื้อหาไม่ตรงกับเกณฑ์ข้อนั้นจริง',
  '- ห้ามยกระดับเพราะเอกสารเขียนยาว สำนวนดี หรืออ้างว่าตั้งเป้าจะได้รางวัลระดับใด',
  '- ห้ามสันนิษฐานหรือเติมข้อมูลที่ไม่มีในเอกสาร',
  '- ห้ามคำนวณคะแนนรายมิติหรือคะแนนรวม ระบบคำนวณเองจากระดับที่คุณเลือก',
  '',
  'ตอบเป็นภาษาไทยทั้งหมด',
].join('\n');

/** Renders the level ladder shared by every dimension. */
const renderLevelKey = (): string =>
  LEVEL_IDS_DESCENDING.map((id) => {
    const level = levelById(id);
    return level
      ? `- ${level.id} = ${level.label} (${level.english}, ช่วงคะแนน ${level.band})`
      : '';
  })
    .filter(Boolean)
    .join('\n');

/** Renders the rubric into the prompt. Derived from `rubric.ts`, never hand-written. */
export function buildRubricPrompt(): string {
  const dimensions = RUBRIC.map((dimension) => {
    const levels = LEVEL_IDS_DESCENDING.map(
      (id) => `  [${id}] ${dimension.levels[id]}`,
    ).join('\n');

    const criteria = dimension.criteria
      .map((criterion) => {
        const checks = criterion.checks
          .map((check) => `       • ${check}`)
          .join('\n');
        return [
          `  ${criterion.code}) ${criterion.title}`,
          `     หลักฐานที่เกณฑ์กำหนด: ${criterion.evidenceRequirement}`,
          `     สิ่งที่ต้องตรวจให้ได้:`,
          checks,
        ].join('\n');
      })
      .join('\n\n');

    return [
      `มิติที่ ${dimension.index}: ${dimension.title} (น้ำหนัก ${dimension.weight}%)`,
      `  ${dimension.focus}`,
      '',
      '  คำบรรยายระดับของมิตินี้ (ใช้ประกอบการเลือกระดับของเกณฑ์ย่อยในมิตินี้):',
      levels,
      '',
      criteria,
    ].join('\n');
  }).join('\n\n');

  const criterionCodes = RUBRIC.flatMap((dimension) =>
    dimension.criteria.map((criterion) => criterion.code),
  );

  return [
    `เกณฑ์การประเมิน ${RUBRIC.length} มิติ รวม ${criterionCodes.length} เกณฑ์ย่อย`,
    '',
    'ระดับที่เลือกได้มี 5 ระดับ:',
    renderLevelKey(),
    '',
    dimensions,
    '',
    renderFramework(),
    '',
    `ให้ตอบผลการประเมินครบทั้ง ${criterionCodes.length} เกณฑ์ย่อย เรียงตามลำดับนี้: ${criterionCodes.join(', ')}`,
  ].join('\n');
}
