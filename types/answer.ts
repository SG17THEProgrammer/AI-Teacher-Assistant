import type { BoundingBox } from './question';

/**
 * A contiguous block of student writing detected on the answer sheet,
 * before it has been mapped to a question. `detectedQuestionNumber` is
 * whatever the student wrote next to it ("Ans 5", "Q.5", "5.", ...),
 * normalized by the AI layer -- it is a *hint* for the mapping engine,
 * not a guaranteed-correct final mapping.
 */
export interface ExtractedAnswerBlock {
  answerId: string;
  /** Normalized number, e.g. "5", "4(a)" -- or null if the student wrote none */
  detectedQuestionNumber: string | null;
  /** Verbatim text as written next to the answer, before normalization */
  detectedNumberRawText: string | null;
  answerText: string;
  pageNumber: number;
  boundingBoxes: BoundingBox[];
  /** Sequential index in which this block appears in the sheet, top to bottom,
   *  page by page -- used to resolve ties and detect out-of-order writing. */
  sequenceIndex: number;
  containsDiagram: boolean;
  containsTable: boolean;
  crossedOut: boolean;
  lowConfidence: boolean;
  rawText?: string;
}

export type AnswerSheetExtractionResult = {
  answers: ExtractedAnswerBlock[];
  pageCount: number;
  warnings: string[];
};
