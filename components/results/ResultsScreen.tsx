'use client';

import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QuestionList } from './QuestionList';
import { AnswerSheetViewer } from './AnswerSheetViewer';
import type { SessionData } from '@/types/session';

export function ResultsScreen({ session, onBack }: { session: SessionData; onBack?: () => void }) {
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(
    session.questions[0]?.id ?? null
  );
  const [activeAnswerId, setActiveAnswerId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'questions' | 'sheet'>('questions');

  if (!session.mapping || !session.grading) return null;

  const selectQuestion = (id: string) => {
    setActiveQuestionId(id);
    setActiveAnswerId(null);
    setMobileTab('sheet');
  };
  const selectAnswer = (id: string) => {
    setActiveAnswerId(id);
    setActiveQuestionId(null);
    setMobileTab('sheet');
  };

  const questionListEl = (
    <QuestionList
      questions={session.questions}
      answers={session.answers}
      mapping={session.mapping}
      grading={session.grading}
      activeQuestionId={activeQuestionId}
      onSelectQuestion={selectQuestion}
      onSelectAnswer={selectAnswer}
    />
  );

  // The uploaded file's own page count is the primary source, but never
  // trust it below the highest page any extracted answer actually landed
  // on -- otherwise a page 2 answer can be reachable (via clicking its
  // question) while the toolbar still declares only 1 page until then.
  const highestAnswerPage = session.answers.reduce((max, a) => Math.max(max, a.pageNumber), 1);
  const pageCount = Math.max(session.answerSheet?.pageCount ?? 1, highestAnswerPage);

  const viewerEl = (
    <AnswerSheetViewer
      sessionId={session.sessionId}
      pageCount={pageCount}
      answers={session.answers}
      mapping={session.mapping}
      questions={session.questions}
      activeQuestionId={activeQuestionId}
      activeAnswerId={activeAnswerId}
    />
  );

  return (
    <TooltipProvider>
      {/* Desktop: side-by-side, matches reference design's two-panel layout */}
      <div className="hidden h-full md:flex">
        <div className="w-[420px] flex-shrink-0 border-r border-black/5 bg-canvas-50">
          {questionListEl}
        </div>
        <div className="min-w-0 flex-1">{viewerEl}</div>
      </div>

      {/* Mobile: tabbed toggle, matches reference design's mobile screens */}
      <div className="flex h-full flex-col md:hidden">
        <Tabs
          value={mobileTab}
          onValueChange={(v) => setMobileTab(v as 'questions' | 'sheet')}
          className="flex h-full flex-col"
        >
          <div className="flex justify-center border-b border-black/5 bg-white py-3">
            <TabsList>
              <TabsTrigger value="questions">Questions</TabsTrigger>
              <TabsTrigger value="sheet">Answer Sheet</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="questions" className="min-h-0 flex-1 overflow-hidden bg-canvas-50">
            {questionListEl}
          </TabsContent>
          <TabsContent value="sheet" className="min-h-0 flex-1 overflow-hidden">
            {viewerEl}
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}