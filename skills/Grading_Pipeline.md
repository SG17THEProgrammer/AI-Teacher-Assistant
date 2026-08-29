# Grading Pipeline

## What this covers

`lib/grading/gradingEngine.ts` — turning a resolved question→answer
mapping into marks, feedback, and an overall class-level summary.

## Per-question grading

For each question:

- **Not Answered / orphaned mapping** → an ungraded placeholder (0 marks,
  `isUngraded: true`, feedback: "Not answered."). This is a fast-path
  short-circuit — we never send an empty answer to Gemini and ask it to
  invent a grade for nothing.
- **Multi-page answers** → `mergeMultiPageAnswerText` concatenates the
  primary block's text with every `additionalAnswerIds` block's text
  (in order) before grading, so a Q2 that spans two pages is graded once,
  on its full combined answer — never graded twice or graded on only the
  first fragment.
- **Otherwise** → a single Gemini call with `GRADING_SYSTEM` (see
  `lib/gemini/prompts.ts`), which explicitly instructs partial credit in
  0.5-mark increments and asks for strengths/mistakes/feedback alongside
  the mark, so the UI's expandable "AI Feedback" card always has
  substance rather than just a number.

No official marking scheme is available (per the spec), so grading
explicitly leans on the model's own subject-matter judgment rather than
string-matching against a model answer — this is called out directly in
the system prompt ("use your subject-matter expertise... generously but
honestly") so the model doesn't over-index on exact phrasing.

## Degraded mode

Without `GEMINI_API_KEY`, `heuristicGrade` provides a crude length-based
score (longer answers score higher, capped) with `confidence: 0.2` and an
explicit "please review manually" feedback message. This exists purely so
the app is demonstrable end-to-end without an API key — it is not
presented as a real grading strategy anywhere in the UI copy or docs.

## Overall summary computation

`computeSummary` derives:

- **Total / percentage**: sum of `marksAwarded` over sum of `totalMarks`
  across all questions (ungraded/unanswered questions contribute 0
  awarded but their `totalMarks` still counts toward the possible total —
  an unanswered question should visibly cost the student marks in the
  percentage, not be excluded from the denominator).
- **Strong / weak areas**: any graded, non-ungraded question scoring
  ≥75% of its marks is "strong"; <50% is "weak" — reported as `Q<number>`
  labels rather than full question text, keeping the summary card compact.
- **Average mapping confidence**: averaged only over questions that *did*
  get mapped, since an unanswered question has no mapping confidence to
  average in.

## Tradeoffs

- Marks are rounded to the nearest 0.5 (`clampMarks`) to match how most
  Indian school marking conventions actually award partial credit —
  arbitrary-precision decimals would look falsely precise for what is
  fundamentally a judgment call.
- Questions without a detected `totalMarks` in the paper default to 5
  (`DEFAULT_MARKS_WHEN_UNSPECIFIED`) rather than being ungraded — a
  question paper that doesn't print per-question marks is common enough
  (e.g. a class discussion worksheet) that silently refusing to grade it
  would be a worse experience than a clearly-documented default.
- Grading currently treats every question independently; there is no
  cross-question consistency check (e.g. flagging if Q3 and Q7 test the
  same fact and were graded very differently).

## Future improvements

1. Let teachers upload an optional marking scheme / model answer per
   question, and pass it into the grading prompt when present — this
   would materially increase grading consistency and is the most
   valuable addition if scope allowed for a fourth upload slot.
2. A "regrade with feedback" action: teacher edits `marksAwarded` or
   leaves a note, and that correction is surfaced back into the prompt
   context for the *next* similar question in the same batch, to reduce
   comparable questions being graded inconsistently.
3. Confidence-weighted rounding: currently confidence and marks are
   independent numbers; a low-confidence grade could visually de-emphasize
   its own mark (e.g. a lighter badge) until a teacher confirms it.
