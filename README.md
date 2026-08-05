# DeepDoc API

A NestJS service that grades Thai-language university project reports with **Google Gemini**.

A submitter uploads a project report plus supporting evidence PDFs. The service stores them in S3, sends every PDF to Gemini together with a structured rubric, and persists a per-dimension score that reviewers browse in the [web client](https://github.com/RoongChakkrin42/deepdoc_client).

Built around a real rubric: the Chulalongkorn University integrated risk-management assessment — 5 dimensions, 15 criteria, 100 points.

> 🇹🇭 [สรุปภาษาไทยอยู่ท้ายไฟล์](#สรุปภาษาไทย)

---

## What this project demonstrates

| Concern | Approach |
| --- | --- |
| **Multimodal input** | PDFs go to Gemini as `inlineData`, not as scraped text — the model reads tables, stamps, signatures and scanned pages |
| **Reliable JSON** | `responseSchema` + `responseMimeType: application/json` instead of regex-scraping prose for a JSON object |
| **Not trusting the model with arithmetic** | The overall score is summed server-side from the dimension scores; the model is never asked for a total |
| **Bounded output** | Every dimension score is clamped to its rubric weight, and any adjustment is surfaced to the reviewer |
| **Long-running work** | Grading takes tens of seconds, so it runs in the background behind a status machine with retries, resumable after a restart |
| **One source of truth** | The rubric drives the upload fields, the form the client renders, the prompt, and the response schema |

---

## Architecture

```
                    ┌──────────────────────────────────────────┐
   browser  ──POST──▶ SubmissionsController                    │
  (public)           │   • multer, PDF-only, size-capped       │
                     │   • ParseJsonPipe validates submitter   │
                     └───────────────┬──────────────────────────┘
                                     │
                     ┌───────────────▼──────────────────────────┐
                     │ SubmissionsService                       │
                     │   owns the lifecycle + retries           │
                     └───┬──────────────────┬───────────────────┘
                         │                  │
              ┌──────────▼──────┐   ┌───────▼─────────────────┐
              │ StorageService  │   │ AnalysisService         │
              │  S3 put/get     │   │  PDFs ──▶ Gemini ──▶    │
              │  presigned URLs │   │  validated scores       │
              └─────────────────┘   └───────┬─────────────────┘
                                            │
                                    ┌───────▼─────────┐
                                    │ rubric.ts       │
                                    │ single source   │
                                    │ of truth        │
                                    └─────────────────┘
```

### Module map

| Path | Responsibility |
| --- | --- |
| `src/analysis/` | Everything Gemini. `rubric/rubric.ts` defines the criteria; `analysis.service.ts` turns PDFs into validated scores. Has **no** database or storage dependency, so it is testable with plain buffers. |
| `src/submissions/` | Submission lifecycle: upload, status machine, retries, listing. |
| `src/storage/` | S3 upload, download and presigned URLs. |
| `src/auth/` | Reviewer login, JWT access/refresh pair, passport strategies. |
| `src/users/` | Reviewer accounts. |
| `src/common/` | Env validation, global exception filter, the multipart-JSON pipe. |

---

## The Gemini integration

### 1. Every PDF reaches the model

The rubric demands documentary proof on all 15 criteria (*"แสดงหลักฐาน : ..."*). So the request carries the report **and** each evidence file, each introduced by a text part naming the criterion it is meant to prove:

```
[ rubric text ]
=== เอกสารโครงการ ===  ชื่อไฟล์: report.pdf
<inlineData: application/pdf>
=== หลักฐานข้อ 1.1 (การสื่อสารนโยบาย…) ===  ชื่อไฟล์: policy-comms.pdf
<inlineData: application/pdf>
=== หลักฐานข้อ 1.2 (…) ===
ไม่มีไฟล์หลักฐานแนบมาสำหรับข้อนี้
…
```

Criteria with no upload are stated explicitly, so a missing document is graded as missing rather than imagined.

Gemini caps an inline request at 20 MB. `GEMINI_MAX_PAYLOAD_MB` (default 18) budgets the base64-encoded payload; anything that does not fit is skipped **and reported** in `analysis.notes`, which the client renders as a warning on the result. Nothing is dropped silently.

**PDFs are billed as image tokens, not text.** A one-page PDF costs a few hundred prompt tokens under `IMAGE` modality — the model is genuinely looking at the page rather than reading extracted text, which is the point, but it means a submission with many evidence files is far more expensive than its byte size suggests. Budget accordingly before pointing this at a free-tier key.

> **Model availability changes.** Models are retired for *new* API keys before they disappear from `ListModels`, so a name can appear in the model list and still 404 with `"no longer available to new users"` when you call it. If analyses start failing right after a key rotation, check the model name first — `GEMINI_MODEL` exists so this is a config change, not a code change.

### 2. The response shape is a contract

`responseSchema` (see `src/analysis/rubric/response.schema.ts`) constrains the reply to exactly five dimension objects with an integer score and a comment. The schema is generated from the rubric, so the model can never be asked for a dimension that does not exist.

### 3. The server owns the numbers

```ts
overallScore: scored.reduce((total, d) => total + d.score, 0)
```

The model grades; it does not add up. Scores outside `0..weight` are clamped and the adjustment is recorded in `notes` rather than hidden.

### 4. Failure is visible

| Status | Meaning |
| --- | --- |
| `pending` | Files stored, queued |
| `processing` | A Gemini call is in flight |
| `completed` | Scored |
| `failed` | Every attempt failed; `failureReason` says why |

Attempts are retried with exponential backoff up to `ANALYSIS_MAX_ATTEMPTS`. On boot, `onApplicationBootstrap` picks up anything left in `pending`/`processing` by a crash or redeploy. Reviewers can re-run a failed analysis with `POST /submissions/:id/retry` — no re-upload needed.

---

## Getting started

```bash
npm install
cp .env.example .env      # then fill in the blanks
npm run start:dev         # http://localhost:8000
```

Requires MongoDB, an S3 bucket, and a [Gemini API key](https://aistudio.google.com/apikey). Configuration is validated at boot — a missing or malformed variable stops the process with a list of what is wrong, rather than failing hours later inside a background job.

### MongoDB for local development

```bash
brew tap mongodb/brew && brew trust mongodb/brew
brew install mongodb-community
brew services start mongodb/brew/mongodb-community
```

Then set `MONGODB_URI=mongodb://127.0.0.1:27017/deepdoc`.

#### If `brew services start` fails with `Bootstrap failed: 5: Input/output error`

This is a bug in MongoDB's tap, not in your machine. Their formula declares

```ruby
service do
  name macos: "#{plist_name}"
end
```

with **no `run`** — it expects Homebrew to pick up the plist MongoDB ships
inside the package. Homebrew 6 dropped that behaviour in favour of the `service`
DSL, so it generates a launch agent with an empty `ProgramArguments`, and
`launchd` rejects the job.

The plist MongoDB ships is complete, so install that one instead:

```bash
cp /opt/homebrew/opt/mongodb-community/homebrew.mxcl.mongodb-community.plist \
   ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/homebrew.mxcl.mongodb-community.plist
```

`brew services list` then reports it as `started`, and it restarts at login.
To remove it: `launchctl bootout gui/$(id -u)/homebrew.mxcl.mongodb-community`.

To skip the service entirely, run the daemon in the foreground — note `--fork`
is no longer supported on macOS:

```bash
mongod --config /opt/homebrew/etc/mongod.conf
```

### Create the first reviewer account

```bash
curl -X POST http://localhost:8000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"reviewer","password":"a-strong-password"}'
```

### Scripts

```bash
npm run start:dev    # watch mode
npm run build        # nest build → dist/
npm run start:prod   # node dist/main
npm test             # jest
npm test -- rubric   # a single suite by name pattern
npm run test:cov     # coverage
npm run lint         # eslint --fix
```

---

## Configuration

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `PORT` | | `8000` | |
| `NODE_ENV` | | `development` | |
| `CORS_ORIGINS` | | `http://localhost:3000` | Comma-separated browser origins |
| `MONGODB_URI` | ✅ | | |
| `JWT_SECRET` | ✅ | | Minimum 16 chars — `openssl rand -base64 32` |
| `JWT_ACCESS_TTL` | | `2h` | |
| `JWT_REFRESH_TTL` | | `7d` | |
| `GEMINI_API_KEY` | ✅ | | |
| `GEMINI_MODEL` | | `gemini-3.6-flash` | |
| `GEMINI_MAX_PAYLOAD_MB` | | `18` | Base64 payload ceiling, max 19 |
| `ANALYSIS_MAX_ATTEMPTS` | | `3` | |
| `AWS_REGION` | ✅ | | |
| `AWS_ACCESS_KEY_ID` | ✅ | | |
| `AWS_SECRET_ACCESS_KEY` | ✅ | | |
| `S3_BUCKET` | ✅ | | |
| `MAX_UPLOAD_MB` | | `10` | Per file |

---

## API

All responses are JSON. Errors share one shape:

```json
{ "statusCode": 400, "message": "…", "path": "/submissions", "timestamp": "…" }
```

### Auth

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/auth/register` | — | Create a reviewer account |
| `POST` | `/auth/login` | — | `{ access_token, refresh_token, token_type }` |
| `POST` | `/auth/refresh` | — | Exchange a refresh token for a new pair |
| `GET` | `/auth/me` | Bearer | Verify a token is still valid |

### Submissions

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/submissions/form-schema` | — | The rubric, for rendering the upload form |
| `POST` | `/submissions` | — | Upload a submission → `202 { id, status }` |
| `GET` | `/submissions?year=2026` | Bearer | All submissions for a year, best score first |
| `POST` | `/submissions/:id/retry` | Bearer | Re-run a failed analysis |

`POST /submissions` is `multipart/form-data`. A multipart body cannot carry nested objects, so the submitter details ride along as a JSON string in `data`, read by the `JsonBody` decorator and validated by `ParseJsonPipe`:

| Field | Contents |
| --- | --- |
| `project` | The report PDF (required, 1 file) |
| `evidence_1_1` … `evidence_5_2` | Evidence PDFs, up to 5 per criterion |
| `data` | JSON string: `{ name, projectName, department, email, phone }` |

Field names come from `GET /submissions/form-schema` — never hardcode them.

Rate limits: 60 req/min globally, 5/min on login and refresh, 3/min on register, 5/hour on submission upload.

---

## Adding or changing a rubric criterion

Edit `src/analysis/rubric/rubric.ts`. That is the whole change — the upload fields, the client's form, the prompt and the response schema are all derived from it. A `rubric.spec.ts` invariant fails the build if the weights stop summing to 100.

---

## Security notes

These are deliberate choices for a demo, and each is what you would revisit before a real deployment:

- **`POST /submissions` is unauthenticated.** Submitters are students without accounts. It is rate limited, PDF-only, size-capped and DTO-validated, but a production deployment wants a submission window, a CAPTCHA, or per-faculty tokens.
- **`POST /auth/register` is open.** Fine for bootstrapping the first reviewer; put it behind an admin guard or an invite flow before shipping.
- **Refresh tokens are stateless.** There is no server-side revocation list, so a stolen refresh token is valid until it expires.
- **Presigned S3 URLs last 6 hours.** Anyone holding a link can read that PDF for that long, without authenticating.

---

## Known limitations

- Analyses run in-process. One instance is fine; behind a load balancer, two instances would both resume the same stuck submissions on boot. A real queue (BullMQ, SQS) is the next step.
- **Scores are not stable across runs, and lowering the temperature does not fix it.** Re-running the analysis five times over one identical submission (`gemini-3.6-flash`):

  | `temperature` | totals out of 100 | spread |
  | --- | --- | --- |
  | `0.2` | 46, 26 | 20 |
  | `0` | 43, 28, 25 | 18 |

  Every dimension moves the same direction on a given run, so the model is re-deciding how strictly to read the rubric rather than adding independent per-dimension noise. `temperature` is set to `0` because that is the right default for a grading task, **but it was measured and it is not the cause** — this model does internal reasoning (responses carry a `thoughtsTokenCount`), and that reasoning varies run to run regardless of the sampling temperature.

  The practical consequence: **rankings within a single run are meaningful, absolute scores are not.** Do not compare this year's 72 against last year's 68, and do not treat a 46 as meaningfully different from a 43. If absolute numbers have to carry weight, grade the whole cohort in one run and report the median of several runs with its spread.

  Untried ideas that would plausibly narrow it: scoring the 15 criteria individually instead of the 5 dimensions, so each number is anchored to one concrete evidence requirement; and putting explicit deduction rules in the prompt rather than leaving "how strict to be" to the model.

- There is no scoring evaluation harness — no golden set, no comparison against human graders. Treat the scores as a first-pass triage aid, not a verdict.
- Gemini's judgement of Thai administrative documents has not been formally validated.

---

## สรุปภาษาไทย

**DeepDoc API** คือ backend (NestJS) ที่ให้ Google Gemini ช่วยตรวจและให้คะแนนรายงานโครงการ ตามเกณฑ์การประเมินการบริหารความเสี่ยงของจุฬาลงกรณ์มหาวิทยาลัย (5 มิติ 15 เกณฑ์ย่อย เต็ม 100 คะแนน)

**การทำงาน**

1. ผู้ส่งอัปโหลดไฟล์สรุปโครงการ พร้อมไฟล์หลักฐานของแต่ละเกณฑ์ (PDF)
2. ระบบเก็บไฟล์ลง S3 แล้วตอบกลับทันทีด้วยสถานะ `pending`
3. เบื้องหลัง ระบบส่ง **ไฟล์ PDF ทั้งหมด** (ทั้งเอกสารโครงการและหลักฐานทุกไฟล์) เข้า Gemini พร้อมเกณฑ์การให้คะแนน
4. Gemini ตอบกลับเป็น JSON ที่ถูกบังคับรูปแบบด้วย `responseSchema`
5. เซิร์ฟเวอร์ตรวจสอบคะแนน ปรับให้อยู่ในช่วงที่ถูกต้อง แล้ว**รวมคะแนนเอง** (ไม่ให้ AI บวกเลข)
6. หน้าเว็บฝั่งผู้ตรวจ poll ดูสถานะจนกว่าจะประเมินเสร็จ

**จุดที่แก้จากเวอร์ชันแรก**

- เดิม AI ได้เห็นแค่เอกสารโครงการ **ไม่เคยเห็นไฟล์หลักฐานเลย** ทั้งที่ทุกเกณฑ์เขียนว่า "แสดงหลักฐาน" — ตอนนี้ส่งครบทุกไฟล์
- เดิมใช้ `pdf-parse` ดึงแต่ข้อความ ทำให้ตาราง รูป และเอกสารสแกนหายไป — ตอนนี้ส่ง PDF ตรงเข้า Gemini
- เดิมงมหา JSON จากคำตอบด้วย regex — ตอนนี้ใช้ structured output
- เดิมถ้า AI พัง งานจะหายเงียบ ๆ ไม่มีใครรู้ — ตอนนี้มีสถานะ `pending/processing/completed/failed` มี retry และสั่งประเมินใหม่ได้
- เดิมชื่อ field หลักฐานถูกเขียนซ้ำ 3 ที่ — ตอนนี้มีที่เดียวคือ `src/analysis/rubric/rubric.ts`
- เดิมแบบฟอร์มเก็บหลักฐานไม่ครบตามเกณฑ์ (ขาดข้อ 3.2, 3.3, 4.3 และมิติที่ 5 ทั้งมิติ) — ตอนนี้ครบทั้ง 15 ข้อ

**เริ่มใช้งาน**

```bash
npm install
cp .env.example .env      # ใส่ค่าให้ครบ
npm run start:dev
```

⚠️ **ชื่อตัวแปร environment เปลี่ยนหมดแล้ว** (เช่น `APIKEY` → `GEMINI_API_KEY`, `DATABASEURL` → `MONGODB_URI`) ดูรายการเต็มใน `.env.example` ระบบจะตรวจสอบค่าตั้งแต่ตอนเปิดเซิร์ฟเวอร์ ถ้าขาดตัวไหนจะบอกทันที
