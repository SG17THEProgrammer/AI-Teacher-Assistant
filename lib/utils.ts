import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)}KB`;
  return `${(kb / 1024).toFixed(1)}MB`;
}

export function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

export const ACCEPTED_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'] as const;

export function isAcceptedFile(file: { type: string; name: string }): boolean {
  if ((ACCEPTED_MIME_TYPES as readonly string[]).includes(file.type)) return true;
  // Some browsers/OSes report inconsistent MIME types for images; fall back
  // to extension checking so a valid .png/.jpg/.jpeg/.pdf is never rejected.
  return /\.(pdf|png|jpe?g)$/i.test(file.name);
}

export function maxUploadBytes(): number {
  const mb = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? 10);
  return mb * 1024 * 1024;
}
