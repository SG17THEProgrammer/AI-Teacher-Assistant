import { nanoid } from 'nanoid';
import { enhanceForOcr, type RenderedPage } from '@/lib/pdf/pdfToImages';
import { renderUploadToPages } from '@/lib/pdf/renderUpload';
import { callGeminiVisionJSON, isGeminiConfigured } from '@/lib/gemini/client';
import { QUESTION_EXTRACTION_SYSTEM, buildQuestionExtractionPrompt } from '@/lib/gemini/prompts';
import { ocrPageFallback, heuristicSegmentQuestions } from '@/lib/ocr/tesseractFallback';
import { computeQuestionOrder } from '@/lib/mapping/numberNormalizer';
import type { ExtractedQuestion, QuestionPaperExtractionResult } from '@/types/question';

interface GeminiQuestionPageResponse {
  questions: {
    questionNumber: string;
    questionText: string;
    totalMarks: number | null;
    lowConfidence: boolean;
    boundingBox?: { x: number; y: number; width: number; height: number };
  }[];
  warnings: string[];
}

/** Convenience wrapper for callers that only have raw file bytes. */
export async function extractQuestionsFromFile(
  fileBuffer: Buffer,
  mimeType: string,
  onPageDone?: (done: number, total: number) => void
): Promise<QuestionPaperExtractionResult> {
  const pages = await renderUploadToPages(fileBuffer, mimeType);
  return extractQuestionsFromPages(pages, onPageDone);
}

export async function extractQuestionsFromPages(
  pages: RenderedPage[],
  onPageDone?: (done: number, total: number) => void,
  rawBuffer?: Buffer,
  mimeType?: string,
): Promise<QuestionPaperExtractionResult> {
  const warnings: string[] = [];
  const perPageResults: ExtractedQuestion[][] = new Array(pages.length);

  if (isGeminiConfigured()) {
    // If we have the original file buffer (PDF or image), send it directly to
    // Gemini as a single document call — avoids the blank-image problem from
    // server-side canvas rendering. Otherwise fall back to per-page PNGs.
    const useDocument = rawBuffer && mimeType === 'application/pdf';
    console.log(`[QuestionPipeline] isGeminiConfigured=true useDocument=${!!useDocument} mimeType=${mimeType} rawBufferSize=${rawBuffer?.length ?? 0} pages=${pages.length}`);

    if (useDocument) {
      // Single Gemini call for the whole PDF — Gemini reads all pages natively.
      try {
        const response = await callGeminiVisionJSON<GeminiQuestionPageResponse>({
          systemInstruction: QUESTION_EXTRACTION_SYSTEM,
          prompt: buildQuestionExtractionPrompt(1, pages.length),
          pdfBuffer: rawBuffer,
        });
        console.log(`[QuestionPipeline] Gemini returned ${response.questions?.length ?? 0} questions, warnings:`, response.warnings);
        warnings.push(...(response.warnings ?? []));
        const allQuestions = response.questions.map((q) => ({
          id: nanoid(10),
          questionNumber: q.questionNumber,
          order: computeQuestionOrder(q.questionNumber),
          questionText: q.questionText,
          pageNumber: q.boundingBox ? 1 : 1,
          totalMarks: q.totalMarks ?? null,
          region: q.boundingBox ? { page: 1, ...q.boundingBox } : null,
          lowConfidence: q.lowConfidence,
        }));
        pages.forEach((_, idx) => onPageDone?.(idx + 1, pages.length));
        const questions = allQuestions.sort((a, b) => a.order - b.order);
        if (questions.length === 0) warnings.push('No questions could be extracted from the question paper.');
        return { questions, pageCount: pages.length, warnings };
      } catch (err) {
        warnings.push(`AI extraction failed (${err instanceof Error ? err.message : 'unknown error'}). Falling back to per-page rendering.`);
      }
    }

    // Parallel page processing to hit the <60s target end-to-end.
    await Promise.all(
      pages.map(async (page, idx) => {
        try {
          const enhanced = await enhanceForOcr(page.pngBuffer);
          const response = await callGeminiVisionJSON<GeminiQuestionPageResponse>({
            systemInstruction: QUESTION_EXTRACTION_SYSTEM,
            prompt: buildQuestionExtractionPrompt(page.pageNumber, pages.length),
            images: [enhanced],
          });
          warnings.push(...(response.warnings ?? []));
          perPageResults[idx] = response.questions.map((q) => ({
            id: nanoid(10),
            questionNumber: q.questionNumber,
            order: computeQuestionOrder(q.questionNumber),
            questionText: q.questionText,
            pageNumber: page.pageNumber,
            totalMarks: q.totalMarks ?? null,
            region: q.boundingBox
              ? { page: page.pageNumber, ...q.boundingBox }
              : null,
            lowConfidence: q.lowConfidence,
          }));
        } catch (err) {
          warnings.push(
            `Page ${page.pageNumber}: AI extraction failed (${
              err instanceof Error ? err.message : 'unknown error'
            }). This page's questions may be missing.`
          );
          perPageResults[idx] = [];
        } finally {
          onPageDone?.(idx + 1, pages.length);
        }
      })
    );
  } else {
    warnings.push(
      'GEMINI_API_KEY not configured -- using degraded Tesseract.js fallback OCR (typed text only, no diagrams/handwriting understanding).'
    );
    for (const [idx, page] of pages.entries()) {
      const fallback = await ocrPageFallback(page);
      const segmented = heuristicSegmentQuestions([fallback]);
      perPageResults[idx] = segmented.map((s) => ({
        id: nanoid(10),
        questionNumber: s.questionNumber,
        order: computeQuestionOrder(s.questionNumber),
        questionText: s.questionText,
        pageNumber: s.pageNumber,
        totalMarks: null,
        region: null,
        lowConfidence: true,
      }));
      onPageDone?.(idx + 1, pages.length);
    }
  }

  const questions = perPageResults.flat().sort((a, b) => a.order - b.order);

  if (questions.length === 0) {
    warnings.push('No questions could be extracted from the question paper.');
  }

  return { questions, pageCount: pages.length, warnings };
}