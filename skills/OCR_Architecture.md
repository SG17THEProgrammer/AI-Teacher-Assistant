# OCR Architecture

## What this covers

How a question paper or answer sheet upload becomes structured, gradable
data: `lib/pdf/`, `lib/gemini/`, `lib/ocr/`.

## Pipeline

```
Upload (PDF/PNG/JPG/JPEG)
  -> renderUploadToPages()          [lib/pdf/renderUpload.ts]
       - PDF: pdfjs-dist + node-canvas rasterize every page at ~200 DPI
       - Image: sharp auto-rotates (EXIF), upscales if < 900px min dimension
  -> enhanceForOcr() per page        [lib/pdf/pdfToImages.ts]
       - sharp .normalize() (contrast stretch) + slight sharpen
  -> Gemini Vision call per page, IN PARALLEL
       - questionPipeline.ts / answerPipeline.ts
       - strict JSON response schema (responseMimeType: application/json)
       - retry + jsonRepair.ts on malformed output
  -> flatten + sort (questions) / assign sequence index (answers)
```

## Design decisions

**Why render every page to PNG before calling Gemini, instead of sending
the PDF directly?** Gemini's file API can accept PDFs directly, but
per-page PNGs give us three things a raw PDF upload doesn't: (1) a stable
page-numbering scheme we control (needed for bounding boxes and the
viewer), (2) a place to apply `enhanceForOcr` for poor scans before the
model ever sees them, and (3) reuse of the *exact same pixels* for the
results-screen viewer (see `savePageImages` in `lib/store/fileStorage.ts`)
so bounding boxes drawn by the OCR pass line up perfectly with what the
teacher sees on screen. If we let the browser render the PDF independently
for viewing, any rendering-engine difference (fonts, DPI, anti-aliasing)
would throw off overlay alignment.

**Why parallel per-page calls instead of one call with all pages?** Two
reasons, both tied to the <60s performance target: (a) per-page calls
parallelize trivially with `Promise.all`, so a 6-page answer sheet costs
roughly the same wall-clock time as a 1-page one; (b) it keeps each
prompt's context small and focused, which in our testing produced more
reliable strict-JSON output than asking for one giant multi-page response
(single large responses are exactly the failure mode `jsonRepair.ts`'s
truncation-recovery logic exists for, since long outputs are the most
likely to be cut off mid-array by a max-tokens limit).

**Why a Tesseract.js fallback at all, if it's explicitly worse?** So the
app is never a brick without an API key. `isGeminiConfigured()` gates
every AI call; when false, `tesseractFallback.ts` provides best-effort
typed-text OCR and a crude regex-based question segmenter
(`heuristicSegmentQuestions`). It is explicitly documented as degraded
(warnings are pushed into the result, and the teacher README calls it out)
rather than silently producing a worse result that looks equally
confident.

**Bounding boxes come from the model, not a separate object-detection
step.** We ask Gemini to estimate a normalized (0–1) bounding box per
question/answer block in the same JSON response as the text. This trades
some box precision (an LLM's spatial estimate is not as tight as a
purpose-built layout model) for a much simpler architecture — one call
per page produces text + region together, instead of running OCR and a
separate vision-detection model and reconciling the two.

## Known tradeoffs / limitations

- **Serverless filesystem**: page images and uploads live under `/tmp`
  (see `lib/store/fileStorage.ts`), which is ephemeral per Vercel
  invocation. This is intentional per the "no database, temporary local
  storage" requirement, but means a session cannot survive a cold start
  between the upload and process steps in a worst-case scenario. In
  practice, `/api/process` runs the whole pipeline in one request so this
  rarely matters; see `skills/Deployment Guide.md`.
- **Bounding box precision**: LLM-estimated boxes are good enough for a
  "click question -> see the right paragraph" experience but will
  sometimes be a few percent off-target on dense pages. The overlay is
  intentionally rendered with rounded corners and partial opacity rather
  than a hairline box, which is far more forgiving of small misalignment.
- **DPI vs payload size tradeoff**: `renderPdfToImages` targets 200 DPI
  capped at 2200px on the longest edge — high enough for legible
  handwriting, low enough to keep the base64 payload per Gemini call
  reasonable. Extremely dense, small handwriting may need a higher cap;
  this is a single constant to tune in `lib/pdf/pdfToImages.ts`.

## Future improvements

1. **Two-pass box refinement**: send the model's first-pass bounding box
   back with a tighter crop and ask it to refine, for pages where multiple
   answer blocks are visually close together.
2. **Layout-model-assisted OCR**: a lightweight open-source layout model
   (e.g. a document layout transformer) could propose candidate regions
   first, then Gemini only needs to transcribe within each region rather
   than segment *and* transcribe — likely to improve both box precision
   and text accuracy on dense pages.
3. **Persistent object storage** (S3/Vercel Blob) instead of `/tmp`, if
   the "no database" constraint is ever relaxed to "no relational
   database" — would remove the serverless-ephemeral-filesystem caveat
   entirely.
