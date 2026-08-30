import { nanoid } from 'nanoid';
import { enhanceForOcr, type RenderedPage } from '@/lib/pdf/pdfToImages';
import { renderUploadToPages } from '@/lib/pdf/renderUpload';
import { computeAnswerBoxesFromTextLayer } from '@/lib/pdf/textLayerBoxes';
import { padAnswerBoundingBoxes } from '@/lib/pdf/boxPadding';
import { callGeminiVisionJSON, isGeminiConfigured } from '@/lib/gemini/client';
import {
  ANSWER_EXTRACTION_SYSTEM,
  buildAnswerExtractionPrompt,
  buildAnswerExtractionDocumentPrompt,
} from '@/lib/gemini/prompts';
import { ocrPageFallback } from '@/lib/ocr/tesseractFallback';
import { normalizeQuestionNumber } from '@/lib/mapping/numberNormalizer';
import type { ExtractedAnswerBlock, AnswerSheetExtractionResult } from '@/types/answer';
import type { BoundingBox } from '@/types/question';

interface GeminiAnswerPageResponse {
  answers: {
    pageNumber?: number;
    detectedNumberRawText: string | null;
    detectedQuestionNumber: string | null;
    answerText: string;
    containsDiagram: boolean;
    containsTable: boolean;
    crossedOut: boolean;
    lowConfidence: boolean;
    boundingBox?: { x: number; y: number; width: number; height: number };
  }[];
  warnings: string[];
}

/** Convenience wrapper for callers that only have raw file bytes. */
export async function extractAnswersFromFile(
  fileBuffer: Buffer,
  mimeType: string,
  onPageDone?: (done: number, total: number) => void
): Promise<AnswerSheetExtractionResult> {
  const pages = await renderUploadToPages(fileBuffer, mimeType);
  return extractAnswersFromPages(pages, onPageDone);
}

export async function extractAnswersFromPages(
  pages: RenderedPage[],
  onPageDone?: (done: number, total: number) => void,
  rawBuffer?: Buffer,
  mimeType?: string,
): Promise<AnswerSheetExtractionResult> {
  const warnings: string[] = [];
  const perPageResults: ExtractedAnswerBlock[][] = new Array(pages.length);
  let globalSequence = 0;

  if (isGeminiConfigured()) {
    const useDocument = rawBuffer && mimeType === 'application/pdf';

    if (useDocument) {
      // Single Gemini call with the raw PDF — avoids blank rendered images.
      try {
        const response = await callGeminiVisionJSON<GeminiAnswerPageResponse>({
          systemInstruction: ANSWER_EXTRACTION_SYSTEM,
          // The raw PDF sent here contains every page, so the prompt must
          // ask for the whole document -- telling the model "this is page 1
          // of N, only this page" (as the per-page prompt does) made it
          // silently ignore every page after the first, which is exactly
          // why later-page answers were coming back as "not answered".
          prompt: buildAnswerExtractionDocumentPrompt(pages.length),
          pdfBuffer: rawBuffer,
        });
        warnings.push(...(response.warnings ?? []));
        if (response.answers.length === 0) warnings.push('No answer content detected in the answer sheet.');

        // The vision model's own boundingBox is a spatial *guess* and is
        // frequently off (confirmed: boxes landing on the header or a
        // neighboring block instead of the block's own text). For a typed
        // PDF we can instead locate each block's label in the PDF's real
        // text geometry and derive an exact box deterministically -- no
        // guessing involved. Falls back to the model's own box per-block
        // when its label can't be located verbatim (e.g. no label written).
        let textLayerBoxes: (BoundingBox[] | null)[] | null = null;
        try {
          textLayerBoxes = await computeAnswerBoxesFromTextLayer(
            rawBuffer,
            response.answers.map((a, i) => ({
              detectedNumberRawText: a.detectedNumberRawText,
              sequenceIndex: i,
              geminiBox: a.boundingBox ? { page: a.pageNumber ?? 1, ...a.boundingBox } : null,
            }))
          );
        } catch {
          // No usable text layer (e.g. scanned/rasterized PDF) -- keep model boxes.
        }

        const answers = response.answers.map((a, i) => {
          const normalized = normalizeQuestionNumber(a.detectedQuestionNumber);
          const derivedBoxes = textLayerBoxes?.[i] ?? null;
          const modelPage = a.pageNumber ?? 1;
          const boundingBoxes = derivedBoxes ?? (a.boundingBox ? [{ page: modelPage, ...a.boundingBox }] : []);
          return {
            answerId: nanoid(10),
            detectedQuestionNumber: normalized?.canonical ?? null,
            detectedNumberRawText: a.detectedNumberRawText,
            answerText: a.answerText,
            pageNumber: boundingBoxes[0]?.page ?? modelPage,
            boundingBoxes,
            sequenceIndex: globalSequence++,
            containsDiagram: a.containsDiagram,
            containsTable: a.containsTable,
            crossedOut: a.crossedOut,
            lowConfidence: a.lowConfidence,
          };
        });
        pages.forEach((_, idx) => onPageDone?.(idx + 1, pages.length));
        padAnswerBoundingBoxes(answers);
        return { answers, pageCount: pages.length, warnings };
      } catch (err) {
        warnings.push(`AI extraction failed (${err instanceof Error ? err.message : 'unknown error'}). Falling back to per-page rendering.`);
        globalSequence = 0;
      }
    }

    // Pages must be processed in parallel for speed, but sequence index
    // has to reflect true page order, so we process concurrently and then
    // assign sequence numbers in a second pass over ordered results.
    await Promise.all(
      pages.map(async (page, idx) => {
        try {
          const enhanced = await enhanceForOcr(page.pngBuffer);
          const response = await callGeminiVisionJSON<GeminiAnswerPageResponse>({
            systemInstruction: ANSWER_EXTRACTION_SYSTEM,
            prompt: buildAnswerExtractionPrompt(page.pageNumber, pages.length),
            images: [enhanced],
          });
          warnings.push(...(response.warnings ?? []));

          if (response.answers.length === 0) {
            warnings.push(
              `Page ${page.pageNumber}: no answer content detected (possibly rough work or a blank page).`
            );
          }

          perPageResults[idx] = response.answers.map((a) => {
            const normalized = normalizeQuestionNumber(a.detectedQuestionNumber);
            return {
              answerId: nanoid(10),
              detectedQuestionNumber: normalized?.canonical ?? null,
              detectedNumberRawText: a.detectedNumberRawText,
              answerText: a.answerText,
              pageNumber: page.pageNumber,
              boundingBoxes: a.boundingBox ? [{ page: page.pageNumber, ...a.boundingBox }] : [],
              sequenceIndex: 0, // assigned below
              containsDiagram: a.containsDiagram,
              containsTable: a.containsTable,
              crossedOut: a.crossedOut,
              lowConfidence: a.lowConfidence,
            };
          });
        } catch (err) {
          warnings.push(
            `Page ${page.pageNumber}: AI extraction failed (${
              err instanceof Error ? err.message : 'unknown error'
            }). Answers on this page may be missing.`
          );
          perPageResults[idx] = [];
        } finally {
          onPageDone?.(idx + 1, pages.length);
        }
      })
    );
  } else {
    warnings.push(
      'GEMINI_API_KEY not configured -- handwriting extraction requires Gemini Vision. Tesseract.js fallback will only pick up typed/printed text, if any.'
    );
    for (const [idx, page] of pages.entries()) {
      const fallback = await ocrPageFallback(page);
      const text = fallback.text.trim();
      perPageResults[idx] = text
        ? [
            {
              answerId: nanoid(10),
              detectedQuestionNumber: null,
              detectedNumberRawText: null,
              answerText: text,
              pageNumber: page.pageNumber,
              boundingBoxes: [],
              sequenceIndex: 0,
              containsDiagram: false,
              containsTable: false,
              crossedOut: false,
              lowConfidence: true,
            },
          ]
        : [];
      onPageDone?.(idx + 1, pages.length);
    }
  }

  const answers = perPageResults.flat();
  for (const answer of answers) {
    answer.sequenceIndex = globalSequence++;
  }

  padAnswerBoundingBoxes(answers);
  return { answers, pageCount: pages.length, warnings };
}