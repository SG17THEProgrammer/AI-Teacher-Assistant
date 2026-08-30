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
    const chosen = result.bestIndex !== null ? pool[result.bestIndex] : undefined;
    if (chosen && result.confidence > 0.25) {
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
    const onlyMapping = stillUnanswered[0]!;
    const answer = stillUnconsumed[0]!;
    const question = questions.find((q) => q.id === onlyMapping.questionId)!;
    consumedAnswerIds.add(answer.answerId);
    const confidence = scoreMapping('sequence-fallback', 0.35, question, answer);
    onlyMapping.mappedAnswerId = answer.answerId;
    onlyMapping.confidence = confidence;
    onlyMapping.method = 'sequence-fallback';
    onlyMapping.reasoning =
      'Exactly one question and one answer block remained unmatched after number and semantic matching, so they were paired as a last resort. Please verify.';
    onlyMapping.needsReview = true;
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

const DUPLICATE_TEXT_SIMILARITY = 0.6;

/**
 * Within a same-numbered group, decides which blocks are genuinely all part
 * of the same answer (e.g. a diagram appended far below the main text, or a
 * continuation on a later page) versus a duplicate re-attempt (the student
 * crossed out and rewrote the same content elsewhere). This used to be
 * guessed from how far apart the blocks were written (a small sequence
 * gap = continuation, a large one = duplicate) -- but a supplementary
 * diagram is routinely written well after the other answers, so that
 * heuristic dropped it as a "duplicate" and it never got merged/highlighted.
 * Content similarity is the real signal: near-identical text is a rewrite;
 * anything else is additional content for the same answer, however far away
 * it was written, and must be merged so every scattered piece highlights
 * together.
 */
function resolveGroup(
  group: ExtractedAnswerBlock[],
  question: ExtractedQuestion
): { primary: ExtractedAnswerBlock; additional: ExtractedAnswerBlock[]; duplicates: ExtractedAnswerBlock[] } {
  if (group.length === 1) {
    return { primary: group[0]!, additional: [], duplicates: [] };
  }

  const maxSimilarity = Math.max(
    0,
    ...group.flatMap((a, i) => group.slice(i + 1).map((b) => textOverlapRatio(a.answerText, b.answerText)))
  );

  if (maxSimilarity < DUPLICATE_TEXT_SIMILARITY) {
    const [primary, ...additional] = group;
    return { primary: primary!, additional, duplicates: [] };
  }

  // Genuine duplicate re-attempts -- prefer the longer, non-crossed-out,
  // higher-confidence attempt as primary.
  const ranked = [...group].sort((a, b) => rankDuplicate(b, question) - rankDuplicate(a, question));
  const [primary, ...rest] = ranked;
  return { primary: primary!, additional: [], duplicates: rest };
}

function textOverlapRatio(a: string, b: string): number {
  const tokenize = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2)
    );
  const wordsA = tokenize(a);
  const wordsB = tokenize(b);
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let overlap = 0;
  for (const w of wordsA) if (wordsB.has(w)) overlap++;
  return overlap / Math.min(wordsA.size, wordsB.size);
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
