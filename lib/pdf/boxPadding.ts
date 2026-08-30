import type { ExtractedAnswerBlock } from '@/types/answer';

const PAD_X = 0.01;
const DESIRED_PAD_Y = 0.012;

/**
 * Clips any box that vertically overlaps a *different* answer's box on the
 * same page, regardless of which source produced either box (deterministic
 * text-layer, or a vision model's raw guess) -- a per-source fix (only
 * clamping inside the text-layer computation) still leaves overlap whenever
 * the OVERLAPPING box itself came from the raw vision guess instead. This
 * runs first, before padding, so padding's own neighbor-gap clamp measures
 * real (already de-overlapped) gaps.
 */
export function clampOverlappingBoxes(answers: ExtractedAnswerBlock[]): void {
  type Entry = { box: ExtractedAnswerBlock['boundingBoxes'][number]; answerId: string };
  const byPage = new Map<number, Entry[]>();
  for (const answer of answers) {
    for (const box of answer.boundingBoxes) {
      const list = byPage.get(box.page) ?? [];
      list.push({ box, answerId: answer.answerId });
      byPage.set(box.page, list);
    }
  }

  for (const entries of byPage.values()) {
    entries.sort((a, b) => a.box.y - b.box.y);
    for (let i = 0; i < entries.length - 1; i++) {
      const current = entries[i]!;
      const next = entries[i + 1]!;
      if (current.answerId === next.answerId) continue; // same block, multiple boxes -- not an overlap
      const currentBottom = current.box.y + current.box.height;
      if (currentBottom > next.box.y && next.box.y > current.box.y) {
        current.box.height = next.box.y - current.box.y;
      }
    }
  }
}

/**
 * Adds outward breathing room to every answer's bounding box(es), clamped
 * per-page so adjacent boxes never overlap even when the source (a vision
 * model's raw guess, or the deterministic text-layer boxes) placed them
 * close together. Applies uniformly regardless of where the box came from
 * -- the PDF text-layer path already pads itself, but the image-upload /
 * scanned-page fallback (raw Gemini boxes) previously had none at all,
 * which is what made the highlight look like it was underlining the last
 * line instead of enclosing the block with margin.
 */
export function padAnswerBoundingBoxes(answers: ExtractedAnswerBlock[]): void {
  const all = answers.flatMap((answer) => answer.boundingBoxes);
  if (all.length === 0) return;

  // Compute every box's new geometry from the original (unpadded) values
  // first, then write back -- padding box[0] must not use an
  // already-padded box[1] as its "neighbor" when computing box[1]'s own gap.
  const originals = all.map((box) => ({ ...box }));
  const padded = all.map((box, i) => {
    let gapAbove = Infinity;
    let gapBelow = Infinity;
    const boxBottom = box.y + box.height;
    for (let j = 0; j < originals.length; j++) {
      if (j === i) continue;
      const other = originals[j]!;
      if (other.page !== box.page) continue;
      const otherBottom = other.y + other.height;
      if (otherBottom <= box.y) gapAbove = Math.min(gapAbove, box.y - otherBottom);
      if (other.y >= boxBottom) gapBelow = Math.min(gapBelow, other.y - boxBottom);
    }
    const padTop = Math.min(DESIRED_PAD_Y, gapAbove / 2);
    const padBottom = Math.min(DESIRED_PAD_Y, gapBelow / 2);

    const x = Math.max(0, box.x - PAD_X);
    const y = Math.max(0, box.y - padTop);
    const right = Math.min(1, box.x + box.width + PAD_X);
    const bottom = Math.min(1, boxBottom + padBottom);
    return { x, y, width: right - x, height: bottom - y };
  });

  all.forEach((box, i) => {
    Object.assign(box, padded[i]);
  });
}
