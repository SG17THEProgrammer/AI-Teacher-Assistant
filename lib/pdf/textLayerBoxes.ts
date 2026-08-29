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

  // First pass: tight (unpadded) box per block, so padding in the second
  // pass can be clamped against real neighboring content instead of a fixed
  // amount that can exceed a tightly-spaced document's actual gap between
  // blocks (that's what let padding push two adjacent boxes into overlap).
  const tightBoxes = blocks.map((_, i) => {
    const start = startIndices[i] ?? null;
    if (start === null) return null;

    const startRun = ordered[start]!;
    let end = ordered.length;
    for (let j = 0; j < startIndices.length; j++) {
      const otherStart = startIndices[j] ?? null;
      if (otherStart === null || otherStart <= start) continue;
      if (ordered[otherStart]!.page !== startRun.page) continue;
      end = Math.min(end, otherStart);
    }
    while (end > start + 1 && ordered[end - 1]!.page !== startRun.page) end--;

    const runsInBlock = ordered.slice(start, end).filter((r) => r.page === startRun.page);
    if (runsInBlock.length === 0) return null;

    return {
      page: startRun.page,
      minX: Math.min(...runsInBlock.map((r) => r.x)),
      minY: Math.min(...runsInBlock.map((r) => r.yTop)),
      maxX: Math.max(...runsInBlock.map((r) => r.x + r.width)),
      maxY: Math.max(...runsInBlock.map((r) => r.yBottom)),
    };
  });

  const padX = 0.01;
  const desiredPadY = 0.006;

  return tightBoxes.map((box, i) => {
    if (!box) return null;

    // Find the closest other block's tight box on the same page, above and
    // below this one, to cap padding so it can never bite into a neighbor's
    // own text -- some source documents space answers only a few points
    // apart, well under twice the desired padding.
    let gapAbove = Infinity;
    let gapBelow = Infinity;
    for (const other of tightBoxes) {
      if (!other || other.page !== box.page) continue;
      if (other.maxY <= box.minY) gapAbove = Math.min(gapAbove, box.minY - other.maxY);
      if (other.minY >= box.maxY) gapBelow = Math.min(gapBelow, other.minY - box.maxY);
    }
    const padTop = Math.min(desiredPadY, gapAbove / 2);
    const padBottom = Math.min(desiredPadY, gapBelow / 2);

    const x = Math.max(0, box.minX - padX);
    const y = Math.max(0, box.minY - padTop);
    const right = Math.min(1, box.maxX + padX);
    const bottom = Math.min(1, box.maxY + padBottom);

    return [{
      page: box.page,
      x,
      y,
      width: right - x,
      height: bottom - y,
    }];
  });
}
