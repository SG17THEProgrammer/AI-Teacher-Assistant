/**
 * A single question extracted from the question paper.
 *
 * Sub-parts (4(a), 4(b)) are modeled as fully independent entries rather
 * than nested children, per the assignment spec: numbering and order must
 * be preserved exactly as printed, and downstream mapping/grading treats
 * every sub-part as its own gradable unit.
 */
export interface ExtractedQuestion {
  id: string;
  /** Printed label, preserved verbatim: "1", "4(a)", "4(b)", "11.b" */
  questionNumber: string;
  /** Normalized sort key so "4(a)" < "4(b)" < "5" even out of OCR order */
  order: number;
  questionText: string;
  pageNumber: number;
  /** Marks the question paper assigns, if detected (e.g. "[5 marks]") */
  totalMarks: number | null;
  /** Bounding box of the question on the source page, for optional preview */
  region: BoundingBox | null;
  /** True when Gemini's confidence in the text/number extraction was low */
  lowConfidence: boolean;
  /** Raw OCR text before normalization, kept for debugging/audit */
  rawText?: string;
}

export interface BoundingBox {
  page: number;
  /** All coordinates are normalized 0-1 fractions of page width/height,
   *  so they stay correct at any zoom level or render resolution. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export type QuestionPaperExtractionResult = {
  questions: ExtractedQuestion[];
  pageCount: number;
  warnings: string[];
};
