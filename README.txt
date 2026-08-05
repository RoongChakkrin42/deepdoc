===============================================================================
DeepDoc API  —  AI-assisted grading of Thai university project reports
Backend service  ·  NestJS 11 · TypeScript · MongoDB · AWS S3 · Google Gemini
===============================================================================

Companion repository: deepdoc_client (the web front end)
Full technical documentation with architecture diagrams: README.md


-------------------------------------------------------------------------------
1. WHAT THIS IS  (for non-technical readers)
-------------------------------------------------------------------------------

Every year, university departments submit a report showing how they manage
institutional risk. A committee reads each report plus its supporting
paperwork and scores it against an official 100-point rubric. It is slow,
repetitive work, and different reviewers score the same report differently.

DeepDoc automates the first pass. A department uploads its report and its
supporting documents; the system sends everything to Google's Gemini AI along
with the official rubric, and returns a score for each of the five assessment
areas together with a written justification citing the specific documents it
found or found missing. Reviewers then read a ranked list instead of a pile of
PDFs.

The rubric is real: the Chulalongkorn University integrated risk-management
assessment, 5 dimensions, 15 criteria, 100 points.

This repository is the server: it receives the uploads, stores them, talks to
the AI, and serves the results to the reviewer interface.


-------------------------------------------------------------------------------
2. WHAT IT DEMONSTRATES  (for technical readers)
-------------------------------------------------------------------------------

The interesting problems here are about making a language model's output
trustworthy enough to act on, not about CRUD.

  MULTIMODAL DOCUMENT INPUT
  PDFs are sent to Gemini as inline binary data, not as extracted text. The
  model sees the actual page, so tables, signatures, official stamps and
  scanned documents all count as evidence. Usage metadata confirms the pages
  are processed under IMAGE modality.

  STRUCTURED OUTPUT AS A CONTRACT
  The reply shape is enforced with responseSchema + responseMimeType, and the
  schema is generated from the rubric definition. There is no prompt-and-pray
  JSON parsing.

  THE SERVER OWNS THE ARITHMETIC
  The model is never asked for a total. It scores five dimensions; the server
  sums them and clamps each score to its rubric weight. A submission can never
  display a total that disagrees with the parts it is made of.

  FAILURE IS VISIBLE, NEVER SILENT
  Grading runs in the background behind a status machine
  (pending → processing → completed | failed), with bounded retries and
  exponential backoff. Work interrupted by a crash or redeploy is resumed at
  boot. Reviewers can re-run a failed analysis without re-uploading. Evidence
  dropped for payload limits and scores adjusted for being out of range are
  both recorded and surfaced in the UI.

  ONE SOURCE OF TRUTH
  src/analysis/rubric/rubric.ts defines the assessment criteria. The upload
  field names, the multer configuration, the prompt, the AI response schema and
  the entire form the browser renders are all derived from it. Adding a
  criterion is a one-file change. A test fails the build if the weights stop
  summing to 100.

  HONEST ABOUT WHAT IT CANNOT DO
  Re-running the same submission produces scores that vary by around 20 points
  out of 100. This was measured across five runs, at two temperature settings,
  and is documented in README.md rather than hidden. Rankings within one batch
  are meaningful; absolute scores across batches are not. A grading tool that
  overstates its own precision is worse than no tool.


-------------------------------------------------------------------------------
3. ARCHITECTURE
-------------------------------------------------------------------------------

  POST /submissions  (public, rate limited, PDF-only, size-capped)
        |
        v
  SubmissionsService ---> StorageService ---> AWS S3
        |                                     (UUID keys, presigned reads)
        |
        +---> MongoDB           (submission record, status = pending, 202 returned)
        |
        +---> AnalysisService ---> Google Gemini
                  |                 report + every evidence PDF + rubric
                  |                 constrained JSON response
                  v
              validated scores ---> MongoDB (status = completed)

  GET /submissions?year=  (reviewer, JWT)  ---> ranked results + presigned URLs

Module layout, one responsibility each:

  src/analysis/      Gemini only. Takes buffers, returns validated scores.
                     No database or storage dependency, so it is unit-testable
                     with plain Buffers and cannot form a dependency cycle.
  src/submissions/   Lifecycle: upload, status machine, retries, listing.
  src/storage/       S3 upload, download, presigned URLs.
  src/auth/          JWT access/refresh pair, passport strategies, bcrypt.
  src/users/         Reviewer accounts.
  src/common/        Environment validation, global exception filter, the
                     multipart-JSON decorator and pipe.


-------------------------------------------------------------------------------
4. ENGINEERING PRACTICES
-------------------------------------------------------------------------------

  - Configuration is validated with class-validator at boot. A missing or
    malformed variable stops the process with a list of what is wrong, instead
    of failing hours later inside a background job.
  - Every error passes through one exception filter and shares one JSON shape.
  - All request payloads are validated by DTOs before reaching a service.
  - Rate limiting on submission, login and registration endpoints.
  - Passwords are bcrypt hashed at 12 rounds and excluded from queries by
    default, so the hash cannot leak into a response by accident.
  - Credential checks spend the same time whether or not the username exists,
    so response timing does not reveal which accounts are real.
  - 48 tests across 6 suites: rubric invariants, AI response normalisation with
    the SDK mocked, environment validation, the multipart-JSON pipe, Mongoose
    schema construction, and HTTP-level tests that exercise the real routing,
    the real JWT guard and the real validation pipeline via supertest.
  - Zero npm audit vulnerabilities.
  - Deliberate security trade-offs (public submission endpoint, open reviewer
    registration, stateless refresh tokens) are listed and explained in
    README.md rather than left for a reader to discover.


-------------------------------------------------------------------------------
5. RUNNING IT
-------------------------------------------------------------------------------

  npm install
  cp .env.example .env        # fill in MongoDB, S3 and Gemini credentials
  npm run start:dev           # http://localhost:8000

  npm test                    # 48 tests
  npm run lint
  npm run build

Requires MongoDB, an S3 bucket and a Gemini API key. README.md has setup
instructions, the full API reference, and the configuration table.


-------------------------------------------------------------------------------
6. PROJECT BACKGROUND
-------------------------------------------------------------------------------

Originally written as a favour for a lecturer at Chulalongkorn University. It
was never deployed for real use. It has since been rebuilt as a portfolio piece
demonstrating a production-shaped Gemini integration.

The rebuild fixed a central flaw in the original: the AI graded only the
project report and never saw the supporting evidence files, even though every
rubric criterion explicitly asks for documentary proof. It was being asked to
judge evidence it had never been shown.

Several other defects were found and fixed along the way, including an upload
endpoint that returned HTTP 201 while reporting an internal failure in the
response body, S3 object keys that collided when two files were uploaded in the
same millisecond, and a validation pipeline ordering bug that made the primary
submission endpoint reject every request. The last of these was only found by
starting the server and exercising it, which is why the test suite now includes
HTTP-level and schema-construction tests.
