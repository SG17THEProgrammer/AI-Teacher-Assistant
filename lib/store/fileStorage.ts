// import { mkdir, writeFile, readFile, rm } from 'fs/promises';
// import path from 'path';
// import os from 'os';
// import { nanoid } from 'nanoid';
// import { getPdfPageCount } from '@/lib/pdf/pdfToImages';
// import { isAcceptedFile, maxUploadBytes } from '@/lib/utils';
// import type { UploadedFileMeta } from '@/types/session';

// /**
//  * Temporary local storage, exactly as the spec requires ("Storage:
//  * Temporary local storage, No database"). Files live under the OS tmp dir,
//  * namespaced by session, and are deleted once a session ends or expires.
//  *
//  * On Vercel's serverless filesystem this resolves to /tmp, which is
//  * writable but ephemeral per-invocation -- acceptable here because the
//  * whole pipeline (upload -> extract -> map -> grade) runs within a single
//  * request lifecycle for a given session; nothing needs to survive a cold
//  * start. This constraint is documented in skills/Deployment Guide.md.
//  */
// const ROOT = path.join(os.tmpdir(), 'veda-ai-checker');

// function sessionDir(sessionId: string): string {
//   return path.join(ROOT, sessionId);
// }

// export async function saveUploadedFile(
//   sessionId: string,
//   fileId: string,
//   buffer: Buffer,
//   extension: string
// ): Promise<string> {
//   const dir = sessionDir(sessionId);
//   await mkdir(dir, { recursive: true });
//   const filePath = path.join(dir, `${fileId}.${extension}`);
//   await writeFile(filePath, buffer);
//   return filePath;
// }

// export async function readStoredFile(filePath: string): Promise<Buffer> {
//   return readFile(filePath);
// }

// export async function deleteSessionFiles(sessionId: string): Promise<void> {
//   await rm(sessionDir(sessionId), { recursive: true, force: true });
// }

// /**
//  * Stores the rasterized page images for a given document ("questionPaper"
//  * or "answerSheet") so the frontend viewer can request the exact pixels
//  * OCR ran against -- this is what keeps highlight bounding boxes aligned
//  * regardless of the browser's own PDF rendering quirks.
//  */
// export async function savePageImages(
//   sessionId: string,
//   kind: 'questionPaper' | 'answerSheet',
//   pages: { pageNumber: number; pngBuffer: Buffer }[]
// ): Promise<void> {
//   const dir = path.join(sessionDir(sessionId), 'pages', kind);
//   await mkdir(dir, { recursive: true });
//   await Promise.all(
//     pages.map((p) => writeFile(path.join(dir, `${p.pageNumber}.png`), p.pngBuffer))
//   );
// }

// export async function readPageImage(
//   sessionId: string,
//   kind: 'questionPaper' | 'answerSheet',
//   pageNumber: number
// ): Promise<Buffer> {
//   const filePath = path.join(sessionDir(sessionId), 'pages', kind, `${pageNumber}.png`);
//   return readFile(filePath);
// }

// export class UploadValidationError extends Error {}

// const EXTENSION_BY_MIME: Record<string, string> = {
//   'application/pdf': 'pdf',
//   'image/png': 'png',
//   'image/jpeg': 'jpg',
//   'image/jpg': 'jpg',
// };

// /**
//  * Validates and persists one uploaded file, shared by both /api/upload
//  * (early per-file feedback while the teacher is still on the upload
//  * screen) and /api/process's own multipart path (see there for why the
//  * critical path re-validates and re-stores rather than trusting a prior
//  * /api/upload call's result).
//  */
// export async function validateAndStoreUpload(
//   sessionId: string,
//   file: File
// ): Promise<UploadedFileMeta> {
//   if (!isAcceptedFile(file)) {
//     throw new UploadValidationError(
//       `Unsupported file type for "${file.name}". Please upload a PDF, PNG, JPG, or JPEG.`
//     );
//   }
//   if (file.size > maxUploadBytes()) {
//     throw new UploadValidationError(
//       `"${file.name}" exceeds the ${process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? 10}MB limit.`
//     );
//   }
//   if (file.size === 0) {
//     throw new UploadValidationError(`"${file.name}" is empty.`);
//   }

//   const buffer = Buffer.from(await file.arrayBuffer());
//   const mimeType = resolveMimeType(file);
//   const extension = EXTENSION_BY_MIME[mimeType] ?? 'bin';
//   const fileId = nanoid(10);
//   const storedPath = await saveUploadedFile(sessionId, fileId, buffer, extension);
//   const pageCount = mimeType === 'application/pdf' ? await safePageCount(buffer) : 1;

//   return {
//     fileId,
//     originalName: file.name,
//     mimeType,
//     sizeBytes: file.size,
//     pageCount,
//     storedPath,
//   };
// }

// function resolveMimeType(file: File): string {
//   if (file.type && EXTENSION_BY_MIME[file.type]) return file.type;
//   if (/\.pdf$/i.test(file.name)) return 'application/pdf';
//   if (/\.png$/i.test(file.name)) return 'image/png';
//   if (/\.jpe?g$/i.test(file.name)) return 'image/jpeg';
//   return file.type || 'application/octet-stream';
// }

// async function safePageCount(buffer: Buffer): Promise<number> {
//   try {
//     return await getPdfPageCount(buffer);
//   } catch {
//     return 1; // corrupt/unreadable metadata shouldn't block upload; extraction will surface the real error later
//   }
// }

import { put, list, del } from '@vercel/blob';
import { nanoid } from 'nanoid';
import { getPdfPageCount } from '@/lib/pdf/pdfToImages';
import { isAcceptedFile, maxUploadBytes } from '@/lib/utils';
import type { UploadedFileMeta } from '@/types/session';

export async function saveUploadedFile(
  sessionId: string,
  fileId: string,
  buffer: Buffer,
  extension: string
): Promise<string> {
  const blobPath = `${sessionId}/${fileId}.${extension}`;
  
  // Save the file to Vercel Blob and ensure the URL matches our path exactly
  const blob = await put(blobPath, buffer, {
    access: 'public',
    addRandomSuffix: false,
  });
  
  // Return the public URL instead of a local file path
  return blob.url; 
}

export async function readStoredFile(fileUrl: string): Promise<Buffer> {
  // Since our "path" is now a URL, we can fetch it directly into a buffer
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch file from Blob storage: ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export async function deleteSessionFiles(sessionId: string): Promise<void> {
  // Vercel Blob is a flat system, so we delete by prefix (folder name)
  let cursor;
  do {
    const { blobs, cursor: nextCursor } = await list({
      prefix: `${sessionId}/`,
      cursor,
    });
    if (blobs.length > 0) {
      await del(blobs.map((b) => b.url));
    }
    cursor = nextCursor;
  } while (cursor);
}

export async function savePageImages(
  sessionId: string,
  kind: 'questionPaper' | 'answerSheet',
  pages: { pageNumber: number; pngBuffer: Buffer }[]
): Promise<void> {
  await Promise.all(
    pages.map((p) => {
      const blobPath = `${sessionId}/pages/${kind}/${p.pageNumber}.png`;
      return put(blobPath, p.pngBuffer, {
        access: 'public',
        addRandomSuffix: false,
      });
    })
  );
}

// Added this helper specifically to make your API route simpler
export async function getPageImageUrl(
  sessionId: string,
  kind: 'questionPaper' | 'answerSheet',
  pageNumber: number
): Promise<string | null> {
  const blobPath = `${sessionId}/pages/${kind}/${pageNumber}.png`;
  const { blobs } = await list({ prefix: blobPath, limit: 1 });
  return blobs.length > 0 ? blobs[0].url : null;
}

export async function readPageImage(
  sessionId: string,
  kind: 'questionPaper' | 'answerSheet',
  pageNumber: number
): Promise<Buffer> {
  const url = await getPageImageUrl(sessionId, kind, pageNumber);
  if (!url) throw new Error(`Page image not found for session ${sessionId}`);
  return readStoredFile(url);
}

export class UploadValidationError extends Error {}

const EXTENSION_BY_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
};

export async function validateAndStoreUpload(
  sessionId: string,
  file: File
): Promise<UploadedFileMeta> {
  if (!isAcceptedFile(file)) {
    throw new UploadValidationError(
      `Unsupported file type for "${file.name}". Please upload a PDF, PNG, JPG, or JPEG.`
    );
  }
  if (file.size > maxUploadBytes()) {
    throw new UploadValidationError(
      `"${file.name}" exceeds the ${process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? 10}MB limit.`
    );
  }
  if (file.size === 0) {
    throw new UploadValidationError(`"${file.name}" is empty.`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = resolveMimeType(file);
  const extension = EXTENSION_BY_MIME[mimeType] ?? 'bin';
  const fileId = nanoid(10);
  
  // storedPath will now natively hold the Vercel Blob URL!
  const storedPath = await saveUploadedFile(sessionId, fileId, buffer, extension);
  const pageCount = mimeType === 'application/pdf' ? await safePageCount(buffer) : 1;

  return {
    fileId,
    originalName: file.name,
    mimeType,
    sizeBytes: file.size,
    pageCount,
    storedPath,
  };
}

function resolveMimeType(file: File): string {
  if (file.type && EXTENSION_BY_MIME[file.type]) return file.type;
  if (/\.pdf$/i.test(file.name)) return 'application/pdf';
  if (/\.png$/i.test(file.name)) return 'image/png';
  if (/\.jpe?g$/i.test(file.name)) return 'image/jpeg';
  return file.type || 'application/octet-stream';
}

async function safePageCount(buffer: Buffer): Promise<number> {
  try {
    return await getPdfPageCount(buffer);
  } catch {
    return 1; 
  }
}