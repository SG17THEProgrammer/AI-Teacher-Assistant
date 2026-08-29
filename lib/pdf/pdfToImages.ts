import sharp from 'sharp';

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

class NodeCanvasFactory {
  create(width: number, height: number) {
    const canvas = {
      width,
      height,
      _data: new Uint8ClampedArray(width * height * 4),
    } as any;
    const context = {
      canvas, // pdfjs does ctx.canvas.width — must be named 'canvas'
      getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; },
      save() {}, restore() {},
      scale() {}, transform() {}, translate() {},
      setTransform() {}, resetTransform() {},
      beginPath() {}, closePath() {},
      fill() {}, stroke() {}, clip() {},
      moveTo() {}, lineTo() {}, bezierCurveTo() {}, quadraticCurveTo() {}, arc() {}, arcTo() {},
      rect() {}, fillRect() {}, clearRect() {}, strokeRect() {},
      createLinearGradient() { return { addColorStop() {} }; },
      createRadialGradient() { return { addColorStop() {} }; },
      createPattern() { return null; },
      drawImage() {},
      putImageData(imgData: any, x: number, y: number) {
        canvas._data.set(imgData.data, (y * canvas.width + x) * 4);
      },
      getImageData(_x: number, _y: number, w: number, h: number) {
        return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
      },
      createImageData(w: number, h: number) {
        return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
      },
      measureText() { return { width: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 }; },
      fillText() {}, strokeText() {},
      isPointInPath() { return false; },
    } as any;
    return { canvas, context };
  }

  reset(canvasAndContext: any, width: number, height: number) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
    canvasAndContext.canvas._data = new Uint8ClampedArray(width * height * 4);
  }

  destroy(canvasAndContext: any) {
    canvasAndContext.canvas._data = null;
  }
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

  const canvasFactory = new NodeCanvasFactory();

  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: true,
    disableFontFace: true,
    CanvasFactory: NodeCanvasFactory,
    useWorkerFetch: false,
    isEvalSupported: false,
    disableRange: true,
    disableStream: true,
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
    const canvasAndContext = canvasFactory.create(width, height);

    await page.render({
      canvasContext: canvasAndContext.context,
      viewport: finalViewport,
    } as any).promise;

    const pngBuffer = await sharp(Buffer.from(canvasAndContext.canvas._data.buffer), {
      raw: { width, height, channels: 4 },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();

    canvasFactory.destroy(canvasAndContext);
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