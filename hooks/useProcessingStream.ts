import { useCallback, useRef, useState } from 'react';
import type { ProcessingProgressEvent, ProcessingStage, SessionData } from '@/types/session';

export interface ProcessingStreamState {
  stage: ProcessingStage;
  percent: number;
  message: string;
  error: string | null;
  /** Full session snapshot delivered inline with the 'done' SSE event,
   *  so the client never needs a separate GET /api/session call that could
   *  land on a different (empty) serverless instance. */
  sessionSnapshot: SessionData | null;
}

const INITIAL_STATE: ProcessingStreamState = {
  stage: 'idle',
  percent: 0,
  message: '',
  error: null,
  sessionSnapshot: null,
};

export function useProcessingStream() {
  const [state, setState] = useState<ProcessingStreamState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(
    (sessionId: string, files: { questionPaper: File; answerSheet: File }, onDone: (snapshot: SessionData | null) => void) => {
      setState(INITIAL_STATE);
      const controller = new AbortController();
      abortRef.current = controller;

      (async () => {
        try {
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
          let finalSnapshot: SessionData | null = null;

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
              const event: ProcessingProgressEvent & { session?: SessionData } = JSON.parse(json);

              // Capture the inline session snapshot if the server sent one
              if (event.session) {
                finalSnapshot = event.session;
              }

              setState({
                stage: event.stage,
                percent: event.percent,
                message: event.message,
                error: event.error ?? null,
                sessionSnapshot: finalSnapshot,
              });

              if (event.stage === 'done' || event.stage === 'error') {
                onDone(finalSnapshot);
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
          onDone(null);
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