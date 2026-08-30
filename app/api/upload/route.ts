
import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { validateAndStoreUpload, UploadValidationError } from '@/lib/store/fileStorage';
import { sessionStore } from '@/lib/store/sessionStore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// NOTE: this route is kept for early per-file feedback while the teacher is
// still on the upload screen (inline "file too large" style errors before
// they even click "Start Mapping"). The actual processing kickoff no longer
// depends on its result surviving into a later request -- see the multipart
// path in /api/process for why (cross-instance session-state risk on
// serverless: this route's sessionStore write and /api/process's read of it
// are not guaranteed to land on the same warm lambda).
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

    if (typeof sessionId !== 'string' || !sessionId) {
      sessionId = nanoid(12);
    }
    sessionStore.getOrCreate(sessionId as string);

    const meta = await validateAndStoreUpload(sessionId as string, file);

    sessionStore.update(sessionId as string, {
      [kind === 'questionPaper' ? 'questionPaper' : 'answerSheet']: meta,
    });

    return NextResponse.json({ sessionId, file: meta });
  } catch (err) {
    const status = err instanceof UploadValidationError ? 400 : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed unexpectedly.' },
      { status }
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
