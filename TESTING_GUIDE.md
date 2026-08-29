# Testing Guide

This guide lets a reviewer verify every major requirement using only the
deployed app (or `npm run dev`), the files in `test-data/`, and this
document — no code reading required.

Before you start, read the honesty note at the top of `test-data/README.md`:
the answer sheets are typed PDFs, not scanned handwriting. This guide
verifies the extraction/mapping/highlighting/grading *pipeline*; it does
not claim to demonstrate handwriting-OCR accuracy on messy handwriting
(test with your own scan for that).

For every scenario below: open the app, upload the two named files, click
**Start Mapping**, wait for processing to finish, then check the listed
expectations against what's on screen and against `expected-output.json`.

---

## Scenario 1 — Basic Mapping
**Files:** `test-data/scenario-1-basic/question-paper.pdf` + `answer-sheet.pdf`

1. Upload both files and start mapping.
2. **Expect:** all 5 questions appear in the left panel, numbered 1–5, in
   that order.
3. Click each question 1–5 in turn. **Expect:** the answer sheet viewer
   jumps to the matching "Ans N." block and highlights it in green each time.
4. **Expect:** every question shows a marks badge (no "Not Answered"
   badges anywhere).
5. **Expect:** no "Unmapped Answers" panel appears (there are no orphans).
6. Cross-check against `expected-output.json`: `questionsAttempted: 5`,
   `questionsUnanswered: 0`, `orphanAnswerCount: 0`.

## Scenario 2 — Out Of Order Answers
**Files:** `test-data/scenario-2-out-of-order/question-paper.pdf` + `answer-sheet.pdf`

The student physically wrote their answers in the order **5, 2, 1, 4, 3**
on the sheet.

1. Upload and process as above.
2. **Expect:** the question list still shows 1, 2, 3, 4, 5 in that
   original order (never reordered to match writing order).
3. Click Q3. **Expect:** the viewer highlights the *third* answer block
   written on the page (which reads "Acceleration is the rate of change…"),
   even though it's physically the last block on the sheet.
4. **Expect:** all 5 mappings show method `number-exact` on hover (the
   tooltip on each marks badge shows the mapping reasoning) — out-of-order
   writing alone should never lower confidence or trigger a review flag.
5. Cross-check against `expected-output.json`: 100% mapping accuracy, 0
   unanswered, 0 orphans.

## Scenario 3 — Unanswered Questions
**Files:** `test-data/scenario-3-unanswered/question-paper.pdf` + `answer-sheet.pdf`

The student answered only Q1, Q2, Q3, Q5, Q7 out of 8 questions.

1. Upload and process.
2. **Expect:** Q4, Q6, and Q8 each display a **"Not Answered"** badge in
   place of a marks badge.
3. **Expect:** the summary card at the top of the question list shows
   "3 questions not answered" and `questionsAttempted: 5` / `totalQuestions: 8`.
4. Click on Q4. **Expect:** the viewer does not highlight anything (or
   shows no matching region) since there is nothing to point to.
5. Cross-check against `expected-output.json`: `questionsUnanswered: 3`.

## Scenario 4 — Multi-page Answers
**Files:** `test-data/scenario-4-multipage/question-paper.pdf` + `answer-sheet.pdf`

Q2 asks for a detailed 4-stage explanation; the student's answer is long
enough that it was written across **two physical pages** of the answer
sheet.

1. Upload and process.
2. Click Q2. **Expect:** the viewer jumps to page 1 and highlights the
   first part of the answer ("Stage one… Stage two…"), and a banner reads
   "This answer spans multiple pages (1, 2)".
3. Use the page-forward arrow. **Expect:** page 2 shows a second green
   highlight over the continuation ("Stage three… Stage four…").
4. **Expect:** Q2 is graded as a single question (one marks badge, one
   feedback block) using the *combined* text from both pages, not graded
   twice or only on the first page's partial content.
5. Cross-check against `expected-output.json`: Q2's mapping entry has
   `expectedAdditionalRegions: 1`.

---

## Checking extraction accuracy directly

If you want to compare raw extraction output (not just the rendered UI),
fetch `GET /api/session/{sessionId}` while the app is open — it returns
the full `SessionData` object (`questions`, `answers`, `mapping`,
`grading`) as JSON, which you can diff field-by-field against each
scenario's `ground-truth.json`.

## Reporting a mismatch

If actual output doesn't match `expected-output.json` for a scenario:

1. Note which stage diverged (extraction / mapping / highlighting / grading).
2. Check `warnings` in the extraction result (surfaced in the browser
   console and in the `SessionData.answers`/`questions` metadata) — a
   low-confidence or fallback-OCR warning often explains a mismatch.
3. If using the Tesseract.js fallback (no `GEMINI_API_KEY` configured),
   expect materially lower accuracy — this is documented behavior, not a bug.
