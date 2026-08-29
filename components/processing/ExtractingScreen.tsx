'use client';

import { motion } from 'framer-motion';
import { Progress } from '@/components/ui/progress';
import type { ProcessingStage } from '@/types/session';

const STAGE_LABEL: Record<ProcessingStage, string> = {
  idle: 'Preparing…',
  uploading: 'Uploading files…',
  'extracting-questions': 'Extracting…',
  'extracting-answers': 'Extracting…',
  mapping: 'Mapping answers to questions…',
  grading: 'Grading & generating feedback…',
  done: 'Done',
  error: 'Something went wrong',
};

export function ExtractingScreen({
  stage,
  message,
  percent,
}: {
  stage: ProcessingStage;
  message: string;
  percent: number;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
      <motion.div
        animate={{ rotate: [0, 8, -8, 0], scale: [1, 1.06, 0.96, 1] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
      >
        <SparkleGlyph />
      </motion.div>
      <div>
        <h2 className="text-xl font-extrabold text-ink-900">{STAGE_LABEL[stage]}</h2>
        <p className="mt-1 text-sm text-ink-400">{message || 'This may take a while'}</p>
      </div>
      <div className="w-full max-w-xs">
        <Progress value={percent} />
      </div>
    </div>
  );
}

function SparkleGlyph() {
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
      <path d="M40 8L46 30L68 36L46 42L40 64L34 42L12 36L34 30L40 8Z" fill="#f0603c" />
      <circle cx="12" cy="16" r="3" fill="#f0603c" opacity="0.6" />
      <path d="M56 50L59 58L67 61L59 64L56 72L53 64L45 61L53 58L56 50Z" fill="#f0603c" opacity="0.55" />
    </svg>
  );
}
