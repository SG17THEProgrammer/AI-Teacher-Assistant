import { useCallback, useState } from 'react';
import type { DropzoneFile } from '@/components/upload/UploadDropzone';

interface UploadResponse {
  sessionId: string;
  file: { fileId: string; pageCount: number };
}

export function useUploadFiles() {
  const [isSubmitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (
      questionPaper: DropzoneFile,
      answerSheet: DropzoneFile
    ): Promise<string | null> => {
      setSubmitting(true);
      setError(null);
      try {
        const qpResult = await uploadOne(questionPaper.file, 'questionPaper', null);
        const asResult = await uploadOne(answerSheet.file, 'answerSheet', qpResult.sessionId);
        return asResult.sessionId;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
        return null;
      } finally {
        setSubmitting(false);
      }
    },
    []
  );

  return { upload, isSubmitting, error };
}

async function uploadOne(
  file: File,
  kind: 'questionPaper' | 'answerSheet',
  sessionId: string | null
): Promise<UploadResponse> {
  const form = new FormData();
  form.append('file', file);
  form.append('kind', kind);
  if (sessionId) form.append('sessionId', sessionId);

  const res = await fetch('/api/upload', { method: 'POST', body: form });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error ?? `Failed to upload ${kind}.`);
  }
  return body;
}
