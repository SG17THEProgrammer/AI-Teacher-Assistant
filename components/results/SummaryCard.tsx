'use client';

import { TrendingUp, TrendingDown } from 'lucide-react';
import type { OverallSummary } from '@/types/grading';

export function SummaryCard({ summary }: { summary: OverallSummary }) {
  return (
    <div className="rounded-2xl bg-ink-900 p-4 text-white">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-white/50">Overall Score</p>
          <p className="mt-0.5 text-2xl font-extrabold">
            {formatNumber(summary.totalMarksAwarded)}
            <span className="text-base font-medium text-white/50">
              {' '}
              / {formatNumber(summary.totalMarksPossible)}
            </span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-extrabold text-brand-400">{summary.percentage}%</p>
          <p className="text-xs text-white/50">
            {summary.questionsAttempted}/{summary.totalQuestions} attempted
          </p>
        </div>
      </div>

      {summary.questionsUnanswered > 0 && (
        <p className="mt-2 rounded-lg bg-white/10 px-2.5 py-1 text-xs font-medium">
          {summary.questionsUnanswered} question{summary.questionsUnanswered === 1 ? '' : 's'} not answered
        </p>
      )}
      {summary.orphanAnswerCount > 0 && (
        <p className="mt-1.5 rounded-lg bg-white/10 px-2.5 py-1 text-xs font-medium">
          {summary.orphanAnswerCount} unmapped answer{summary.orphanAnswerCount === 1 ? '' : 's'} found
        </p>
      )}

      {(summary.strongAreas.length > 0 || summary.weakAreas.length > 0) && (
        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-white/10 pt-3">
          <div>
            <p className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-success-DEFAULT">
              <TrendingUp size={12} /> Strong
            </p>
            <p className="mt-1 text-xs text-white/70">
              {summary.strongAreas.length > 0 ? summary.strongAreas.join(', ') : '—'}
            </p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-brand-400">
              <TrendingDown size={12} /> Weak
            </p>
            <p className="mt-1 text-xs text-white/70">
              {summary.weakAreas.length > 0 ? summary.weakAreas.join(', ') : '—'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
