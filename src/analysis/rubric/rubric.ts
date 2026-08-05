/**
 * The assessment rubric is the single source of truth for the whole system.
 *
 * Everything downstream is derived from this file:
 *  - the multipart field names accepted by the upload endpoint
 *  - the form the client renders (served by `GET /submissions/form-schema`)
 *  - the prompt sent to Gemini
 *  - the JSON response schema Gemini is constrained to
 *  - the maximum score of every dimension
 *
 * Adding or removing a criterion here is the only edit required.
 */

export interface RubricCriterion {
  /** Human-facing code, e.g. `1.2`. */
  code: string;
  /** Multipart field name that carries this criterion's evidence PDFs. */
  field: string;
  title: string;
  /** What the submitter has to prove, quoted from the official rubric. */
  evidenceRequirement: string;
}

export interface RubricDimension {
  index: number;
  title: string;
  /** Maximum score for this dimension. The five weights sum to 100. */
  weight: number;
  criteria: RubricCriterion[];
}

type CriterionInput = Omit<RubricCriterion, 'field'>;

/** Derives the multipart field name for a criterion code (`1.2` -> `evidence_1_2`). */
const fieldFor = (code: string) => `evidence_${code.replace(/\./g, '_')}`;

const dimension = (
  index: number,
  title: string,
  weight: number,
  criteria: CriterionInput[],
): RubricDimension => ({
  index,
  title,
  weight,
  criteria: criteria.map((criterion) => ({
    ...criterion,
    field: fieldFor(criterion.code),
  })),
});

export const RUBRIC: readonly RubricDimension[] = [
  dimension(1, 'การกำกับความเสี่ยงและธรรมาภิบาลองค์กร', 20, [
    {
      code: '1.1',
      title:
        'การสื่อสารนโยบายการบริหารความเสี่ยงแบบบูรณาการของจุฬาลงกรณ์มหาวิทยาลัย',
      evidenceRequirement:
        'ช่องทางในการสื่อสารนโยบายการบริหารความเสี่ยงและความต่อเนื่องของจุฬาฯ อย่างน้อย 2 ช่องทาง',
    },
    {
      code: '1.2',
      title: 'การแต่งตั้งและสื่อสารความรับผิดชอบด้านการบริหารความเสี่ยง',
      evidenceRequirement:
        'คำสั่งแต่งตั้งคณะกรรมการ/คณะทำงานบริหารความเสี่ยงของส่วนงาน/หน่วยงาน พร้อมหลักฐานการสื่อสารอย่างน้อย 2 ช่องทาง',
    },
    {
      code: '1.3',
      title: 'การประชุมคณะกรรมการบริหารความเสี่ยง',
      evidenceRequirement:
        'หนังสือเชิญประชุม หรือวาระการประชุม หรือรายงานการประชุมของคณะกรรมการ/คณะทำงานบริหารความเสี่ยง อย่างน้อยปีละ 2 ครั้ง',
    },
    {
      code: '1.4',
      title: 'การฝึกอบรมด้านการบริหารความเสี่ยง',
      evidenceRequirement:
        'รายชื่อบุคลากรของส่วนงาน/หน่วยงานที่เข้าร่วมการฝึกอบรมด้านการบริหารความเสี่ยงจากมหาวิทยาลัย',
    },
  ]),

  dimension(2, 'การประเมินความเสี่ยงและการวางแผนบริหารความเสี่ยง', 30, [
    {
      code: '2.1',
      title:
        'การระบุความเสี่ยงที่สอดคล้องกับกรอบการบริหารความเสี่ยงของมหาวิทยาลัย และมีระบบการระบุที่ชัดเจน',
      evidenceRequirement:
        'รายการความเสี่ยงของส่วนงาน/หน่วยงานที่สอดคล้องกับกรอบของมหาวิทยาลัย และกระบวนการระบุ/จัดการความเสี่ยง พร้อมแผนผังงาน (flowchart) ของกระบวนการ',
    },
    {
      code: '2.2',
      title: 'แผนบริหารความเสี่ยงของส่วนงาน/หน่วยงาน',
      evidenceRequirement:
        'แผนปฏิบัติการโดยละเอียดสำหรับแต่ละประเด็นความเสี่ยงที่ระบุ ตามแนวปฏิบัติของมหาวิทยาลัย',
    },
    {
      code: '2.3',
      title:
        'การถ่ายทอดแผนบริหารความเสี่ยงไปยังหน่วยงานย่อยหรือผู้รับผิดชอบระดับปฏิบัติ',
      evidenceRequirement:
        'บันทึกการประชุมถ่ายทอดแผน เช่น เวิร์กช็อป Townhall หรือ Briefing Session หรือเอกสารชี้แจงแนวทาง/คู่มือ/Action Plan ที่ถ่ายทอดให้หน่วยงานย่อย',
    },
  ]),

  dimension(3, 'การติดตามและรายงานผลการบริหารความเสี่ยง', 25, [
    {
      code: '3.1',
      title: 'การติดตามความเสี่ยงอย่างสม่ำเสมอ',
      evidenceRequirement:
        'กิจกรรมการติดตามความเสี่ยงรายไตรมาสในระบบ Riskonnex',
    },
    {
      code: '3.2',
      title: 'ตัวชี้วัดความเสี่ยงหลัก (KRI)',
      evidenceRequirement:
        'รายการตัวชี้วัดความเสี่ยงหลัก (KRI) ที่ใช้แจ้งเตือนภัยความเสี่ยงขององค์กรในทุกประเด็นความเสี่ยง',
    },
    {
      code: '3.3',
      title:
        'การรายงานผลการบริหารความเสี่ยง และการนำผลลัพธ์ที่ได้ไปใช้ประโยชน์',
      evidenceRequirement:
        'ผลการดำเนินงานตามแผนบริหารความเสี่ยงในแต่ละประเด็นความเสี่ยง',
    },
  ]),

  dimension(4, 'วัฒนธรรมและความตระหนักด้านการบริหารความเสี่ยง', 15, [
    {
      code: '4.1',
      title: 'กิจกรรมสร้างความตระหนักด้านความเสี่ยง',
      evidenceRequirement:
        'หลักฐานการจัดกิจกรรมสร้างความตระหนักด้านความเสี่ยงภายในส่วนงาน/หน่วยงาน อย่างน้อย 2 ครั้งในรอบปี',
    },
    {
      code: '4.2',
      title: 'การมีส่วนร่วมของบุคลากรในการบริหารความเสี่ยง',
      evidenceRequirement:
        'หลักฐานการมีส่วนร่วมของบุคลากรในการระบุและวางแผนบรรเทาความเสี่ยง',
    },
    {
      code: '4.3',
      title: 'การยกย่องความพยายามด้านการบริหารความเสี่ยง',
      evidenceRequirement:
        'ตัวอย่างวิธีการกระตุ้นจูงใจหรือให้รางวัลยกย่องแก่ผู้มีส่วนร่วมในการบริหารความเสี่ยง',
    },
  ]),

  dimension(5, 'การปรับปรุงอย่างต่อเนื่องและนวัตกรรม', 10, [
    {
      code: '5.1',
      title: 'บทเรียนที่ได้รับและแนวปฏิบัติที่ดี',
      evidenceRequirement:
        'รายงานการถอดบทเรียนจากเหตุการณ์ความเสี่ยงหรือเหตุการณ์เกือบเกิดความเสียหาย และแนวปฏิบัติที่ดีที่สามารถนำไปใช้เป็นตัวอย่างได้',
    },
    {
      code: '5.2',
      title: 'การปรับปรุงกระบวนการบริหารความเสี่ยง',
      evidenceRequirement:
        'ตัวอย่างการปรับปรุงกระบวนการบริหารความเสี่ยงจากประสบการณ์หรือข้อมูลเชิงลึกใหม่ ๆ รวมถึงแผนการปรับปรุงหรือนวัตกรรมในอนาคต',
    },
  ]),
] as const;

/** Every criterion, flattened, in rubric order. */
export const RUBRIC_CRITERIA: readonly RubricCriterion[] = RUBRIC.flatMap(
  (dim) => dim.criteria,
);

/** Multipart field names that carry evidence PDFs, in rubric order. */
export const EVIDENCE_FIELDS: readonly string[] = RUBRIC_CRITERIA.map(
  (criterion) => criterion.field,
);

/** Multipart field name carrying the project report itself. */
export const PROJECT_FIELD = 'project';

/** Maximum total score. Asserted at module load so the weights can never drift. */
export const MAX_TOTAL_SCORE = RUBRIC.reduce((sum, dim) => sum + dim.weight, 0);

if (MAX_TOTAL_SCORE !== 100) {
  throw new Error(
    `Rubric weights must sum to 100, got ${MAX_TOTAL_SCORE}. Check src/analysis/rubric/rubric.ts.`,
  );
}
