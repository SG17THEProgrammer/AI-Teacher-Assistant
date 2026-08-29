'use client';

import { ArrowLeft, HelpCircle, Bell, Sparkles, ChevronDown, ClipboardList } from 'lucide-react';

export function TopBar({ breadcrumb = 'Exams', onBack }: { breadcrumb?: string; onBack?: () => void }) {
  return (
    <header className="flex h-[73px] flex-shrink-0 items-center justify-between border-b border-black/5 bg-white px-4 md:px-6">
      <div className="flex items-center gap-3 text-ink-700">
        <button aria-label="Back" className="text-ink-900" onClick={onBack}>
          <ArrowLeft size={20} />
        </button>
        <ClipboardList size={16} className="text-ink-400" />
        <span className="text-[15px] font-medium">{breadcrumb}</span>
      </div>

      <div className="flex items-center gap-3 md:gap-5">
        <button aria-label="Help" className="hidden sm:flex text-ink-600 hover:text-ink-900">
          <HelpCircle size={20} />
        </button>
        <button aria-label="Notifications" className="relative text-ink-600 hover:text-ink-900">
          <Bell size={20} />
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-brand-500" />
        </button>
        <button
          aria-label="AI Toolkit"
          className="hidden sm:flex h-8 w-8 items-center justify-center rounded-full border border-ink-900/10 text-ink-900"
        >
          <Sparkles size={16} />
        </button>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 overflow-hidden rounded-full bg-canvas-200">
            <div className="flex h-full w-full items-center justify-center text-sm">👩🏻‍🏫</div>
          </div>
          <span className="hidden text-sm font-semibold text-ink-900 md:inline">Madhur Rastogi</span>
          <ChevronDown size={16} className="hidden text-ink-400 md:inline" />
        </div>
      </div>
    </header>
  );
}