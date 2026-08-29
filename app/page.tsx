'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { UploadScreen } from '@/components/upload/UploadScreen';
import { ExtractingScreen } from '@/components/processing/ExtractingScreen';
import { ResultsScreen } from '@/components/results/ResultsScreen';
import { useUploadFiles } from '@/hooks/useUpload';
import { useProcessingStream } from '@/hooks/useProcessingStream';
import { useSessionData } from '@/hooks/useSessionData';
import {
  usePersistedSession,
  saveSessionToStorage,
  clearSessionFromStorage,
} from '@/hooks/usePersistedSession';
import type { DropzoneFile } from '@/components/upload/UploadDropzone';
import type { SessionData } from '@/types/session';

type Phase = 'upload' | 'processing' | 'results';

export default function Home() {
  const [phase, setPhase] = useState<Phase>('upload');
  const [sessionId, setSessionId] = useState<string | null>(null);
  // When restored from localStorage we show results immediately without refetch
  const [restoredSession, setRestoredSession] = useState<SessionData | null>(null);

  const persisted = usePersistedSession();

  // Restore previous session on first load
  useEffect(() => {
    if (persisted && phase === 'upload') {
      setRestoredSession(persisted.snapshot);
      setSessionId(persisted.sessionId);
      setPhase('results');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persisted]);

  const { upload, isSubmitting, error: uploadError } = useUploadFiles();
  const { state: processingState, start: startProcessing } = useProcessingStream();
  const {
    data: fetchedSession,
    refetch,
    isFetching,
  } = useSessionData(sessionId, phase === 'results' && !restoredSession);

  const session = restoredSession ?? fetchedSession;

  // Persist results to localStorage whenever we get them
  useEffect(() => {
    if (session && sessionId && phase === 'results' && session.stage === 'done') {
      saveSessionToStorage(sessionId, session);
    }
  }, [session, sessionId, phase]);

  const handleStartMapping = async (questionPaper: DropzoneFile, answerSheet: DropzoneFile) => {
    clearSessionFromStorage();
    setRestoredSession(null);
    const newSessionId = await upload(questionPaper, answerSheet);
    if (!newSessionId) return;
    setSessionId(newSessionId);
    setPhase('processing');
    startProcessing(newSessionId, () => {
      setPhase('results');
      refetch();
    });
  };

  const handleGoBack = () => {
    setPhase('upload');
    setRestoredSession(null);
  };

  return (
    <AppShell sidebarCollapsedByDefault={phase === 'processing'}>
      {phase === 'upload' && (
        <UploadScreen
          onStartMapping={handleStartMapping}
          isSubmitting={isSubmitting}
          errorMessage={uploadError}
        />
      )}

      {phase === 'processing' && (
        <ExtractingScreen
          stage={processingState.stage}
          message={processingState.error ?? processingState.message}
          percent={processingState.percent}
        />
      )}

      {phase === 'results' && (
        <>
          {isFetching && !session && (
            <div className="flex h-full items-center justify-center text-sm text-ink-400">
              Loading results…
            </div>
          )}
          {session && !processingState.error && (
            <ResultsScreen session={session} />
          )}
          {processingState.error && (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-lg font-bold text-danger-DEFAULT">Processing failed</p>
              <p className="max-w-md text-sm text-ink-500">{processingState.error}</p>
              <button
                onClick={handleGoBack}
                className="mt-2 rounded-pill bg-ink-900 px-5 py-2 text-sm font-semibold text-white"
              >
                Start over
              </button>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}