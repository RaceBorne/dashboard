'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Lightweight data table — no virtualisation (we cap reads at a few
 * hundred rows per page anyway, well below the 1k row threshold where
 * scrolling perf actually matters). Uses native HTML table for built-in
 * accessibility and copy/paste behaviour.
 *
 * Caller supplies typed columns and rows; the table handles sticky
 * header, hover state, click-to-open, and an empty state.
 */

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  /** Render a row's cell. */
  render: (row: T) => React.ReactNode;
  /** Tailwind width hint, e.g. "w-24" or "min-w-[12rem]". */
  width?: string;
  align?: 'left' | 'right' | 'center';
  /** Suppress click-through on this cell (e.g. for inline edit cells). */
  swallowClick?: boolean;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  /** Stable id for each row — used as React key + click identifier. */
  rowKey: (row: T) => string;
  /** Click handler. If set, rows render as buttons (with hover + cursor). */
  onRowClick?: (row: T) => void;
  /** Optional empty-state slot when `rows.length === 0`. */
  empty?: React.ReactNode;
  /** Extra class for the outer scroll container. */
  className?: string;
  /**
   * Optional dense rendering — tighter row height, smaller text.
   */
  dense?: boolean;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  empty,
  className,
  dense,
}: DataTableProps<T>) {
  return (
    <div className={cn('rounded-xl bg-evari-surface overflow-hidden', className)}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-evari-surfaceSoft text-evari-dim">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    'text-left font-medium uppercase tracking-[0.08em] text-[10px]',
                    'px-3 py-2',
                    c.align === 'right' && 'text-right',
                    c.align === 'center' && 'text-center',
                    c.width,
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-sm text-evari-dim italic"
                >
                  {empty ?? 'Nothing to show.'}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    'border-t border-evari-edge/30 transition-colors',
                    onRowClick && 'cursor-pointer hover:bg-evari-surfaceSoft/60',
                  )}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      onClick={
                        c.swallowClick
                          ? (e) => e.stopPropagation()
                          : undefined
                      }
                      className={cn(
                        'px-3',
                        dense ? 'py-1.5' : 'py-2.5',
                        'text-evari-text align-middle',
                        c.align === 'right' && 'text-right tabular-nums',
                        c.align === 'center' && 'text-center',
                      )}
                    >
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
