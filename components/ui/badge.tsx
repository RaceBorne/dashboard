import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// Global rule: badges are always solid fills, never translucent tints. Text
// colour follows the auto-contrast principle used for the accent system.
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-evari-surfaceSoft text-evari-text',
        outline: 'bg-evari-surfaceSoft text-evari-dim',
        muted: 'bg-evari-surfaceSoft text-evari-dim',
        accent: 'bg-evari-accent text-white',
        gold: 'bg-evari-gold text-evari-goldInk',
        success: 'bg-evari-success text-evari-ink',
        warning: 'bg-evari-warn text-evari-goldInk',
        critical: 'bg-evari-danger text-white',
        info: 'bg-sky-500 text-evari-ink',
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
