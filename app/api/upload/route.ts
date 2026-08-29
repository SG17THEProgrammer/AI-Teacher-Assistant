import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { saveUploadedFile } from '@/lib/store/fileStorage';
import { sessionStore } from '@/lib/store/sessionStore';
import { getPdfPageCount } from '@/lib/pdf/pdfToImages';
import { isAcceptedFile, maxUploadBytes } from '@/lib/utils';
import type { UploadedFileMeta } from '@/types/session';

export const runtime = 'nodejs';

const EXTENSION_BY_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const kind = formData.get('kind');
    let sessionId = formData.get('sessionId');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing file field.' }, { status: 400 });
    }
    if (kind !== 'questionPaper' && kind !== 'answerSheet') {
      return NextResponse.json(
        { error: 'kind must be "questionPaper" or "answerSheet".' },
        { status: 400 }
      );
    }
    if (!isAcceptedFile(file)) {
      return NextResponse.json(
        { error: 'Unsupported file type. Please upload a PDF, PNG, JPG, or JPEG.' },
        { status: 400 }
      );
    }
    if (file.size > maxUploadBytes()) {
      return NextResponse.json(
        { error: `File exceeds the ${process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? 10}MB limit.` },
        { status: 400 }
      );
    }
    if (file.size === 0) {
      return NextResponse.json({ error: 'The uploaded file is empty.' }, { status: 400 });
    }

    if (typeof sessionId !== 'string' || !sessionId) {
      sessionId = nanoid(12);
    }
    sessionStore.getOrCreate(sessionId as string);

    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = resolveMimeType(file);
    const extension = EXTENSION_BY_MIME[mimeType] ?? 'bin';
    const fileId = nanoid(10);

    const storedPath = await saveUploadedFile(sessionId as string, fileId, buffer, extension);
    const pageCount = mimeType === 'application/pdf' ? await safePageCount(buffer) : 1;

    const meta: UploadedFileMeta = {
      fileId,
      originalName: file.name,
      mimeType,
      sizeBytes: file.size,
      pageCount,
      storedPath,
    };

    sessionStore.update(sessionId as string, {
      [kind === 'questionPaper' ? 'questionPaper' : 'answerSheet']: meta,
    });

    return NextResponse.json({ sessionId, file: meta });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed unexpectedly.' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const { sessionId, kind } = await req.json();
  if (typeof sessionId !== 'string') {
    return NextResponse.json({ error: 'sessionId is required.' }, { status: 400 });
  }
  sessionStore.update(sessionId, {
    [kind === 'questionPaper' ? 'questionPaper' : 'answerSheet']: null,
  });
  return NextResponse.json({ ok: true });
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
    return 1; // corrupt/unreadable metadata shouldn't block upload; extraction will surface the real error later
  }
}
