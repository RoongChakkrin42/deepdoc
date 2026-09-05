# DeepDoc API

A NestJS service that grades Thai-language risk-management reports with **Google Gemini**.

It exists for the **Chula Risk Management Excellence (RMEx) Award** — Chulalongkorn University's annual award for risk management at the faculty/unit level, judged on 5 dimensions and 15 criteria. This service does the first pass, so reviewers start from a scored, evidence-linked draft instead of a stack of PDFs.

**Stack:** NestJS 11 · TypeScript · MongoDB · AWS S3 · Google Gemini · Passport JWT · Jest

> 🇹🇭 [สรุปภาษาไทยอยู่ท้ายไฟล์](#สรุปภาษาไทย)

---

## What it does

```
submitter ──POST /submissions──▶ S3 ──▶ Mongo (pending) ──▶ 202 Accepted
                                              │
                                   background │ Gemini reads the PDF
                                              ▼
                                   level per criterion ──▶ server scores it
                                              │
reviewer ──GET /submissions?year=──────────── ▼ completed
```

One report PDF in; a weighted 0-100 total, an award tier, and the reasoning behind every criterion out.

---

## The problems it solves

### Scores swung 18 points between identical runs

The obvious design — show the model the criteria, ask for a score out of 20 per dimension — is unusable. Three runs over one identical submission returned **43, 28, 25**. Every dimension moved the same direction each run, so the model was re-deciding how strictly to read the rubric, not adding random noise. `temperature: 0` was measured and did **not** fix it: this model reasons internally, and that reasoning varies regardless of sampling.

Four changes, together:

| | |
| --- | --- |
| **Choose, don't invent** | The model picks one of the five maturity levels the official rubric publishes, instead of producing a number. The enum is generated from the rubric, so an out-of-range score is unrepresentable. |
| **Quote before judging** | Every criterion must carry `evidenceFound` — text lifted out of the report — so a level is a reading of the document, not an impression of it. |
| **Count what the rubric counts** | *"อย่างน้อย 2 ช่องทาง"*, *"ปีละ 2 ครั้ง"*: each countable threshold is spelled out per criterion as `checks`, so it stops being a matter of taste. |
| **Fifteen small calls, not five big ones** | Judging per criterion means one harsh reading moves the total far less. |

Same test, current design: **81.83, 81.83, 84.25** — spread 2.42, same award tier, 2 of 15 criteria moved.

### The model was doing arithmetic

It now returns no number at all. Scoring is server-side and rounded at each step, so the total is exactly the sum of the figures shown beside it:

`level → points (95/80/60/40/15, the band midpoints) → dimension mean → × weight → total → award tier`

A submission judged outstanding on all fifteen criteria totals **95, not 100** — which is what the official *"โดดเด่น = 90-100"* band means. Uniform grading at any level lands in the tier the rubric intends.

### The grader was checking against a document it had never seen

Criterion 2.1 asks whether a faculty's risk register lines up with the *university's* risk framework. That framework now ships inside the prompt (`analysis/rubric/framework.ts`), so the check is against the real categories rather than the model's guess at them.

### A submission is one document, not sixteen uploads

Entrants write a single report covering all five dimensions, describing their supporting material inside it. A form with one upload slot per criterion asked them to file their work into a matrix nobody uses. `POST /submissions` takes exactly one PDF, and the rubric travels to the client through `GET /submissions/form-schema` so the form can show a checklist of what the report must cover.

### Failures used to vanish

Grading takes tens of seconds, so it runs in the background behind `pending → processing → completed | failed`, with backoff retries and a recorded `failureReason`. `onApplicationBootstrap` resumes whatever a crash left mid-flight, and a failed analysis can be re-run without a re-upload. Anything odd about a run — a level awarded with nothing quoted behind it — lands in `analysis.notes` and is shown, never dropped.

### One rubric, one file

`src/analysis/rubric/rubric.ts` is the only place criteria exist. The prompt, the response schema's enums, the scoring, the award tiers and the client's form are all derived from it, and `rubric.spec.ts` fails the build if the weights stop summing to 100 or a criterion ships without a check.

---

## Getting started

```bash
npm install
cp .env.example .env      # fill in the blanks
npm run start:dev         # http://localhost:8000

# /results is behind a JWT and nothing seeds an account:
npm run seed:reviewer -- --username reviewer --password 'a-strong-password'
```

Needs MongoDB, an S3 bucket, and a [Gemini API key](https://aistudio.google.com/apikey). Every variable is validated at boot, so a missing one stops the process with a list of what is wrong rather than failing hours later inside a background job.

```bash
npm test          # jest
npm run lint      # eslint --fix
npm run build     # nest build → dist/
```

### Running the whole stack locally

`docker compose up --build` brings up MongoDB, MinIO and the API wired together
the way the cluster wires them — including the split between the endpoint the
server calls MinIO on and the one presigned download links are signed for, which
is the part most likely to be wrong. Put `GEMINI_API_KEY` in `.env.compose`
first. Run the client against it with `npm run dev` in the other repo.

### Deployment

Images build in GitHub Actions (`.github/workflows/ci.yml`) and publish to GHCR
on every merge to `master`; the workflow then pins the new tag in
[**deepdoc-gitops**](https://github.com/RoongChakkrin42/deepdoc-gitops), where
ArgoCD picks it up and rolls it out to a k3s cluster. That repository's README
is the deployment runbook.

Two things there are consequences of code in *this* repository, and are
explained where they are configured: the API runs a **single replica** with a
`Recreate` strategy, because the boot-time resume of unfinished analyses has no
locking; and the ingress must preserve the client IP, because the throttler
keys on it.

---

## API

Errors share one shape: `{ statusCode, message, path, timestamp }`.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/auth/register` · `/auth/login` · `/auth/refresh` | — | Account and tokens |
| `GET` | `/auth/me` | Bearer | Verify a token is still valid |
| `GET` | `/submissions/form-schema` | — | The rubric, for rendering the form |
| `POST` | `/submissions` | — | Upload → `202 { id, status }` |
| `GET` | `/submissions?year=2026` | Bearer | A year's submissions, best score first |
| `POST` | `/submissions/:id/retry` | Bearer | Re-run a failed analysis |

`POST /submissions` is `multipart/form-data`: the report PDF as `project`, and — because a multipart body cannot carry nested objects — the submitter details as a JSON string in `data`.

---

## Limits and trade-offs

- **Scores still move a little** — 2.4 points over three runs of one document, which is a spot check, not an evaluation harness. Trust award tiers; ranking two neighbours by a decimal is not meaningful. There is no golden set and no comparison against human graders, so treat the output as first-pass triage.
- **PDFs are billed as image tokens, not text.** The model genuinely looks at each page, which is the point, but a long report costs far more than its byte size suggests. Gemini caps an inline request at 20 MB and a report over the configured budget is refused with a message naming the size.
- **`POST /submissions` and `POST /auth/register` are unauthenticated on purpose** for the demo, protected only by rate limits. Production wants a submission window, an admin guard, and an invite flow.
- **Rate limiting keys on the caller, not the proxy.** `ThrottlerGuard` reads `req.ip`, which Express derives from `X-Forwarded-For` using a `trust proxy` hop count that belongs to the deployment rather than the app — one hop behind Traefik, two behind a host that fronts with a CDN. Getting it wrong fails silently and hands every caller a fresh allowance. `ProxyAwareThrottlerGuard` prefers `CF-Connecting-IP`, which the CDN overwrites and a caller therefore cannot forge, and falls back to `req.ip` elsewhere.
- **Analyses run in-process**, and refresh tokens are stateless with no revocation list. One instance is fine; a real deployment wants a queue and a token blacklist.

---

## สรุปภาษาไทย

**DeepDoc API** คือ backend (NestJS) ที่ให้ Google Gemini ช่วยตรวจและให้คะแนนรายงานการบริหารความเสี่ยง สำหรับรางวัล **Chula RMEx Award** ของจุฬาลงกรณ์มหาวิทยาลัย ซึ่งตัดสินด้วยเกณฑ์ 5 มิติ 15 เกณฑ์ย่อย เต็ม 100 คะแนน ระบบทำหน้าที่ตรวจรอบแรก ให้กรรมการเริ่มจากผลที่มีคะแนนและหลักฐานอ้างอิงครบ แทนที่จะเริ่มจากกอง PDF

**เทคโนโลยี:** NestJS 11 · TypeScript · MongoDB · AWS S3 · Google Gemini · JWT · Jest

**การทำงาน:** อัปโหลดรายงาน PDF ไฟล์เดียว → เก็บลง S3 → ตอบ `202 pending` ทันที → เบื้องหลังส่งเข้า Gemini พร้อมเกณฑ์ → Gemini เลือก "ระดับ" ให้ทุกเกณฑ์ย่อย → เซิร์ฟเวอร์คิดคะแนนเอง → ผู้ตรวจล็อกอินดูผลที่เรียงตามคะแนน

### ปัญหาหลักที่แก้ และวิธีแก้

**1. คะแนนเหวี่ยง 18 คะแนน ทั้งที่เป็นเอกสารเดียวกัน**

วิธีตรงไปตรงมาคือให้เกณฑ์แล้วขอตัวเลขต่อมิติ ผลคือรันเอกสารเดิม 3 รอบได้ 43, 28, 25 และทุกมิติขยับไปทางเดียวกัน แปลว่าโมเดลเปลี่ยน "ความเข้มในการอ่านเกณฑ์" ทุกรอบ ลด `temperature` เป็น 0 แล้ววัด ไม่ช่วย เพราะโมเดลคิดภายในของมันเองซึ่งแปรผันอยู่ดี แก้ 4 อย่างพร้อมกัน:

- ให้**เลือก 1 ใน 5 ระดับ**ตามคำบรรยายจริงในเอกสารเกณฑ์ ไม่ให้คิดเลขเอง
- ต้อง**คัดข้อความจริงจากเอกสาร**มาใส่ `evidenceFound` ก่อนตัดสิน ระดับที่ได้จึงมาจากการอ่าน ไม่ใช่ความรู้สึก
- **อะไรที่นับได้ต้องนับ** — "อย่างน้อย 2 ช่องทาง", "ปีละ 2 ครั้ง" เขียนเป็นรายการ `checks` รายเกณฑ์
- **ตัดสิน 15 ครั้งเล็ก แทน 5 ครั้งใหญ่** อ่านพลาดข้อเดียวจึงกระทบคะแนนรวมน้อยลงมาก

วัดด้วยเอกสารเดิม แบบใหม่ได้ **81.83, 81.83, 84.25** เหวี่ยง 2.42 คะแนน ได้ระดับรางวัลเดียวกันทุกรอบ

**2. เคยปล่อยให้ AI คิดเลข** — ตอนนี้โมเดลไม่ตอบตัวเลขสักตัว เซิร์ฟเวอร์คำนวณเองทุกขั้นและปัดเศษก่อนส่งต่อ คะแนนรวมจึงเท่ากับผลบวกของตัวเลขที่แสดงข้าง ๆ เสมอ: `ระดับ → คะแนน (95/80/60/40/15) → เฉลี่ยรายมิติ → ถ่วงน้ำหนัก → รวม → ระดับรางวัล` ได้ "โดดเด่น" ครบทุกข้อจะได้ **95 ไม่ใช่ 100** ตรงตามที่เกณฑ์เขียนว่าโดดเด่น = ช่วง 90-100

**3. สั่งให้ตรวจความสอดคล้องกับกรอบมหาวิทยาลัย ทั้งที่ AI ไม่เคยเห็นกรอบนั้น** — เกณฑ์ข้อ 2.1 ต้องดูว่าความเสี่ยงของส่วนงานตรงกับกรอบระดับมหาวิทยาลัยไหม ตอนนี้ส่งกรอบไปใน prompt ด้วย การตรวจจึงเทียบกับหมวดจริง ไม่ใช่ที่โมเดลเดาเอา

**4. ผลงานคือเอกสารฉบับเดียว ไม่ใช่ไฟล์ 16 ช่อง** — ผู้ส่งเขียนรายงานฉบับเดียวครอบคลุมทั้ง 5 มิติ โดยบรรยายหลักฐานไว้ข้างใน ฟอร์มที่บังคับอัปโหลดแยกรายเกณฑ์จึงไม่ตรงกับงานจริง ตอนนี้รับ PDF ไฟล์เดียว และส่งเกณฑ์ไปให้หน้าเว็บแสดงเป็น checklist ให้เช็คก่อนอัป

**5. งานที่พังเคยหายเงียบ** — การตรวจใช้เวลาหลายสิบวินาที จึงทำเบื้องหลังภายใต้สถานะ `pending → processing → completed | failed` มี retry บันทึกสาเหตุเมื่อล้มเหลว และไล่ทำงานที่ค้างต่อให้เองตอนเปิดเซิร์ฟเวอร์ ส่วนความผิดปกติในรอบนั้น เช่น ให้ระดับสูงแต่ยกหลักฐานมาไม่ได้ จะขึ้นเป็นคำเตือน ไม่ตัดทิ้งเงียบ ๆ

**6. เกณฑ์อยู่ที่เดียว** — `src/analysis/rubric/rubric.ts` เป็นที่เดียวที่นิยามเกณฑ์ ทั้ง prompt, response schema, การคิดคะแนน, ระดับรางวัล และฟอร์มฝั่งหน้าเว็บ ล้วนสร้างจากไฟล์นี้ แก้ที่เดียวจบ มีเทสต์กันไว้ว่าน้ำหนักต้องรวมได้ 100 เสมอ

### เริ่มใช้งาน

```bash
npm install
cp .env.example .env      # ใส่ค่าให้ครบ (ต้องมี MongoDB, S3 bucket, Gemini API key)
npm run start:dev

# หน้า /results ต้องล็อกอิน และระบบไม่ได้สร้างบัญชีให้อัตโนมัติ
npm run seed:reviewer -- --username reviewer --password 'รหัสที่ตั้งเอง'
```

### ข้อจำกัดที่ควรรู้

- คะแนนยังขยับได้เล็กน้อย (~2.4 คะแนน วัดจากเอกสารเดียว 3 รอบ) ให้เชื่อ "ระดับรางวัล" มากกว่าตัวเลขทศนิยม และยังไม่มีการเทียบกับกรรมการจริง ถือเป็นตัวช่วยคัดกรองรอบแรก ไม่ใช่คำตัดสิน
- PDF ถูกคิดค่าเป็น token รูปภาพ ไม่ใช่ข้อความ เอกสารยาวจึงแพงกว่าที่ขนาดไฟล์บอกมาก
- `POST /submissions` และ `POST /auth/register` เปิดสาธารณะโดยตั้งใจสำหรับเดโม มีแค่ rate limit กัน ถ้าใช้จริงต้องปิดเพิ่ม
