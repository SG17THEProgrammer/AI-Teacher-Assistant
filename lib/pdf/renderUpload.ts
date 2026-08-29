import { renderPdfToImages, normalizeImageUpload, type RenderedPage } from './pdfToImages';

/**
 * Single entry point that turns *any* accepted upload (PDF, PNG, JPG, JPEG)
 * into the same `RenderedPage[]` shape. Callers render once and reuse the
 * result for both OCR and (for the answer sheet) serving page images to the
 * viewer, so bounding boxes computed during OCR line up exactly with what
 * the teacher sees on screen.
 */
export async function renderUploadToPages(
  buffer: Buffer,
  mimeType: string
): Promise<RenderedPage[]> {
  return mimeType === 'application/pdf'
    ? renderPdfToImages(buffer)
    : normalizeImageUpload(buffer);
}
