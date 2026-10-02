'use client';

import { ClipboardList, Trash2, ChevronRight, Plus,FileText, Clock3, Trophy, BarChart3  } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { HistoryEntry } from '@/hooks/usePersistedSession';
import { removeFromHistory } from '@/hooks/usePersistedSession';
import { useMemo, useState } from 'react';

function formatEntryDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const ITEMS_PER_PAGE = 6;

function tone(percent: number) {
  if (percent >= 80)
    return { ring: 'text-green-500', bar: 'bg-green-500', chip: 'bg-green-50 text-green-700', label: 'Excellent' };
  if (percent >= 50)
    return { ring: 'text-yellow-500', bar: 'bg-yellow-500', chip: 'bg-yellow-50 text-yellow-700', label: 'Average' };
  return { ring: 'text-red-500', bar: 'bg-red-500', chip: 'bg-red-50 text-red-700', label: 'Needs work' };
}

function ScoreRing({ percent }: { percent: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const t = tone(percent);
  return (
    <div className={cn('relative h-16 w-16 flex-shrink-0', t.ring)}>
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-black/10" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          className="stroke-current transition-all duration-700"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(Math.max(percent, 0), 100) / 100)}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[13px] font-black text-ink-900">
        {Math.round(percent)}%
      </span>
    </div>
  );
}

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
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(history.length / ITEMS_PER_PAGE);

  const paginatedHistory = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return history.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [history, currentPage]);

  const stats = useMemo(() => {
    if (history.length === 0) return null;
    const avg = history.reduce((s, e) => s + e.percent, 0) / history.length;
    const best = Math.max(...history.map((e) => e.percent));
    return { avg: Math.round(avg), best: Math.round(best) };
  }, [history]);

  const handleDelete = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    setDeleting(sessionId);

    setTimeout(async () => {
      await removeFromHistory(sessionId);
      onHistoryChange();
      setDeleting(null);

      // If deleting the last item on the current page,
      // move back one page.
      const remainingItems = history.length - 1;
      const newTotalPages = Math.max(
        1,
        Math.ceil(remainingItems / ITEMS_PER_PAGE)
      );

      if (currentPage > newTotalPages) {
        setCurrentPage(newTotalPages);
      }
    }, 300);
  };

  const goToPage = (page: number) => {
    setCurrentPage(Math.min(Math.max(page, 1), totalPages));
  };

  return (
    <div className="h-full overflow-y-auto scrollbar-thin border-2 border-black/40 rounded-[15px] ml-2">
      <div className="mx-auto w-full px-6 py-6 md:px-10 md:py-8 h-full">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between -mt-3">
          <div>
            <h1 className="text-2xl font-extrabold text-ink-900">Exams</h1>
            <p className="mt-1 text-sm text-ink-700">
              {history.length === 0
                ? 'No exams graded yet.'
                : `${history.length} exam${history.length !== 1 ? 's' : ''} graded`}
            </p>
          </div>

          <button
            onClick={onNewExam}
            className="flex items-center gap-2 rounded-pill bg-ink-900 px-5 py-2.5 text-sm font-semibold text-white shadow-floating transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-ink-800 hover:shadow-lg active:translate-y-0"
          >
            <Plus size={16} />
            New Exam
          </button>
        </div>

        {stats && (
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { icon: ClipboardList, label: 'Exams graded', value: String(history.length) },
              { icon: BarChart3, label: 'Average score', value: `${stats.avg}%` },
              { icon: Trophy, label: 'Best score', value: `${stats.best}%` },
            ].map((s) => (
              <div
                key={s.label}
                className="flex items-center gap-3 rounded-2xl border border-black/5 bg-white p-4 shadow-sm"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-500">
                  <s.icon size={18} />
                </span>
                <div>
                  <p className="text-xl font-extrabold leading-none text-ink-900">{s.value}</p>
                  <p className="mt-1 text-xs font-medium text-ink-500">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {history.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-black/10 bg-white py-16 text-center px-3">
            <ClipboardList
              size={40}
              className="mb-4 text-ink-200"
            />

            <p className="text-base font-semibold text-ink-400">
              No exams yet
            </p>

            <p className="mt-1 text-sm text-ink-300">
              Upload a question paper and answer sheet to get started.
            </p>

            <button
              onClick={onNewExam}
              className="mt-6 rounded-pill bg-ink-900 px-5 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-ink-800"
            >
              Grade your first exam
            </button>
          </div>
        )}

        {/* History Grid */}
        {history.length > 0 && (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            {paginatedHistory.map((entry) => {
                const t = tone(entry.percent);
                return (
                  <div
                    key={entry.sessionId}
                    onClick={() => onOpen(entry)}
                    className={cn(
                      'group relative flex min-w-0 cursor-pointer items-center gap-4 overflow-hidden rounded-2xl border border-black/5 bg-white p-4 pl-5 shadow-sm',
                      'transition-all duration-300 ease-out',
                      'hover:-translate-y-1 hover:border-brand-200 hover:shadow-floating',
                      'active:translate-y-0 active:scale-[0.99]',
                      deleting === entry.sessionId && 'pointer-events-none scale-95 opacity-0'
                    )}
                  >
                    <span className={cn('absolute inset-y-0 left-0 w-1.5', t.bar)} />

                    <ScoreRing percent={entry.percent} />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <FileText size={14} className="flex-shrink-0 text-ink-400" />
                        <p className="truncate text-[15px] font-semibold text-ink-900">
                          {entry.questionPaperName}
                        </p>
                      </div>
                      <p className="mt-0.5 truncate text-sm text-ink-700">
                        Answer: {entry.answerSheetName}
                      </p>

                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-bold', t.chip)}>
                          {entry.score} marks · {t.label}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-ink-500">
                          <Clock3 size={12} />
                          {formatEntryDate(entry.createdAt ?? entry.savedAt)}
                        </span>
                      </div>
                      {entry.createdAt != null && entry.savedAt - entry.createdAt > 60_000 && (
                        <p className="mt-1 text-[11px] text-ink-400">
                          Last opened {formatEntryDate(entry.savedAt)}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-shrink-0 items-center gap-1">
                      <button
                        aria-label="Delete"
                        onClick={(e) => handleDelete(e, entry.sessionId)}
                        className={cn(
                          'flex h-8 w-8 items-center justify-center rounded-full text-ink-300',
                          'transition-all duration-200 ease-out hover:bg-red-50 hover:text-red-500',
                          'md:opacity-0 md:group-hover:opacity-100'
                        )}
                      >
                        <Trash2 size={15} />
                      </button>
                      <ChevronRight
                        size={18}
                        className="text-ink-300 transition-all duration-300 ease-out group-hover:translate-x-1 group-hover:text-brand-500"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2">
                {/* Previous */}
                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className={cn(
                    'flex h-9 items-center justify-center rounded-full border px-3 text-sm font-medium',
                    'transition-all duration-200 ease-out',
                    currentPage === 1
                      ? 'cursor-not-allowed border-black/5 text-ink-200'
                      : 'border-black/10 text-ink-600 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-600'
                  )}
                >
                  Previous
                </button>

                {/* Page Numbers */}
                <div className="flex items-center gap-1">
                  {Array.from(
                    { length: totalPages },
                    (_, index) => index + 1
                  ).map((page) => (
                    <button
                      key={page}
                      onClick={() => goToPage(page)}
                      className={cn(
                        'flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold',
                        'transition-all duration-200 ease-out',
                        page === currentPage
                          ? 'bg-ink-900 text-white shadow-sm'
                          : 'text-ink-500 hover:bg-black/5 hover:text-ink-900'
                      )}
                    >
                      {page}
                    </button>
                  ))}
                </div>

                {/* Next */}
                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className={cn(
                    'flex h-9 items-center justify-center rounded-full border px-3 text-sm font-medium',
                    'transition-all duration-200 ease-out',
                    currentPage === totalPages
                      ? 'cursor-not-allowed border-black/5 text-ink-200'
                      : 'border-black/10 text-ink-600 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-600'
                  )}
                >
                  Next
                </button>
              </div>
            )}

            {/* Pagination Info */}
            {totalPages > 1 && (
              <p className="mt-3 text-center text-xs text-ink-400">
                Showing{' '}
                {(currentPage - 1) * ITEMS_PER_PAGE + 1}–
                {Math.min(
                  currentPage * ITEMS_PER_PAGE,
                  history.length
                )}{' '}
                of {history.length} exams
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

