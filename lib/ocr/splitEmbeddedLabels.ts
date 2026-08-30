/**
 * Gemini's segmentation rule ("a new block starts whenever the student
 * writes a new question reference") can still fail when that reference
 * appears mid-block rather than at its very start -- e.g. a student writing
 * "Ans 5. <answer text> Diagram for Answer 2: <drawing>" all in one visual
 * run gets read back as ONE block labelled "5", with the Q2 diagram's
 * content and pixels silently absorbed into Q5's box and text. No amount of
 * downstream box-clamping or answer-merging can recover from that, because
 * there is only ever one block to work with.
 *
 * This deterministically re-splits such a block using its own transcribed
 * text: if a *different* question's label shows up after the block's own
 * opening label, everything from that point on becomes its own new block,
 * attributed to the referenced question. The text-layer box computation
 * downstream then locates each half independently from real PDF text
 * positions, so both halves get correct, non-overlapping boxes.
 */
interface RawAnswerLike {
  detectedNumberRawText: string | null;
  detectedQuestionNumber: string | null;
  answerText: string;
  containsDiagram: boolean;
  containsTable: boolean;
  crossedOut: boolean;
  lowConfidence: boolean;
}

const EMBEDDED_LABEL_RE =
  /\b(?:diagram|figure|table|chart)?\s*(?:for\s+)?(?:ans(?:wer)?|q(?:uestion)?)\.?\s*(\d+[a-zA-Z]?)\s*[:.\-]?\s*/i;

function digitsOf(label: string | null): string {
  return (label ?? '').replace(/\D/g, '');
}

export function splitEmbeddedAnswerLabels<T extends RawAnswerLike>(answers: T[]): T[] {
  const result: T[] = [];
  for (const a of answers) {
    const ownLabel = a.detectedNumberRawText?.trim() ?? '';
    const body = ownLabel && a.answerText.startsWith(ownLabel) ? a.answerText.slice(ownLabel.length) : a.answerText;

    const match = EMBEDDED_LABEL_RE.exec(body);
    const referencedDigits = match ? digitsOf(match[1]) : '';
    const ownDigits = digitsOf(a.detectedQuestionNumber);

    if (match && match.index > 0 && referencedDigits && referencedDigits !== ownDigits) {
      const before = (ownLabel ? `${ownLabel} ` : '') + body.slice(0, match.index).trim();
      const after = body.slice(match.index).trim();
      if (before) {
        result.push({ ...a, answerText: before });
      }
      result.push({
        ...a,
        detectedNumberRawText: match[0].trim(),
        detectedQuestionNumber: referencedDigits,
        answerText: after,
      });
      continue;
    }

    result.push(a);
  }
  return result;
}
