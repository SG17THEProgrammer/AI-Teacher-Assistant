import { mkdir, writeFile, readFile, rm } from 'fs/promises';
import path from 'path';
import os from 'os';

/**
 * Temporary local storage, exactly as the spec requires ("Storage:
 * Temporary local storage, No database"). Files live under the OS tmp dir,
 * namespaced by session, and are deleted once a session ends or expires.
 *
 * On Vercel's serverless filesystem this resolves to /tmp, which is
 * writable but ephemeral per-invocation -- acceptable here because the
 * whole pipeline (upload -> extract -> map -> grade) runs within a single
 * request lifecycle for a given session; nothing needs to survive a cold
 * start. This constraint is documented in skills/Deployment Guide.md.
 */
const ROOT = path.join(os.tmpdir(), 'veda-ai-checker');

function sessionDir(sessionId: string): string {
  return path.join(ROOT, sessionId);
}

export async function saveUploadedFile(
  sessionId: string,
  fileId: string,
  buffer: Buffer,
  extension: string
): Promise<string> {
  const dir = sessionDir(sessionId);
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${fileId}.${extension}`);
  await writeFile(filePath, buffer);
  return filePath;
}

export async function readStoredFile(filePath: string): Promise<Buffer> {
  return readFile(filePath);
}

export async function deleteSessionFiles(sessionId: string): Promise<void> {
  await rm(sessionDir(sessionId), { recursive: true, force: true });
}

/**
 * Stores the rasterized page images for a given document ("questionPaper"
 * or "answerSheet") so the frontend viewer can request the exact pixels
 * OCR ran against -- this is what keeps highlight bounding boxes aligned
 * regardless of the browser's own PDF rendering quirks.
 */
export async function savePageImages(
  sessionId: string,
  kind: 'questionPaper' | 'answerSheet',
  pages: { pageNumber: number; pngBuffer: Buffer }[]
): Promise<void> {
  const dir = path.join(sessionDir(sessionId), 'pages', kind);
  await mkdir(dir, { recursive: true });
  await Promise.all(
    pages.map((p) => writeFile(path.join(dir, `${p.pageNumber}.png`), p.pngBuffer))
  );
}

export async function readPageImage(
  sessionId: string,
  kind: 'questionPaper' | 'answerSheet',
  pageNumber: number
): Promise<Buffer> {
  const filePath = path.join(sessionDir(sessionId), 'pages', kind, `${pageNumber}.png`);
  return readFile(filePath);
}
