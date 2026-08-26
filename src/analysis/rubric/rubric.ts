/**
 * The assessment rubric is the single source of truth for the whole system.
 *
 * Everything downstream is derived from this file:
 *  - the form the client renders (served by `GET /submissions/form-schema`)
 *  - the prompt sent to Gemini
 *  - the JSON response schema Gemini is constrained to
 *  - how a maturity level becomes a number, and how the five dimensions are
 *    weighted into one total and an award tier
 *
 * Transcribed from "เกณฑ์ Chula Risk Management Excellence (RMEx) Award
 * ประจำปีงบประมาณ 2568" (ศูนย์บริหารความเสี่ยง จุฬาลงกรณ์มหาวิทยาลัย).
 *
 * Two transcription notes, both deliberate:
 *  - The official scoring table repeats dimension 1's heading on dimension 5.
 *    Its five level descriptors are unambiguously about continuous improvement
 *    and innovation, so the criteria section's title is used instead.
 *  - Dimension 4 is titled "วัฒนธรรมและความตระหนัก..." in the criteria section
 *    and "วัฒนธรรมความเสี่ยงและการปรับปรุงอย่างต่อเนื่อง" in the scoring table.
 *    The criteria section wins, for the same reason.
 */

/**
 * The five maturity levels the official rubric scores each dimension against.
 *
 * `score` is the midpoint of the level's published band. The model picks a
 * *level*, never a number: asking for a free integer is what made two runs over
 * an identical submission land 20 points apart, because nothing anchored what
 * "14 out of 20" was supposed to mean. A five-way choice between written
 * descriptions is a far more stable judgement, and averaging fifteen of them
 * back into a total restores the granularity the discretisation costs.
 */
export const RUBRIC_LEVELS = [
  {
    id: 'inadequate',
    label: 'ยังไม่เหมาะสม',
    english: 'Inadequate',
    band: '0-29',
    minScore: 0,
    score: 15,
  },
  {
    id: 'beginning',
    label: 'เริ่มต้น',
    english: 'Beginning',
    band: '30-49',
    minScore: 30,
    score: 40,
  },
  {
    id: 'developing',
    label: 'พัฒนา',
    english: 'Developing',
    band: '50-69',
    minScore: 50,
    score: 60,
  },
  {
    id: 'mature',
    label: 'ก้าวหน้า',
    english: 'Mature',
    band: '70-89',
    minScore: 70,
    score: 80,
  },
  {
    id: 'outstanding',
    label: 'โดดเด่น',
    english: 'Outstanding',
    band: '90-100',
    minScore: 90,
    score: 95,
  },
] as const;

export type RubricLevelId = (typeof RUBRIC_LEVELS)[number]['id'];
export type RubricLevel = (typeof RUBRIC_LEVELS)[number];

/** Level ids ordered best-first, matching how the official tables are printed. */
export const LEVEL_IDS_DESCENDING: readonly RubricLevelId[] = [...RUBRIC_LEVELS]
  .reverse()
  .map((level) => level.id);

/**
 * The level a 0-100 dimension score falls in, using the published bands. Used
 * for display only — the numbers themselves come from averaging the criteria.
 */
export const levelForScore = (score: number): RubricLevel =>
  [...RUBRIC_LEVELS].reverse().find((level) => score >= level.minScore) ??
  RUBRIC_LEVELS[0];

const LEVEL_BY_ID = new Map<string, RubricLevel>(
  RUBRIC_LEVELS.map((level) => [level.id, level]),
);

export const levelById = (id: string): RubricLevel | undefined =>
  LEVEL_BY_ID.get(id);

export interface RubricCriterion {
  /** Human-facing code, e.g. `1.2`. */
  code: string;
  title: string;
  /** What the submitter has to prove, quoted from the official rubric. */
  evidenceRequirement: string;
  /**
   * The checks a grader has to be able to tick off before this criterion can
   * reach `mature`. Several are literally countable in the official text
   * ("อย่างน้อย 2 ช่องทาง", "ปีละ 2 ครั้ง"), and counting is the one part of
   * this judgement a model should never be improvising.
   */
  checks: readonly string[];
}

export interface RubricDimension {
  index: number;
  title: string;
  /** The one-line statement of what the dimension assesses. */
  focus: string;
  /** Percentage weight. The five weights sum to 100. */
  weight: number;
  /** Official level descriptors, keyed by level id. */
  levels: Readonly<Record<RubricLevelId, string>>;
  criteria: readonly RubricCriterion[];
}

export const RUBRIC: readonly RubricDimension[] = [
  {
    index: 1,
    title: 'การกำกับความเสี่ยงและธรรมาภิบาลองค์กร',
    focus:
      'ประเมินความมุ่งมั่นของผู้นำและโครงสร้างธรรมาภิบาลด้านการบริหารความเสี่ยง',
    weight: 20,
    levels: {
      outstanding:
        'ผู้นำสูงสุดแสดงบทบาทธรรมาภิบาลความเสี่ยงอย่างเป็นเลิศ มีโครงสร้างการกำกับดูแลที่ชัดเจน การบริหารความเสี่ยงถูกรวมเข้ากับแผนกลยุทธ์อย่างสมบูรณ์ มีการกำกับดูแลโดยคณะกรรมการและถ่ายทอดความรับผิดชอบทั่วทั้งองค์กร',
      mature:
        'มีกรอบธรรมาภิบาลความเสี่ยงที่ชัดเจน บทบาทและความรับผิดชอบกำหนดไว้ ผู้นำมีส่วนร่วมในการกำกับดูแลความเสี่ยงอย่างสม่ำเสมอ',
      developing:
        'มีโครงสร้างธรรมาภิบาลความเสี่ยงขั้นพื้นฐาน ผู้นำมีส่วนร่วมบ้าง การกำกับดูแลความเสี่ยงยังไม่สอดคล้องกับกลยุทธ์ทั้งหมด',
      beginning:
        'โครงสร้างธรรมาภิบาลความเสี่ยงยังไม่ชัดเจน ผู้นำมีส่วนร่วมน้อย ความรับผิดชอบไม่แน่นอนหรือขาดความต่อเนื่อง',
      inadequate:
        'ไม่มีโครงสร้างธรรมาภิบาลความเสี่ยงที่เป็นทางการ ผู้นำขาดบทบาทในการบริหารความเสี่ยงหรือดำเนินการแบบเฉพาะกิจ',
    },
    criteria: [
      {
        code: '1.1',
        title:
          'การสื่อสารนโยบายการบริหารความเสี่ยงแบบบูรณาการของจุฬาลงกรณ์มหาวิทยาลัย',
        evidenceRequirement:
          'ช่องทางในการสื่อสารนโยบายการบริหารความเสี่ยงและความต่อเนื่องของจุฬาฯ อย่างน้อย 2 ช่องทาง',
        checks: [
          'ระบุชื่อช่องทางการสื่อสารได้อย่างน้อย 2 ช่องทาง เช่น เว็บไซต์ จดหมายข่าว ที่ประชุมบุคลากร อีเมลภายใน (ต้องนับได้จริง ไม่ใช่กล่าวรวม ๆ ว่า "หลายช่องทาง")',
          'สิ่งที่สื่อสารคือนโยบายการบริหารความเสี่ยงแบบบูรณาการของจุฬาฯ ไม่ใช่เอกสารอื่น',
        ],
      },
      {
        code: '1.2',
        title: 'การแต่งตั้งและสื่อสารความรับผิดชอบด้านการบริหารความเสี่ยง',
        evidenceRequirement:
          'คำสั่งแต่งตั้งคณะกรรมการ/คณะทำงานบริหารความเสี่ยงของส่วนงาน/หน่วยงาน พร้อมหลักฐานการสื่อสารอย่างน้อย 2 ช่องทาง',
        checks: [
          'มีคำสั่งแต่งตั้งที่อ้างอิงได้ (เลขที่คำสั่ง วันที่ หรือองค์ประกอบคณะกรรมการ)',
          'ระบุช่องทางการสื่อสารคำสั่งได้อย่างน้อย 2 ช่องทาง',
        ],
      },
      {
        code: '1.3',
        title: 'การประชุมคณะกรรมการบริหารความเสี่ยง',
        evidenceRequirement:
          'หนังสือเชิญประชุม หรือวาระการประชุม หรือรายงานการประชุมของคณะกรรมการ/คณะทำงานบริหารความเสี่ยง อย่างน้อยปีละ 2 ครั้ง',
        checks: [
          'ระบุการประชุมได้อย่างน้อย 2 ครั้งในรอบปี พร้อมครั้งที่หรือเดือนที่ประชุม',
          'ระบุสาระของการประชุม เช่น วาระ มติ หรือการติดตามแผน',
        ],
      },
      {
        code: '1.4',
        title: 'การฝึกอบรมด้านการบริหารความเสี่ยง',
        evidenceRequirement:
          'รายชื่อบุคลากรของส่วนงาน/หน่วยงานที่เข้าร่วมการฝึกอบรมด้านการบริหารความเสี่ยงจากมหาวิทยาลัย',
        checks: [
          'ระบุหลักสูตร/กิจกรรมฝึกอบรมที่จัดโดยมหาวิทยาลัยหรือศูนย์บริหารความเสี่ยง',
          'ระบุผู้เข้าอบรมได้ เช่น รายชื่อ จำนวน หรือกลุ่มตำแหน่ง',
        ],
      },
    ],
  },

  {
    index: 2,
    title: 'การประเมินความเสี่ยงและการวางแผนบริหารความเสี่ยง',
    focus:
      'ประเมินกระบวนการระบุ วิเคราะห์ และจัดลำดับความสำคัญความเสี่ยงอย่างเป็นระบบ',
    weight: 30,
    levels: {
      outstanding:
        'ระบุความเสี่ยงอย่างครอบคลุมโดยใช้หลายเครื่องมือ (PEST, SWOT, การวิเคราะห์สถานการณ์) มีการวิเคราะห์เชิงปริมาณและคุณภาพขั้นสูงพร้อมการคาดการณ์ล่วงหน้า มีแผนบริหารความเสี่ยงที่ครอบคลุมและเชื่อมโยงทุกระดับ',
      mature:
        'มีขั้นตอนการระบุและวิเคราะห์ความเสี่ยงที่เป็นระบบ ใช้เครื่องมือที่เหมาะสมและมีการประเมินความเสี่ยงอย่างสม่ำเสมอ มี risk register ที่อัปเดตเป็นระยะ',
      developing:
        'มีการระบุความเสี่ยงแบบพื้นฐาน ใช้เครื่องมือบางส่วน การประเมินความเสี่ยงอาจขาดความต่อเนื่องหรือความลึกซึ้ง เอกสาร risk register อาจไม่สมบูรณ์',
      beginning:
        'ระบุความเสี่ยงอย่างจำกัด วิเคราะห์น้อยหรือไม่เป็นระบบ การประเมินความเสี่ยงไม่สม่ำเสมอ เอกสารไม่ครบถ้วน',
      inadequate:
        'ไม่มีการระบุหรือวิเคราะห์ความเสี่ยงอย่างเป็นระบบ การประเมินความเสี่ยงขาดหายหรือไม่เหมาะสมอย่างยิ่ง',
    },
    criteria: [
      {
        code: '2.1',
        title:
          'การระบุความเสี่ยงที่สอดคล้องกับกรอบการบริหารความเสี่ยงของมหาวิทยาลัย และมีระบบการระบุที่ชัดเจน',
        evidenceRequirement:
          'รายการความเสี่ยงของส่วนงาน/หน่วยงานที่สอดคล้องกับกรอบของมหาวิทยาลัย และกระบวนการระบุ/จัดการความเสี่ยง พร้อมแผนผังงาน (flowchart) ของกระบวนการ',
        checks: [
          'มีรายการประเด็นความเสี่ยงของส่วนงานที่ระบุชื่อได้จริง',
          'ประเด็นความเสี่ยงถูกจับคู่เข้ากับหมวดความเสี่ยงในกรอบระดับมหาวิทยาลัย (ดูรายการหมวดที่ให้ไว้ท้ายเกณฑ์)',
          'อธิบายกระบวนการระบุและจัดการความเสี่ยงเป็นลำดับขั้น และมีแผนผังงาน (flowchart) ของกระบวนการ',
        ],
      },
      {
        code: '2.2',
        title: 'แผนบริหารความเสี่ยงของส่วนงาน/หน่วยงาน',
        evidenceRequirement:
          'แผนปฏิบัติการโดยละเอียดสำหรับแต่ละประเด็นความเสี่ยงที่ระบุ ตามแนวปฏิบัติของมหาวิทยาลัย',
        checks: [
          'มีแผนปฏิบัติการรายประเด็นความเสี่ยง ไม่ใช่แผนรวมเพียงฉบับเดียวที่ไม่แยกประเด็น',
          'แต่ละแผนระบุมาตรการจัดการ ผู้รับผิดชอบ กรอบเวลา และเกณฑ์วัดความสำเร็จ',
        ],
      },
      {
        code: '2.3',
        title:
          'การถ่ายทอดแผนบริหารความเสี่ยงไปยังหน่วยงานย่อยหรือผู้รับผิดชอบระดับปฏิบัติ',
        evidenceRequirement:
          'บันทึกการประชุมถ่ายทอดแผน เช่น เวิร์กช็อป Townhall หรือ Briefing Session หรือเอกสารชี้แจงแนวทาง/คู่มือ/Action Plan ที่ถ่ายทอดให้หน่วยงานย่อย',
        checks: [
          'ระบุกิจกรรมหรือเอกสารที่ใช้ถ่ายทอดแผนได้อย่างเจาะจง',
          'ระบุผู้รับการถ่ายทอด เช่น หน่วยงานย่อย จำนวนผู้เข้าร่วม หรือช่วงเวลาที่ถ่ายทอด',
        ],
      },
    ],
  },

  {
    index: 3,
    title: 'การติดตามและรายงานผลการบริหารความเสี่ยง',
    focus: 'ประเมินระบบการติดตามผลและการสื่อสารความเสี่ยง',
    weight: 25,
    levels: {
      outstanding:
        'มีระบบติดตามความเสี่ยงแบบ real-time พร้อม dashboard และตัวชี้วัดความเสี่ยง (KRI) รายงานครบถ้วนถึงทุกกลุ่มเป้าหมาย วิเคราะห์แนวโน้มและคาดการณ์ล่วงหน้า เชื่อมโยงกับระบบบริหารผลการดำเนินงานขององค์กร',
      mature:
        'มีการติดตามความเสี่ยงอย่างสม่ำเสมอ ใช้ KRI และมีรอบการรายงานที่เหมาะสม สื่อสารกับผู้มีส่วนได้ส่วนเสียอย่างมีประสิทธิภาพ เชื่อมโยงบางส่วนกับระบบอื่น',
      developing:
        'มีระบบติดตามขั้นพื้นฐาน รายงานเป็นระยะ การสื่อสารกับผู้มีส่วนได้ส่วนเสียยังขาดความต่อเนื่องหรือความลึกซึ้ง',
      beginning:
        'ระบบติดตามและรายงานผลจำกัด รายงานไม่สม่ำเสมอ การสื่อสารไม่ทั่วถึงหรือไม่เหมาะสม',
      inadequate:
        'ไม่มีระบบติดตามหรือรายงานผลความเสี่ยง การสื่อสารขาดหายหรือไร้ประสิทธิภาพอย่างยิ่ง',
    },
    criteria: [
      {
        code: '3.1',
        title: 'การติดตามความเสี่ยงอย่างสม่ำเสมอ',
        evidenceRequirement:
          'กิจกรรมการติดตามความเสี่ยงรายไตรมาสในระบบ Riskonnex',
        checks: [
          'ระบุการติดตามความเสี่ยงเป็นรายไตรมาส และอ้างอิงไตรมาสที่ติดตามได้',
          'ระบุว่าการติดตามทำผ่านระบบ Riskonnex หรือระบบที่มหาวิทยาลัยกำหนด',
        ],
      },
      {
        code: '3.2',
        title: 'ตัวชี้วัดความเสี่ยงหลัก (KRI)',
        evidenceRequirement:
          'รายการตัวชี้วัดความเสี่ยงหลัก (KRI) ที่ใช้แจ้งเตือนภัยความเสี่ยงขององค์กรในทุกประเด็นความเสี่ยง',
        checks: [
          'ระบุ KRI เป็นตัว ๆ ได้ ไม่ใช่กล่าวลอย ๆ ว่ามีการกำหนด KRI',
          'ครอบคลุมประเด็นความเสี่ยงที่ระบุไว้ในข้อ 2.1 ครบทุกประเด็น',
          'ระบุเกณฑ์การแจ้งเตือนหรือความถี่ในการวัดของ KRI',
        ],
      },
      {
        code: '3.3',
        title:
          'การรายงานผลการบริหารความเสี่ยง และการนำผลลัพธ์ที่ได้ไปใช้ประโยชน์',
        evidenceRequirement:
          'ผลการดำเนินงานตามแผนบริหารความเสี่ยงในแต่ละประเด็นความเสี่ยง พร้อมระบุว่าบรรลุเป้าหมายที่กำหนดหรือไม่ และเกิดผลลัพธ์อย่างไรต่อองค์กร',
        checks: [
          'รายงานผลรายประเด็นความเสี่ยง ไม่ใช่สรุปภาพรวมอย่างเดียว',
          'ระบุชัดว่าบรรลุเป้าหมายที่กำหนดไว้หรือไม่',
          'ระบุผลลัพธ์ที่เกิดขึ้นต่อองค์กร และการนำผลไปใช้ต่อ',
        ],
      },
    ],
  },

  {
    index: 4,
    title: 'วัฒนธรรมและความตระหนักด้านการบริหารความเสี่ยง',
    focus: 'ประเมินวัฒนธรรมองค์กรด้านความเสี่ยงและกลไกการเรียนรู้',
    weight: 15,
    levels: {
      outstanding:
        'มีวัฒนธรรมความเสี่ยงที่แข็งแกร่ง ฝังอยู่ในทุกการตัดสินใจ บุคลากรทุกระดับมีความตระหนักรู้สูงและมีส่วนร่วมในการบริหารความเสี่ยงอย่างแข็งขัน มีการสื่อสารและฝึกอบรมอย่างต่อเนื่อง',
      mature:
        'วัฒนธรรมความเสี่ยงกำลังพัฒนา บุคลากรส่วนใหญ่มีความตระหนักรู้และเข้าใจบทบาทของตนในการบริหารความเสี่ยง มีการสื่อสารและฝึกอบรมเป็นระยะ',
      developing:
        'มีการตระหนักรู้เรื่องความเสี่ยงในระดับหนึ่ง บุคลากรบางส่วนเข้าใจและมีส่วนร่วม กิจกรรมสร้างความตระหนักรู้มีจำกัด',
      beginning:
        'วัฒนธรรมความเสี่ยงยังไม่ชัดเจน ความตระหนักรู้ของบุคลากรยังน้อย กิจกรรมสร้างความตระหนักรู้น้อยมาก',
      inadequate:
        'ไม่มีวัฒนธรรมความเสี่ยงหรือความตระหนักรู้ด้านการบริหารความเสี่ยงที่เห็นได้ชัด',
    },
    criteria: [
      {
        code: '4.1',
        title: 'กิจกรรมสร้างความตระหนักด้านความเสี่ยง',
        evidenceRequirement:
          'หลักฐานการจัดกิจกรรมสร้างความตระหนักด้านความเสี่ยงภายในส่วนงาน/หน่วยงาน อย่างน้อย 2 ครั้งในรอบปี',
        checks: [
          'ระบุกิจกรรมได้อย่างน้อย 2 ครั้งในรอบปี พร้อมชื่อกิจกรรมและช่วงเวลา',
          'เป็นกิจกรรมที่ส่วนงานจัดขึ้นเอง ไม่ใช่การส่งคนไปอบรมของมหาวิทยาลัย (ข้อนั้นคือ 1.4)',
        ],
      },
      {
        code: '4.2',
        title: 'การมีส่วนร่วมของบุคลากรในการบริหารความเสี่ยง',
        evidenceRequirement:
          'หลักฐานการมีส่วนร่วมของบุคลากรในการระบุและวางแผนบรรเทาความเสี่ยง',
        checks: [
          'ระบุช่องทางที่บุคลากรมีส่วนร่วม เช่น แบบสำรวจ ประชุมกลุ่มย่อย เวิร์กช็อป',
          'ระบุขนาดการมีส่วนร่วม เช่น จำนวนคนหรือจำนวนหน่วยงานที่ร่วม',
          'ระบุว่าข้อเสนอของบุคลากรถูกนำไปใช้จริงในทะเบียนหรือแผนความเสี่ยง',
        ],
      },
      {
        code: '4.3',
        title: 'การยกย่องความพยายามด้านการบริหารความเสี่ยง',
        evidenceRequirement:
          'ตัวอย่างวิธีการกระตุ้นจูงใจหรือให้รางวัลยกย่องแก่ผู้มีส่วนร่วมในการบริหารความเสี่ยง',
        checks: [
          'ระบุกลไกการยกย่องหรือจูงใจได้อย่างเจาะจง เช่น ชื่อรางวัล เกณฑ์การประเมินผลงาน',
          'ระบุว่ามีการใช้จริง เช่น ผู้ได้รับรางวัล โอกาสที่มอบ หรือรอบการประเมิน',
        ],
      },
    ],
  },

  {
    index: 5,
    title: 'การปรับปรุงอย่างต่อเนื่องและนวัตกรรม',
    focus:
      'ประเมินการเรียนรู้จากเหตุการณ์ การปรับปรุงกระบวนการ และการใช้นวัตกรรมด้านการบริหารความเสี่ยง',
    weight: 10,
    levels: {
      outstanding:
        'มีการเรียนรู้อย่างต่อเนื่องจากเหตุการณ์และ near-miss นำนวัตกรรมและเทคโนโลยีใหม่มาใช้ในการบริหารความเสี่ยง มีการปรับปรุงระบบอย่างเป็นระบบและต่อเนื่อง เป็นแบบอย่างด้านนวัตกรรม',
      mature:
        'มีการเรียนรู้และปรับปรุงอย่างสม่ำเสมอ มีการนำเทคโนโลยีหรือแนวทางใหม่มาปรับใช้บ้าง มีการเปรียบเทียบและนำแนวปฏิบัติที่ดีมาประยุกต์',
      developing:
        'เรียนรู้จากเหตุการณ์เป็นครั้งคราว มีการปรับปรุงบ้างแต่ไม่เป็นระบบ การใช้นวัตกรรมมีจำกัด',
      beginning:
        'กิจกรรมการเรียนรู้และปรับปรุงน้อยมาก ไม่มีการใช้นวัตกรรมหรือเทคโนโลยีใหม่',
      inadequate:
        'ไม่มีกลไกการปรับปรุงอย่างต่อเนื่องหรือการใช้นวัตกรรมที่เห็นได้ชัด',
    },
    criteria: [
      {
        code: '5.1',
        title: 'บทเรียนที่ได้รับและแนวปฏิบัติที่ดี',
        evidenceRequirement:
          'รายงานการถอดบทเรียนจากเหตุการณ์ความเสี่ยงหรือเหตุการณ์เกือบเกิดความเสียหาย และแนวปฏิบัติที่ดีที่สามารถนำไปใช้เป็นตัวอย่างได้',
        checks: [
          'อ้างอิงเหตุการณ์จริงหรือเหตุการณ์เกือบเกิดความเสียหายที่เกิดขึ้นได้อย่างเจาะจง',
          'ระบุสิ่งที่ได้เรียนรู้และแนวปฏิบัติที่ดีที่สรุปออกมาจากเหตุการณ์นั้น',
        ],
      },
      {
        code: '5.2',
        title: 'การปรับปรุงกระบวนการบริหารความเสี่ยง',
        evidenceRequirement:
          'ตัวอย่างการปรับปรุงกระบวนการบริหารความเสี่ยงจากประสบการณ์หรือข้อมูลเชิงลึกใหม่ ๆ รวมถึงแผนการปรับปรุงหรือนวัตกรรมในอนาคต',
        checks: [
          'ระบุการปรับปรุงกระบวนการที่ทำไปแล้วจริง ไม่ใช่มีแต่แผนในอนาคต',
          'ระบุแผนการปรับปรุงหรือนวัตกรรมที่เตรียมจะทำต่อ',
        ],
      },
    ],
  },
] as const;

/** Every criterion, flattened, in rubric order. */
export const RUBRIC_CRITERIA: readonly RubricCriterion[] = RUBRIC.flatMap(
  (dimension) => dimension.criteria,
);

/** Multipart field name carrying the report. It is the only file accepted. */
export const PROJECT_FIELD = 'project';

/** Maximum total score. Asserted at module load so the weights can never drift. */
export const MAX_TOTAL_SCORE = RUBRIC.reduce((sum, dim) => sum + dim.weight, 0);

if (MAX_TOTAL_SCORE !== 100) {
  throw new Error(
    `Rubric weights must sum to 100, got ${MAX_TOTAL_SCORE}. Check src/analysis/rubric/rubric.ts.`,
  );
}

/**
 * Award tiers, best-first. `awardTierFor` relies on that ordering, so the
 * lowest tier must stay last with a floor of zero.
 */
export const AWARD_TIERS = [
  {
    id: 'excellence',
    label: 'Excellence Award',
    minScore: 85,
    description: 'องค์กรมีความเป็นเลิศด้านการบริหารความเสี่ยงในระดับสูง',
  },
  {
    id: 'recognition',
    label: 'Recognition Award',
    minScore: 70,
    description: 'องค์กรมีการบริหารความเสี่ยงที่ดีและควรได้รับการยกย่อง',
  },
  {
    id: 'improvement',
    label: 'Improvement Award',
    minScore: 50,
    description: 'องค์กรมีการพัฒนาการบริหารความเสี่ยงอย่างต่อเนื่อง',
  },
  {
    id: 'participation',
    label: 'Participation Certificate',
    minScore: 0,
    description: 'องค์กรเข้าร่วมและมีความพยายามในการพัฒนา',
  },
] as const;

export type AwardTier = (typeof AWARD_TIERS)[number];

/** Maps a 0-100 total onto its award tier. */
export const awardTierFor = (score: number): AwardTier =>
  AWARD_TIERS.find((tier) => score >= tier.minScore) ??
  AWARD_TIERS[AWARD_TIERS.length - 1];
