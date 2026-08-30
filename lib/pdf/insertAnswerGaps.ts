import { createCanvas, loadImage } from '@napi-rs/canvas';
import type { RenderedPage } from './pdfToImages';
import type { ExtractedAnswerBlock } from '@/types/answer';

// A page image is a flat raster -- CSS can't open up space inside it, so a
// tight-written answer sheet (near-zero real gap between blocks) can only be
// given breathing room by redrawing the page itself: cut it into horizontal
// strips at each detected answer boundary and re-paste them into a taller
// canvas with real blank rows between blocks. Bounding boxes are then
// remapped into the new, taller image's coordinate space so the on-screen
// highlight overlay stays pixel-aligned.
const MIN_GAP_PX = 50;

/**
 * Mutates each answer's boundingBoxes in place to match the taller image,
 * and returns the redrawn pages. Only pages that actually needed extra room
 * are redrawn; everything else is returned untouched.
 */
export async function insertAnswerGaps(
  pages: RenderedPage[],
  answers: ExtractedAnswerBlock[]
): Promise<RenderedPage[]> {
  const byPage = new Map<number, ExtractedAnswerBlock[]>();
  for (const answer of answers) {
    const list = byPage.get(answer.pageNumber) ?? [];
    list.push(answer);
    byPage.set(answer.pageNumber, list);
  }

  return Promise.all(
    pages.map(async (page) => {
      const blocks = byPage.get(page.pageNumber);
      if (!blocks || blocks.length < 2) return page;
      try {
        return await insertGapsForPage(page, blocks);
      } catch {
        // Never let a redraw failure take down the whole pipeline -- worst
        // case the page just keeps its original (tighter) spacing.
        return page;
      }
    })
  );
}

async function insertGapsForPage(
  page: RenderedPage,
  blocks: ExtractedAnswerBlock[]
): Promise<RenderedPage> {
  const image = await loadImage(page.pngBuffer);
  const { width, height } = page;

  const ranges = blocks
    .map((block) => {
      const boxes = block.boundingBoxes.filter((b) => b.page === page.pageNumber);
      if (boxes.length === 0) return null;
      return {
        top: Math.min(...boxes.map((b) => b.y)) * height,
        bottom: Math.max(...boxes.map((b) => b.y + b.height)) * height,
      };
    })
    .filter((r): r is { top: number; bottom: number } => r !== null)
    .sort((a, b) => a.top - b.top);

  if (ranges.length < 2) return page;

  // How much blank space to insert right after each block's bottom edge,
  // clamped to never shrink a gap that's already adequate.
  const insertions: { atY: number; amount: number }[] = [];
  for (let i = 0; i < ranges.length - 1; i++) {
    const current = ranges[i]!;
    const next = ranges[i + 1]!;
    const gap = next.top - current.bottom;
    const extra = MIN_GAP_PX - gap;
    if (extra > 0) insertions.push({ atY: current.bottom, amount: extra });
  }
  if (insertions.length === 0) return page;

  const totalExtra = insertions.reduce((sum, ins) => sum + ins.amount, 0);
  const newHeight = Math.ceil(height + totalExtra);
  const canvas = createCanvas(width, newHeight);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, newHeight);

  // Draw the original image in horizontal strips, shifting each strip down
  // by the cumulative blank space inserted above it.
  let cumulative = 0;
  let sliceStart = 0;
  const cuts = [...insertions.map((ins) => ins.atY), height];
  for (let i = 0; i < cuts.length; i++) {
    const sliceEnd = cuts[i]!;
    const sliceHeight = sliceEnd - sliceStart;
    if (sliceHeight > 0) {
      ctx.drawImage(
        image as any,
        0, sliceStart, width, sliceHeight,
        0, sliceStart + cumulative, width, sliceHeight
      );
    }
    if (i < insertions.length) cumulative += insertions[i]!.amount;
    sliceStart = sliceEnd;
  }

  // Remap every box on this page into the new, taller image's fractions --
  // anything below an insertion point shifts down by that insertion amount.
  for (const block of blocks) {
    block.boundingBoxes = block.boundingBoxes.map((box) => {
      if (box.page !== page.pageNumber) return box;
      const pixelY = box.y * height;
      const shift = insertions.reduce((sum, ins) => (pixelY >= ins.atY ? sum + ins.amount : sum), 0);
      return {
        ...box,
        y: (pixelY + shift) / newHeight,
        height: (box.height * height) / newHeight,
      };
    });
  }

  return {
    pageNumber: page.pageNumber,
    pngBuffer: canvas.toBuffer('image/png'),
    width,
    height: newHeight,
  };
}
