'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Brain,
  Check,
  ChevronRight,
  ExternalLink,
  Gauge,
  Hash,
  Instagram,
  KeyRound,
  Linkedin,
  Loader2,
  Mail,
  MapPin,
  Music,
  Search,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/**
 * ConnectorsClient — grid of connectors grouped by category, with a
 * slide-in Configure panel for each provider.
 */

type Status = 'not_configured' | 'configured' | 'live' | 'error' | 'degraded';

interface ConnectorField {
  key: string;
  label: string;
  placeholder?: string;
  secret?: boolean;
  optional?: boolean;
  default?: string;
  helpText?: string;
}

interface Connector {
  id: string;
  name: string;
  category: string;
  module: string;
  icon: string;
  description: string;
  docsUrl?: string;
  oauth: boolean;
  hasTest: boolean;
  fields: ConnectorField[];
  setupSteps?: string[];
  status: Status;
  config: Record<string, unknown>;
  connectedAt: string | null;
  lastTestedAt: string | null;
  lastTestStatus: string | null;
  lastTestError: string | null;
  hasEnvFallback: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  commerce: 'Commerce',
  analytics: 'Analytics',
  seo: 'SEO',
  email: 'Email',
  social: 'Social',
  ai: 'AI',
  infra: 'Infrastructure',
};

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  ShoppingBag,
  KeyRound,
  Mail,
  TrendingUp,
  Search,
  Gauge,
  MapPin,
  Hash,
  Instagram,
  Linkedin,
  Music,
  Sparkles,
  Brain,
};

export function ConnectorsClient() {
  const [loading, setLoading] = useState(true);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [encryptionEnabled, setEncryptionEnabled] = useState<boolean>(true);
  const [activeId, setActiveId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/connectors', { cache: 'no-store' });
      const data = (await res.json()) as {
        ok?: boolean;
        connectors?: Connector[];
        encryptionEnabled?: boolean;
      };
      setConnectors(data.connectors ?? []);
      setEncryptionEnabled(Boolean(data.encryptionEnabled));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byCategory = connectors.reduce<Record<string, Connector[]>>((acc, c) => {
    (acc[c.category] ||= []).push(c);
    return acc;
  }, {});

  const active = activeId ? connectors.find((c) => c.id === activeId) ?? null : null;

  return (
    <div className="space-y-6">
      {!encryptionEnabled ? (
        <div className="rounded-md border border-evari-warn/40 bg-evari-warn/10 px-4 py-3 text-[12px] text-evari-warn">
          <div className="font-medium">Credentials are stored as plaintext.</div>
          <div className="text-evari-text/80 mt-0.5">
            Set CONNECTOR_ENCRYPTION_KEY (32 bytes, base64) in the Vercel
            project environment to enable AES-GCM at rest. Generate with:
            <code className="ml-1 font-mono text-[11px] bg-evari-surface/60 px-1 py-0.5 rounded">
              node -e &quot;console.log(require(&apos;crypto&apos;).randomBytes(32).toString(&apos;base64&apos;))&quot;
            </code>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-evari-dim">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading connectors…
        </div>
      ) : (
        Object.entries(byCategory).map(([cat, items]) => (
          <section key={cat} className="space-y-2">
            <h2 className="text-[11px] uppercase tracking-[0.16em] text-evari-dimmer font-medium px-1">
              {CATEGORY_LABELS[cat] ?? cat}
            </h2>
            <div className="grid gap-2 grid-cols-1 md:grid-cols-2">
              {items.map((c) => (
                <ConnectorCard key={c.id} connector={c} onOpen={() => setActiveId(c.id)} />
              ))}
            </div>
          </section>
        ))
      )}

      {active ? (
        <ConfigurePanel
          connector={active}
          onClose={() => setActiveId(null)}
          onSaved={() => {
            setActiveId(null);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

function ConnectorCard({
  connector,
  onOpen,
}: {
  connector: Connector;
  onOpen: () => void;
}) {
  const Icon = ICONS[connector.icon] ?? KeyRound;
  const effective: Status =
    connector.status === 'not_configured' && connector.hasEnvFallback
      ? 'configured'
      : connector.status;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group w-full text-left rounded-md bg-evari-surface hover:bg-evari-surface/80 transition-colors px-4 py-3.5 flex items-start gap-3"
    >
      <div className="h-8 w-8 rounded bg-evari-surfaceSoft/50 inline-flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="h-4 w-4 text-evari-text/80" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-semibold text-evari-text">
            {connector.name}
          </span>
          <StatusPill status={effective} />
          {connector.oauth ? (
            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-evari-surfaceSoft/60 text-evari-dim font-medium">
              OAuth
            </span>
          ) : null}
        </div>
        <div className="text-[12px] text-evari-dim mt-0.5 leading-relaxed line-clamp-2">
          {connector.description}
        </div>
        {connector.lastTestedAt ? (
          <div className="text-[11px] text-evari-dimmer mt-1">
            Last tested {formatRelative(connector.lastTestedAt)}
            {connector.lastTestError ? ' · ' + connector.lastTestError : ''}
          </div>
        ) : connector.hasEnvFallback ? (
          <div className="text-[11px] text-evari-dimmer mt-1">
            Using legacy env fallback until you save credentials here
          </div>
        ) : null}
      </div>
      <ChevronRight className="h-4 w-4 text-evari-dimmer shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}

function StatusPill({ status }: { status: Status }) {
  // Live / Configured both use the 'wire-live' variable — same bright
  // orange the wireframe uses for a lit-up service, so Craig gets a
  // consistent visual language across the two pages. Error / degraded
  // stay in their own accent so failures still read as failures.
  // Solid orange fill, no outline — matches the wireframe's lit lozenge.
  const liveStyle: React.CSSProperties = {
    background: 'rgb(var(--evari-wire-live))',
    color: 'rgb(var(--evari-wire-live-ink))',
  };
  const style =
    status === 'error'
      ? 'bg-evari-danger/15 text-evari-danger'
      : status === 'degraded'
        ? 'bg-evari-warn/15 text-evari-warn'
        : status === 'not_configured'
          ? 'bg-evari-surfaceSoft text-evari-dim'
          : '';
  const label =
    status === 'live'
      ? 'Live'
      : status === 'configured'
        ? 'Configured'
        : status === 'error'
          ? 'Error'
          : status === 'degraded'
            ? 'Degraded'
            : 'Not configured';
  const isLive = status === 'live' || status === 'configured';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] uppercase tracking-wide font-semibold',
        style,
      )}
      style={isLive ? liveStyle : undefined}
    >
      {label}
    </span>
  );
}

function ConfigurePanel({
  connector,
  onClose,
  onSaved,
}: {
  connector: Connector;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(
      connector.fields.map((f) => [
        f.key,
        f.default && !connector.config[f.key] ? f.default : '',
      ]),
    ),
  );
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/connectors/' + connector.id, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ credentials: values }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'HTTP ' + res.status);
      onSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function runTest() {
    setTesting(true);
    setTestResult(null);
    try {
      // Save first so the tester reads the latest values from the DB.
      if (Object.values(values).some((v) => v)) {
        await fetch('/api/connectors/' + connector.id, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ credentials: values }),
        });
      }
      const res = await fetch('/api/connectors/' + connector.id + '/test', {
        method: 'POST',
      });
      const data = (await res.json()) as { ok?: boolean; detail?: string; error?: string };
      setTestResult({
        ok: Boolean(data.ok),
        msg: data.ok ? (data.detail ?? 'Test passed') : (data.error ?? 'Test failed'),
      });
    } catch (err) {
      setTestResult({
        ok: false,
        msg: err instanceof Error ? err.message : 'Test failed',
      });
    } finally {
      setTesting(false);
    }
  }

  async function clearAll() {
    if (!confirm('Clear all credentials for ' + connector.name + '?')) return;
    setClearing(true);
    try {
      await fetch('/api/connectors/' + connector.id, { method: 'DELETE' });
      onSaved();
    } finally {
      setClearing(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[520px] h-full bg-evari-carbon shadow-2xl flex flex-col">
        <header className="flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-evari-text">
            {connector.name}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-7 w-7 inline-flex items-center justify-center rounded-md text-evari-dimmer hover:text-evari-text hover:bg-evari-surface/60 transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <p className="text-[12px] text-evari-dim leading-relaxed">
            {connector.description}
          </p>
          {connector.docsUrl ? (
            <a
              href={connector.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-evari-gold hover:underline"
            >
              API docs <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}

          {connector.setupSteps && connector.setupSteps.length > 0 ? (
            <div className="rounded-md bg-evari-surface/60 px-3 py-3 space-y-2">
              <div className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
                How to get these credentials
              </div>
              <ol className="space-y-1.5 list-none">
                {connector.setupSteps.map((step, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-[12px] text-evari-text leading-relaxed"
                  >
                    <span className="text-[11px] font-mono tabular-nums text-evari-dimmer pt-0.5 shrink-0 w-5 text-right">
                      {i + 1}.
                    </span>
                    <span className="min-w-0 flex-1">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          <div className="space-y-3 pt-2">
            {connector.fields.map((f) => (
              <div key={f.key} className="space-y-1">
                <label className="text-[11px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
                  {f.label}
                  {f.optional ? (
                    <span className="ml-1 normal-case tracking-normal text-evari-dim">
                      (optional)
                    </span>
                  ) : null}
                </label>
                <input
                  type={f.secret ? 'password' : 'text'}
                  value={values[f.key] ?? ''}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [f.key]: e.target.value }))
                  }
                  placeholder={f.placeholder ?? (f.secret ? '••••••••  (leave blank to keep current)' : '')}
                  className="w-full rounded-md bg-[rgb(var(--evari-input-fill))] px-3 py-2 text-[13px] text-evari-text placeholder:text-evari-dimmer/60 focus:outline-none focus:bg-[rgb(var(--evari-input-fill-focus))] transition-colors"
                  autoComplete="off"
                  spellCheck={false}
                />
                {f.helpText ? (
                  <div className="text-[11px] text-evari-dim leading-relaxed">
                    {f.helpText}
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          {testResult ? (
            <div
              className={cn(
                'rounded-md px-3 py-2 text-[12px]',
                testResult.ok
                  ? 'bg-evari-success/10 text-evari-success'
                  : 'bg-evari-danger/10 text-evari-danger',
              )}
            >
              {testResult.ok ? (
                <div className="inline-flex items-center gap-1.5 font-medium">
                  <Check className="h-3 w-3" /> {testResult.msg}
                </div>
              ) : (
                testResult.msg
              )}
            </div>
          ) : null}

          {saveError ? (
            <div className="rounded-md bg-evari-danger/10 text-evari-danger text-[12px] px-3 py-2">
              {saveError}
            </div>
          ) : null}

          <div className="pt-2 text-[11px] text-evari-dimmer leading-relaxed">
            <div>Paste new values above and hit Save. Leave a field blank to keep the existing secret.</div>
            {connector.hasEnvFallback ? (
              <div className="mt-1">
                Env-var fallback is active for some fields. Saving here
                takes precedence; clearing drops back to the env value.
              </div>
            ) : null}
          </div>
        </div>
        <footer className="px-5 py-3 flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void clearAll()}
            disabled={clearing || saving || testing}
            title="Remove all stored credentials for this connector"
          >
            {clearing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            Clear
          </Button>
          <div className="ml-auto flex items-center gap-2">
            {connector.hasTest ? (
              <Button
                size="sm"
                variant="default"
                onClick={() => void runTest()}
                disabled={testing || saving}
              >
                {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Test
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="primary"
              onClick={() => void save()}
              disabled={saving || testing}
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Save
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diffSec = Math.floor((Date.now() - then) / 1000);
  if (diffSec < 10) return 'just now';
  if (diffSec < 60) return diffSec + 's ago';
  const min = Math.floor(diffSec / 60);
  if (min < 60) return min + 'm ago';
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + 'h ago';
  const d = Math.floor(hr / 24);
  return d + 'd ago';
}
