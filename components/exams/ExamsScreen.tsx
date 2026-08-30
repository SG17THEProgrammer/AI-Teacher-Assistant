'use client';

import { ClipboardList, Trash2, ChevronRight, Plus } from 'lucide-react';
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
        <div className="mb-6 flex items-center justify-between -mt-3">
          <div>
            <h1 className="text-2xl font-extrabold text-ink-900">
              Exams
            </h1>

            <p className="mt-1 text-sm text-ink-700">
              {history.length === 0
                ? 'No exams graded yet.'
                : `${history.length} exam${
                    history.length !== 1 ? 's' : ''
                  } graded`}
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
              {paginatedHistory.map((entry) => (
                <div
                  key={entry.sessionId}
                  onClick={() => onOpen(entry)}
                  className={cn(
                    'group flex min-w-0 cursor-pointer items-center gap-4 rounded-2xl border border-black/5 bg-white p-4 shadow-sm',
                    'transition-all duration-300 ease-out',
                    'hover:-translate-y-1 hover:border-brand-200 hover:shadow-floating',
                    'active:translate-y-0 active:scale-[0.99]',
                    deleting === entry.sessionId &&
                      'pointer-events-none scale-95 opacity-0'
                  )}
                >
                  {/* Score */}
                  <div
                    className={cn(
                      'flex h-14 w-20 flex-shrink-0 flex-col items-center justify-center rounded-xl text-white',
                      entry.percent >= 80
                        ? 'bg-green-500'
                        : entry.percent >= 50
                        ? 'bg-yellow-500'
                        : 'bg-red-500'
                    )}
                  >
                    <span className="text-lg font-black leading-none">
                      {Math.round(entry.percent)}%
                    </span>

                    <span className="text-[10px] font-medium opacity-80">
                      {entry.score} marks
                    </span>
                  </div>

                  {/* Details */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-ink-900">
                      {entry.questionPaperName}
                    </p>

                    <p className="mt-0.5 truncate text-sm text-ink-700">
                      Answer: {entry.answerSheetName}
                    </p>

                    <p className="mt-1 text-xs text-ink-500">
                      Created {formatEntryDate(entry.createdAt ?? entry.savedAt)}

                      {entry.createdAt != null &&
                        entry.savedAt - entry.createdAt > 60_000 && (
                          <>
                            {' '}
                            · Last opened{' '}
                            {formatEntryDate(entry.savedAt)}
                          </>
                        )}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-shrink-0 items-center gap-1">
                    <button
                      aria-label="Delete"
                      onClick={(e) =>
                        handleDelete(e, entry.sessionId)
                      }
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-full',
                        'text-ink-300',
                        'transition-all duration-200 ease-out',
                        'hover:bg-red-50 hover:text-red-500',
                        'md:hidden md:group-hover:flex'
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
              ))}
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

