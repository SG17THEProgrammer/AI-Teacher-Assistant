export type MappingMethod = 'number-exact' | 'number-fuzzy' | 'semantic' | 'sequence-fallback';

export interface QuestionMapping {
  questionId: string;
  /** null when no answer block could be matched at all -> "Not Answered" */
  mappedAnswerId: string | null;
  /** Additional answer blocks matched to the same question (multi-page,
   *  or a student who wrote a continuation elsewhere on the sheet). */
  additionalAnswerIds: string[];
  confidence: number; // 0-1
  method: MappingMethod | null;
  /** Human-readable trace of why this mapping was chosen, shown on hover
   *  in the "Preview Mapping" interaction from the design spec. */
  reasoning: string;
  needsReview: boolean;
}

export interface OrphanAnswer {
  answerId: string;
  reason: 'no-question-match' | 'duplicate-of-mapped' | 'below-confidence-threshold';
  bestGuessQuestionId: string | null;
  bestGuessConfidence: number | null;
}

export interface MappingResult {
  mappings: QuestionMapping[];
  unansweredQuestionIds: string[];
  orphanAnswers: OrphanAnswer[];
}
