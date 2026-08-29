'use client';

import { AlertTriangle } from 'lucide-react';
import type { OrphanAnswer } from '@/types/mapping';
import type { ExtractedAnswerBlock } from '@/types/answer';
import type { ExtractedQuestion } from '@/types/question';

export function OrphanAnswersPanel({
  orphans,
  answersById,
  questionsById,
  onSelectAnswer,
}: {
  orphans: OrphanAnswer[];
  answersById: Map<string, ExtractedAnswerBlock>;
  questionsById: Map<string, ExtractedQuestion>;
  onSelectAnswer: (answerId: string) => void;
}) {
  if (orphans.length === 0) return null;

  return (
    <div className="rounded-2xl border border-warning-100 bg-warning-50 p-4">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-warning-DEFAULT">
        <AlertTriangle size={13} /> Unmapped Answers ({orphans.length})
      </p>
      <ul className="mt-2 flex flex-col gap-2">
        {orphans.map((orphan) => {
          const answer = answersById.get(orphan.answerId);
          if (!answer) return null;
          const bestGuess = orphan.bestGuessQuestionId
            ? questionsById.get(orphan.bestGuessQuestionId)
            : null;
          return (
            <li key={orphan.answerId}>
              <button
                onClick={() => onSelectAnswer(orphan.answerId)}
                className="w-full rounded-xl bg-white p-3 text-left text-[13px] shadow-panel hover:ring-1 hover:ring-warning-DEFAULT"
              >
                <p className="line-clamp-2 text-ink-700">{answer.answerText}</p>
                <p className="mt-1 text-[11px] font-medium text-ink-400">
                  Page {answer.pageNumber}
                  {orphan.reason === 'duplicate-of-mapped' && bestGuess
                    ? ` • Looks like a duplicate/extra attempt at Q${bestGuess.questionNumber}`
                    : answer.detectedNumberRawText
                      ? ` • Student wrote "${answer.detectedNumberRawText}" but no matching question was found`
                      : ' • No question number could be identified'}
                </p>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
