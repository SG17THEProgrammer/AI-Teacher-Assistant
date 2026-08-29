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

  // The set of answer blocks that should be highlighted right now: either
  // the explicitly selected orphan answer, or every block (primary +
  // multi-page continuations) that make up the active question's mapping.
  const highlightedBlocks = useMemo(() => {
    if (activeAnswerId) {
      const block = answersById.get(activeAnswerId);
      return block ? [block] : [];
    }
    if (!activeMapping?.mappedAnswerId) return [];
    const ids = [activeMapping.mappedAnswerId, ...activeMapping.additionalAnswerIds];
    return ids.map((id) => answersById.get(id)).filter((b): b is ExtractedAnswerBlock => Boolean(b));
  }, [activeAnswerId, activeMapping, answersById]);

  // Auto-navigate to the first page containing a highlighted block whenever
  // the selection changes, then scroll that region into view.
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
    <div className="flex h-full flex-col bg-canvas-DEFAULT">
      <div className="flex items-center justify-between bg-ink-900 px-4 py-2.5 text-white">
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
        <div className="bg-brand-50 px-4 py-1.5 text-center text-xs font-medium text-brand-600">
          This answer spans multiple pages ({[...pagesWithHighlight].sort((a, b) => a - b).join(', ')}) —
          use the page arrows to see the rest.
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-auto scrollbar-thin p-6">
        <div
          className="relative rounded-lg bg-white shadow-panel overflow-hidden"
          style={{
            width: `${zoom}%`,
            // Explicit instead of `mx-auto`: once zoom pushes the box wider
            // than its scroll container, centering margins must resolve to
            // 0 (left-aligned) so growth is visible immediately without
            // having to scroll in both directions to find it.
            marginLeft: zoom > 100 ? 0 : 'auto',
            marginRight: zoom > 100 ? 0 : 'auto',
          }}
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
  );
}

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

  // A plain <img> lets the browser size this by its own natural width/height
  // (via w-full h-auto below), so the wrapper always ends up exactly the
  // size of the real rendered page -- which is what keeps the percentage-
  // based highlight overlay aligned with the actual text. The previous
  // <object> with a hardcoded pixel height forced a mismatched aspect
  // ratio onto every page, stretching/cropping the image and throwing off
  // every highlight box's position along with it.
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
