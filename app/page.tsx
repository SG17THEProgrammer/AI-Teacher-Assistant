'use client';

import { useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { UploadScreen } from '@/components/upload/UploadScreen';
import { ExtractingScreen } from '@/components/processing/ExtractingScreen';
import { ResultsScreen } from '@/components/results/ResultsScreen';
import { useUploadFiles } from '@/hooks/useUpload';
import { useProcessingStream } from '@/hooks/useProcessingStream';
import { useSessionData } from '@/hooks/useSessionData';
import type { DropzoneFile } from '@/components/upload/UploadDropzone';

type Phase = 'upload' | 'processing' | 'results';

export default function Home() {
  const [phase, setPhase] = useState<Phase>('upload');
  const [sessionId, setSessionId] = useState<string | null>(null);

  const { upload, isSubmitting, error: uploadError } = useUploadFiles();
  const { state: processingState, start: startProcessing } = useProcessingStream();
  const {
    data: session,
    refetch,
    isFetching,
  } = useSessionData(sessionId, phase === 'results');

  const handleStartMapping = async (questionPaper: DropzoneFile, answerSheet: DropzoneFile) => {
    const newSessionId = await upload(questionPaper, answerSheet);
    if (!newSessionId) return;
    setSessionId(newSessionId);
    setPhase('processing');
    startProcessing(newSessionId, () => {
      setPhase('results');
      refetch();
    });
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
          {session && !processingState.error && <ResultsScreen session={session} />}
          {processingState.error && (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-lg font-bold text-danger-DEFAULT">Processing failed</p>
              <p className="max-w-md text-sm text-ink-500">{processingState.error}</p>
              <button
                onClick={() => setPhase('upload')}
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
