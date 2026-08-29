'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function AppShell({
  children,
  sidebarCollapsedByDefault = false,
}: {
  children: React.ReactNode;
  sidebarCollapsedByDefault?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(sidebarCollapsedByDefault);

  // `useState`'s initial value only applies on first mount, but AppShell
  // stays mounted across phase transitions (upload -> processing ->
  // results) since only its children swap out. Re-sync collapse state
  // whenever the caller's desired default changes (e.g. entering the
  // "Extracting..." phase, which the design shows with a collapsed
  // sidebar) while still letting the teacher manually toggle afterward.
  useEffect(() => {
    setCollapsed(sidebarCollapsedByDefault);
  }, [sidebarCollapsedByDefault]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-canvas-DEFAULT">
      <div className="flex h-full w-full overflow-hidden">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-hidden bg-canvas-50">{children}</main>
        </div>
      </div>
    </div>
  );
}
