// // import { NextRequest, NextResponse } from 'next/server';
// // import { readPageImage, readStoredFile } from '@/lib/store/fileStorage';
// // import { sessionStore } from '@/lib/store/sessionStore';

// // export const runtime = 'nodejs';

// // export async function GET(
// //   _req: NextRequest,
// //   { params }: { params: Promise<{ sessionId: string; kind: string; pageNumber: string }> }
// // ): Promise<NextResponse> {
// //   const { sessionId, kind, pageNumber } = await params;

// //   if (kind !== 'questionPaper' && kind !== 'answerSheet') {
// //     return NextResponse.json({ error: 'Invalid document kind.' }, { status: 400 });
// //   }

// //   const pageNum = Number(pageNumber);
// //   if (!Number.isInteger(pageNum) || pageNum < 1) {
// //     return NextResponse.json({ error: 'Invalid page number.' }, { status: 400 });
// //   }

// //   // Try rendered PNG first (works for both PDF and image uploads)
// //   try {
// //     const buffer = await readPageImage(sessionId, kind, pageNum);
// //     if (buffer.length > 0) {
// //       return new NextResponse(new Uint8Array(buffer), {
// //         headers: {
// //           'Content-Type': 'image/png',
// //           'Cache-Control': 'private, max-age=3600, immutable',
// //         },
// //       });
// //     }
// //   } catch {
// //     // fall through to original file
// //   }

// //   // Fall back: serve the original uploaded file (works great for PDFs in browser)
// //   try {
// //     const session = sessionStore.get(sessionId);
// //     const meta = kind === 'answerSheet' ? session?.answerSheet : session?.questionPaper;
// //     if (!meta?.storedPath) {
// //       return NextResponse.json({ error: 'Page image not found.' }, { status: 404 });
// //     }
// //     const buffer = await readStoredFile(meta.storedPath);
// //     const contentType = meta.mimeType || 'application/pdf';
// //     return new NextResponse(new Uint8Array(buffer), {
// //       headers: {
// //         'Content-Type': contentType,
// //         'Cache-Control': 'private, max-age=3600, immutable',
// //       },
// //     });
// //   } catch {
// //     return NextResponse.json({ error: 'Page image not found.' }, { status: 404 });
// //   }
// // }
// import { NextRequest, NextResponse } from 'next/server';
// // Import the new helper we created in fileStorage.ts
// import { getPageImageUrl } from '@/lib/store/fileStorage';
// import { sessionStore } from '@/lib/store/sessionStore';

// export const runtime = 'nodejs';

// export async function GET(
//   _req: NextRequest,
//   { params }: { params: Promise<{ sessionId: string; kind: string; pageNumber: string }> }
// ): Promise<NextResponse> {
//   const { sessionId, kind, pageNumber } = await params;

//   if (kind !== 'questionPaper' && kind !== 'answerSheet') {
//     return NextResponse.json({ error: 'Invalid document kind.' }, { status: 400 });
//   }

//   const pageNum = Number(pageNumber);
//   if (!Number.isInteger(pageNum) || pageNum < 1) {
//     return NextResponse.json({ error: 'Invalid page number.' }, { status: 400 });
//   }

//   // 1. Try rendered PNG first (works for both PDF and image uploads)
//   try {
//     const pngUrl = await getPageImageUrl(sessionId, kind, pageNum);
//     if (pngUrl) {
//       // Redirect the frontend straight to the Vercel Blob URL
//       return NextResponse.redirect(pngUrl);
//     }
//   } catch (error) {
//     // fall through to original file
//   }

//   // 2. Fall back: serve the original uploaded file (works great for PDFs in browser)
//   try {
//     const session = sessionStore.get(sessionId);
//     const meta = kind === 'answerSheet' ? session?.answerSheet : session?.questionPaper;
    
//     if (!meta?.storedPath) {
//       return NextResponse.json({ error: 'Page image not found.' }, { status: 404 });
//     }
    
//     // Because we updated validateAndStoreUpload in the last step, 
//     // meta.storedPath is now the actual Vercel Blob URL!
//     return NextResponse.redirect(meta.storedPath);
//   } catch {
//     return NextResponse.json({ error: 'Page image not found.' }, { status: 404 });
//   }
// }

import { NextRequest, NextResponse } from 'next/server';
import { getPageImageUrl } from '@/lib/store/fileStorage';
import { sessionStore } from '@/lib/store/sessionStore';
import { head } from '@vercel/blob';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  // Fix: Changed `kind` back to `string` to satisfy Next.js route parameter types
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

  // We explicitly tell TypeScript this is safe because we just checked it above
  const validKind = kind as 'questionPaper' | 'answerSheet';

  // 1. Try rendered PNG first
  try {
    const pngUrl = await getPageImageUrl(sessionId, validKind, pageNum);
    if (pngUrl) {
      return NextResponse.redirect(pngUrl);
    }
  } catch {
    // fall through to original file
  }

  // 2. Fall back: serve the original uploaded file
  let session = sessionStore.get(sessionId);

  // If memory is wiped (Vercel cold start), recover it from Blob!
  if (!session) {
    try {
      const blob = await head(`${sessionId}/session.json`);
      const res = await fetch(blob.url);
      session = await res.json();
    } catch (e) {
      console.error("Could not recover session from Blob");
    }
  }

  const meta = validKind === 'answerSheet' ? session?.answerSheet : session?.questionPaper;
  
  if (!meta?.storedPath) {
    return NextResponse.json({ error: 'Page image not found.' }, { status: 404 });
  }
  
  return NextResponse.redirect(meta.storedPath);
}