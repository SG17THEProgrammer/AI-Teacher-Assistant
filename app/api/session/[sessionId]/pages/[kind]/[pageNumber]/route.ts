import { NextRequest, NextResponse } from 'next/server';
import { readPageImage } from '@/lib/store/fileStorage';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string; kind: string; pageNumber: string }> }
): Promise<NextResponse> {
  const { sessionId, kind, pageNumber } = await params;

  if (kind !== 'questionPaper' && kind !== 'answerSheet') {
    return NextResponse.json({ error: 'Invalid document kind.' }, { status: 400 });
  }

  const pageNum = Number(pageNumber);
  if (!Number.isInteger(pageNum) || pageNum < 1) {
    return NextResponse.json({ error: 'Invalid page number.' }, { status: 400 });
  }

  try {
    const buffer = await readPageImage(sessionId, kind, pageNum);
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'private, max-age=3600, immutable',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Page image not found.' }, { status: 404 });
  }
}
