'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Briefcase, Check, ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CtxLite {
  id: string;
  name: string;
  isDefault: boolean;
}

interface Props {
  contexts: CtxLite[];
  activeId: string | null;
}

/**
 * Persistent active-context dropdown shown in the TopBar across every
 * page. Click to switch which context is being employed; the cookie
 * write triggers a router.refresh() so the page (and any AI prompts
 * fired from it) pick up the new identity.
 */
export function ContextPicker({ contexts, activeId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const active = contexts.find((c) => c.id === activeId) ?? contexts[0];

  async function pick(id: string) {
    if (id === activeId) {
      setOpen(false);
      return;
    }
    setBusy(id);
    try {
      const res = await fetch('/api/context/active', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json().catch(() => null);
      if (data?.ok) {
        setOpen(false);
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  if (!active) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-evari-edge/40 bg-evari-edge/10 text-[12px] text-evari-text hover:border-evari-gold/40 transition"
        title="Switch active context"
      >
        <Briefcase className="h-3.5 w-3.5 text-evari-gold/80" />
        <span className="font-medium">{active.name}</span>
        <ChevronDown className="h-3 w-3 text-evari-dim" />
      </button>
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-label="Close context picker"
          />
          <div className="absolute right-0 mt-1 z-50 min-w-[260px] rounded-md border border-evari-edge/40 bg-evari-surface shadow-2xl overflow-hidden">
            <div className="px-3 py-2 border-b border-evari-edge/30 text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">
              Active context
            </div>
            <ul>
              {contexts.map((c) => {
                const isActive = c.id === activeId;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => void pick(c.id)}
                      disabled={busy === c.id}
                      className={cn(
                        'w-full text-left px-3 py-2 flex items-center gap-2 text-[12px] transition',
                        isActive ? 'bg-evari-gold/10 text-evari-gold' : 'text-evari-text hover:bg-evari-edge/20',
                      )}
                    >
                      <Briefcase className="h-3.5 w-3.5 shrink-0" />
                      <span className="font-medium truncate">{c.name}</span>
                      {isActive ? <Check className="h-3.5 w-3.5 ml-auto" /> : null}
                      {busy === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin ml-auto" /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-evari-edge/30">
              <a
                href="/context"
                className="block px-3 py-2 text-[11px] text-evari-dim hover:bg-evari-edge/20 hover:text-evari-text transition"
                onClick={() => setOpen(false)}
              >
                Manage contexts →
              </a>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
