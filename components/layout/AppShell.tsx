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
    <div className="flex h-screen w-full overflow-hidden bg-canvas-DEFAULT">
      <div className="flex h-full w-full overflow-hidden">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} onExamsClick={onExamsClick} />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <TopBar onBack={onBack} />
          <main className="flex-1 overflow-hidden bg-canvas-50">{children}</main>
        </div>
      </div>
    </div>
  );
}