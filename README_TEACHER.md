# VedaAI — For Teachers

## What this does

You upload two things — a question paper and one student's answer sheet
— and VedaAI reads both, figures out which answer belongs to which
question, marks it, and gives you feedback for every question, all in
about a minute. No typing scores by hand, no flipping between two
physical papers to check which answer goes where.

## 1. Upload

On the Exams screen, you'll see two boxes:

- **Upload Question Paper** — the exam paper you set, as a PDF, PNG, JPG,
  or JPEG (max 10MB).
- **Upload Answer Sheet** — that one student's handwritten answers, same
  file types, max 10MB.

Drop a file in, or tap the box to browse. Once both boxes show a file,
the **Start Mapping** button lights up.

## 2. Processing

Tap **Start Mapping** and you'll see an "Extracting…" screen with a
progress bar. Behind the scenes, VedaAI is:

1. Reading every question off the question paper.
2. Reading every answer the student wrote, including handwriting.
3. Working out which answer goes with which question.
4. Marking each answer and writing feedback.

This usually finishes in under a minute. You don't need to do anything
during this step — just wait for the results screen.

## 3. The results screen

- **Left side**: every question from the paper, in order, each with a
  mark badge (green = strong, orange = partial, red = weak) and a
  "Not Answered" badge for anything the student skipped.
- **Right side**: the student's answer sheet, with the matching answer
  highlighted in green.

Tap any question to jump straight to its highlighted answer. Tap the
little arrow on a question to open **AI Feedback** — what the student got
right, what they missed, and a short written comment.

If an answer on the sheet couldn't be matched to any question — maybe the
student wrote the wrong number by mistake — it shows up in an
**Unmapped Answers** section so you can check it yourself rather than it
silently disappearing.

## 4. Mapping — how VedaAI matches answers to questions

Most of the time, VedaAI matches by the question number the student
wrote (however they wrote it — "Q5", "Ans 5", "5.", "Question 5" all work
the same). If a student forgot to write a number, or numbered something
wrong, VedaAI reads the *content* of the answer and matches it to the
question it actually answers. Every match shows a small confidence
indicator — hover or tap a mark badge to see why VedaAI paired that
answer with that question.

If a student's answer to one question runs across two pages, VedaAI
keeps it as one answer and highlights it on both pages when you click
that question — you don't need to hunt for the second half.

## 5. Highlighting

The green box on the answer sheet is exactly the area VedaAI matched to
the question you clicked — not the whole page, not a guess at the general
area. You can zoom in/out and flip pages; the highlight stays correctly
placed at any zoom level.

## 6. Grading

Each question is marked out of whatever it's worth on the question paper
(or a default if the paper didn't print marks). Marking is done
generously but honestly: full credit for a correct answer even if it's
phrased differently from a model answer, partial credit for partially
right reasoning, low or no credit for answers that are off-topic, blank,
or clearly wrong.

The feedback under each question always explains *why* — what the
student got right, what they got wrong, and a short comment you could
read out to them directly.

## 7. Limitations — please read

- **VedaAI can misread messy handwriting.** Like any human marker glancing
  at rushed handwriting, it can get individual words wrong. If a mark
  looks surprising, tap the question to see the highlighted answer
  yourself before trusting the number.
- **It has no official marking scheme.** It grades using general subject
  knowledge, not your school's specific rubric. Treat every mark as a
  strong first pass to review, not a final, unchangeable score.
- **Very poor quality scans** (badly lit photos, extreme skew, heavy
  glare) will produce lower-confidence results across the board — a
  flatbed scan or a clear, well-lit photo works best.
- **It's built for one student at a time.** Batch-processing a whole
  class isn't part of this version — upload one answer sheet per session.

## FAQ

**What file types can I upload?**
PDF, PNG, JPG, or JPEG, up to 10MB each.

**Can I upload a scanned photo instead of a proper scanner PDF?**
Yes — a clear, well-lit photo works, though a flatbed scan will generally
give more accurate results.

**What happens if my student didn't write any question numbers at all?**
VedaAI will try to match answers to questions by their content instead.
It's less reliable than number-based matching, so double-check those
matches in the results screen.

**Can I edit a mark VedaAI gave?**
Not in this version — treat the AI's mark and feedback as a fast first
pass you review and adjust in your own gradebook.

**Is my data stored anywhere permanently?**
No. Files and results are kept only for the length of your session and
are not saved to a database.

**What if a question and its answer just don't match up on screen?**
Check the "Unmapped Answers" section — the correct answer may be sitting
there because it couldn't be confidently matched. You can always read the
raw answer sheet yourself on the right-hand viewer.
