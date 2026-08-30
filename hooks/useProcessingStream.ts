import { useCallback, useRef, useState } from 'react';
import type { ProcessingProgressEvent, ProcessingStage } from '@/types/session';

export interface ProcessingStreamState {
  stage: ProcessingStage;
  percent: number;
  message: string;
  error: string | null;
}

const INITIAL_STATE: ProcessingStreamState = {
  stage: 'idle',
  percent: 0,
  message: '',
  error: null,
};

/**
 * Consumes the fetch-based Server-Sent Events stream from POST /api/process.
 * We use fetch + ReadableStream rather than EventSource because EventSource
 * only supports GET requests, and starting processing needs a POST body
 * (the uploaded files themselves).
 */
export function useProcessingStream() {
  const [state, setState] = useState<ProcessingStreamState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(
    (sessionId: string, files: { questionPaper: File; answerSheet: File }, onDone: () => void) => {
      setState(INITIAL_STATE);
      const controller = new AbortController();
      abortRef.current = controller;

      (async () => {
        try {
          // Files travel with this same request (multipart), rather than
          // referencing a prior /api/upload call's result, so the whole
          // pipeline can run start-to-finish on one serverless instance --
          // see /api/process's own comment for why that matters.
          const form = new FormData();
          form.append('sessionId', sessionId);
          form.append('questionPaper', files.questionPaper);
          form.append('answerSheet', files.answerSheet);

          const response = await fetch('/api/process', {
            method: 'POST',
            body: form,
            signal: controller.signal,
          });

          if (!response.ok || !response.body) {
            throw new Error(await response.text());
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const events = buffer.split('\n\n');
            buffer = events.pop() ?? '';

            for (const raw of events) {
              const line = raw.trim();
              if (!line.startsWith('data:')) continue;
              const json = line.slice('data:'.length).trim();
              if (!json) continue;
              const event: ProcessingProgressEvent = JSON.parse(json);
              setState({
                stage: event.stage,
                percent: event.percent,
                message: event.message,
                error: event.error ?? null,
              });
              if (event.stage === 'done' || event.stage === 'error') {
                onDone();
              }
            }
          }
        } catch (err) {
          if (controller.signal.aborted) return;
          setState((prev) => ({
            ...prev,
            stage: 'error',
            error: err instanceof Error ? err.message : 'Processing failed unexpectedly.',
          }));
          onDone();
        }
      })();
    },
    []
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { state, start, cancel };
}
