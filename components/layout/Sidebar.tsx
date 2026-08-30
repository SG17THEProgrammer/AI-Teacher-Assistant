'use client';

import { useState } from 'react';
import { LayoutGrid, MonitorPlay, FileText, ClipboardList, Clock3, PanelLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { label: 'Home', icon: LayoutGrid },
  { label: 'My Classroom', icon: MonitorPlay },
  { label: 'Assignments', icon: FileText },
  { label: 'Exams', icon: ClipboardList, active: true, action: 'exams' },
  { label: 'My Library', icon: Clock3 },
];

export function Sidebar({
  collapsed,
  onToggle,
  onExamsClick,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onExamsClick?: () => void;
}) {
  const [toast, setToast] = useState<string | null>(null);

  const handleNavClick = (label: string, isActive?: boolean, action?: string) => {
    if (action === 'exams' && onExamsClick) {
      onExamsClick();
      return;
    }
    setToast(`${label} — coming soon`);
    setTimeout(() => setToast(null), 2500);
  };

  if (collapsed) {
    return (
      <aside className="hidden md:flex w-[56px] flex-shrink-0 flex-col items-center gap-4 border-r border-black/5 bg-white py-5 rounded-[15px] m-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-900 -mt-3">
          <span className="text-lg font-black text-white">V</span>
        </div>
        <button
          onClick={onToggle}
          aria-label="Expand sidebar"
          className="mt-1 flex h-9 w-9 items-center justify-center rounded-lg text-ink-400 hover:bg-canvas-100"
        >
          <PanelLeft size={18} />
        </button>
        <div className="mt-2 flex h-10 w-10 items-center justify-center rounded-full bg-brand-500 text-white shadow-floating">
          <SparkleIcon className="h-4 w-4" />
        </div>
        <nav className="mt-2 flex flex-col gap-2">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.label}
              title={item.label}
              onClick={() => handleNavClick(item.label, item.active, (item as any).action)}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-lg',
                item.active ? 'bg-canvas-100 text-ink-900' : 'text-ink-400 hover:bg-canvas-50 cursor-pointer'
              )}
            >
              <item.icon size={18} />
            </button>
          ))}
        </nav>
        <div className="mt-auto flex h-9 w-9 items-center justify-center rounded-full bg-canvas-200 text-xs">
          🏫
        </div>
        {toast && (
          <div className="fixed bottom-6 left-20 z-50 rounded-xl bg-ink-900 px-4 py-2 text-sm text-white shadow-floating">
            {toast}
          </div>
        )}
      </aside>
    );
  }

  return (
    <aside className="hidden md:flex w-[250px] flex-shrink-0 flex-col gap-6 border-r border-black/5 bg-white p-5 rounded-[15px] m-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink-900">
            <span className="text-base font-black text-white">V</span>
          </div>
          <span className="text-xl font-extrabold text-ink-900">VedaAI</span>
        </div>
        <button
          onClick={onToggle}
          aria-label="Collapse sidebar"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-400 hover:bg-canvas-100"
        >
          <PanelLeft size={18} />
        </button>
      </div>

      <button
        onClick={() => handleNavClick('AI Toolkit')}
        className="flex items-center gap-2 rounded-pill bg-ink-900 px-4 py-2.5 text-sm font-semibold text-white shadow-floating"
      >
        <SparkleIcon className="h-4 w-4 text-brand-400" />
        AI Teacher&apos;s Toolkit
      </button>

      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.label}
            onClick={() => handleNavClick(item.label, item.active, (item as any).action)}
            className={cn(
              'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors text-left',
              item.active ? 'bg-canvas-100 text-ink-900' : 'text-ink-500 hover:bg-canvas-50'
            )}
          >
            <item.icon size={18} />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="mt-auto flex items-center gap-3 rounded-2xl bg-canvas-50 p-3">
        {/* <div className="flex h-10 w-10 items-center justify-center rounded-full bg-canvas-200 text-lg"> */}
          <img src="https://icon2.cleanpng.com/20180814/yrk/47849b8ccfecbc49a1a1e22daa4905f3.webp" alt="school_image" className='h-9 w-8'/>
        {/* </div> */}
        <div className="leading-tight">
          <p className="text-sm font-bold text-ink-900">Delhi Public School</p>
          <p className="text-xs text-ink-400">Bokaro Steel City</p>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-[280px] z-50 rounded-xl bg-ink-900 px-4 py-2 text-sm text-white shadow-floating">
          {toast}
        </div>
      )}
    </aside>
  );
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2l1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6L12 2z" />
    </svg>
  );
}