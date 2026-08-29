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
    <div className="flex h-full flex-col bg-canvas-DEFAULT overflow-hidden rounded-[15px] ml-1">
      {/* Top toolbar — always full width, never affected by zoom */}
      <div className="flex flex-shrink-0 items-center justify-between bg-ink-900 px-4 py-2.5 text-white"> 
        <span className="text-sm font-semibold">Answer Sheet</span>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <button
              aria-label="Zoom out"
              onClick={() => setZoom((z) => Math.max(50, z - 10))}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
            >
              <Minus size={14} />
            </button>
            <span className="w-11 text-center text-xs font-medium">{zoom}%</span>
            <button
              aria-label="Zoom in"
              onClick={() => setZoom((z) => Math.min(200, z + 10))}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
            >
              <Plus size={14} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              aria-label="Previous page"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs font-medium">
              Page {page} of {pageCount}
            </span>
            <button
              aria-label="Next page"
              disabled={page >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30"
            >
              <ChevronRight size={14} />
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

      {/*
        Scroll container: always fills remaining height, scrolls in both axes
        when zoom > 100. The inner wrapper uses `min-w-max` only when zoom
        pushes content wider than the viewport so horizontal scroll appears;
        at zoom ≤ 100 we stay flex-centered with no overflow.
      */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto scrollbar-thin md:p-6"
      >
        {/*
          100% zoom = the page's actual reference size (PAGE_MAX_WIDTH), not
          "stretch to fill the panel" -- otherwise 100% looks artificially
          full-bleed on a wide panel, and zoom appears to arbitrarily resize
          the page rather than scale it from a real baseline. Zoom then
          scales that fixed reference up/down, same as Word/Docs/PDF.js.
        */}
        <div className="mx-auto" style={{ maxWidth: PAGE_MAX_WIDTH }}>
          <div
            className="relative mx-auto overflow-hidden rounded-lg bg-white shadow-panel"
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
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={`Answer sheet page ${page}`}
      className="block h-auto w-full rounded-lg"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}