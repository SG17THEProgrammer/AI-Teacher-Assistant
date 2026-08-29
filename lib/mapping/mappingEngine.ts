import { normalizeQuestionNumber, labelSimilarity } from './numberNormalizer';
import { semanticMatchQuestionToAnswers } from './semanticMatch';
import { scoreMapping, needsReview } from './confidence';
import type { ExtractedQuestion } from '@/types/question';
import type { ExtractedAnswerBlock } from '@/types/answer';
import type { MappingResult, QuestionMapping, OrphanAnswer } from '@/types/mapping';

const FUZZY_LABEL_THRESHOLD = 0.72;

/**
 * The hybrid answer-mapping engine described in the spec:
 *
 *   Phase 1 - Question number matching (exact, then fuzzy for OCR noise)
 *   Phase 2 - Semantic matching for anything Phase 1 couldn't resolve
 *             (missing numbers, wrong numbering, genuine ambiguity)
 *   Phase 3 - Confidence scoring over the result of whichever phase matched
 *
 * Also produces "Not Answered" (unansweredQuestionIds) and "Unmapped
 * Answer" (orphanAnswers) sets, and merges genuinely multi-page answers
 * for the same question into one mapping's additionalAnswerIds while
 * separating true duplicate re-attempts into orphans.
 */
export async function runMappingEngine(
  questions: ExtractedQuestion[],
  answers: ExtractedAnswerBlock[]
): Promise<MappingResult> {
  const consumedAnswerIds = new Set<string>();
  const mappings: QuestionMapping[] = [];
  // Scoped per call (not module-level) so concurrent requests processing
  // different sessions can never bleed state into each other.
  const pendingDuplicates: { answer: ExtractedAnswerBlock; questionId: string; confidence: number }[] =
    [];

  // ---- Phase 1: number matching -----------------------------------------
  const numberGroups = groupAnswersByCanonicalNumber(answers);

  for (const question of questions) {
    const qNorm = normalizeQuestionNumber(question.questionNumber);
    if (!qNorm) {
      mappings.push(emptyMapping(question.id));
      continue;
    }

    const exactGroup = numberGroups.get(qNorm.canonical);
    if (exactGroup && exactGroup.length > 0) {
      const { primary, additional, duplicates } = resolveGroup(exactGroup, question);
      consumedAnswerIds.add(primary.answerId);
      additional.forEach((a) => consumedAnswerIds.add(a.answerId));
      // duplicates are intentionally NOT consumed as "used" here beyond
      // being excluded from primary/additional -- they surface later as
      // orphan "duplicate-of-mapped" answers pointing back at this question.
      const confidence = scoreMapping('number-exact', 0.95, question, primary);
      mappings.push({
        questionId: question.id,
        mappedAnswerId: primary.answerId,
        additionalAnswerIds: additional.map((a) => a.answerId),
        confidence,
        method: 'number-exact',
        reasoning: `Matched by exact question-number label "${qNorm.canonical}"${
          additional.length ? ` (merged ${additional.length} additional page block(s) as a multi-page answer)` : ''
        }.`,
        needsReview: needsReview(confidence),
      });
      duplicates.forEach((d) =>
        pendingDuplicates.push({ answer: d, questionId: question.id, confidence })
      );
      continue;
    }

    // Fuzzy label match (OCR noise: "4(o)" vs "4(a)") against any group not
    // already claimed exactly by another question.
    const fuzzy = findBestFuzzyGroup(qNorm.canonical, numberGroups, questions);
    if (fuzzy) {
      const { primary, additional } = resolveGroup(fuzzy.group, question);
      consumedAnswerIds.add(primary.answerId);
      additional.forEach((a) => consumedAnswerIds.add(a.answerId));
      const confidence = scoreMapping(
        'number-fuzzy',
        0.6 + 0.3 * fuzzy.similarity,
        question,
        primary
      );
      mappings.push({
        questionId: question.id,
        mappedAnswerId: primary.answerId,
        additionalAnswerIds: additional.map((a) => a.answerId),
        confidence,
        method: 'number-fuzzy',
        reasoning: `Matched by fuzzy label similarity (${(fuzzy.similarity * 100).toFixed(
          0
        )}%) between "${qNorm.canonical}" and the student's written "${fuzzy.label}", likely OCR or numbering noise.`,
        needsReview: needsReview(confidence),
      });
      continue;
    }

    mappings.push(emptyMapping(question.id)); // resolved in Phase 2 below
  }

  // ---- Phase 2: semantic matching for anything still unresolved --------
  const unresolvedMappings = mappings.filter((m) => m.mappedAnswerId === null);
  const availableForSemantic = () =>
    answers.filter((a) => !consumedAnswerIds.has(a.answerId));

  for (const mapping of unresolvedMappings) {
    const question = questions.find((q) => q.id === mapping.questionId)!;
    const pool = availableForSemantic();
    if (pool.length === 0) break;

    const result = await semanticMatchQuestionToAnswers(question, pool);
    if (result.bestIndex !== null && result.confidence > 0.25) {
      const chosen = pool[result.bestIndex];
      consumedAnswerIds.add(chosen.answerId);
      const confidence = scoreMapping('semantic', result.confidence, question, chosen);
      mapping.mappedAnswerId = chosen.answerId;
      mapping.confidence = confidence;
      mapping.method = 'semantic';
      mapping.reasoning = `No matching question number found on the answer sheet; matched by content similarity. ${result.reasoning}`;
      mapping.needsReview = needsReview(confidence);
    }
  }

  // ---- Sequence fallback: last resort 1:1 pairing -----------------------
  const stillUnanswered = mappings.filter((m) => m.mappedAnswerId === null);
  const stillUnconsumed = availableForSemantic();
  if (stillUnanswered.length === 1 && stillUnconsumed.length === 1) {
    const question = questions.find((q) => q.id === stillUnanswered[0].questionId)!;
    const answer = stillUnconsumed[0];
    consumedAnswerIds.add(answer.answerId);
    const confidence = scoreMapping('sequence-fallback', 0.35, question, answer);
    stillUnanswered[0].mappedAnswerId = answer.answerId;
    stillUnanswered[0].confidence = confidence;
    stillUnanswered[0].method = 'sequence-fallback';
    stillUnanswered[0].reasoning =
      'Exactly one question and one answer block remained unmatched after number and semantic matching, so they were paired as a last resort. Please verify.';
    stillUnanswered[0].needsReview = true;
  }

  // ---- Assemble unanswered / orphans ------------------------------------
  const unansweredQuestionIds = mappings
    .filter((m) => m.mappedAnswerId === null)
    .map((m) => m.questionId);

  const orphanAnswers: OrphanAnswer[] = [];
  for (const answer of answers) {
    if (!consumedAnswerIds.has(answer.answerId)) {
      const dup = pendingDuplicates.find((d) => d.answer.answerId === answer.answerId);
      orphanAnswers.push({
        answerId: answer.answerId,
        reason: dup ? 'duplicate-of-mapped' : 'no-question-match',
        bestGuessQuestionId: dup?.questionId ?? null,
        bestGuessConfidence: dup?.confidence ?? null,
      });
    }
  }

  return { mappings, unansweredQuestionIds, orphanAnswers };
}

// -- internal helpers -------------------------------------------------------

function emptyMapping(questionId: string): QuestionMapping {
  return {
    questionId,
    mappedAnswerId: null,
    additionalAnswerIds: [],
    confidence: 0,
    method: null,
    reasoning: 'No answer found for this question.',
    needsReview: false,
  };
}

function groupAnswersByCanonicalNumber(
  answers: ExtractedAnswerBlock[]
): Map<string, ExtractedAnswerBlock[]> {
  const groups = new Map<string, ExtractedAnswerBlock[]>();
  for (const answer of answers) {
    const norm = normalizeQuestionNumber(answer.detectedQuestionNumber);
    if (!norm) continue;
    const list = groups.get(norm.canonical) ?? [];
    list.push(answer);
    groups.set(norm.canonical, list);
  }
  // Keep each group in the order the student actually wrote them.
  for (const list of groups.values()) {
    list.sort((a, b) => a.sequenceIndex - b.sequenceIndex);
  }
  return groups;
}

/**
 * Within a same-numbered group, decides which blocks are genuinely the
 * same multi-page answer (contiguous in writing order, nothing else
 * interleaved) versus a duplicate re-attempt written elsewhere on the
 * sheet. Multi-page continuations are merged; duplicates are separated out
 * for the caller to record as orphan "duplicate-of-mapped" answers.
 */
function resolveGroup(
  group: ExtractedAnswerBlock[],
  question: ExtractedQuestion
): { primary: ExtractedAnswerBlock; additional: ExtractedAnswerBlock[]; duplicates: ExtractedAnswerBlock[] } {
  if (group.length === 1) {
    return { primary: group[0], additional: [], duplicates: [] };
  }

  // A run is "contiguous" if consecutive sequence indices differ by more
  // than 1 only because of blocks belonging to *this same group* (i.e. no
  // other question's answer was written in between) -- approximated here by
  // checking there's no large sequence gap, which in practice corresponds
  // to "the student kept writing across a page turn" rather than "wrote
  // something else, then came back much later and re-answered".
  const gaps = group.slice(1).map((a, i) => a.sequenceIndex - group[i].sequenceIndex);
  const looksContiguous = gaps.every((g) => g <= 3);

  if (looksContiguous) {
    const [primary, ...additional] = group;
    return { primary, additional, duplicates: [] };
  }

  // Not contiguous -> treat as duplicate re-attempts. Prefer the longer,
  // non-crossed-out, higher-confidence attempt as primary.
  const ranked = [...group].sort((a, b) => rankDuplicate(b, question) - rankDuplicate(a, question));
  const [primary, ...rest] = ranked;
  return { primary, additional: [], duplicates: rest };
}

function rankDuplicate(answer: ExtractedAnswerBlock, _question: ExtractedQuestion): number {
  let score = answer.answerText.trim().length;
  if (answer.crossedOut) score *= 0.3;
  if (answer.lowConfidence) score *= 0.7;
  return score;
}

function findBestFuzzyGroup(
  canonical: string,
  groups: Map<string, ExtractedAnswerBlock[]>,
  allQuestions: ExtractedQuestion[]
): { group: ExtractedAnswerBlock[]; similarity: number; label: string } | null {
  const claimedExactly = new Set(
    allQuestions
      .map((q) => normalizeQuestionNumber(q.questionNumber)?.canonical)
      .filter((c): c is string => Boolean(c))
  );

  let best: { group: ExtractedAnswerBlock[]; similarity: number; label: string } | null = null;
  for (const [label, group] of groups) {
    if (claimedExactly.has(label)) continue; // that label belongs to a real, different question
    const similarity = labelSimilarity(canonical, label);
    if (similarity >= FUZZY_LABEL_THRESHOLD && (!best || similarity > best.similarity)) {
      best = { group, similarity, label };
    }
  }
  return best;
}
