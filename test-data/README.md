# Test Data

Four self-contained scenarios, each with a question paper PDF, a matching
"answer sheet" PDF, and JSON ground truth you can diff the app's output
against. Generated deterministically by `scripts/generate_test_data.py`
(run `npm run generate-test-data` to regenerate).

## Please read before testing: what these files are (and aren't)

The answer sheets in this folder are **typed PDF text, not scanned
handwriting**. Producing genuinely handwritten scans wasn't possible in
the environment this project was generated in, and shipping fake-looking
"handwriting fonts" pretending to be scans would be actively misleading
about what was actually validated.

What this dataset *does* let you verify, fully and honestly:

- Question extraction and numbering/ordering logic
- The mapping engine's number normalization, out-of-order handling,
  unanswered detection, and multi-page merging
- The highlighting system's bounding-box math (every box in
  `ground-truth.json` is exact -- it was recorded at PDF-generation time
  from the real coordinates this script drew text at, not estimated after
  the fact)
- The grading pipeline's plumbing (marks, feedback, summary computation)

What it does **not** validate: Gemini Vision's actual handwriting OCR
accuracy on messy, cursive, or mixed handwriting. For that, test with a
real scanned answer sheet -- the pipeline handles typed and handwritten
input identically, so everything above still applies, but OCR text
quality on genuine handwriting will vary with legibility in a way typed
PDFs cannot demonstrate.

## Scenarios

| Folder | Tests | Question count | Answered |
|---|---|---|---|
| `scenario-1-basic/` | Standard extraction + mapping | 5 | All 5, in order |
| `scenario-2-out-of-order/` | Mapping engine robustness | 5 | All 5, written 5→2→1→4→3 |
| `scenario-3-unanswered/` | "Not Answered" detection | 8 | Only 5 (Q4, Q6, Q8 skipped) |
| `scenario-4-multipage/` | Multi-page region merging | 4 | All 4; Q2's answer spans 2 pages |

Each folder contains:

- `question-paper.pdf` / `answer-sheet.pdf` — upload these two files together
- `ground-truth.json` — the exact questions/answers/bounding boxes as generated
- `expected-output.json` — the summarized result you should see in the app
- `scenario.json` — a short machine-readable description of what the scenario tests

See `../TESTING_GUIDE.md` for step-by-step instructions per scenario.
