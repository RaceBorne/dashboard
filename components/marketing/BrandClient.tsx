'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import type {
  BrandColors,
  BrandFonts,
  CustomFont,
  FooterDesign,
  FooterSocial,
  MarketingBrand,
  SignatureDesign,
} from '@/lib/marketing/types';
import { DEFAULT_FOOTER_DESIGN, DEFAULT_SIGNATURE_DESIGN } from '@/lib/marketing/types';
import { FontDropzone } from './FontDropzone';
import { FooterDesigner } from './FooterDesigner';
import { SignatureDesigner } from './SignatureDesigner';

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
  const [customFonts, setCustomFonts] = useState<CustomFont[]>(brand.customFonts);
  const [footerDesign, setFooterDesign] = useState<FooterDesign>(brand.footerDesign ?? DEFAULT_FOOTER_DESIGN);
  const [signatureDesign, setSignatureDesign] = useState<SignatureDesign>(brand.signatureDesign ?? DEFAULT_SIGNATURE_DESIGN);
  const [socials, setSocials] = useState<FooterSocial>(brand.socials ?? {});

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
    JSON.stringify(colors) !== JSON.stringify(brand.colors) ||
    JSON.stringify(fonts)  !== JSON.stringify(brand.fonts) ||
    JSON.stringify(footerDesign) !== JSON.stringify(brand.footerDesign ?? DEFAULT_FOOTER_DESIGN) ||
    JSON.stringify(signatureDesign) !== JSON.stringify(brand.signatureDesign ?? DEFAULT_SIGNATURE_DESIGN) ||
    JSON.stringify(socials) !== JSON.stringify(brand.socials ?? {});

  /**
   * Save → PATCH the API → re-sync EVERY local state field from the
   * server response. The re-sync is the safety net: if the server
   * silently drops a field (e.g. wrong column type, RLS, validation),
   * the input snaps back to what was actually saved, so the user sees
   * the truth instead of a misleading 'Saved' toast.
   */
  async function handleSave() {
    if (!dirty || saving) return;
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const body = {
        companyName:    companyName.trim() || null,
        companyAddress: companyAddress.trim() || null,
        replyToEmail:   replyTo.trim() || null,
        logoLightUrl:   logoLight.trim() || null,
        logoDarkUrl:    logoDark.trim() || null,
        colors,
        fonts,
        // Clear the legacy plaintext override when the designer is in play —
        // resolution priority is override > design > default template.
        signatureHtml:    null,
        signatureDesign,
        footerDesign,
        socials,
      };
      const res = await fetch('/api/marketing/brand', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      // Surface non-200s clearly — Vercel SSO redirect, Supabase errors, etc.
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}${text ? ': ' + text.slice(0, 160) : ''}`);
      }
      const data = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!data.ok) throw new Error(((data as { error?: string }).error) ?? 'Save returned ok=false');
      const fresh = data.brand as MarketingBrand;
      // Re-sync every local field from the server's view of the brand —
      // exposes any silent drift between request and persistence.
      setBrand(fresh);
      setCompanyName(fresh.companyName ?? '');
      setCompanyAddress(fresh.companyAddress ?? '');
      setReplyTo(fresh.replyToEmail ?? '');
      setLogoLight(fresh.logoLightUrl ?? '');
      setLogoDark(fresh.logoDarkUrl ?? '');
      setColors(fresh.colors);
      setFonts(fresh.fonts);
      setCustomFonts(fresh.customFonts);
      setFooterDesign(fresh.footerDesign ?? DEFAULT_FOOTER_DESIGN);
      setSignatureDesign(fresh.signatureDesign ?? DEFAULT_SIGNATURE_DESIGN);
      setSocials(fresh.socials ?? {});
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

        {/* Logos — sourced from Settings → Branding (single source of truth) */}
        <section className="rounded-md bg-evari-surface border border-evari-edge/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-evari-text">Logos</h2>
            <a href="/settings" className="text-[11px] text-evari-dim hover:text-evari-text underline underline-offset-2">
              Manage in Settings →
            </a>
          </div>
          <p className="text-[10px] text-evari-dimmer">
            Pulled from <code className="text-evari-text">dashboard_branding</code> — the same image you uploaded under
            Settings → Branding. Email sends use these automatically.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Light background</span>
              <div className="p-3 rounded bg-white border border-evari-edge/30 min-h-[64px] flex items-center">
                {logoLight ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={logoLight} alt="light bg logo" className="h-10 w-auto object-contain" />
                ) : (
                  <span className="text-[11px] text-zinc-400 italic">No light logo set</span>
                )}
              </div>
            </div>
            <div>
              <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Dark background</span>
              <div className="p-3 rounded bg-evari-ink border border-evari-edge/30 min-h-[64px] flex items-center">
                {logoDark ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={logoDark} alt="dark bg logo" className="h-10 w-auto object-contain" />
                ) : (
                  <span className="text-[11px] text-evari-dimmer italic">No dark logo set</span>
                )}
              </div>
            </div>
          </div>
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

        {/* Typography — full-width: selectors LEFT, custom font upload + list RIGHT */}
        <section className="rounded-md bg-evari-surface border border-evari-edge/30 p-4 xl:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-evari-text">Typography</h2>
            <span className="text-[10px] text-evari-dimmer">Brand fonts available everywhere — pickers, designers, sender</span>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(320px,40%)_minmax(0,1fr)] gap-3">

            {/* LEFT — Heading + body pickers with live samples */}
            <div className="space-y-3">
              {(['heading', 'body'] as Array<'heading' | 'body'>).map((slot) => (
                <label key={slot} className="block">
                  <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5 capitalize">{slot}</span>
                  <select className={inputCls} value={fonts[slot]} onChange={(e) => setFont(slot, e.target.value)}>
                    {customFonts.length > 0 ? (
                      <optgroup label="Brand fonts (uploaded)">
                        {[...new Set(customFonts.map((f) => f.name))].map((n) => <option key={`c-${n}`} value={n}>{n}</option>)}
                      </optgroup>
                    ) : null}
                    <optgroup label="System + Google Fonts">
                      {FONT_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
                    </optgroup>
                  </select>
                  <p
                    className="mt-2 text-base text-evari-text"
                    style={{ fontFamily: `'${fonts[slot]}', sans-serif` }}
                  >
                    {slot === 'heading' ? 'Sample heading' : 'The quick brown fox jumps over the lazy dog.'}
                  </p>
                </label>
              ))}
              <p className="text-[10px] text-evari-dimmer">
                Web-safe fonts render natively in every email client. Google Fonts (Inter, Roboto, etc.) load via @import in the email head — most modern clients honour them, Outlook falls back to a sans-serif. Uploaded brand fonts are embedded by URL.
              </p>
            </div>

            {/* RIGHT — drag/drop upload + uploaded fonts list */}
            <div>
              <FontDropzone
                initialFonts={customFonts}
                onChange={(next) => setCustomFonts(next)}
              />
            </div>
          </div>
        </section>

        {/* Social media — single source of truth for company URLs.
            Footer Social block, email signature, and any social-thumbnail
            generator all read from here so the user only fills them in
            once. */}
        <section className="rounded-md bg-evari-surface border border-evari-edge/30 p-4 space-y-3 xl:col-span-2">
          <header className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-evari-text">Social media</h2>
            <span className="text-[10px] text-evari-dimmer">Single source of truth — used by every email + thumbnail</span>
          </header>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {([
              { key: 'instagram', label: 'Instagram',   placeholder: 'https://instagram.com/yourhandle' },
              { key: 'twitter',   label: 'X / Twitter', placeholder: 'https://x.com/yourhandle' },
              { key: 'linkedin',  label: 'LinkedIn',    placeholder: 'https://linkedin.com/company/yourcompany' },
              { key: 'facebook',  label: 'Facebook',    placeholder: 'https://facebook.com/yourpage' },
              { key: 'tiktok',    label: 'TikTok',      placeholder: 'https://tiktok.com/@yourhandle' },
              { key: 'youtube',   label: 'YouTube',     placeholder: 'https://youtube.com/@yourchannel' },
              { key: 'website',   label: 'Website',     placeholder: 'https://your-site.com' },
            ] as Array<{ key: keyof FooterSocial; label: string; placeholder: string }>).map((f) => (
              <label key={String(f.key)} className="block">
                <span className="block text-[10px] font-medium uppercase tracking-[0.1em] text-evari-dimmer mb-1">{f.label}</span>
                <input
                  type="url"
                  value={socials[f.key] ?? ''}
                  onChange={(e) => setSocials((cur: FooterSocial) => ({ ...cur, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className={inputCls + ' font-mono text-[12px]'}
                />
              </label>
            ))}
          </div>
        </section>

        <FooterDesigner
          initialBrand={brand}
          value={footerDesign}
          onChange={setFooterDesign}
        />

        {/* Email signature — block builder, full width, viewer LEFT / tools RIGHT */}
        <SignatureDesigner
          initialBrand={brand}
          value={signatureDesign}
          onChange={setSignatureDesign}
        />
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
