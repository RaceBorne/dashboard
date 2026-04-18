import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-evari-edge bg-evari-surface text-evari-text',
        outline: 'border-evari-edge bg-transparent text-evari-dim',
        muted: 'border-transparent bg-evari-edge text-evari-dim',
        accent: 'border-primary/40 bg-primary/15 text-primary',
        gold: 'border-evari-gold/40 bg-evari-gold/10 text-evari-gold',
        success: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
        warning: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
        critical: 'border-red-500/40 bg-red-500/15 text-red-300',
        info: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
