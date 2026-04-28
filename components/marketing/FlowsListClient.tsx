'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { Flow } from '@/lib/marketing/types';

interface Props {
  flows: Flow[];
}

export function FlowsListClient({ flows }: Props) {
  return (
    <div className="flex-1 min-h-0 overflow-auto bg-evari-ink p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs text-evari-dimmer tabular-nums">{flows.length} flows</span>
        <Link
          href="/email/flows/new"
          className="ml-auto inline-flex items-center gap-1 rounded-md h-8 px-2.5 text-xs font-semibold bg-evari-gold text-evari-goldInk hover:brightness-105 transition duration-500 ease-in-out"
        >
          <Plus className="h-3.5 w-3.5" />
          New flow
        </Link>
      </div>
      <div className="rounded-panel bg-evari-surface border border-evari-edge/30 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-evari-dimmer border-b border-evari-edge/30">
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Trigger event</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {flows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-12 text-center text-evari-dimmer text-sm">
                  No flows yet. Click <span className="text-evari-text font-semibold">New flow</span> to start one.
                </td>
              </tr>
            ) : (
              flows.map((f) => (
                <tr key={f.id} className="border-b border-evari-edge/20 last:border-0 hover:bg-evari-surfaceSoft/40 transition-colors">
                  <td className="px-3 py-2">
                    <Link href={`/email/flows/${f.id}`} className="text-evari-text font-medium hover:text-evari-gold transition-colors">
                      {f.name || 'Untitled'}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-evari-dim font-mono text-[12px]">{f.triggerValue}</td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-medium',
                        f.isActive
                          ? 'bg-evari-success/15 text-evari-success'
                          : 'bg-evari-surfaceSoft text-evari-dim',
                      )}
                    >
                      {f.isActive ? 'active' : 'paused'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-evari-dimmer text-xs font-mono tabular-nums">
                    {new Date(f.updatedAt).toISOString().slice(0, 10)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
