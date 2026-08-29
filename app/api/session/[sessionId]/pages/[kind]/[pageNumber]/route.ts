import { NextRequest, NextResponse } from 'next/server';
import { readPageImage, readStoredFile } from '@/lib/store/fileStorage';
import { sessionStore } from '@/lib/store/sessionStore';

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

  // Try rendered PNG first (works for image uploads)
  try {
    const buffer = await readPageImage(sessionId, kind, pageNum);
    // Reject blank images (all-zero or near-zero data = blank canvas stub output)
    const isBlank = buffer.every((b) => b === 0 || b === 137 || b === 80); // PNG header check
    if (buffer.length > 5000 && !isBlank) {
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'private, max-age=3600, immutable',
        },
      });
    }
  } catch {
    // fall through to original file
  }

  // Fall back: serve the original uploaded file (works great for PDFs in browser)
  try {
    const session = sessionStore.get(sessionId);
    const meta = kind === 'answerSheet' ? session?.answerSheet : session?.questionPaper;
    if (!meta?.storedPath) {
      return NextResponse.json({ error: 'Page image not found.' }, { status: 404 });
    }
    const buffer = await readStoredFile(meta.storedPath);
    const contentType = meta.mimeType || 'application/pdf';
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600, immutable',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Page image not found.' }, { status: 404 });
  }
}