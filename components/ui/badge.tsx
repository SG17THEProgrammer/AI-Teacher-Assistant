import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-bold leading-none',
  {
    variants: {
      tone: {
        success: 'bg-success-light text-success-DEFAULT',
        warning: 'bg-warning-50 text-warning-DEFAULT',
        danger: 'bg-danger-50 text-danger-DEFAULT',
        neutral: 'bg-canvas-200 text-ink-600',
        brand: 'bg-brand-50 text-brand-600',
      },
    },
    defaultVariants: { tone: 'neutral' },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/** Marks badge that auto-picks a tone from the score ratio, matching the
 *  green (>=70%), orange (30-70%), red (<30%) pattern in the reference design. */
export function MarksBadge({ awarded, total }: { awarded: number; total: number }) {
  const ratio = total > 0 ? awarded / total : 0;
  const tone = ratio >= 0.7 ? 'success' : ratio >= 0.3 ? 'warning' : 'danger';
  return (
    <Badge tone={tone}>
      {formatMarks(awarded)}/{formatMarks(total)}
    </Badge>
  );
}

function formatMarks(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
