import type { ExtractedQuestion } from './question';
import type { ExtractedAnswerBlock } from './answer';
import type { MappingResult } from './mapping';
import type { GradingResult } from './grading';

export type ProcessingStage =
  | 'idle'
  | 'uploading'
  | 'extracting-questions'
  | 'extracting-answers'
  | 'mapping'
  | 'grading'
  | 'done'
  | 'error';

export interface ProcessingProgressEvent {
  stage: ProcessingStage;
  /** 0-100, coarse progress within the whole pipeline (not just this stage) */
  percent: number;
  message: string;
  error?: string;
}

export interface UploadedFileMeta {
  fileId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  pageCount: number;
  storedPath: string;
}

export interface SessionData {
  sessionId: string;
  createdAt: number;
  questionPaper: UploadedFileMeta | null;
  answerSheet: UploadedFileMeta | null;
  stage: ProcessingStage;
  questions: ExtractedQuestion[];
  answers: ExtractedAnswerBlock[];
  mapping: MappingResult | null;
  grading: GradingResult | null;
  errorMessage: string | null;
}
