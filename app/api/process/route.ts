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
import type { ProcessingProgressEvent, SessionData } from '@/types/session';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest): Promise<Response> {
  const contentType = req.headers.get('content-type') ?? '';
  let sessionId: string;

  if (contentType.includes('multipart/form-data')) {
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
      // Helper: sends a progress event. The final 'done' event also carries
      // the complete session snapshot so the client never needs a separate
      // GET /api/session call (which could hit a different cold lambda).
      const send = (event: ProcessingProgressEvent & { session?: SessionData }) => {
        sessionStore.update(sessionId, { stage: event.stage });
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        send({ stage: 'extracting-questions', percent: 5, message: 'Reading question paper…' });

        const [qpBuffer, asBuffer] = await Promise.all([
          readStoredFile(session.questionPaper!.storedPath),
          readStoredFile(session.answerSheet!.storedPath),
        ]);

        const [questionPages, answerPages] = await Promise.all([
          renderUploadToPages(qpBuffer, session.questionPaper!.mimeType),
          renderUploadToPages(asBuffer, session.answerSheet!.mimeType),
        ]);

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

        // Build the final session state
        const finalSession = sessionStore.update(sessionId, { grading, stage: 'done' });

        // Embed the full session in the done event so the client can
        // render results immediately without a follow-up GET that might
        // hit a different (empty) serverless instance.
        send({
          stage: 'done',
          percent: 100,
          message: 'Done.',
          session: finalSession,
        });
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