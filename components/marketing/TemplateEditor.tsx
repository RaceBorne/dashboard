'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Check,
  ChevronLeft,
  Loader2,
  Monitor,
  Smartphone,
  Send,
  Eye,
  X,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import type { EmailTemplate } from '@/lib/marketing/templates';
import type { EmailDesign, MarketingBrand } from '@/lib/marketing/types';
import { EmailDesigner } from './EmailDesigner';
import { renderEmailDesign } from '@/lib/marketing/email-design';

interface Props {
  template: EmailTemplate;
  brand: MarketingBrand;
}

type Device = 'desktop' | 'mobile';

/**
 * Full-page template editor — Klaviyo-style. Top bar with name +
 * Desktop/Mobile toggle + Preview & test, the rich block builder
 * fills the full viewport below. No sidebar nav, no campaign editor
 * cruft — this is the design surface.
 *
 * Save model: autosave on every change, debounced; explicit Save
 * button still available as a manual flush.
 */
export function TemplateEditor({ template, brand }: Props) {
  const router = useRouter();
  const [name, setName] = useState(template.name);
  const [design, setDesign] = useState<EmailDesign>(template.design);
  const [device, setDevice] = useState<Device>('desktop');
  const [savedAt, setSavedAt] = useState<string | null>(template.updatedAt);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const dirty = name !== template.name || JSON.stringify(design) !== JSON.stringify(template.design);

  // Debounced autosave so the user doesn't have to think about saving.
  useEffect(() => {
    if (!dirty) return;
    const handle = setTimeout(() => { void save(); }, 1200);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, design]);

  async function save() {
    if (saving) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/marketing/templates/${template.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, design }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.error ?? 'Save failed');
      setSavedAt(data.template.updatedAt);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-evari-ink">
      {/* Top bar */}
      <header className="h-12 shrink-0 flex items-center gap-3 px-3 border-b border-evari-edge/30 bg-evari-surface">
        <Link href="/email/templates" className="inline-flex items-center gap-1 text-evari-dim hover:text-evari-text text-sm">
          <ChevronLeft className="h-4 w-4" />
          Templates
        </Link>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="text-sm font-semibold text-evari-text bg-transparent focus:outline-none focus:bg-evari-ink rounded px-2 py-1 min-w-[200px]"
          placeholder="Untitled template"
        />
        <div className="text-[10px] text-evari-dimmer flex items-center gap-1">
          {saving ? (
            <><Loader2 className="h-3 w-3 animate-spin" /> Saving</>
          ) : dirty ? (
            <><span className="h-1.5 w-1.5 rounded-full bg-evari-gold" /> Unsaved</>
          ) : savedAt ? (
            <><Check className="h-3 w-3 text-evari-success" /> Saved {new Date(savedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</>
          ) : null}
        </div>

        {/* Device toggle */}
        <div className="ml-auto inline-flex rounded-md bg-evari-ink border border-evari-edge/30 p-0.5">
          <button type="button" onClick={() => setDevice('desktop')} className={cn('inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-colors', device === 'desktop' ? 'bg-evari-gold text-evari-goldInk' : 'text-evari-dim hover:text-evari-text')}>
            <Monitor className="h-3 w-3" /> Desktop
          </button>
          <button type="button" onClick={() => setDevice('mobile')} className={cn('inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-colors', device === 'mobile' ? 'bg-evari-gold text-evari-goldInk' : 'text-evari-dim hover:text-evari-text')}>
            <Smartphone className="h-3 w-3" /> Mobile
          </button>
        </div>

        <button
          type="button"
          onClick={() => setPreviewing(true)}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs bg-evari-ink text-evari-text border border-evari-edge/30 hover:bg-black/40"
        >
          <Eye className="h-3.5 w-3.5" /> Preview & test
        </button>

        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold bg-evari-gold text-evari-goldInk disabled:opacity-50 hover:brightness-110 transition"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {dirty ? 'Save' : 'Saved'}
        </button>
      </header>

      {error ? (
        <div className="px-3 py-1.5 bg-evari-danger/10 text-evari-danger text-[11px] border-b border-evari-danger/30">{error}</div>
      ) : null}

      {/* Designer body — fills the viewport */}
      <div className={cn('flex-1 min-h-0 overflow-auto p-3', device === 'mobile' && 'flex justify-center')}>
        <div className={device === 'mobile' ? 'w-[400px]' : 'w-full'}>
          <EmailDesigner initialBrand={brand} value={design} onChange={setDesign} />
        </div>
      </div>

      {previewing ? (
        <PreviewModal design={design} brand={brand} onClose={() => setPreviewing(false)} />
      ) : null}
    </div>
  );
}

// ─── Preview & test modal ──────────────────────────────────────

function PreviewModal({ design, brand, onClose }: { design: EmailDesign; brand: MarketingBrand; onClose: () => void }) {
  const [device, setDevice] = useState<Device>('desktop');
  const [testEmail, setTestEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const html = useMemo(() => renderEmailDesign(design, brand), [design, brand]);
  const sizeKb = Math.round(new Blob([html]).size / 1024);

  async function sendTest() {
    if (!testEmail.trim()) return;
    setSending(true); setError(null); setSent(null);
    try {
      const res = await fetch('/api/marketing/templates/preview-send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testEmail.trim(), html, subject: '[Test] Template preview' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.error ?? 'Send failed');
      setSent(testEmail.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col">
      <header className="h-12 shrink-0 flex items-center gap-3 px-4 border-b border-evari-edge/30 bg-evari-surface">
        <h3 className="text-sm font-semibold text-evari-text">Preview mode</h3>
        <div className="ml-auto inline-flex rounded-md bg-evari-ink border border-evari-edge/30 p-0.5">
          <button type="button" onClick={() => setDevice('desktop')} className={cn('inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-colors', device === 'desktop' ? 'bg-evari-gold text-evari-goldInk' : 'text-evari-dim hover:text-evari-text')}>
            <Monitor className="h-3 w-3" /> Desktop
          </button>
          <button type="button" onClick={() => setDevice('mobile')} className={cn('inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-colors', device === 'mobile' ? 'bg-evari-gold text-evari-goldInk' : 'text-evari-dim hover:text-evari-text')}>
            <Smartphone className="h-3 w-3" /> Mobile
          </button>
        </div>
        <button type="button" onClick={onClose} className="text-evari-dim hover:text-evari-text inline-flex items-center gap-1 px-2 py-1 rounded">
          <X className="h-4 w-4" /> Done
        </button>
      </header>

      <div className="flex-1 min-h-0 grid grid-cols-[1fr_360px] gap-3 p-3 overflow-hidden">
        {/* Preview iframe */}
        <div className="min-h-0 overflow-auto flex justify-center bg-zinc-100 rounded-md">
          <iframe
            title="Preview"
            srcDoc={html}
            className="bg-white"
            style={{ width: device === 'mobile' ? '400px' : '100%', height: '100%', maxWidth: '900px', border: 0 }}
          />
        </div>

        {/* Side panel — total size + send test */}
        <aside className="rounded-md bg-evari-surface border border-evari-edge/30 p-3 space-y-4 overflow-y-auto">
          <section>
            <h4 className="text-xs font-semibold text-evari-text mb-1">Total size</h4>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-evari-ink overflow-hidden">
                <div className={cn('h-full rounded-full', sizeKb < 102 ? 'bg-evari-success' : 'bg-evari-gold')} style={{ width: `${Math.min(100, (sizeKb / 102) * 100)}%` }} />
              </div>
              <span className="text-[11px] text-evari-text font-mono tabular-nums">~{sizeKb}kb</span>
            </div>
            <p className="text-[10px] text-evari-dimmer mt-1">
              Gmail clips emails over 102kb. {sizeKb < 102 ? 'You\'re safe.' : 'Trim some content to avoid clipping.'}
            </p>
          </section>

          <section>
            <h4 className="text-xs font-semibold text-evari-text mb-1">Send a test</h4>
            <p className="text-[10px] text-evari-dimmer mb-2">Ships the rendered design to one address via Postmark so you can see how it lands in a real inbox.</p>
            <div className="flex items-center gap-1">
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="you@example.com"
                className="flex-1 px-2 py-1 rounded bg-evari-ink text-evari-text text-sm font-mono border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none"
              />
              <button
                type="button"
                disabled={sending || !testEmail.trim()}
                onClick={sendTest}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-evari-gold text-evari-goldInk disabled:opacity-50 hover:brightness-110"
              >
                {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                Send test
              </button>
            </div>
            {sent ? <p className="text-[11px] text-evari-success mt-2">Sent to {sent} ✓</p> : null}
            {error ? <p className="text-[11px] text-evari-danger mt-2">{error}</p> : null}
          </section>
        </aside>
      </div>
    </div>
  );
}
