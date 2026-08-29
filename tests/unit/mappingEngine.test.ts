import { describe, it, expect, beforeEach } from 'vitest';
import { runMappingEngine } from '@/lib/mapping/mappingEngine';
import type { ExtractedQuestion } from '@/types/question';
import type { ExtractedAnswerBlock } from '@/types/answer';

function makeQuestion(id: string, questionNumber: string, questionText = `Text for Q${questionNumber}`): ExtractedQuestion {
  return {
    id,
    questionNumber,
    order: 0,
    questionText,
    pageNumber: 1,
    totalMarks: 5,
    region: null,
    lowConfidence: false,
  };
}

function makeAnswer(
  answerId: string,
  detectedQuestionNumber: string | null,
  answerText: string,
  sequenceIndex: number,
  pageNumber = 1
): ExtractedAnswerBlock {
  return {
    answerId,
    detectedQuestionNumber,
    detectedNumberRawText: detectedQuestionNumber,
    answerText,
    pageNumber,
    boundingBoxes: [],
    sequenceIndex,
    containsDiagram: false,
    containsTable: false,
    crossedOut: false,
    lowConfidence: false,
  };
}

describe('runMappingEngine', () => {
  beforeEach(() => {
    // Ensure the fallback (non-Gemini) path is exercised deterministically.
    delete process.env.GEMINI_API_KEY;
  });

  it('maps answers written out of order back to the correct questions (Phase 1)', async () => {
    const questions = ['1', '2', '3', '4', '5'].map((n) => makeQuestion(`q${n}`, n));
    // Student physically wrote answers in the order 5, 2, 1, 4, 3.
    const writeOrder = ['5', '2', '1', '4', '3'];
    const answers = writeOrder.map((n, i) => makeAnswer(`a${n}`, n, `answer for ${n}`, i));

    const result = await runMappingEngine(questions, answers);

    expect(result.unansweredQuestionIds).toEqual([]);
    expect(result.orphanAnswers).toEqual([]);
    for (const n of ['1', '2', '3', '4', '5']) {
      const mapping = result.mappings.find((m) => m.questionId === `q${n}`);
      expect(mapping?.mappedAnswerId).toBe(`a${n}`);
      expect(mapping?.method).toBe('number-exact');
    }
  });

  it('flags questions with no matching answer as unanswered', async () => {
    const numbers = ['1', '2', '3', '4', '5', '6', '7', '8'];
    const questions = numbers.map((n) => makeQuestion(`q${n}`, n));
    const answeredNumbers = ['1', '2', '3', '5', '7'];
    const answers = answeredNumbers.map((n, i) => makeAnswer(`a${n}`, n, `answer ${n}`, i));

    const result = await runMappingEngine(questions, answers);

    const unansweredNumbers = result.unansweredQuestionIds
      .map((id) => questions.find((q) => q.id === id)?.questionNumber)
      .sort();
    expect(unansweredNumbers).toEqual(['4', '6', '8']);
    expect(result.orphanAnswers).toEqual([]);
  });

  it('merges a contiguous multi-page answer into one mapping with additional regions', async () => {
    const questions = [makeQuestion('q1', '1'), makeQuestion('q2', '2'), makeQuestion('q3', '3')];
    const answers = [
      makeAnswer('a1', '1', 'answer one', 0, 1),
      makeAnswer('a2a', '2', 'answer two part A', 1, 1),
      makeAnswer('a2b', '2', 'answer two part B', 2, 2), // page turn, same question
      makeAnswer('a3', '3', 'answer three', 3, 2),
    ];

    const result = await runMappingEngine(questions, answers);
    const q2 = result.mappings.find((m) => m.questionId === 'q2');

    expect(q2?.mappedAnswerId).toBe('a2a');
    expect(q2?.additionalAnswerIds).toEqual(['a2b']);
    expect(result.orphanAnswers).toEqual([]);
  });

  it('treats a non-contiguous repeated answer as a duplicate, keeping the stronger attempt', async () => {
    const questions = [makeQuestion('q1', '1'), makeQuestion('q2', '2')];
    const answers = [
      makeAnswer('a1-short', '1', 'short first attempt', 0),
      makeAnswer('a2', '2', 'answer two', 1),
      // Written much later (large sequence gap), and clearly a fuller re-attempt.
      makeAnswer('a1-long', '1', 'a much longer and more complete second attempt at question one', 10),
    ];

    const result = await runMappingEngine(questions, answers);
    const q1 = result.mappings.find((m) => m.questionId === 'q1');

    expect(q1?.mappedAnswerId).toBe('a1-long');
    expect(result.orphanAnswers).toHaveLength(1);
    expect(result.orphanAnswers[0]).toMatchObject({
      answerId: 'a1-short',
      reason: 'duplicate-of-mapped',
      bestGuessQuestionId: 'q1',
    });
  });

  it('fuzzy-matches a garbled question-number label from OCR noise', async () => {
    const questions = [makeQuestion('q4a', '4(a)', 'Explain photosynthesis')];
    // Student's number was OCR'd as "4(q)" instead of "4(a)".
    const answers = [makeAnswer('a4x', '4(q)', 'Photosynthesis explanation here', 0)];

    const result = await runMappingEngine(questions, answers);
    const mapping = result.mappings[0];

    expect(mapping.mappedAnswerId).toBe('a4x');
    expect(mapping.method).toBe('number-fuzzy');
    expect(mapping.confidence).toBeGreaterThan(0.5);
  });

  it('never crashes when there are zero answers at all', async () => {
    const questions = [makeQuestion('q1', '1'), makeQuestion('q2', '2')];
    const result = await runMappingEngine(questions, []);
    expect(result.unansweredQuestionIds).toEqual(['q1', 'q2']);
    expect(result.orphanAnswers).toEqual([]);
  });

  it('never crashes when there are zero questions at all (all orphans)', async () => {
    const answers = [makeAnswer('a1', '1', 'stray answer', 0)];
    const result = await runMappingEngine([], answers);
    expect(result.unansweredQuestionIds).toEqual([]);
    expect(result.orphanAnswers).toHaveLength(1);
  });
});
