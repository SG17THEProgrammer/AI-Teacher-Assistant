'use client';

import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { UploadDropzone, type DropzoneFile } from './UploadDropzone';
import { TeacherAvatar } from './TeacherAvatar';

export function UploadScreen({
  onStartMapping,
  isSubmitting,
  errorMessage,
}: {
  onStartMapping: (questionPaper: DropzoneFile, answerSheet: DropzoneFile) => void;
  isSubmitting: boolean;
  errorMessage: string | null;
}) {
  const [questionPaper, setQuestionPaper] = useState<DropzoneFile | null>(null);
  const [answerSheet, setAnswerSheet] = useState<DropzoneFile | null>(null);

  const bothPresent = Boolean(questionPaper && answerSheet);

  return (
    <div className="flex h-full flex-col items-center overflow-y-auto scrollbar-thin px-6 py-10 md:py-16">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="flex w-full max-w-[720px] flex-col items-center text-center"
      >
        <h1 className="text-2xl font-extrabold leading-tight text-ink-900 md:text-[34px]">
          Upload{' '}
          <span className="rounded-lg bg-brand-50 px-2 text-brand-500 underline decoration-brand-300">
            Question Paper &amp; Answer Sheets
          </span>
        </h1>
        <p className="mt-3 text-[15px] text-ink-500">Upload both files to get started</p>

        <div className="my-8">
          <TeacherAvatar />
        </div>

        <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
          <UploadDropzone
            label="Question Paper"
            accentLabel="Question Paper"
            value={questionPaper}
            onChange={setQuestionPaper}
            disabled={isSubmitting}
          />
          <UploadDropzone
            label="Answer Sheet"
            accentLabel="Answer Sheet"
            value={answerSheet}
            onChange={setAnswerSheet}
            disabled={isSubmitting}
          />
        </div>

        {errorMessage && (
          <p className="mt-4 rounded-xl bg-danger-50 px-4 py-2 text-sm font-medium text-danger-DEFAULT">
            {errorMessage}
          </p>
        )}

        <Button
          variant="primary"
          size="default"
          disabled={!bothPresent || isSubmitting}
          onClick={() => bothPresent && onStartMapping(questionPaper!, answerSheet!)}
          className="mt-8 gap-2 disabled:bg-ink-900/20"
        >
          {isSubmitting ? 'Uploading…' : 'Start Mapping'}
          {!isSubmitting && <ArrowRight size={16} />}
        </Button>
        <p className="mt-3 max-w-sm text-xs text-ink-400">
          Once both files are uploaded, you&apos;ll be able to map answers with questions
        </p>
      </motion.div>
    </div>
  );
}
