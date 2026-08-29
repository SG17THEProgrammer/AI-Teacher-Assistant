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

  const viewerEl = (
    <AnswerSheetViewer
      sessionId={session.sessionId}
      pageCount={session.answerSheet?.pageCount ?? 1}
      answers={session.answers}
      mapping={session.mapping}
      questions={session.questions}
      activeQuestionId={activeQuestionId}
      activeAnswerId={activeAnswerId}
    />
  );

  return (
    <TooltipProvider>
      {/*
        Desktop two-panel layout.
        Key fixes:
        - Left panel: fixed width w-[380px] with flex-shrink-0 so it never
          squishes regardless of browser zoom.
        - Right panel: min-w-0 + flex-1 so it fills remaining space but
          never forces the layout wider than the viewport.
        - Both panels: overflow-hidden so their own internal scroll containers
          work correctly and nothing bleeds out of the split.
      */}
      <div className="hidden h-full md:flex overflow-hidden">
        <div className="w-[49%] flex-shrink-0 bg-transparent overflow-hidden  border border-red-600 rounded-tr-[15px] rounded-br-[15px]">
          {questionListEl}
        </div>
        <div className="min-w-0 flex-1 overflow-hidden ">
          {viewerEl}
        </div>
      </div>

      {/* Mobile: tabbed toggle */}
      <div className="flex h-full flex-col md:hidden overflow-hidden">
        <Tabs
          value={mobileTab}
          onValueChange={(v) => setMobileTab(v as 'questions' | 'sheet')}
          className="flex h-full flex-col overflow-hidden"
        >
          <div className="flex flex-shrink-0 justify-center border-b border-black/5 bg-white py-3">
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