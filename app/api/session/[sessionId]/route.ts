import { NextRequest, NextResponse } from 'next/server';
import { sessionStore } from '@/lib/store/sessionStore';
import { deleteSessionFiles } from '@/lib/store/fileStorage';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  const { sessionId } = await params;
  const session = sessionStore.get(sessionId);
  if (!session) {
    return NextResponse.json({ error: 'Session not found or has expired.' }, { status: 404 });
  }
  return NextResponse.json(session);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  const { sessionId } = await params;
  await deleteSessionFiles(sessionId);
  sessionStore.delete(sessionId);
  return NextResponse.json({ ok: true });
}
