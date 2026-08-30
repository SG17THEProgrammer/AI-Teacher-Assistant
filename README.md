# AI Teacher Assistant Answer Sheet Evaluation Engine

<div align="center">

[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Gemini AI](https://img.shields.io/badge/Gemini-2.5_Flash-4285F4?style=flat-square&logo=google)](https://ai.google.dev/)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-black?style=flat-square&logo=vercel)](https://ai-teacher-assistant-shray.vercel.app/)


**Upload a question paper + student answer sheet → get AI-graded results with highlighted regions, marks, and feedback in under 60 seconds.**

[Live Demo](#) · [Documentation](#architecture) · [Testing Guide](TESTING_GUIDE.md) · [Teacher's Guide](README_TEACHER.md)

</div>

---

## What It Does

VedaAI reads both a question paper and a student's handwritten answer sheet, figures out which answer belongs to which question, marks each answer, and returns highlighted regions + AI-generated feedback — all in one pipeline run.

| Feature | Detail |
|---|---|
| **OCR** | Gemini Vision (handwriting, diagrams, tables) with Tesseract.js fallback |
| **Mapping** | 3-phase hybrid: number-exact → fuzzy → semantic content matching |
| **Grading** | Per-question AI marks + strengths/mistakes/feedback |
| **Highlighting** | Pixel-accurate bounding boxes, zoom-safe, multi-page |
| **File formats** | PDF, PNG, JPG, JPEG (up to 10MB each) |
| **No database** | In-memory sessions + Vercel Blob storage |

---

## Quick Start

```bash
git clone <this-repo>
cd veda-ai-checker
npm install
cp .env.example .env.local
# Set GEMINI_API_KEY in .env.local (free key at https://aistudio.google.com/app/apikey)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), upload the files in `test-data/scenario-1-basic/`, and click **Start Mapping**.

> **No API key?** The app runs end-to-end with a degraded Tesseract.js OCR fallback — useful for UI development, but not for real handwriting evaluation.

---

## Environment Variables

All variables are documented in [`.env.example`](.env.example):

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `GEMINI_API_KEY` | **Yes** (for real AI) | — | Gemini Vision API key |
| `GEMINI_MODEL` | No | `gemini-2.5-flash` | Model for extraction/grading |
| `FORCE_OCR_FALLBACK` | No | `false` | Force Tesseract.js even when key is set |
| `NEXT_PUBLIC_MAX_UPLOAD_MB` | No | `10` | Upload size limit (client + server) |
| `MAPPING_CONFIDENCE_THRESHOLD` | No | `0.55` | Below this, a mapping is flagged for review |
| `SESSION_TTL_MINUTES` | No | `120` | In-memory session expiry |
| `BLOB_READ_WRITE_TOKEN` | **Yes** (for Vercel) | — | Vercel Blob storage token |

---

## Architecture

```
Upload (2 files) → POST /api/upload → temp storage + session record
        │
        ▼
Start Mapping → POST /api/process (SSE stream) →
        │
        ├── render pages (pdfjs-dist / sharp) once, save answer-sheet PNGs
        │
        ├── extract questions (Gemini Vision, parallel per page) ─┐
        └── extract answers   (Gemini Vision, parallel per page) ─┴── both awaited together
                │
                ▼
        3-phase mapping engine (number → semantic → confidence)
                │
                ▼
        grading engine (per-question Gemini + summary computation)
                │
                ▼
        session updated → "done" event with inline snapshot sent to client
                │
                ▼
        ResultsScreen: question list (left) ↔ answer sheet viewer (right)
        click question → jump + highlight; hover badge → confidence tooltip
```

### Mapping Engine — 3 Phases

| Phase | Method | Description |
|---|---|---|
| **1 — Number Matching** | Exact + Fuzzy | Normalises `"Ans 5"`, `"Q.5"`, `"5."` etc. to canonical form; fuzzy Levenshtein for OCR noise like `"4(o)"` → `"4(a)"` |
| **2 — Semantic Matching** | Gemini text-only call | For answers with no/wrong number: matches by content similarity against unclaimed blocks |
| **3 — Confidence Scoring** | Rule-based | Combines method type + OCR quality signals; flags mappings below threshold for teacher review |

---

## Project Structure

```
app/
  page.tsx                          # Phase state machine: upload → processing → results
  api/
    upload/route.ts                 # POST: validate + store uploaded file
    process/route.ts                # POST: SSE stream — full pipeline
    session/[sessionId]/
      route.ts                      # GET/DELETE session data
      pages/[kind]/[pageNumber]/    # Serves rasterised page PNGs

components/
  layout/                           # Sidebar, TopBar, AppShell
  upload/                           # UploadScreen, UploadDropzone, TeacherAvatar
  processing/                       # ExtractingScreen (SSE progress)
  results/                          # QuestionList, QuestionCard, AnswerSheetViewer,
                                    # HighlightOverlay, SummaryCard, OrphanAnswersPanel
  ui/                               # shadcn-style primitives (button, badge, tabs, …)
  exams/                            # ExamsScreen (history/dashboard)

lib/
  pdf/                              # PDF/image → rasterised pages; bounding-box utilities
  gemini/                           # Gemini client, prompts, JSON repair
  ocr/                              # question/answer extraction pipelines, Tesseract fallback
  mapping/                          # 3-phase hybrid mapping engine
  grading/                          # per-question + summary grading
  store/                            # in-memory session store, Vercel Blob storage

types/                              # ExtractedQuestion, ExtractedAnswerBlock, Mapping, Grading, Session
hooks/                              # useUpload, useProcessingStream (SSE), useSessionData, usePersistedSession
skills/                             # Design-decision docs (OCR, Mapping, Highlighting, Grading, Deployment)
test-data/                          # 6 scenarios: PDFs + ground-truth.json + expected-output.json
tests/
  unit/                             # vitest: mapping engine, JSON repair, number normaliser
  integration/                      # vitest: real API route tests (requires running server)
  e2e/                              # Playwright: full upload → results flow
scripts/
  generate_test_data.py             # Regenerates test-data/ (pip install -r scripts/requirements.txt)
  generate_extra_test_data.py       # Generates scenarios 5 & 6
```

---

## Running Locally

```bash
npm run dev        # http://localhost:3000, hot reload
npm run typecheck  # tsc --noEmit
npm run lint       # next lint
```

## Building

```bash
npm run build
npm run start      # serves production build on :3000
```

---

## Testing

```bash
# Unit tests (mapping engine, JSON repair, number normaliser)
npm run test

# End-to-end tests (requires running dev server + Chromium)
npx playwright install --with-deps chromium
npm run test:e2e

# Integration tests (requires running server at localhost:3000)
BASE_URL=http://localhost:3000 npm run test -- integration

# Everything
npm run test:all
```

### Test Scenarios

| Scenario | Questions | Tests |
|---|---|---|
| `scenario-1-basic` | 5 | Standard extraction + in-order mapping |
| `scenario-2-out-of-order` | 5 | Mapping engine robustness (answers written 5→2→1→4→3) |
| `scenario-3-unanswered` | 8 | "Not Answered" detection (Q4, Q6, Q8 skipped) |
| `scenario-4-multipage` | 4 | Multi-page answer merging (Q2 spans 2 pages) |
| `scenario-5-image-upload` | 3 | JPEG upload path (no PDF text layer) |
| `scenario-6-orphans` | 4 | Orphan answer detection + semantic matching |

See [`TESTING_GUIDE.md`](TESTING_GUIDE.md) for step-by-step manual verification.

> **Note on test data:** Answer sheets are typed PDFs (not scanned handwriting). This gives fully deterministic, reproducible pipeline testing without OCR variance. For real handwriting accuracy, test with a genuine scanned sheet.

---

## Deployment (Vercel)

1. Push to GitHub/GitLab/Bitbucket
2. **Vercel** → New Project → import repo (Next.js auto-detected)
3. Add environment variables (Project Settings → Environment Variables):
   - `GEMINI_API_KEY` ← required
   - `BLOB_READ_WRITE_TOKEN` ← required (create a Vercel Blob store in Storage tab)
   - Any optional vars from `.env.example`
4. Deploy — no custom build config needed

**Hobby plan note:** `maxDuration = 60` in `/api/process/route.ts` matches Vercel Hobby's 60s function limit exactly. Upgrade to Pro for more headroom on large uploads.

See [`skills/Deployment_Guide.md`](skills/Deployment_Guide.md) for a full walkthrough and troubleshooting table.

---

## Key Design Decisions

### Why per-page PNG rendering instead of raw PDF upload to Gemini?
Per-page PNGs give: (1) a stable page-numbering scheme for bounding boxes, (2) a place to apply `enhanceForOcr` preprocessing, and (3) pixel-identical images for both OCR and the results viewer — so highlights always align perfectly.

### Why parallel page processing?
`Promise.all` across pages keeps a 6-page answer sheet roughly as fast as 1 page, hitting the <60s end-to-end target.

### Why in-memory sessions + Vercel Blob (no database)?
The spec requires "no database." The entire pipeline runs inside a single SSE response. Vercel Blob backs up session state for cold-start recovery, and sessions expire via TTL sweep.

### Why bounding boxes from the model (not a separate detection step)?
One Gemini call per page returns text + spatial region together. Trades some box precision for a much simpler architecture. The UI compensates with rounded, semi-transparent overlays that forgive small offsets.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `GEMINI_API_KEY is not set` | Env var missing | Check `.env.local` or Vercel project settings |
| Generic "please review manually" feedback | `FORCE_OCR_FALLBACK=true` set, or Gemini call failing | Unset `FORCE_OCR_FALLBACK`; check function logs |
| Processing times out ~60s | Vercel Hobby function limit | Upgrade plan, or reduce `targetDpi` in `lib/pdf/pdfToImages.ts` |
| Highlight boxes slightly offset | LLM bounding-box imprecision (expected) | See `skills/OCR_Architecture.md` for two-pass refinement idea |
| Page images 404 in viewer | `/tmp` cleared between cold starts | Re-upload; this is the documented serverless ephemeral-storage tradeoff |
| `sharp`/`canvas` native build failures | Node version mismatch | Ensure Node ≥ 18.17.0; don't override version to unsupported releases |

---

<div align="center">
Built with ❤️ for teachers · Powered by <a href="https://ai.google.dev/">Gemini AI</a> · Deployed on <a href="https://vercel.com/">Vercel</a>
</div>
