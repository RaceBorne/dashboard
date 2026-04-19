'use client';

import { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Sparkles,
  Send,
  RefreshCw,
  ChevronDown,
  Pencil,
  Trash2,
  Copy,
  Check,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { MessageResponse } from '@/components/MessageResponse';
import {
  readEnvValues,
  writeEnvValues,
  clearEnvValues,
  envBlock,
  maskValue,
  type EnvValues,
} from '@/lib/connections-store';
import { cn } from '@/lib/utils';
import type { IntegrationStatus } from '@/lib/types';

const CATEGORY_LABEL: Record<IntegrationStatus['category'], string> = {
  infra: 'Infrastructure',
  ai: 'AI',
  commerce: 'Commerce',
  seo: 'SEO & analytics',
  leads: 'Leads & messaging',
  social: 'Social',
  storage: 'Storage',
};
const CATEGORY_ORDER: IntegrationStatus['category'][] = [
  'infra',
  'ai',
  'commerce',
  'seo',
  'leads',
  'social',
  'storage',
];

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  mock?: boolean;
}

export function ConnectionsClient({
  integrations,
}: {
  integrations: IntegrationStatus[];
}) {
  const grouped = integrations.reduce<
    Record<string, IntegrationStatus[]>
  >((acc, s) => {
    (acc[s.category] ||= []).push(s);
    return acc;
  }, {});

  // --- Chat state ---------------------------------------------------------
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<ChatMsg[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;
    const userMsg: ChatMsg = {
      id: 'u-' + Math.random().toString(36).slice(2, 9),
      role: 'user',
      content: text,
    };
    setHistory((h) => [...h, userMsg]);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch('/api/connections/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: history.map(({ role, content }) => ({ role, content })),
        }),
      });
      const data = (await res.json()) as { markdown: string; mock?: boolean };
      setHistory((h) => [
        ...h,
        {
          id: 'a-' + Math.random().toString(36).slice(2, 9),
          role: 'assistant',
          content: data.markdown,
          mock: data.mock,
        },
      ]);
    } catch (e) {
      setHistory((h) => [
        ...h,
        {
          id: 'a-err',
          role: 'assistant',
          content: 'Something went wrong reaching the chat endpoint.',
          mock: true,
        },
      ]);
    } finally {
      setLoading(false);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: 'smooth',
        });
      });
    }
  }

  // --- Edit / delete state -----------------------------------------------
  const [editing, setEditing] = useState<IntegrationStatus | null>(null);
  const confirm = useConfirm();

  async function deleteCredentials(s: IntegrationStatus) {
    const ok = await confirm({
      title: 'Clear stored credentials?',
      description: `Removes locally-saved values for ${s.label}. Env vars in your .env.local / Vercel project are not touched.`,
      confirmLabel: 'Clear',
      tone: 'danger',
    });
    if (!ok) return;
    clearEnvValues(s.key);
    // Nudge re-render
    setLocalVersion((v) => v + 1);
  }

  // localVersion is bumped whenever local credentials change, so cards
  // re-evaluate their "saved locally" state.
  const [localVersion, setLocalVersion] = useState(0);

  const connectedCount = integrations.filter((i) => i.connected).length;

  return (
    <div className="p-6 max-w-[1200px] space-y-6">
      {/* Chat window */}
      <section className="rounded-xl bg-evari-surface p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-lg bg-evari-surfaceSoft flex items-center justify-center shrink-0">
            <Sparkles className="h-4 w-4 text-evari-dim" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-evari-text">
              Ask about connections
            </div>
            <div className="text-xs text-evari-dim mt-0.5">
              What should we wire up next and why? Grounded in the current
              connection state below.
            </div>
          </div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer">
            {connectedCount} / {integrations.length} connected
          </div>
        </div>

        {history.length > 0 && (
          <div
            ref={scrollRef}
            className="space-y-3 max-h-[360px] overflow-y-auto pr-1"
          >
            {history.map((m) => (
              <div
                key={m.id}
                className={cn(
                  'rounded-md p-3',
                  m.role === 'user'
                    ? 'bg-evari-surfaceSoft ml-6'
                    : 'bg-evari-surface/60 mr-6',
                )}
              >
                {m.role === 'assistant' && m.mock && (
                  <Badge variant="warning" className="text-[10px] mb-2">
                    offline reply
                  </Badge>
                )}
                {m.role === 'assistant' ? (
                  <div className="text-sm">
                    <MessageResponse>{m.content}</MessageResponse>
                  </div>
                ) : (
                  <div className="text-sm text-evari-text leading-relaxed">
                    {m.content}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <Input
            placeholder="e.g. What scopes do I need to enable the bike-builder → Shopify draft-order flow?"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void sendMessage();
              }
            }}
            disabled={loading}
            className="flex-1"
          />
          <Button
            variant="primary"
            size="sm"
            onClick={() => void sendMessage()}
            disabled={loading || !input.trim()}
          >
            {loading ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : (
              <Send className="h-3 w-3" />
            )}
            Send
          </Button>
        </div>
      </section>

      {/* How credentials are read */}
      <section className="rounded-xl bg-evari-surface p-5 space-y-2">
        <div className="text-sm font-medium text-evari-text">
          How this dashboard reads credentials
        </div>
        <p className="text-sm text-evari-dim leading-relaxed">
          The server reads credentials from{' '}
          <code className="font-mono text-evari-text">process.env</code>. Use
          the <span className="inline-flex items-center gap-0.5">
            <Pencil className="h-3 w-3" /> edit
          </span>{' '}
          button on any row to enter values — they're stored on this device
          and exported as a ready-to-paste{' '}
          <code className="font-mono text-evari-text">.env</code> block for{' '}
          <code className="font-mono text-evari-text">.env.local</code> or
          Vercel project settings. Once Supabase is wired, the save action
          will persist server-side and the adapters will flip live
          automatically.
        </p>
      </section>

      {/* Connections grouped by category */}
      {CATEGORY_ORDER.map((cat) => {
        const items = grouped[cat];
        if (!items || items.length === 0) return null;
        return (
          <section key={cat} className="space-y-2">
            <h2 className="text-[10px] uppercase tracking-[0.18em] text-evari-dimmer font-medium px-1">
              {CATEGORY_LABEL[cat]}
            </h2>
            <div className="space-y-1">
              {items.map((s) => (
                <ConnectionCard
                  key={s.key + '-' + localVersion}
                  s={s}
                  onEdit={() => setEditing(s)}
                  onDelete={() => void deleteCredentials(s)}
                />
              ))}
            </div>
          </section>
        );
      })}

      {/* Edit dialog */}
      <Dialog
        open={editing != null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        {editing && (
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Credentials · {editing.label}</DialogTitle>
              <DialogDescription>
                Paste or type your keys below. They're saved on this device
                only and exportable as a ready-to-paste .env block.
              </DialogDescription>
            </DialogHeader>
            <CredentialsForm
              s={editing}
              onSaved={() => {
                setLocalVersion((v) => v + 1);
                setEditing(null);
              }}
              onCancel={() => setEditing(null)}
            />
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Connection card

function ConnectionCard({
  s,
  onEdit,
  onDelete,
}: {
  s: IntegrationStatus;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const localValues = readEnvValues(s.key);
  const hasLocal = Object.keys(localValues).length > 0;

  return (
    <div className="group relative rounded-md bg-evari-surface/60 p-4 space-y-3 hover:bg-evari-surface transition-colors">
      {/* Edit / delete — top-right */}
      <div className="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <button
          type="button"
          aria-label={'Edit ' + s.label + ' credentials'}
          title="Edit credentials"
          onClick={onEdit}
          className="h-6 w-6 inline-flex items-center justify-center rounded text-evari-dimmer hover:text-evari-text hover:bg-evari-surfaceSoft"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          type="button"
          aria-label={'Clear ' + s.label + ' credentials'}
          title="Clear credentials"
          onClick={onDelete}
          className="h-6 w-6 inline-flex items-center justify-center rounded text-evari-dimmer hover:text-evari-danger hover:bg-evari-surfaceSoft"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      <div className="flex items-start justify-between gap-3 pr-14">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-sm font-medium text-evari-text">
              {s.label}
            </div>
            {s.connected ? (
              <Badge variant="success" className="text-[10px]">
                <CheckCircle2 className="h-3 w-3" />
                connected
              </Badge>
            ) : (
              <Badge variant="warning" className="text-[10px]">
                <AlertCircle className="h-3 w-3" />
                not connected
              </Badge>
            )}
            {hasLocal && !s.connected && (
              <Badge variant="gold" className="text-[10px]">
                saved locally
              </Badge>
            )}
          </div>
          <a
            href={s.docsUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 text-[11px] text-evari-dim hover:text-evari-gold inline-flex items-center gap-1"
          >
            documentation
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        </div>
        {(s.capabilities?.length ?? 0) > 0 && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-[11px] text-evari-dim hover:text-evari-text inline-flex items-center gap-1 h-6 px-2 rounded-md hover:bg-evari-surfaceSoft shrink-0"
          >
            {open ? 'Hide scopes' : `${s.capabilities!.length} scopes`}
            <ChevronDown
              className={cn(
                'h-3 w-3 transition-transform',
                open && 'rotate-180',
              )}
            />
          </button>
        )}
      </div>

      {s.synopsis && (
        <p className="text-xs text-evari-dim leading-relaxed">{s.synopsis}</p>
      )}
      {s.notes && (
        <p className="text-[11px] text-evari-dimmer leading-relaxed italic">
          {s.notes}
        </p>
      )}

      {open && s.capabilities && (
        <ul className="space-y-1 pt-1">
          {s.capabilities.map((c) => (
            <li
              key={c.name}
              className="rounded-md bg-evari-surface/60 px-3 py-2 flex items-start gap-3"
            >
              <code className="text-[11px] font-mono text-evari-gold shrink-0 pt-0.5">
                {c.name}
              </code>
              <span className="text-xs text-evari-dim leading-relaxed">
                {c.description}
              </span>
            </li>
          ))}
        </ul>
      )}

      {s.envVarsRequired.length > 0 && (
        <div className="rounded-md bg-evari-ink/60 p-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
              Required env vars
            </div>
            <button
              type="button"
              onClick={onEdit}
              className="text-[10px] text-evari-gold hover:text-evari-text inline-flex items-center gap-1"
            >
              <Pencil className="h-2.5 w-2.5" />
              edit
            </button>
          </div>
          <ul className="space-y-1">
            {s.envVarsRequired.map((v) => {
              const missingFromEnv = s.envVarsMissing.includes(v);
              const locally = localValues[v];
              return (
                <li
                  key={v}
                  className="flex items-center justify-between text-[11px] font-mono gap-3"
                >
                  <span
                    className={
                      missingFromEnv ? 'text-evari-dimmer' : 'text-evari-text'
                    }
                  >
                    {v}
                  </span>
                  {!missingFromEnv ? (
                    <span className="text-evari-success">set</span>
                  ) : locally ? (
                    <span className="text-evari-gold tabular-nums">
                      {maskValue(locally)}
                    </span>
                  ) : (
                    <span className="text-evari-warn">missing</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Credentials form (edit modal body)

function CredentialsForm({
  s,
  onSaved,
  onCancel,
}: {
  s: IntegrationStatus;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<EnvValues>({});
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setValues(readEnvValues(s.key));
  }, [s.key]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    writeEnvValues(s.key, values);
    onSaved();
  }

  function set(k: string, v: string) {
    setValues((prev) => ({ ...prev, [k]: v }));
  }

  async function copyEnv() {
    const block = envBlock(values);
    if (!block) return;
    try {
      await navigator.clipboard.writeText(block);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  if (s.envVarsRequired.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-evari-dim">
          This integration doesn't need any credentials — it works out of the
          box.
        </p>
        <div className="flex justify-end">
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {s.envVarsRequired.map((key) => (
        <label key={key} className="space-y-1 block">
          <span className="block text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium font-mono">
            {key}
          </span>
          <Input
            type="password"
            autoComplete="off"
            value={values[key] ?? ''}
            onChange={(e) => set(key, e.target.value)}
            placeholder="paste value…"
          />
        </label>
      ))}

      {Object.values(values).some(Boolean) && (
        <div className="rounded-md bg-evari-ink/60 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
              Ready-to-paste .env block
            </div>
            <button
              type="button"
              onClick={() => void copyEnv()}
              className="text-[11px] text-evari-gold hover:text-evari-text inline-flex items-center gap-1"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3" />
                  copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  copy
                </>
              )}
            </button>
          </div>
          <pre className="text-[11px] font-mono text-evari-dim whitespace-pre-wrap break-all">
            {envBlock(values) || '# (empty)'}
          </pre>
        </div>
      )}

      <p className="text-[11px] text-evari-dimmer italic leading-relaxed">
        Saved locally on this device. The server reads from process.env — paste
        this block into <code className="font-mono">.env.local</code> (dev) or
        your Vercel project Environment Variables (production) to activate.
      </p>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" variant="primary">
          Save
        </Button>
      </div>
    </form>
  );
}
