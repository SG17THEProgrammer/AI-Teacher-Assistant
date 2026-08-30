import { createWorker, type Worker } from 'tesseract.js';
import type { RenderedPage } from '@/lib/pdf/pdfToImages';

export interface FallbackOcrPage {
  pageNumber: number;
  text: string;
  /** Tesseract word-level boxes, normalized 0-1, used to approximate
   *  bounding regions when Gemini is unavailable. */
  words: { text: string; box: { x: number; y: number; width: number; height: number } }[];
}

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker('eng');
  }
  return workerPromise;
}

/**
 * Fallback text-only OCR used when GEMINI_API_KEY is absent or
 * FORCE_OCR_FALLBACK=true. Tesseract has no real handwriting model, so this
 * path is best-effort for typed question papers and degrades gracefully
 * (rather than crashing) on handwritten answer sheets -- the UI surfaces a
 * warning banner in that case and the mapping engine leans harder on
 * number-based matching since semantic text quality will be lower.
 */
export async function ocrPageFallback(page: RenderedPage): Promise<FallbackOcrPage> {
  const worker = await getWorker();
  const { data } = await worker.recognize(page.pngBuffer);

  const words = (data.words ?? []).map((w) => ({
    text: w.text,
    box: {
      x: w.bbox.x0 / page.width,
      y: w.bbox.y0 / page.height,
      width: (w.bbox.x1 - w.bbox.x0) / page.width,
      height: (w.bbox.y1 - w.bbox.y0) / page.height,
    },
  }));

  return { pageNumber: page.pageNumber, text: data.text, words };
}

export async function terminateFallbackWorker(): Promise<void> {
  if (workerPromise) {
    const worker = await workerPromise;
    await worker.terminate();
    workerPromise = null;
  }
}

/**
 * Very rough heuristic segmentation of fallback OCR text into question-like
 * chunks, split on lines that start with a number/label pattern. Used only
 * when Gemini is unavailable; accuracy is intentionally conservative (it is
 * documented as a degraded mode in the teacher README).
 */
export function heuristicSegmentQuestions(pages: FallbackOcrPage[]): {
  questionNumber: string;
  questionText: string;
  pageNumber: number;
}[] {
  const NUMBERING = /^\s*(\d{1,2}\s*\.?\s*\(?[a-d]?\)?)\s*[.).:-]?\s+/;
  const results: { questionNumber: string; questionText: string; pageNumber: number }[] = [];

  for (const page of pages) {
    const lines = page.text.split('\n').map((l) => l.trim()).filter(Boolean);
    let current: { questionNumber: string; questionText: string; pageNumber: number } | null =
      null;

    for (const line of lines) {
      const match = line.match(NUMBERING);
      if (match) {
        if (current) results.push(current);
        const label = match[1]!.replace(/\s+/g, '');
        current = {
          questionNumber: label,
          questionText: line.slice(match[0].length).trim(),
          pageNumber: page.pageNumber,
        };
      } else if (current) {
        current.questionText += ' ' + line;
      }
    }
    if (current) results.push(current);
  }

  return results;
}
