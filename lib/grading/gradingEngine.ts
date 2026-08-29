import { callGeminiVisionJSON, isGeminiConfigured } from '@/lib/gemini/client';
import { GRADING_SYSTEM, buildGradingPrompt } from '@/lib/gemini/prompts';
import type { ExtractedQuestion } from '@/types/question';
import type { ExtractedAnswerBlock } from '@/types/answer';
import type { MappingResult } from '@/types/mapping';
import type { QuestionGrade, OverallSummary, GradingResult } from '@/types/grading';

interface GeminiGradeResponse {
  marksAwarded: number;
  confidence: number;
  strengths: string[];
  mistakes: string[];
  feedback: string;
}

const DEFAULT_MARKS_WHEN_UNSPECIFIED = 5;

export async function runGradingEngine(
  questions: ExtractedQuestion[],
  answers: ExtractedAnswerBlock[],
  mapping: MappingResult
): Promise<GradingResult> {
  const answerById = new Map(answers.map((a) => [a.answerId, a]));
  const mappingByQuestion = new Map(mapping.mappings.map((m) => [m.questionId, m]));

  const grades = await Promise.all(
    questions.map((question) => gradeOne(question, mappingByQuestion.get(question.id), answerById))
  );

  const summary = computeSummary(questions, grades, mapping);
  return { grades, summary };
}

async function gradeOne(
  question: ExtractedQuestion,
  mapping: ReturnType<Map<string, MappingResult['mappings'][number]>['get']>,
  answerById: Map<string, ExtractedAnswerBlock>
): Promise<QuestionGrade> {
  const totalMarks = question.totalMarks ?? DEFAULT_MARKS_WHEN_UNSPECIFIED;

  if (!mapping || !mapping.mappedAnswerId) {
    return {
      questionId: question.id,
      marksAwarded: 0,
      totalMarks,
      confidence: 1,
      strengths: [],
      mistakes: [],
      feedback: 'Not answered.',
      isUngraded: true,
    };
  }

  const answer = answerById.get(mapping.mappedAnswerId);
  if (!answer) {
    return {
      questionId: question.id,
      marksAwarded: 0,
      totalMarks,
      confidence: 0,
      strengths: [],
      mistakes: [],
      feedback: 'Mapped answer could not be located.',
      isUngraded: true,
    };
  }

  const fullAnswerText = mergeMultiPageAnswerText(answer, mapping.additionalAnswerIds, answerById);

  if (!isGeminiConfigured()) {
    return heuristicGrade(question, fullAnswerText, totalMarks);
  }

  try {
    const response = await callGeminiVisionJSON<GeminiGradeResponse>({
      systemInstruction: GRADING_SYSTEM,
      prompt: buildGradingPrompt(question.questionNumber, question.questionText, totalMarks, fullAnswerText),
      images: [],
      maxRetries: 2,
    });
    return {
      questionId: question.id,
      marksAwarded: clampMarks(response.marksAwarded, totalMarks),
      totalMarks,
      confidence: clamp01(response.confidence),
      strengths: response.strengths ?? [],
      mistakes: response.mistakes ?? [],
      feedback: response.feedback,
      isUngraded: false,
    };
  } catch {
    return heuristicGrade(question, fullAnswerText, totalMarks);
  }
}

function mergeMultiPageAnswerText(
  primary: ExtractedAnswerBlock,
  additionalIds: string[],
  answerById: Map<string, ExtractedAnswerBlock>
): string {
  const parts = [primary.answerText];
  for (const id of additionalIds) {
    const block = answerById.get(id);
    if (block) parts.push(block.answerText);
  }
  return parts.join('\n\n');
}

/** Degraded grading used only when Gemini is not configured, so the app
 *  remains end-to-end functional (with an obvious low-confidence signal)
 *  even without an API key. */
function heuristicGrade(
  question: ExtractedQuestion,
  answerText: string,
  totalMarks: number
): QuestionGrade {
  const length = answerText.trim().length;
  const ratio = Math.min(length / 200, 1); // longer answers score higher, capped
  const marksAwarded = Math.round(ratio * totalMarks * 2) / 2;
  return {
    questionId: question.id,
    marksAwarded,
    totalMarks,
    confidence: 0.2,
    strengths: length > 0 ? ['An answer was provided.'] : [],
    mistakes: [],
    feedback:
      'Automatic grading requires GEMINI_API_KEY to be configured; this is a rough length-based estimate only. Please review manually.',
    isUngraded: false,
  };
}

function computeSummary(
  questions: ExtractedQuestion[],
  grades: QuestionGrade[],
  mapping: MappingResult
): OverallSummary {
  const totalMarksPossible = grades.reduce((sum, g) => sum + g.totalMarks, 0);
  const totalMarksAwarded = grades.reduce((sum, g) => sum + g.marksAwarded, 0);
  const questionsUnanswered = mapping.unansweredQuestionIds.length;
  const questionsAttempted = questions.length - questionsUnanswered;

  const confidences = mapping.mappings.filter((m) => m.mappedAnswerId).map((m) => m.confidence);
  const averageMappingConfidence =
    confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0;

  const scored = grades.filter((g) => !g.isUngraded && g.totalMarks > 0);
  const strong = scored
    .filter((g) => g.marksAwarded / g.totalMarks >= 0.75)
    .map((g) => questionLabel(questions, g.questionId));
  const weak = scored
    .filter((g) => g.marksAwarded / g.totalMarks < 0.5)
    .map((g) => questionLabel(questions, g.questionId));

  return {
    totalMarksAwarded,
    totalMarksPossible,
    percentage: totalMarksPossible > 0 ? Math.round((totalMarksAwarded / totalMarksPossible) * 1000) / 10 : 0,
    questionsAttempted,
    questionsUnanswered,
    totalQuestions: questions.length,
    strongAreas: strong,
    weakAreas: weak,
    orphanAnswerCount: mapping.orphanAnswers.length,
    averageMappingConfidence: Math.round(averageMappingConfidence * 100) / 100,
  };
}

function questionLabel(questions: ExtractedQuestion[], questionId: string): string {
  const q = questions.find((q) => q.id === questionId);
  return q ? `Q${q.questionNumber}` : questionId;
}

function clampMarks(value: number, max: number): number {
  const rounded = Math.round(value * 2) / 2; // nearest 0.5
  return Math.max(0, Math.min(max, rounded));
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
