'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { HighlightOverlay } from './HighlightOverlay';
import type { ExtractedAnswerBlock } from '@/types/answer';
import type { MappingResult } from '@/types/mapping';
import type { ExtractedQuestion } from '@/types/question';

export function AnswerSheetViewer({
  sessionId,
  pageCount,
  answers,
  mapping,
  questions,
  activeQuestionId,
  activeAnswerId,
}: {
  sessionId: string;
  pageCount: number;
  answers: ExtractedAnswerBlock[];
  mapping: MappingResult;
  questions: ExtractedQuestion[];
  activeQuestionId: string | null;
  activeAnswerId: string | null;
}) {
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const highlightRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const answersById = useMemo(() => new Map(answers.map((a) => [a.answerId, a])), [answers]);
  const activeMapping = useMemo(
    () => mapping.mappings.find((m) => m.questionId === activeQuestionId),
    [mapping, activeQuestionId]
  );
  const activeQuestion = useMemo(
    () => questions.find((q) => q.id === activeQuestionId),
    [questions, activeQuestionId]
  );

  const highlightedBlocks = useMemo(() => {
    if (activeAnswerId) {
      const block = answersById.get(activeAnswerId);
      return block ? [block] : [];
    }
    if (!activeMapping?.mappedAnswerId) return [];
    const ids = [activeMapping.mappedAnswerId, ...activeMapping.additionalAnswerIds];
    return ids.map((id) => answersById.get(id)).filter((b): b is ExtractedAnswerBlock => Boolean(b));
  }, [activeAnswerId, activeMapping, answersById]);

  useEffect(() => {
    const firstBlock = highlightedBlocks[0];
    if (firstBlock) setPage(firstBlock.pageNumber);
  }, [highlightedBlocks]);

  useEffect(() => {
    highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [page, activeQuestionId, activeAnswerId]);

  const pagesWithHighlight = useMemo(
    () => new Set(highlightedBlocks.map((b) => b.pageNumber)),
    [highlightedBlocks]
  );
  const spansMultiplePages = pagesWithHighlight.size > 1;

  const currentPageBoxes = highlightedBlocks
    .filter((b) => b.pageNumber === page)
    .flatMap((b) => b.boundingBoxes);

  const label = activeAnswerId
    ? 'Unmapped'
    : activeQuestion
      ? `Q${activeQuestion.questionNumber}`
      : '';

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-tr-[15px] rounded-tl-[15px] ml-3 w-[96%]">
      {/* Top toolbar — always full width, never affected by zoom */}
      <div className="flex flex-shrink-0 items-center justify-between bg-ink-900 px-4 py-2.5 text-white">

        {/* Hides text on mobile, shows on desktop */}
        <span className="hidden md:inline text-sm font-semibold">Answer Sheet</span>

        {/* 
    UPDATED CONTAINER: 
    - w-full justify-between: forces items to opposite sides on mobile
    - md:w-auto md:justify-start: returns to normal tighter layout on desktop
  */}
        <div className="flex w-full justify-between items-center gap-4 text-white px-1 py-1 rounded-xl shadow-lg md:w-auto md:justify-start md:px-3">

          {/* Zoom Controls (The left pill box) */}
          <div className="flex items-center gap-1 bg-[#2d2d2d] px-2 py-1 rounded-lg">
            <button
              aria-label="Zoom out"
              onClick={() => setZoom((z) => Math.max(100, z - 10))}
              className={`flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-white/10 active:bg-white/20 ${zoom === 100 ? "cursor-not-allowed opacity-40" : ""
                }`}
              disabled={zoom === 100}
            >
              <Minus size={12} className="text-gray-300" />
            </button>

            <span className="w-10 text-center text-xs font-semibold select-none">
              {zoom}%
            </span>

            <button
              aria-label="Zoom in"
              onClick={() => setZoom((z) => Math.min(250, z + 10))}
              className={`flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-white/10 active:bg-white/20 ${zoom === 250 ? "cursor-not-allowed opacity-40" : ""
                }`}
              disabled={zoom === 250}
            >
              <Plus size={12} className="text-gray-300" />
            </button>
          </div>

          {/* Page Controls (The right pill box) */}
          <div className="flex items-center gap-1.5 bg-[#2d2d2d] px-2 py-1 rounded-lg">
            <button
              aria-label="Previous page"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className={`flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-white/10 active:bg-white/20 ${page === 1 ? "cursor-not-allowed opacity-40" : ""
                }`}
            >
              <ChevronLeft size={14} className="text-gray-300" />
            </button>

            <span className="text-xs font-semibold px-1 select-none whitespace-nowrap">
              Page {page} of {pageCount}
            </span>

            <button
              aria-label="Next page"
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={page === pageCount}
              className={`flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-white/10 active:bg-white/20 ${page === pageCount ? "cursor-not-allowed opacity-40" : ""
                }`}
            >
              <ChevronRight size={14} className="text-gray-300" />
            </button>
          </div>

        </div>

      </div>


      {spansMultiplePages && (
        <div className="flex-shrink-0 bg-brand-50 px-4 py-1.5 text-center text-xs font-medium text-brand-600">
          This answer spans multiple pages ({[...pagesWithHighlight].sort((a, b) => a - b).join(', ')}) —
          use the page arrows to see the rest.
        </div>
      )}

      {/* Scroll container */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto scrollbar-thin border-2 border-black rounded-bl-[15px] rounded-br-[15px]"
      >
        {/* ADDED: min-h-full ensures layout fills vertical viewport space */}
        <div className="mx-auto min-h-full flex flex-col" style={{ maxWidth: PAGE_MAX_WIDTH }}>
          {/* ADDED: flex-1 allows this container to push down to the absolute bottom */}
          <div
            className="relative mx-auto overflow-hidden rounded-bl-lg rounded-br-lg bg-white shadow-panel flex-1 min-h-full"
            style={{ width: `${zoom}%` }}
          >
            <PageRenderer
              sessionId={sessionId}
              kind="answerSheet"
              page={page}
            />
            {currentPageBoxes.map((box, i) => (
              <HighlightOverlay
                key={i}
                box={box}
                label={label}
                registerRef={i === 0 ? (el) => (highlightRef.current = el) : undefined}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const PAGE_MAX_WIDTH = 850;

function PageRenderer({
  sessionId,
  kind,
  page,
}: {
  sessionId: string;
  kind: string;
  page: number;
}) {
  const [failed, setFailed] = useState(false);
  const src = `/api/session/${sessionId}/pages/${kind}/${page}`;

  if (failed) {
    return (
      <div className="flex aspect-[3/4] w-full items-center justify-center rounded-lg bg-ink-50 p-6 text-center text-sm text-ink-400">
        Preview unavailable for this page.{' '}
        <a href={src} target="_blank" rel="noreferrer" className="ml-1 underline">
          Open original
        </a>
      </div>
    );
  }

  return (
    // FIXED: Changed typo 'f-full' to 'h-full'
    <img
      src={src}
      alt={`Answer sheet page ${page}`}
      className="object-cover w-full h-full"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}
