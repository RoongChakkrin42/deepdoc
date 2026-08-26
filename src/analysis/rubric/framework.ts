/**
 * The university-level risk framework that criterion 2.1 measures a submission
 * against ("รายการความเสี่ยง ... ที่สอดคล้องกับกรอบของมหาวิทยาลัย").
 *
 * Transcribed from "รายงานการวิเคราะห์กรอบบริหารความเสี่ยงระดับองค์กร
 * จุฬาลงกรณ์มหาวิทยาลัย ปีงบประมาณ 2568 (2025 Chula Risk Management Framework
 * Process)". Without it the model has no way to tell whether a faculty's risk
 * register actually lines up with the university's categories — it was being
 * asked to check alignment against a document it had never seen.
 */

export interface FrameworkCategory {
  /** Thai name with the English term, as printed in the framework. */
  name: string;
  /** The sub-risks the framework lists underneath it. */
  examples: readonly string[];
}

export interface FrameworkGroup {
  title: string;
  categories: readonly FrameworkCategory[];
}

export const UNIVERSITY_RISK_FRAMEWORK: readonly FrameworkGroup[] = [
  {
    title: 'ความเสี่ยงมิติกลยุทธ์ (Strategic Risk)',
    categories: [
      {
        name: 'การจัดการทรัพยากรบุคคล (Talent Management)',
        examples: [
          'การดึงดูดและรักษาคณาจารย์/นักวิจัยที่มีความสามารถสูง',
          'การพัฒนาศักยภาพและทักษะของบุคลากรให้ทันการเปลี่ยนแปลง',
        ],
      },
      {
        name: 'ความล่าช้าทางเทคโนโลยี/ไม่ทันต่อเทคโนโลยี (Technological Lag)',
        examples: [
          'การขาดการนำเทคโนโลยีใหม่ เช่น AI, Blockchain, การวิเคราะห์ข้อมูลขั้นสูง มาใช้',
          'ความท้าทายในการปรับตัวและนำนวัตกรรมมาใช้ในการดำเนินงาน',
        ],
      },
      {
        name: 'ความยั่งยืนทางการเงิน (Financial Sustainability)',
        examples: [
          'การพึ่งพาแหล่งทุนที่ไม่แน่นอน',
          'การจัดการค่าใช้จ่ายและงบประมาณ',
        ],
      },
    ],
  },
  {
    title: 'ความเสี่ยงมิติปฏิบัติการ (Operational Risk)',
    categories: [
      {
        name: 'ประสิทธิภาพในการดำเนินงานขององค์กร (Organizational Efficiency)',
        examples: ['ความซับซ้อนของกระบวนการภายใน', 'การต่อต้านการเปลี่ยนแปลง'],
      },
      {
        name: 'การปฏิบัติตามกฎระเบียบ (Regulatory Compliance)',
        examples: [
          'การเปลี่ยนแปลงในกฎหมายและนโยบายการศึกษา',
          'การปฏิบัติตามมาตรฐานการศึกษานานาชาติ',
        ],
      },
      {
        name: 'ความปลอดภัยทางไซเบอร์และความเป็นส่วนตัวของข้อมูล (Cybersecurity and Data Privacy)',
        examples: [
          'การโจมตีทางไซเบอร์',
          'การไม่ปฏิบัติตามกฎหมายความเป็นส่วนตัวของข้อมูล เช่น PDPA, GDPR',
        ],
      },
      {
        name: 'สุขภาพจิตและความเป็นอยู่ที่ดี (Health and Well-being)',
        examples: [
          'การจัดการปัญหาสุขภาพจิตของบุคลากรและนิสิต',
          'ความเครียดและความเหนื่อยล้าจากภาระงาน',
        ],
      },
      {
        name: 'การเสียชื่อเสียงและความสัมพันธ์ (Reputation and Engagement)',
        examples: [
          'ความคิดเห็นเชิงลบของสาธารณชนจากปัญหาที่ยังไม่ได้รับการแก้ไข',
          'การจัดการด้านประชาสัมพันธ์ที่ไม่มีประสิทธิภาพ',
        ],
      },
    ],
  },
  {
    title: 'ความเสี่ยงที่เกิดขึ้นใหม่ (Emerging Risks)',
    categories: [
      {
        name: 'การหยุดชะงักทางเทคโนโลยี (Technological Disruption)',
        examples: [
          'การพัฒนาเทคโนโลยีที่ไม่คาดการณ์ได้',
          'การรวมเทคโนโลยีที่ยังไม่ผ่านการทดสอบเพียงพอ',
        ],
      },
      {
        name: 'วิกฤตระดับโลก (Global Crises)',
        examples: ['การระบาดใหญ่ที่ไม่คาดคิด', 'ความขัดแย้งทางการเมือง'],
      },
      {
        name: 'การเปลี่ยนแปลงคุณค่าของสังคม (Societal Value Shifts)',
        examples: [
          'ความต้องการในรูปแบบการศึกษาใหม่',
          'การลดลงของความเชื่อมั่นในสถาบันการศึกษา',
        ],
      },
    ],
  },
] as const;

/** Renders the framework as the reference block appended to the prompt. */
export function renderFramework(): string {
  const groups = UNIVERSITY_RISK_FRAMEWORK.map((group) => {
    const categories = group.categories
      .map(
        (category) =>
          `  - ${category.name}\n    (${category.examples.join(' / ')})`,
      )
      .join('\n');
    return `${group.title}\n${categories}`;
  }).join('\n\n');

  return [
    'กรอบบริหารความเสี่ยงระดับองค์กร จุฬาลงกรณ์มหาวิทยาลัย ปีงบประมาณ 2568',
    'ใช้รายการนี้เป็นเกณฑ์ตัดสินข้อ 2.1 ว่าประเด็นความเสี่ยงของส่วนงานสอดคล้องกับกรอบของมหาวิทยาลัยหรือไม่',
    '',
    groups,
  ].join('\n');
}
