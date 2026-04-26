'use client';

import { useMemo, useState } from 'react';

import { cn } from '@/lib/utils';
import { renderFooter } from '@/lib/marketing/footer';
import {
  DEFAULT_FOOTER_DESIGN,
  type FooterAlignment,
  type FooterDesign,
  type FooterLayout,
  type FooterSocial,
  type MarketingBrand,
} from '@/lib/marketing/types';

interface Props {
  initialBrand: MarketingBrand;
  value: FooterDesign | null;
  onChange: (next: FooterDesign) => void;
}

const LAYOUTS: Array<{ value: FooterLayout; label: string; hint: string }> = [
  { value: 'stacked',  label: 'Stacked',  hint: 'Each block as its own row' },
  { value: 'split',    label: 'Split',    hint: 'Logo + signature left · address + social right' },
  { value: 'centered', label: 'Centered', hint: 'Stacked but always centred' },
];

const ALIGNMENTS: Array<{ value: FooterAlignment; label: string }> = [
  { value: 'left',   label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right',  label: 'Right' },
];

const BLOCK_LABELS: Array<{ key: keyof FooterDesign['blocks']; label: string; hint: string }> = [
  { key: 'logo',        label: 'Logo',        hint: 'Brand logo image' },
  { key: 'signature',   label: 'Signature',   hint: 'Sender signature block' },
  { key: 'address',     label: 'Address',     hint: 'Company name + postal address (legal)' },
  { key: 'social',      label: 'Social',      hint: 'Links to your platforms' },
  { key: 'unsubscribe', label: 'Unsubscribe', hint: 'Required by law for marketing' },
];

const SOCIAL_FIELDS: Array<{ key: keyof FooterSocial; label: string; placeholder: string }> = [
  { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/evari' },
  { key: 'twitter',   label: 'X / Twitter', placeholder: 'https://x.com/evari' },
  { key: 'linkedin',  label: 'LinkedIn',  placeholder: 'https://linkedin.com/company/evari' },
  { key: 'facebook',  label: 'Facebook',  placeholder: 'https://facebook.com/evari' },
  { key: 'tiktok',    label: 'TikTok',    placeholder: 'https://tiktok.com/@evari' },
  { key: 'youtube',   label: 'YouTube',   placeholder: 'https://youtube.com/@evari' },
  { key: 'website',   label: 'Website',   placeholder: 'https://evari.cc' },
];

/**
 * Branded footer designer. Lives inside the brand kit page. Builds a
 * FooterDesign config, renders the live preview using the SAME
 * renderFooter() function the sender uses at send time, so what you
 * see here is byte-identical to what mailbox providers see.
 */
export function FooterDesigner({ initialBrand, value, onChange }: Props) {
  const design = value ?? DEFAULT_FOOTER_DESIGN;
  const [showSocial, setShowSocial] = useState(false);

  function update<K extends keyof FooterDesign>(key: K, val: FooterDesign[K]) {
    onChange({ ...design, [key]: val });
  }
  function toggleBlock(k: keyof FooterDesign['blocks']) {
    onChange({ ...design, blocks: { ...design.blocks, [k]: !design.blocks[k] } });
  }
  function setSocial(k: keyof FooterSocial, v: string) {
    onChange({ ...design, social: { ...design.social, [k]: v } });
  }

  // Compose a hypothetical brand object for the live preview, so the
  // designer reflects edits to OTHER brand-kit fields (signature, logo,
  // address) without needing to save first.
  const previewBrand: MarketingBrand = { ...initialBrand, footerDesign: design };
  const previewHtml = useMemo(
    () =>
      renderFooter({
        brand: previewBrand,
        unsubscribeUrl: 'https://dashboard-raceborne.vercel.app/unsubscribe?u=preview',
      }),
    [previewBrand],
  );

  const inputCls =
    'px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text text-sm border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none transition-colors duration-500 ease-in-out w-full';

  return (
    <section className="rounded-md bg-evari-surface border border-evari-edge/30 p-4 xl:col-span-2">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-evari-text">Branded footer</h2>
        <span className="text-[10px] text-evari-dimmer">Auto-appended to every send · same renderer as the mailbox preview</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Controls */}
        <div className="space-y-3">
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-1">Layout</span>
            <div className="grid grid-cols-3 gap-1">
              {LAYOUTS.map((l) => (
                <button
                  key={l.value}
                  type="button"
                  onClick={() => update('layout', l.value)}
                  className={cn(
                    'p-2 rounded-md text-xs transition-colors duration-500 ease-in-out text-left',
                    design.layout === l.value
                      ? 'bg-evari-gold text-evari-goldInk'
                      : 'bg-evari-ink text-evari-dim hover:text-evari-text',
                  )}
                >
                  <div className="font-semibold">{l.label}</div>
                  <div className="text-[10px] opacity-80 mt-0.5">{l.hint}</div>
                </button>
              ))}
            </div>
          </label>

          {design.layout !== 'split' ? (
            <label className="block">
              <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-1">Alignment</span>
              <div className="inline-flex rounded-md bg-evari-ink border border-evari-edge/30 p-0.5">
                {ALIGNMENTS.map((a) => (
                  <button
                    key={a.value}
                    type="button"
                    onClick={() => update('alignment', a.value)}
                    disabled={design.layout === 'centered'}
                    className={cn(
                      'px-3 py-1 rounded text-xs font-medium transition-colors duration-500 ease-in-out',
                      design.alignment === a.value
                        ? 'bg-evari-gold text-evari-goldInk'
                        : 'text-evari-dim hover:text-evari-text disabled:opacity-50',
                    )}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
              {design.layout === 'centered' ? (
                <span className="block text-[10px] text-evari-dimmer mt-1">Centered layout always centres — alignment is locked.</span>
              ) : null}
            </label>
          ) : null}

          <fieldset>
            <legend className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-1">Blocks</legend>
            <div className="space-y-1">
              {BLOCK_LABELS.map((b) => (
                <label key={b.key} className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={design.blocks[b.key]}
                    onChange={() => toggleBlock(b.key)}
                    className="mt-0.5 h-4 w-4 rounded accent-evari-gold"
                    disabled={b.key === 'unsubscribe'}
                  />
                  <span className="flex-1">
                    <span className="text-sm text-evari-text">{b.label}</span>
                    <span className="block text-[10px] text-evari-dimmer">
                      {b.hint}{b.key === 'unsubscribe' ? ' · always on' : ''}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {design.blocks.social ? (
            <div className="rounded-md bg-evari-ink/40 border border-evari-edge/20 p-3">
              <button
                type="button"
                onClick={() => setShowSocial((v) => !v)}
                className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer hover:text-evari-text transition-colors mb-2"
              >
                Social URLs {showSocial ? '↑' : '↓'} · {Object.values(design.social).filter(Boolean).length} set
              </button>
              {showSocial ? (
                <div className="space-y-1.5">
                  {SOCIAL_FIELDS.map((f) => (
                    <label key={f.key} className="block">
                      <span className="block text-[10px] text-evari-dimmer mb-0.5">{f.label}</span>
                      <input
                        type="url"
                        value={design.social[f.key] ?? ''}
                        onChange={(e) => setSocial(f.key, e.target.value)}
                        placeholder={f.placeholder}
                        className={cn(inputCls, 'font-mono text-[11px]')}
                      />
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Background</span>
              <div className="flex items-center gap-1">
                <input type="color" value={design.background} onChange={(e) => update('background', e.target.value)} className="h-9 w-9 rounded-md border border-evari-edge/30 bg-evari-ink cursor-pointer" />
                <input type="text" value={design.background} onChange={(e) => update('background', e.target.value)} className={cn(inputCls, 'flex-1 font-mono text-[11px]')} />
              </div>
            </label>
            <label className="block">
              <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Text</span>
              <div className="flex items-center gap-1">
                <input type="color" value={design.textColor} onChange={(e) => update('textColor', e.target.value)} className="h-9 w-9 rounded-md border border-evari-edge/30 bg-evari-ink cursor-pointer" />
                <input type="text" value={design.textColor} onChange={(e) => update('textColor', e.target.value)} className={cn(inputCls, 'flex-1 font-mono text-[11px]')} />
              </div>
            </label>
            <label className="block">
              <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Muted (legal/fine print)</span>
              <div className="flex items-center gap-1">
                <input type="color" value={design.mutedColor} onChange={(e) => update('mutedColor', e.target.value)} className="h-9 w-9 rounded-md border border-evari-edge/30 bg-evari-ink cursor-pointer" />
                <input type="text" value={design.mutedColor} onChange={(e) => update('mutedColor', e.target.value)} className={cn(inputCls, 'flex-1 font-mono text-[11px]')} />
              </div>
            </label>
            <label className="block">
              <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Padding (px)</span>
              <input type="number" min={0} max={96} value={design.paddingPx} onChange={(e) => update('paddingPx', Math.max(0, Math.min(96, Number(e.target.value) || 0)))} className={cn(inputCls, 'font-mono text-[11px]')} />
            </label>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={design.borderTop}
              onChange={(e) => update('borderTop', e.target.checked)}
              className="h-4 w-4 rounded accent-evari-gold"
            />
            <span className="text-sm text-evari-text">Top border</span>
            {design.borderTop ? (
              <input
                type="color"
                value={design.borderColor}
                onChange={(e) => update('borderColor', e.target.value)}
                className="ml-auto h-7 w-7 rounded border border-evari-edge/30 bg-evari-ink cursor-pointer"
              />
            ) : null}
          </label>
        </div>

        {/* Preview */}
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">Live preview</div>
          <div className="rounded-md border border-evari-edge/30 overflow-hidden bg-zinc-50">
            <div
              className="text-zinc-900 max-h-[600px] overflow-auto"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </div>
          <p className="text-[10px] text-evari-dimmer">
            Rendered with the same function the sender uses. Email-safe nested tables, inline CSS only.
          </p>
        </div>
      </div>
    </section>
  );
}
