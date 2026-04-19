'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Generic right-side drawer.
 *
 * 640px wide on desktop, full-width on mobile, ESC + overlay-click +
 * close button all dismiss. Used by Products / Orders / Customers /
 * Discounts / Drafts / Pages / Articles drawers.
 *
 * For the SEO-only drawer use SeoDrawer (built in Milestone 1) — it
 * already wraps Radix directly so the title-tag char counters and
 * Generate buttons can live in the chrome.
 */
export interface RightDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Optional content rendered top-right of the header (status badges etc). */
  headerRight?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  /** Controls the drawer width. Default 640px. */
  width?: number;
}

export function RightDrawer({
  open,
  onOpenChange,
  title,
  subtitle,
  headerRight,
  footer,
  children,
  width = 640,
}: RightDrawerProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content
          style={{ maxWidth: `${width}px` }}
          className="fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-evari-carbon shadow-[-8px_0_40px_rgba(0,0,0,0.55)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right focus:outline-none"
        >
          <header className="flex items-start justify-between gap-4 px-5 py-4 border-b border-evari-edge/40 shrink-0">
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title asChild>
                <div className="text-sm font-medium text-evari-text truncate">
                  {title}
                </div>
              </DialogPrimitive.Title>
              {subtitle && (
                <DialogPrimitive.Description asChild>
                  <div className="text-xs text-evari-dim mt-0.5 truncate">
                    {subtitle}
                  </div>
                </DialogPrimitive.Description>
              )}
            </div>
            {headerRight && (
              <div className="shrink-0 flex items-center gap-2">{headerRight}</div>
            )}
            <DialogPrimitive.Close
              aria-label="Close"
              className="rounded-md p-1.5 text-evari-dim hover:bg-evari-surface hover:text-evari-text"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </header>
          <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
          {footer && (
            <footer
              className={cn(
                'flex items-center justify-end gap-2 px-5 py-3 border-t border-evari-edge/40 shrink-0',
              )}
            >
              {footer}
            </footer>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ---------------------------------------------------------------------------
// Tiny presentational helpers for drawer bodies — used everywhere so they
// live next to the drawer.
// ---------------------------------------------------------------------------

export function DrawerSection({
  title,
  action,
  children,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <header className="flex items-center justify-between mb-2.5">
        <h3 className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
          {title}
        </h3>
        {action}
      </header>
      {children}
    </section>
  );
}

export function DrawerKV({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 py-1.5 text-sm">
      <div className="text-evari-dim">{label}</div>
      <div className="text-evari-text min-w-0 break-words">{children}</div>
    </div>
  );
}
