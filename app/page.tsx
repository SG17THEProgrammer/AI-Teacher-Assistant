'use client';

import { useEffect, useRef, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { UploadScreen } from '@/components/upload/UploadScreen';
import { ExtractingScreen } from '@/components/processing/ExtractingScreen';
import { ResultsScreen } from '@/components/results/ResultsScreen';
import { ExamsScreen } from '@/components/exams/ExamsScreen';
import { useUploadFiles } from '@/hooks/useUpload';
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
  const [historyVersion, setHistoryVersion] = useState(0); // bump to force re-read

  const history = useHistory(historyVersion);

  // Auto-open last session if available on first load
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    // Just show exams list — user can pick which one to open
  }, []);

  const { upload, isSubmitting, error: uploadError } = useUploadFiles();
  const { state: processingState, start: startProcessing } = useProcessingStream();
  const {
    data: fetchedSession,
    refetch,
    isFetching,
  } = useSessionData(sessionId, phase === 'results' && !activeSession);

  const session = activeSession ?? fetchedSession;

  // Save to history whenever a session completes
  useEffect(() => {
    if (session && sessionId && phase === 'results' && session.stage === 'done') {
      saveSessionToHistory(sessionId, session).then(() => {
        setHistoryVersion((v) => v + 1);
      });
    }
  }, [session, sessionId, phase]);

  const handleStartMapping = async (questionPaper: DropzoneFile, answerSheet: DropzoneFile) => {
    setActiveSession(null);
    const newSessionId = await upload(questionPaper, answerSheet);
    if (!newSessionId) return;
    setSessionId(newSessionId);
    setPhase('processing');
    startProcessing(newSessionId, () => {
      setPhase('results');
      refetch();
    });
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