'use client';

import { ClipboardList, Trash2, ChevronRight, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { HistoryEntry } from '@/hooks/usePersistedSession';
import { removeFromHistory } from '@/hooks/usePersistedSession';
import { useState } from 'react';

export function ExamsScreen({
  history,
  onOpen,
  onNewExam,
  onHistoryChange,
}: {
  history: HistoryEntry[];
  onOpen: (entry: HistoryEntry) => void;
  onNewExam: () => void;
  onHistoryChange: () => void;
}) {
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDelete = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    setDeleting(sessionId);
    setTimeout(() => {
      removeFromHistory(sessionId);
      onHistoryChange();
      setDeleting(null);
    }, 300);
  };

  return (
    <div className="flex h-full flex-col overflow-auto p-6 md:p-10">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-ink-900">Exams</h1>
            <p className="mt-1 text-sm text-ink-400">
              {history.length === 0
                ? 'No exams graded yet.'
                : `${history.length} exam${history.length !== 1 ? 's' : ''} graded`}
            </p>
          </div>
          <button
            onClick={onNewExam}
            className="flex items-center gap-2 rounded-pill bg-ink-900 px-5 py-2.5 text-sm font-semibold text-white shadow-floating hover:bg-ink-800 transition-colors"
          >
            <Plus size={16} />
            New Exam
          </button>
        </div>

        {history.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-black/10 bg-white py-20 text-center">
            <ClipboardList size={40} className="mb-4 text-ink-200" />
            <p className="text-base font-semibold text-ink-400">No exams yet</p>
            <p className="mt-1 text-sm text-ink-300">Upload a question paper and answer sheet to get started.</p>
            <button
              onClick={onNewExam}
              className="mt-6 rounded-pill bg-ink-900 px-5 py-2.5 text-sm font-semibold text-white"
            >
              Grade your first exam
            </button>
          </div>
        )}

        {history.length > 0 && (
          <div className="flex flex-col gap-3">
            {history.map((entry) => (
              <div
                key={entry.sessionId}
                onClick={() => onOpen(entry)}
                className={cn(
                  'group flex cursor-pointer items-center gap-4 rounded-2xl border border-black/5 bg-white p-4 shadow-sm transition-all hover:border-brand-200 hover:shadow-floating',
                  deleting === entry.sessionId && 'opacity-0 scale-95'
                )}
              >
                <div
                  className={cn(
                    'flex h-14 w-14 flex-shrink-0 flex-col items-center justify-center rounded-xl text-white',
                    entry.percent >= 80
                      ? 'bg-green-500'
                      : entry.percent >= 50
                      ? 'bg-yellow-500'
                      : 'bg-red-500'
                  )}
                >
                  <span className="text-lg font-black leading-none">{Math.round(entry.percent)}%</span>
                  <span className="text-[10px] font-medium opacity-80">{entry.score}</span>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-ink-900">
                    {entry.questionPaperName}
                  </p>
                  <p className="mt-0.5 truncate text-sm text-ink-400">
                    Answer: {entry.answerSheetName}
                  </p>
                  <p className="mt-1 text-xs text-ink-300">
                    {new Date(entry.savedAt).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    aria-label="Delete"
                    onClick={(e) => handleDelete(e, entry.sessionId)}
                    className="hidden group-hover:flex h-8 w-8 items-center justify-center rounded-full text-ink-300 hover:bg-red-50 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                  <ChevronRight size={18} className="text-ink-300 group-hover:text-brand-500 transition-colors" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}