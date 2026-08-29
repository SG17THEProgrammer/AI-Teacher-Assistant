'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn('inline-flex items-center rounded-pill bg-canvas-200 p-1', className)}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'rounded-pill px-5 py-2 text-sm font-semibold text-ink-500 transition-colors',
        'data-[state=active]:bg-ink-900 data-[state=active]:text-white',
        className
      )}
      {...props}
    />
  );
}

export const TabsContent = TabsPrimitive.Content;
