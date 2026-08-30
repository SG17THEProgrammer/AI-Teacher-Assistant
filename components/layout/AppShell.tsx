'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function AppShell({
  children,
  sidebarCollapsedByDefault = false,
  onBack,
  onExamsClick,
}: {
  children: React.ReactNode;
  sidebarCollapsedByDefault?: boolean;
  onBack?: () => void;
  onExamsClick?: () => void;
}) {
  const [collapsed, setCollapsed] = useState(sidebarCollapsedByDefault);

  useEffect(() => {
    setCollapsed(sidebarCollapsedByDefault);
  }, [sidebarCollapsedByDefault]);

  return (
    /*
      Root shell: always exactly the viewport, no overflow.
      overflow-hidden at this level means the sidebar + content area
      together can never push the page wider or taller than the viewport,
      which prevents the blank-gap issues at non-100% browser zoom.
    */
    <div className="flex h-screen w-screen max-w-full overflow-hidden">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        onExamsClick={onExamsClick}
      />
      {/*
        Right-hand column: fills all remaining width, never shrinks below 0,
        stacks TopBar + main vertically. overflow-hidden ensures the main
        area's own scroll containers take over instead of the column itself
        growing.
      */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden mr-2 md:mr-0">
        <TopBar onBack={onBack} />
        {/*
          Main content area: flex-1 fills vertical space, overflow-hidden so
          each screen (Exams, Upload, Results…) controls its own scrolling.
        */}
        <main className="flex-1 overflow-hidden bg-transparent  mt-2 mb-2">{children}</main>
      </div>
    </div>
  );
}