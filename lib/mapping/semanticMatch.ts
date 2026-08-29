import { callGeminiVisionJSON, isGeminiConfigured } from '@/lib/gemini/client';
import { SEMANTIC_MATCH_SYSTEM, buildSemanticMatchPrompt } from '@/lib/gemini/prompts';
import type { ExtractedQuestion } from '@/types/question';
import type { ExtractedAnswerBlock } from '@/types/answer';

export interface SemanticMatchResult {
  bestIndex: number | null;
  confidence: number;
  reasoning: string;
}

/**
 * Phase 2 of the mapping engine. Given a question that Phase 1 (number
 * matching) could not confidently resolve, and a shortlist of candidate
 * answer blocks (unmatched, or numbered for a different question but
 * content-plausible), ask Gemini to pick the best content match.
 *
 * This is a text-only call (no images) since we already have transcribed
 * text for both sides, which keeps it fast and cheap relative to the
 * vision extraction calls.
 */
export async function semanticMatchQuestionToAnswers(
  question: ExtractedQuestion,
  candidates: ExtractedAnswerBlock[]
): Promise<SemanticMatchResult> {
  if (candidates.length === 0) {
    return { bestIndex: null, confidence: 0, reasoning: 'No candidates available.' };
  }

  if (!isGeminiConfigured()) {
    // Degraded fallback: crude keyword-overlap scoring so the pipeline
    // still produces a result end-to-end without an API key configured.
    return keywordOverlapFallback(question, candidates);
  }

  try {
    const prompt = buildSemanticMatchPrompt(
      question.questionNumber,
      question.questionText,
      candidates.map((c, index) => ({ index, text: c.answerText }))
    );
    const result = await callGeminiVisionJSON<SemanticMatchResult>({
      systemInstruction: SEMANTIC_MATCH_SYSTEM,
      prompt,
      images: [],
      maxRetries: 2,
    });
    // The model can hallucinate an index outside the candidates array it
    // was given (especially with very short candidate lists) -- never trust
    // it blindly, since the caller indexes straight into `candidates` with
    // no further checks.
    if (
      typeof result.bestIndex !== 'number' ||
      !Number.isInteger(result.bestIndex) ||
      result.bestIndex < 0 ||
      result.bestIndex >= candidates.length
    ) {
      return { ...result, bestIndex: null };
    }
    return result;
  } catch {
    return keywordOverlapFallback(question, candidates);
  }
}

function keywordOverlapFallback(
  question: ExtractedQuestion,
  candidates: ExtractedAnswerBlock[]
): SemanticMatchResult {
  const qWords = [...tokenize(question.questionText)];
  let bestIndex: number | null = null;
  let bestScore = 0;

  candidates.forEach((candidate, index) => {
    const aWords = tokenize(candidate.answerText);
    const overlap = qWords.filter((w) => aWords.has(w)).length;
    const score = overlap / Math.max(qWords.length, 1);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return {
    bestIndex: bestScore > 0.08 ? bestIndex : null,
    confidence: Math.min(bestScore * 1.5, 0.6), // cap: never as confident as a real semantic pass
    reasoning: 'Keyword-overlap fallback (Gemini unavailable): matched on shared vocabulary.',
  };
}

function tokenize(text: string): Set<string> {
  const stop = new Set(['the', 'a', 'an', 'of', 'to', 'and', 'in', 'is', 'for', 'on', 'with']);
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stop.has(w))
  );
}
