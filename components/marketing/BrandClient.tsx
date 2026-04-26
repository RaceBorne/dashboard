'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { BrandColors, BrandFonts, MarketingBrand } from '@/lib/marketing/types';

interface Props {
  initialBrand: MarketingBrand;
}

const COLOR_KEYS: Array<{ key: keyof BrandColors; label: string; hint: string }> = [
  { key: 'primary',    label: 'Primary',     hint: 'Headings + main brand colour' },
  { key: 'accent',     label: 'Accent',      hint: 'Highlights + featured links' },
  { key: 'text',       label: 'Body text',   hint: 'Default body copy colour' },
  { key: 'bg',         label: 'Background',  hint: 'Email canvas background' },
  { key: 'link',       label: 'Link',        hint: 'Inline anchor colour' },
  { key: 'buttonBg',   label: 'Button bg',   hint: 'Button background fill' },
  { key: 'buttonText', label: 'Button text', hint: 'Button label colour' },
  { key: 'muted',      label: 'Muted',       hint: 'Footer + helper text' },
];

const FONT_OPTIONS = [
  // Web-safe — no @import required
  'Arial',
  'Helvetica',
  'Georgia',
  'Times New Roman',
  'Courier New',
  'Verdana',
  'Trebuchet MS',
  // Common Google Fonts — builder will inject @import when used
  'Inter',
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Poppins',
  'Playfair Display',
  'Merriweather',
  'Raleway',
  'Source Sans Pro',
];

/**
 * Brand kit editor — colours, fonts, logos, signature, reply-to,
 * legal footer (CAN-SPAM company name + address). Single dirty-aware
 * Save button at the bottom.
 */
export function BrandClient({ initialBrand }: Props) {
  const router = useRouter();
  const [brand, setBrand] = useState<MarketingBrand>(initialBrand);
  const [companyName, setCompanyName] = useState(brand.companyName ?? '');
  const [companyAddress, setCompanyAddress] = useState(brand.companyAddress ?? '');
  const [replyTo, setReplyTo] = useState(brand.replyToEmail ?? '');
  const [logoLight, setLogoLight] = useState(brand.logoLightUrl ?? '');
  const [logoDark, setLogoDark] = useState(brand.logoDarkUrl ?? '');
  const [colors, setColors] = useState<BrandColors>(brand.colors);
  const [fonts, setFonts] = useState<BrandFonts>(brand.fonts);
  const [signature, setSignature] = useState(brand.signatureHtml ?? '');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function setColor(k: keyof BrandColors, v: string) {
    setColors((c) => ({ ...c, [k]: v }));
  }
  function setFont(k: keyof BrandFonts, v: string) {
    setFonts((f) => ({ ...f, [k]: v }));
  }

  const dirty =
    companyName    !== (brand.companyName ?? '') ||
    companyAddress !== (brand.companyAddress ?? '') ||
    replyTo        !== (brand.replyToEmail ?? '') ||
    logoLight      !== (brand.logoLightUrl ?? '') ||
    logoDark       !== (brand.logoDarkUrl ?? '') ||
    signature      !== (brand.signatureHtml ?? '') ||
    JSON.stringify(colors) !== JSON.stringify(brand.colors) ||
    JSON.stringify(fonts)  !== JSON.stringify(brand.fonts);

  async function handleSave() {
    if (!dirty || saving) return;
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch('/api/marketing/brand', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName:    companyName.trim() || null,
          companyAddress: companyAddress.trim() || null,
          replyToEmail:   replyTo.trim() || null,
          logoLightUrl:   logoLight.trim() || null,
          logoDarkUrl:    logoDark.trim() || null,
          colors,
          fonts,
          signatureHtml:  signature.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.error ?? 'Save failed');
      setBrand(data.brand as MarketingBrand);
      setInfo('Saved');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    'px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text text-sm border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none transition-colors duration-500 ease-in-out w-full';

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-evari-ink p-4">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">

        {/* Identity */}
        <section className="rounded-md bg-evari-surface border border-evari-edge/30 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-evari-text">Identity</h2>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Company name</span>
            <input className={inputCls} value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Evari" />
          </label>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Company postal address</span>
            <textarea className={cn(inputCls, 'min-h-[60px]')} value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)} placeholder="123 Some Street, City, Country"  />
            <span className="block text-[10px] text-evari-dimmer mt-1">Required by CAN-SPAM / GDPR — appears at the bottom of every email automatically.</span>
          </label>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Reply-To email</span>
            <input className={cn(inputCls, 'font-mono text-[12px]')} value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="hello@evari.cc" />
            <span className="block text-[10px] text-evari-dimmer mt-1">Where replies to your sends land. Leave blank to use the From address.</span>
          </label>
        </section>

        {/* Logos */}
        <section className="rounded-md bg-evari-surface border border-evari-edge/30 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-evari-text">Logos</h2>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Logo on light background — image URL</span>
            <input className={cn(inputCls, 'font-mono text-[12px]')} value={logoLight} onChange={(e) => setLogoLight(e.target.value)} placeholder="https://..." />
            {logoLight ? (
              <div className="mt-2 p-3 rounded bg-white inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoLight} alt="light bg logo" className="h-12 w-auto object-contain" />
              </div>
            ) : null}
          </label>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Logo on dark background — image URL</span>
            <input className={cn(inputCls, 'font-mono text-[12px]')} value={logoDark} onChange={(e) => setLogoDark(e.target.value)} placeholder="https://..." />
            {logoDark ? (
              <div className="mt-2 p-3 rounded bg-evari-ink inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoDark} alt="dark bg logo" className="h-12 w-auto object-contain" />
              </div>
            ) : null}
          </label>
          <p className="text-[10px] text-evari-dimmer">
            URLs for now — Phase 12 (Asset Library) will let you upload + pick from a media browser.
          </p>
        </section>

        {/* Colours */}
        <section className="rounded-md bg-evari-surface border border-evari-edge/30 p-4 xl:col-span-2">
          <h2 className="text-sm font-semibold text-evari-text mb-3">Colours</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {COLOR_KEYS.map(({ key, label, hint }) => (
              <label key={key} className="block">
                <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">{label}</span>
                <div className="flex items-center gap-1">
                  <input
                    type="color"
                    value={colors[key]}
                    onChange={(e) => setColor(key, e.target.value)}
                    className="h-9 w-9 rounded-md border border-evari-edge/30 bg-evari-ink cursor-pointer"
                  />
                  <input
                    type="text"
                    value={colors[key]}
                    onChange={(e) => setColor(key, e.target.value)}
                    className={cn(inputCls, 'flex-1 font-mono text-[11px]')}
                  />
                </div>
                <span className="block text-[10px] text-evari-dimmer mt-1">{hint}</span>
              </label>
            ))}
          </div>
        </section>

        {/* Fonts */}
        <section className="rounded-md bg-evari-surface border border-evari-edge/30 p-4">
          <h2 className="text-sm font-semibold text-evari-text mb-3">Typography</h2>
          <div className="grid grid-cols-2 gap-2">
            {(['heading','body'] as Array<keyof BrandFonts>).map((slot) => (
              <label key={slot} className="block">
                <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5 capitalize">{slot}</span>
                <select className={inputCls} value={fonts[slot]} onChange={(e) => setFont(slot, e.target.value)}>
                  {FONT_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
                <p
                  className="mt-2 text-base text-evari-text"
                  style={{ fontFamily: `'${fonts[slot]}', sans-serif` }}
                >
                  {slot === 'heading' ? 'Sample heading' : 'The quick brown fox jumps over the lazy dog.'}
                </p>
              </label>
            ))}
          </div>
          <p className="text-[10px] text-evari-dimmer mt-3">
            Web-safe fonts render natively in every email client. Google Fonts (Inter, Roboto, etc.) are loaded via @import in the email head — most modern clients honour them, Outlook falls back to a sans-serif.
          </p>
        </section>

        {/* Signature */}
        <section className="rounded-md bg-evari-surface border border-evari-edge/30 p-4">
          <h2 className="text-sm font-semibold text-evari-text mb-1">Email signature</h2>
          <p className="text-[10px] text-evari-dimmer mb-2">
            Auto-appended to the bottom of every send (above the legal footer + unsubscribe link). HTML allowed.
          </p>
          <textarea
            className={cn(inputCls, 'font-mono text-[12px] min-h-[160px]')}
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            placeholder={'<p>— Craig<br/>Evari · evari.cc</p>'}
          />
          {signature ? (
            <div className="mt-2 p-3 rounded bg-white text-zinc-900">
              <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500 mb-1">Preview</div>
              <div dangerouslySetInnerHTML={{ __html: signature }} />
            </div>
          ) : null}
        </section>
      </div>

      {/* Footer save */}
      <div className="mt-3 flex items-center gap-2">
        {error ? <span className="text-xs text-evari-danger">{error}</span> : null}
        {info  ? <span className="text-xs text-evari-success">{info}</span> : null}
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold bg-evari-gold text-evari-goldInk disabled:opacity-40 hover:brightness-105 transition duration-500 ease-in-out"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {saving ? 'Saving…' : dirty ? 'Save brand' : 'Saved'}
        </button>
      </div>
    </div>
  );
}
