import type { ExtractedQuestion } from '@/types/question';
import type { ExtractedAnswerBlock } from '@/types/answer';
import type { MappingMethod } from '@/types/mapping';

const REVIEW_THRESHOLD = Number(process.env.MAPPING_CONFIDENCE_THRESHOLD ?? 0.55);

/**
 * Combines the signal from *how* a mapping was found (method) with quality
 * signals from the underlying OCR (lowConfidence flags) to produce the
 * final 0-1 confidence score shown to the teacher.
 */
export function scoreMapping(
  method: MappingMethod,
  baseScore: number,
  question: ExtractedQuestion,
  answer: ExtractedAnswerBlock
): number {
  let score = baseScore;

  if (question.lowConfidence) score -= 0.1;
  if (answer.lowConfidence) score -= 0.1;
  if (answer.crossedOut) score -= 0.05;

  // Very short answers relative to marks-heavy questions are slightly
  // suspicious (could be a partial OCR capture rather than a genuinely
  // short answer), so nudge confidence down a touch rather than penalize
  // grading -- grading has its own judgment for legitimately short answers.
  if (question.totalMarks && question.totalMarks >= 3 && answer.answerText.trim().length < 15) {
    score -= 0.08;
  }

  return clamp(score);
}

export function needsReview(confidence: number): boolean {
  return confidence < REVIEW_THRESHOLD;
}

export function reviewThreshold(): number {
  return REVIEW_THRESHOLD;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(1, n));
}
