# VedaAI — AI Answer Sheet Evaluation Engine

Upload a question paper and a student's answer sheet; get back every
question mapped to its answer, an exact highlighted region for each
mapping, AI-generated marks and feedback, and a class-ready summary — in
under a minute.

This README is written to get another developer from clone to running
app in under 10 minutes. For what the product does from a teacher's
perspective, see [`README_TEACHER.md`](./README_TEACHER.md). For design
rationale behind specific subsystems, see [`skills/`](./skills).

## Quick start

```bash
git clone <this-repo>
cd veda-ai-checker
npm install
cp .env.example .env.local
# open .env.local and set GEMINI_API_KEY (get one free at https://aistudio.google.com/app/apikey)
npm run dev
```

Open http://localhost:3000, upload the files in
`test-data/scenario-1-basic/`, and click **Start Mapping**.

Without a `GEMINI_API_KEY`, the app still runs end-to-end using a
degraded Tesseract.js fallback (typed text only, no real handwriting
understanding) — useful for UI development, not for evaluating extraction
accuracy. See [`skills/OCR Architecture.md`](./skills/OCR_Architecture.md).

## Environment variables

All documented in [`.env.example`](./.env.example):

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `GEMINI_API_KEY` | Yes (for real AI) | — | Gemini Vision API key |
| `GEMINI_MODEL` | No | `gemini-2.5-flash` | Model for extraction/grading |
| `FORCE_OCR_FALLBACK` | No | `false` | Force Tesseract.js even with a key set |
| `NEXT_PUBLIC_MAX_UPLOAD_MB` | No | `10` | Client + server upload size limit |
| `MAPPING_CONFIDENCE_THRESHOLD` | No | `0.55` | Below this, a mapping is flagged for review |
| `SESSION_TTL_MINUTES` | No | `120` | In-memory session expiry |

## Running locally

```bash
npm run dev        # http://localhost:3000, hot reload
npm run typecheck   # tsc --noEmit
npm run lint        # next lint
```

## Building

```bash
npm run build
npm run start        # serves the production build on :3000
```

## Testing

```bash
npm run test          # vitest unit tests (mapping engine, JSON repair, number normalization)
npm run test:e2e      # Playwright end-to-end (upload -> process -> results)
npm run test:all       # both
```

Playwright needs browsers installed once: `npx playwright install --with-deps chromium`.

For a full manual verification walkthrough with no code reading required,
see [`TESTING_GUIDE.md`](./TESTING_GUIDE.md) and the four scenarios under
[`test-data/`](./test-data).

## Deployment

See [`skills/Deployment Guide.md`](./skills/Deployment_Guide.md) for the
full walkthrough and troubleshooting table. Short version: push to a git
provider, import into Vercel, set `GEMINI_API_KEY` in the project's
environment variables, deploy.

## Folder structure

```
app/
  page.tsx                     # phase state machine: upload -> processing -> results
  layout.tsx, providers.tsx, globals.css
  api/
    upload/route.ts            # POST: validate + store an uploaded file
    process/route.ts           # POST: SSE stream running the full pipeline
    session/[sessionId]/
      route.ts                 # GET full session data, DELETE to clear
      pages/[kind]/[pageNumber]/route.ts   # serves rasterized page PNGs

components/
  layout/                      # Sidebar, TopBar, AppShell (persistent chrome)
  upload/                      # UploadScreen, UploadDropzone, TeacherAvatar
  processing/                  # ExtractingScreen
  results/                     # QuestionList, QuestionCard, AnswerSheetViewer,
                                # HighlightOverlay, SummaryCard, OrphanAnswersPanel,
                                # ResultsScreen (desktop split-pane / mobile tabs)
  ui/                          # shadcn-style primitives (button, badge, tabs, ...)

lib/
  pdf/                         # PDF/image -> rasterized page rendering
  gemini/                      # Gemini client, prompts, JSON repair
  ocr/                         # question/answer extraction pipelines, Tesseract fallback
  mapping/                     # the 3-phase hybrid mapping engine (see skills/)
  grading/                     # per-question + summary grading
  store/                       # in-memory session store, temp file storage

types/                         # ExtractedQuestion, ExtractedAnswerBlock, Mapping, Grading, Session
hooks/                         # useUpload, useProcessingStream (SSE), useSessionData
skills/                        # design-decision docs (OCR, Mapping, Highlighting, Grading, Deployment)
test-data/                     # 4 scenarios: PDFs + ground-truth.json + expected-output.json
tests/
  unit/                        # vitest: mapping engine, JSON repair, number normalizer
  e2e/                         # Playwright: full upload -> results flow
scripts/
  generate_test_data.py        # regenerates everything under test-data/ (needs: pip install -r scripts/requirements.txt)
```

## Architecture at a glance

```
Upload (2 files) --POST /api/upload--> temp storage + session record
        |
        v
Start Mapping --POST /api/process (SSE)-->
        |
        +--> render pages (pdfjs-dist/sharp) once, save answer-sheet PNGs
        |
        +--> extract questions (Gemini, parallel per page) --+
        +--> extract answers   (Gemini, parallel per page) --+--> both awaited together
        |
        v
   3-phase mapping engine (number -> semantic -> confidence)
        |
        v
   grading engine (per-question Gemini call + summary computation)
        |
        v
   session updated, "done" event sent -> client fetches GET /api/session/:id
        |
        v
   ResultsScreen: question list (left) <-> answer sheet viewer (right),
   click a question -> jump + highlight; hover -> mapping confidence tooltip
```

## Troubleshooting

See the table in [`skills/Deployment Guide.md`](./skills/Deployment_Guide.md#troubleshooting)
— it covers the most common issues (missing API key, timeouts on large
uploads, offset highlights, native module build issues, ephemeral storage
between cold starts).

## A note on scope and honesty

This project was built to closely match a provided design reference and
to implement every pipeline stage described in the assignment spec with
real, working code (no TODOs, no mocked logic in the core engine). Two
things are worth knowing before you review it:

- The Gemini-dependent paths (`isGeminiConfigured()` returning `true`)
  have not been run against the live API in the environment this was
  built in — they're written to the documented Gemini SDK contract and
  exercised via the fallback path, but you should expect to do a real
  smoke test with your own API key before treating this as
  production-verified.
- `test-data/`'s answer sheets are typed PDFs standing in for handwritten
  scans (see `test-data/README.md`), which is enough to validate the
  mapping/highlighting/grading *pipeline* deterministically, but not
  Gemini's handwriting-OCR accuracy specifically — test with a real scan
  for that.
