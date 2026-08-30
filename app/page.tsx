'use client';

import { useEffect, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import { AppShell } from '@/components/layout/AppShell';
import { UploadScreen } from '@/components/upload/UploadScreen';
import { ExtractingScreen } from '@/components/processing/ExtractingScreen';
import { ResultsScreen } from '@/components/results/ResultsScreen';
import { ExamsScreen } from '@/components/exams/ExamsScreen';
import { useProcessingStream } from '@/hooks/useProcessingStream';
import { useSessionData } from '@/hooks/useSessionData';
import {
  saveSessionToHistory,
  useHistory,
  type HistoryEntry,
} from '@/hooks/usePersistedSession';
import type { DropzoneFile } from '@/components/upload/UploadDropzone';
import type { SessionData } from '@/types/session';

type Phase = 'upload' | 'processing' | 'results' | 'exams';

export default function Home() {
  const [phase, setPhase] = useState<Phase>('exams');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<SessionData | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);

  const history = useHistory(historyVersion);

  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
  }, []);

  const { state: processingState, start: startProcessing } = useProcessingStream();

  // Only fetch from the API when we don't already have an activeSession
  // (e.g. when reopening a history entry that was saved server-side).
  // For freshly-processed sessions the snapshot comes inline in the SSE
  // done event, so we never need this GET call at all — avoiding the
  // cross-instance 404 on Vercel serverless.
  const shouldFetch = phase === 'results' && !activeSession && !!sessionId;
  const { data: fetchedSession, isFetching } = useSessionData(sessionId, shouldFetch);

  const session = activeSession ?? fetchedSession;

  // Save to history whenever a session completes
  useEffect(() => {
    if (session && sessionId && phase === 'results' && session.stage === 'done') {
      saveSessionToHistory(sessionId, session).then(() => {
        setHistoryVersion((v) => v + 1);
      });
    }
  }, [session, sessionId, phase]);

  const handleStartMapping = (questionPaper: DropzoneFile, answerSheet: DropzoneFile) => {
    setActiveSession(null);
    const newSessionId = nanoid(12);
    setSessionId(newSessionId);
    setPhase('processing');

    startProcessing(
      newSessionId,
      { questionPaper: questionPaper.file, answerSheet: answerSheet.file },
      (snapshot) => {
        if (snapshot) {
          // Use the session data delivered inline with the done event —
          // no GET request needed, no cross-instance 404 possible.
          setActiveSession(snapshot);
        }
        // Still transition to results whether or not we got a snapshot;
        // if snapshot is null (error case) the error UI handles it.
        setPhase('results');
      }
    );
  };

  const handleOpenHistoryEntry = (entry: HistoryEntry) => {
    setActiveSession(entry.snapshot);
    setSessionId(entry.sessionId);
    setPhase('results');
  };

  const handleGoBack = () => {
    setActiveSession(null);
    setPhase('exams');
  };

  const handleNewExam = () => {
    setActiveSession(null);
    setPhase('upload');
  };

  return (
    <AppShell
      sidebarCollapsedByDefault={phase === 'processing'}
      onBack={phase !== 'exams' ? handleGoBack : undefined}
      onExamsClick={() => setPhase('exams')}
    >
      {phase === 'exams' && (
        <ExamsScreen
          history={history}
          onOpen={handleOpenHistoryEntry}
          onNewExam={handleNewExam}
          onHistoryChange={() => setHistoryVersion((v) => v + 1)}
        />
      )}

      {phase === 'upload' && (
        <UploadScreen
          onStartMapping={handleStartMapping}
          isSubmitting={false}
          errorMessage={null}
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
            <ResultsScreen session={session} onBack={handleGoBack} />
          )}
          {processingState.error && (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-lg font-bold text-red-600">Processing failed</p>
              <p className="max-w-md text-sm text-ink-500">{processingState.error}</p>
              <button
                onClick={handleGoBack}
                className="mt-2 rounded-pill bg-ink-900 px-5 py-2 text-sm font-semibold text-white"
              >
                Go back
              </button>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}