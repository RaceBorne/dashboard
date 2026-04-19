import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// Global rule: every Button renders in UPPERCASE with slightly wider tracking
// for legibility. Icon-only buttons (size="icon") opt out via class override.
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium uppercase tracking-[0.06em] ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-evari-surfaceSoft text-evari-text hover:bg-evari-mute',
        primary:
          'bg-evari-gold text-evari-goldInk hover:bg-evari-gold/90',
        gold:
          'bg-evari-gold text-evari-goldInk hover:bg-evari-gold/90',
        outline:
          'bg-evari-surfaceSoft text-evari-text hover:bg-evari-mute',
        ghost:
          'bg-transparent text-evari-dim hover:bg-evari-surface hover:text-evari-text',
        destructive:
          'bg-evari-danger/90 text-white hover:bg-evari-danger',
        link:
          'text-evari-gold underline-offset-4 hover:underline px-0 py-0 h-auto',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
