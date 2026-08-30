import { NextRequest } from 'next/server';
import { nanoid } from 'nanoid';
import { sessionStore } from '@/lib/store/sessionStore';
import { readStoredFile, savePageImages, validateAndStoreUpload, UploadValidationError } from '@/lib/store/fileStorage';
import { renderUploadToPages } from '@/lib/pdf/renderUpload';
import { extractQuestionsFromPages } from '@/lib/ocr/questionPipeline';
import { extractAnswersFromPages } from '@/lib/ocr/answerPipeline';
import { insertAnswerGaps } from '@/lib/pdf/insertAnswerGaps';
import { runMappingEngine } from '@/lib/mapping/mappingEngine';
import { runGradingEngine } from '@/lib/grading/gradingEngine';
import type { ProcessingProgressEvent } from '@/types/session';

export const runtime = 'nodejs';
export const maxDuration = 60; // matches the <60s upload-to-result target

/**
 * Orchestrates the full pipeline as one Server-Sent Events stream:
 *
 *   extracting-questions + extracting-answers (run in parallel)
 *   -> mapping
 *   -> grading
 *   -> done
 *
 * Streaming progress (rather than one blocking request) is what lets the
 * "Extracting..." screen in the design show real stage-by-stage feedback,
 * and lets question-paper and answer-sheet OCR overlap instead of running
 * back to back -- the main lever for hitting the 60s performance target.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const contentType = req.headers.get('content-type') ?? '';
  let sessionId: string;

  if (contentType.includes('multipart/form-data')) {
    // Instance-safe path: the actual file bytes travel with THIS request, so
    // the whole pipeline runs start-to-finish on one lambda instance. The
    // old flow required a prior /api/upload call's result (an in-memory
    // sessionStore entry + a /tmp file) to still be visible here -- but
    // Vercel gives no guarantee that two separate requests, even seconds
    // apart from the same browser, land on the same warm instance. That
    // gap is exactly what produced "Both files must be uploaded before
    // processing" despite both having genuinely been uploaded (more likely
    // on a slow mobile connection, which widens the gap between requests).
    try {
      const formData = await req.formData();
      const questionPaperFile = formData.get('questionPaper');
      const answerSheetFile = formData.get('answerSheet');
      const providedSessionId = formData.get('sessionId');

      if (!(questionPaperFile instanceof File) || !(answerSheetFile instanceof File)) {
        return new Response('Both questionPaper and answerSheet files are required.', { status: 400 });
      }

      sessionId = typeof providedSessionId === 'string' && providedSessionId ? providedSessionId : nanoid(12);
      sessionStore.getOrCreate(sessionId);

      const [questionPaperMeta, answerSheetMeta] = await Promise.all([
        validateAndStoreUpload(sessionId, questionPaperFile),
        validateAndStoreUpload(sessionId, answerSheetFile),
      ]);
      sessionStore.update(sessionId, { questionPaper: questionPaperMeta, answerSheet: answerSheetMeta });
    } catch (err) {
      const status = err instanceof UploadValidationError ? 400 : 500;
      return new Response(err instanceof Error ? err.message : 'Upload failed unexpectedly.', { status });
    }
  } else {
    // Legacy path: sessionId referencing files already stored by a prior
    // /api/upload call. Kept for the integration test and any external
    // caller that still uses the two-step flow; only instance-safe when
    // both requests happen to land on the same warm lambda (true by
    // construction in a local/single-process test run).
    const body = await req.json();
    if (typeof body.sessionId !== 'string') {
      return new Response('sessionId is required', { status: 400 });
    }
    sessionId = body.sessionId;
  }

  const session = sessionStore.get(sessionId);
  if (!session?.questionPaper || !session?.answerSheet) {
    return new Response('Both files must be uploaded before processing.', { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ProcessingProgressEvent) => {
        sessionStore.update(sessionId, { stage: event.stage });
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        send({ stage: 'extracting-questions', percent: 5, message: 'Reading question paper…' });

        const [qpBuffer, asBuffer] = await Promise.all([
          readStoredFile(session.questionPaper!.storedPath),
          readStoredFile(session.answerSheet!.storedPath),
        ]);

        // Render both documents to page images once. The answer sheet's
        // rendered pages are persisted immediately so the results screen's
        // viewer can fetch the exact pixels OCR will run against -- this is
        // what keeps highlight overlays pixel-aligned regardless of how the
        // browser would otherwise render the source PDF itself.
        const [questionPages, answerPages] = await Promise.all([
          renderUploadToPages(qpBuffer, session.questionPaper!.mimeType),
          renderUploadToPages(asBuffer, session.answerSheet!.mimeType),
        ]);

        // Question and answer extraction run concurrently -- they are
        // independent until the mapping stage, so there is no reason to
        // serialize them and every second here counts toward the 60s budget.
        const [questionResult, answerResult] = await Promise.all([
          extractQuestionsFromPages(
            questionPages,
            (done, total) =>
              send({
                stage: 'extracting-questions',
                percent: 5 + Math.round((done / total) * 30),
                message: `Extracting questions… (page ${done} of ${total})`,
              }),
            qpBuffer,
            session.questionPaper!.mimeType,
          ),
          (async () => {
            send({ stage: 'extracting-answers', percent: 10, message: 'Reading answer sheet…' });
            return extractAnswersFromPages(
              answerPages,
              (done, total) =>
                send({
                  stage: 'extracting-answers',
                  percent: 35 + Math.round((done / total) * 30),
                  message: `Reading handwriting… (page ${done} of ${total})`,
                }),
              asBuffer,
              session.answerSheet!.mimeType,
            );
          })(),
        ]);

        // Now that every answer's final bounding box is known, redraw any
        // page whose blocks are packed tighter than a readable gap -- this
        // physically inserts blank rows into the page image itself (the
        // only way to add spacing on what is ultimately a flat raster),
        // remapping boxes in place to match. Saved after extraction so OCR
        // still ran against the original, untouched pixels.
        const spacedAnswerPages = await insertAnswerGaps(answerPages, answerResult.answers);
        await savePageImages(sessionId, 'answerSheet', spacedAnswerPages);

        sessionStore.update(sessionId, {
          questions: questionResult.questions,
          answers: answerResult.answers,
        });

        send({ stage: 'mapping', percent: 70, message: 'Mapping answers to questions…' });
        const mapping = await runMappingEngine(questionResult.questions, answerResult.answers);
        sessionStore.update(sessionId, { mapping });

        send({ stage: 'grading', percent: 85, message: 'Grading and generating feedback…' });
        const grading = await runGradingEngine(questionResult.questions, answerResult.answers, mapping);
        sessionStore.update(sessionId, { grading, stage: 'done' });

        send({ stage: 'done', percent: 100, message: 'Done.' });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Processing failed unexpectedly.';
        sessionStore.update(sessionId, { stage: 'error', errorMessage: message });
        send({ stage: 'error', percent: 100, message: 'Processing failed.', error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}