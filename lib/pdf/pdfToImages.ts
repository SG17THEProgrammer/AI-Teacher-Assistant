import path from 'node:path';
import sharp from 'sharp';
import { createCanvas } from 'canvas';

export async function getPdfPageCount(buffer: Buffer): Promise<number> {
  const pdfParse = (await import('pdf-parse')).default;
  const result = await pdfParse(buffer, { max: 1 });
  return result.numpages;
}

export interface RenderedPage {
  pageNumber: number;
  pngBuffer: Buffer;
  width: number;
  height: number;
}

export async function renderPdfToImages(
  pdfBuffer: Buffer,
  opts: { targetDpi?: number; maxDimensionPx?: number } = {}
): Promise<RenderedPage[]> {
  const targetDpi = opts.targetDpi ?? 200;
  const maxDimensionPx = opts.maxDimensionPx ?? 2200;

  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  // Inject the worker module into globalThis so pdfjs finds WorkerMessageHandler
  // and runs fully in-process without trying to load any worker file from disk.
  // This is the only approach that survives Next.js bundling on the server side.
  if (!(globalThis as any).pdfjsWorker) {
    (globalThis as any).pdfjsWorker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs' as any);
  }

  // Non-embedded fonts (e.g. Helvetica) are drawn as vector glyph paths built
  // from pdfjs's bundled standard font metrics — without this pdfjs silently
  // drops every glyph it can't resolve, rendering text-only pages blank.
  // pdfjs's Node factory passes this straight to fs.readFile, not a URL
  // parser, so it must be a plain filesystem path (a file:// string fails
  // with ENOENT since fs treats it as a literal path, not a URL to resolve).
  const standardFontDataUrl = `${path.join(process.cwd(), 'node_modules/pdfjs-dist/standard_fonts')}${path.sep}`;

  // No CanvasFactory override here — pdfjs's own Node build already creates
  // auxiliary canvases (Type3 glyphs, soft masks, patterns) via the `canvas`
  // package when running under Node, as long as it's installed.
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    // useSystemFonts assumes @font-face/OS font rendering (disableFontFace:
    // false); combined with disableFontFace: true it made pdfjs skip
    // fetching standard font data entirely, silently dropping all
    // non-embedded-font glyphs (buildFontPaths never ran since font.data
    // stayed null) — every standard-font page rendered with no visible text.
    useSystemFonts: false,
    disableFontFace: true,
    useWorkerFetch: false,
    isEvalSupported: false,
    disableRange: true,
    disableStream: true,
    standardFontDataUrl,
  } as any).promise;

  const pages: RenderedPage[] = [];
  const scale = targetDpi / 72;

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });

    let renderScale = scale;
    const longestEdge = Math.max(viewport.width, viewport.height);
    if (longestEdge > maxDimensionPx) {
      renderScale = scale * (maxDimensionPx / longestEdge);
    }
    const finalViewport = page.getViewport({ scale: renderScale });

    const width = Math.ceil(finalViewport.width);
    const height = Math.ceil(finalViewport.height);
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');

    await page.render({
      canvasContext: context,
      viewport: finalViewport,
    } as any).promise;

    const pngBuffer = canvas.toBuffer('image/png');
    pages.push({ pageNumber, pngBuffer, width, height });
  }

  return pages;
}

export async function normalizeImageUpload(buffer: Buffer): Promise<RenderedPage[]> {
  const image = sharp(buffer).rotate();
  const metadata = await image.metadata();
  const width = metadata.width ?? 1000;
  const height = metadata.height ?? 1400;

  const minDimension = Math.min(width, height);
  const needsUpscale = minDimension < 900;
  const pipeline = needsUpscale
    ? image.resize({ width: Math.round(width * (1200 / minDimension)) })
    : image;

  const pngBuffer = await pipeline.png({ compressionLevel: 9 }).toBuffer();
  const finalMeta = await sharp(pngBuffer).metadata();

  return [{
    pageNumber: 1,
    pngBuffer,
    width: finalMeta.width ?? width,
    height: finalMeta.height ?? height,
  }];
}

export async function enhanceForOcr(pngBuffer: Buffer): Promise<Buffer> {
  return sharp(pngBuffer)
    .normalize()
    .sharpen({ sigma: 1 })
    .png({ compressionLevel: 9 })
    .toBuffer();
}