# Mapping Engine

## What this covers

`lib/mapping/` — the hybrid engine that decides which answer block belongs
to which question. This is the part of the assignment explicitly called
out as most important, so this doc goes deeper than the others.

## The three phases

### Phase 1 — Number matching (`mappingEngine.ts` + `numberNormalizer.ts`)

Every question label ("4", "4(a)", "11.b") and every number the student
wrote ("Ans 5", "Q.5", "5.", "Question 5") is normalized to the same
canonical shape via `normalizeQuestionNumber()`: a parent number, an
optional sub-part letter, and a sortable numeric key. Two labels are
"the same question" iff their canonical forms match exactly
(`sameQuestion()`).

Answers are grouped by canonical number (`groupAnswersByCanonicalNumber`).
For each question, an exact-canonical-match group is looked up first. If
none exists, a **fuzzy** pass (`findBestFuzzyGroup`) checks
Levenshtein-based label similarity against any *unclaimed* group (i.e. a
label that doesn't already exactly belong to a real question) — this
catches OCR noise like a smudged "4(a)" read as "4(o)", without ever
letting a fuzzy match steal an answer from a question that has an exact
label match elsewhere on the paper.

### Phase 2 — Semantic matching (`semanticMatch.ts`)

Anything Phase 1 couldn't resolve (no number written, or a number that
doesn't correspond to any real question — "incorrect numbering") goes to
a text-only Gemini call: given the question and a shortlist of remaining
unclaimed answer blocks, which one (if any) actually *answers* it? This is
deliberately a separate, cheaper text-only call rather than re-running
vision extraction — by this point we already have transcribed text for
both sides.

If Gemini is unavailable, `keywordOverlapFallback` provides a crude but
functional substitute (shared-vocabulary scoring, explicitly capped at a
lower confidence than a real semantic pass so it never masquerades as a
high-confidence result).

### Phase 3 — Confidence scoring (`confidence.ts`)

Every mapping — regardless of which phase produced it — gets a final 0-1
confidence score. The *method* sets a base score (number-exact highest,
sequence-fallback lowest), which is then adjusted down for OCR-quality
signals: `question.lowConfidence`, `answer.lowConfidence`,
`answer.crossedOut`, and a heuristic penalty when a high-mark question got
a suspiciously short answer (possibly a truncated OCR capture, not
necessarily a truly short answer — grading judges that separately).
Anything below `MAPPING_CONFIDENCE_THRESHOLD` (default 0.55, env-tunable)
is flagged `needsReview`, which the UI surfaces via a tooltip on the marks
badge.

## Multi-page vs. duplicate disambiguation

The single trickiest piece of Phase 1: if a question's canonical number
has *multiple* answer blocks, are they one continued answer (page turn) or
separate re-attempts (duplicate)? `resolveGroup()` uses writing-order
contiguity as the signal: if the blocks' `sequenceIndex` values (assigned
in the order the student wrote things, top to bottom, page by page) are
close together (gap ≤ 3), they're treated as one continuous answer and
merged into `additionalAnswerIds`. If there's a large gap — meaning other,
differently-numbered content was written in between — they're treated as
duplicates: the longer, non-crossed-out, higher-confidence one is kept as
primary, and the rest become orphan answers with `reason:
'duplicate-of-mapped'`, retaining a pointer back to which question they
were a duplicate attempt at.

This heuristic is intentionally simple and stated as a heuristic, not
dressed up as more certain than it is — see "Future improvements" below.

## Unanswered / orphan bookkeeping

- **Not Answered**: any question whose mapping never resolves through
  Phase 1, 2, or the last-resort sequence fallback.
- **Unmapped Answer**: any answer block never consumed by a mapping, with
  a `reason` (`no-question-match` vs `duplicate-of-mapped`) and, where
  available, a best-guess question it might belong to.

## Concurrency note

`runMappingEngine` scopes all mutable state (consumed-answer set,
duplicate scratch buffer) to the function call rather than module-level
variables, specifically so that two sessions being processed concurrently
on the same warm serverless instance can never have their state cross-
contaminate. This was a deliberate fix during development — an earlier
draft used a module-level array for exactly this bookkeeping, which
would've been a real bug under concurrent load.

## Tradeoffs

- The contiguity heuristic (gap ≤ 3) for multi-page vs. duplicate
  detection is a constant, not a learned threshold — it works well for
  the common case (a student runs out of room and continues on the next
  page shortly after) but could misclassify a student who deliberately
  revisits a question much later in the same writing sequence.
- Semantic matching is only invoked for the *shortlist* of still-unclaimed
  answers, not run pairwise against every answer for every question — this
  keeps the number of Gemini calls linear in the number of unresolved
  questions rather than quadratic, but means a wrongly-numbered answer
  that Phase 1 already (incorrectly) claimed for a different question
  won't be reconsidered by Phase 2.

## Future improvements

1. Replace the fixed contiguity gap constant with a learned or
   content-aware check (e.g. also compare answer text similarity between
   candidate continuation blocks — genuine continuations of the same
   answer tend to be topically coherent).
2. Allow Phase 2 to also reconsider Phase-1 claims when its own confidence
   for an alternative pairing is much higher than the number-match's
   confidence, with a clear audit trail of the override.
3. Batch the Phase 2 semantic-match calls (one call covering several
   unresolved questions with their respective candidate lists) to reduce
   API round-trips further.
