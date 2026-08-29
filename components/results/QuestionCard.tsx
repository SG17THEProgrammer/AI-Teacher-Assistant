'use client';

import { ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge, MarksBadge } from '@/components/ui/badge';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn, formatConfidence } from '@/lib/utils';
import type { ExtractedQuestion } from '@/types/question';
import type { QuestionGrade } from '@/types/grading';
import type { QuestionMapping } from '@/types/mapping';

export interface QuestionCardProps {
  index: number;
  question: ExtractedQuestion;
  grade: QuestionGrade | undefined;
  mapping: QuestionMapping | undefined;
  isUnanswered: boolean;
  isActive: boolean;
  isExpanded: boolean;
  onSelect: () => void;
  onToggleExpand: () => void;
}

export function QuestionCard({
  index,
  question,
  grade,
  mapping,
  isUnanswered,
  isActive,
  isExpanded,
  onSelect,
  onToggleExpand,
}: QuestionCardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border bg-white p-4 transition-all',
        isActive ? 'border-brand-400 shadow-floating ring-1 ring-brand-200' : 'border-black/5'
      )}
    >
      <button className="flex w-full items-start gap-3 text-left" onClick={onSelect}>
        <span
          className={cn(
            'mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold',
            isActive ? 'bg-brand-500 text-white' : 'bg-ink-900 text-white'
          )}
        >
          {index}
        </span>
        <span className="min-w-0 flex-1 text-[14px] font-medium leading-snug text-ink-800">
          {question.questionText}
        </span>

        <span className="flex flex-shrink-0 items-center gap-2">
          {isUnanswered ? (
            <Badge tone="danger">Not Answered</Badge>
          ) : grade ? (
            <MappingConfidenceTooltip mapping={mapping}>
              <MarksBadge awarded={grade.marksAwarded} total={grade.totalMarks} />
            </MappingConfidenceTooltip>
          ) : null}
          <button
            aria-label={isExpanded ? 'Collapse feedback' : 'Expand feedback'}
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
            className="flex h-6 w-6 items-center justify-center rounded-full text-ink-400 hover:bg-canvas-100"
          >
            <ChevronDown size={16} className={cn('transition-transform', isExpanded && 'rotate-180')} />
          </button>
        </span>
      </button>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="ml-10 mt-3 rounded-xl bg-canvas-50 p-3.5">
              {isUnanswered ? (
                <p className="text-[13px] text-ink-500">
                  This question was not answered on the submitted answer sheet.
                </p>
              ) : grade ? (
                <FeedbackBody grade={grade} mapping={mapping} />
              ) : (
                <p className="text-[13px] text-ink-400">No feedback available.</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FeedbackBody({
  grade,
  mapping,
}: {
  grade: QuestionGrade;
  mapping: QuestionMapping | undefined;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-ink-400">AI Feedback</p>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-700">{grade.feedback}</p>
      </div>
      {grade.strengths.length > 0 && (
        <ListBlock label="Strengths" items={grade.strengths} tone="success" />
      )}
      {grade.mistakes.length > 0 && <ListBlock label="Mistakes" items={grade.mistakes} tone="danger" />}
      {mapping?.needsReview && (
        <p className="rounded-lg bg-warning-50 px-2.5 py-1.5 text-[12px] font-medium text-warning-DEFAULT">
          Low mapping confidence ({formatConfidence(mapping.confidence)}) — please verify this pairing.
        </p>
      )}
    </div>
  );
}

function ListBlock({ label, items, tone }: { label: string; items: string[]; tone: 'success' | 'danger' }) {
  return (
    <div>
      <p
        className={cn(
          'text-xs font-bold uppercase tracking-wide',
          tone === 'success' ? 'text-success-DEFAULT' : 'text-danger-DEFAULT'
        )}
      >
        {label}
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[13px] text-ink-700">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function MappingConfidenceTooltip({
  mapping,
  children,
}: {
  mapping: QuestionMapping | undefined;
  children: React.ReactNode;
}) {
  if (!mapping) return <>{children}</>;
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <span>{children}</span>
      </TooltipTrigger>
      <TooltipContent>
        <p className="font-semibold">Mapping confidence: {formatConfidence(mapping.confidence)}</p>
        <p className="mt-1 text-ink-300">{mapping.reasoning}</p>
      </TooltipContent>
    </Tooltip>
  );
}
