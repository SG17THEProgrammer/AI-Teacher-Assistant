'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { QuestionCard } from './QuestionCard';
import { SummaryCard } from './SummaryCard';
import { OrphanAnswersPanel } from './OrphanAnswersPanel';
import type { ExtractedQuestion } from '@/types/question';
import type { ExtractedAnswerBlock } from '@/types/answer';
import type { MappingResult } from '@/types/mapping';
import type { GradingResult } from '@/types/grading';

export function QuestionList({
  questions,
  answers,
  mapping,
  grading,
  activeQuestionId,
  onSelectQuestion,
  onSelectAnswer,
}: {
  questions: ExtractedQuestion[];
  answers: ExtractedAnswerBlock[];
  mapping: MappingResult;
  grading: GradingResult;
  activeQuestionId: string | null;
  onSelectQuestion: (questionId: string) => void;
  onSelectAnswer: (answerId: string) => void;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [allExpanded, setAllExpanded] = useState(false);

  const mappingByQuestion = new Map(mapping.mappings.map((m) => [m.questionId, m]));
  const gradeByQuestion = new Map(grading.grades.map((g) => [g.questionId, g]));
  const unansweredSet = new Set(mapping.unansweredQuestionIds);
  const answersById = new Map(answers.map((a) => [a.answerId, a]));
  const questionsById = new Map(questions.map((q) => [q.id, q]));

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="flex h-full flex-col mr-1">
      <div className="flex items-center justify-between px-5 py-4">
        <h2 className="text-[15px] font-bold text-ink-900">
          Extracted Questions <span className="font-medium text-ink-400">(from question paper)</span>
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const next = !allExpanded;
            setAllExpanded(next);
            setExpandedIds(next ? new Set(questions.map((q) => q.id)) : new Set());
          }}
        >
          {allExpanded ? 'Collapse All' : 'Expand All'}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-5 pt-4">
        {/* <div className="mb-4">
          <SummaryCard summary={grading.summary} />
        </div> */}

        <div className="flex flex-col gap-3 -mt-4">
          {questions.map((question, i) => (
            <QuestionCard
              key={question.id}
              index={i + 1}
              question={question}
              grade={gradeByQuestion.get(question.id)}
              mapping={mappingByQuestion.get(question.id)}
              isUnanswered={unansweredSet.has(question.id)}
              isActive={activeQuestionId === question.id}
              isExpanded={expandedIds.has(question.id)}
              onSelect={() => onSelectQuestion(question.id)}
              onToggleExpand={() => toggleExpand(question.id)}
            />
          ))}
        </div>

        {mapping.orphanAnswers.length > 0 && (
          <div className="mt-4">
            <OrphanAnswersPanel
              orphans={mapping.orphanAnswers}
              answersById={answersById}
              questionsById={questionsById}
              onSelectAnswer={onSelectAnswer}
            />
          </div>
        )}
      </div>
    </div>
  );
}
