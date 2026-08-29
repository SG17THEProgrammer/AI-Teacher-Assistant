import { openPdfDocument } from './pdfToImages';
import type { BoundingBox } from '@/types/question';

interface PositionedRun {
  str: string;
  page: number;
  /** Top-origin fractions of the page, 0-1. */
  x: number;
  yTop: number;
  yBottom: number;
  width: number;
}

// Generous ascent/descent allowance (fraction of font size) so a run's box
// reaches from just above the cap-height down past descenders (g, y, p) --
// asymmetric ascent-only margins previously left the true baseline+descender
// of the last line uncovered, cutting the highlight off before the real end
// of the block's text.
const ASCENT_RATIO = 0.82;
const DESCENT_RATIO = 0.28;

/**
 * Reads every text run on every page of a typed/embedded-text PDF, with its
 * exact position converted to top-origin page fractions (matching the
 * BoundingBox convention used for the on-screen highlight overlay).
 */
async function extractTextRuns(pdfBuffer: Buffer): Promise<PositionedRun[]> {
  const doc = await openPdfDocument(pdfBuffer);
  const runs: PositionedRun[] = [];

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const { items } = await page.getTextContent();

    for (const item of items as any[]) {
      if (typeof item.str !== 'string' || !item.str.trim()) continue;
      const [a, b, c, d, e, f] = item.transform;
      const fontHeight = Math.hypot(c, d) || Math.hypot(a, b);
      const width = item.width ?? Math.hypot(a, b) * item.str.length;
      // transform's (e, f) is the glyph baseline in bottom-origin PDF space.
      const topPdf = f + fontHeight * ASCENT_RATIO;
      const bottomPdf = f - fontHeight * DESCENT_RATIO;
      runs.push({
        str: item.str,
        page: pageNumber,
        x: e / viewport.width,
        yTop: (viewport.height - topPdf) / viewport.height,
        yBottom: (viewport.height - bottomPdf) / viewport.height,
        width: width / viewport.width,
      });
    }
  }

  return runs;
}

/**
 * Computes an exact bounding box per answer block straight from the PDF's
 * own text geometry, rather than trusting a vision model's spatial guess.
 * Only applicable to typed/embedded-text PDFs (the model still owns
 * segmentation into blocks and their `detectedNumberRawText` label -- this
 * only replaces the box, using where that label's exact text actually sits).
 *
 * Returns null for any block whose label text can't be located verbatim on
 * the page, so callers can fall back to the model's own box for that block.
 */
export async function computeAnswerBoxesFromTextLayer(
  pdfBuffer: Buffer,
  blocks: { detectedNumberRawText: string | null; sequenceIndex: number }[]
): Promise<(BoundingBox[] | null)[]> {
  const runs = await extractTextRuns(pdfBuffer);
  if (runs.length === 0) return blocks.map(() => null);

  // Order runs by page then vertical position (top to bottom), which is how
  // a typed answer sheet is laid out and how `sequenceIndex` orders blocks.
  const ordered = [...runs].sort((r1, r2) => r1.page - r2.page || r1.yTop - r2.yTop);

  const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

  const startIndices: (number | null)[] = blocks.map((block) => {
    const label = block.detectedNumberRawText ? normalize(block.detectedNumberRawText) : null;
    if (!label) return null;
    const found = ordered.findIndex((run) => normalize(run.str).startsWith(label));
    return found === -1 ? null : found;
  });

  return blocks.map((_, i) => {
    const start = startIndices[i] ?? null;
    if (start === null) return null;

    // The block's own text runs span from its label to just before the next
    // located block's label (on the same page), or to the end of that page.
    const startRun = ordered[start]!;
    let end = ordered.length;
    for (let j = 0; j < startIndices.length; j++) {
      const otherStart = startIndices[j] ?? null;
      if (otherStart === null || otherStart <= start) continue;
      if (ordered[otherStart]!.page !== startRun.page) continue;
      end = Math.min(end, otherStart);
    }
    // Cap at the end of the starting run's page.
    while (end > start + 1 && ordered[end - 1]!.page !== startRun.page) end--;

    const runsInBlock = ordered.slice(start, end).filter((r) => r.page === startRun.page);
    if (runsInBlock.length === 0) return null;

    const minX = Math.min(...runsInBlock.map((r) => r.x));
    const minY = Math.min(...runsInBlock.map((r) => r.yTop));
    const maxX = Math.max(...runsInBlock.map((r) => r.x + r.width));
    const maxY = Math.max(...runsInBlock.map((r) => r.yBottom));

    // A little breathing room so the border doesn't sit flush against the
    // glyphs it's highlighting.
    const padX = 0.01;
    const padY = 0.006;
    return [{
      page: startRun.page,
      x: Math.max(0, minX - padX),
      y: Math.max(0, minY - padY),
      width: Math.min(1, maxX + padX) - Math.max(0, minX - padX),
      height: Math.min(1, maxY + padY) - Math.max(0, minY - padY),
    }];
  });
}
