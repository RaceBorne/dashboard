'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X, Wand2, Loader2, Check, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * Shared SEO drawer.
 *
 * One component that powers SEO editing for products, collections, pages
 * and articles — they all expose the same fields. Slides in from the
 * right at 640px wide; ESC / overlay click / X dismisses; deep-linkable
 * via the parent's URL state (parent controls `open`).
 *
 * Field contract:
 *   - title     — meta title tag (30–60 char sweet spot)
 *   - meta      — meta description (120–160 char sweet spot)
 *   - handle    — URL handle (parent decides whether to allow editing)
 *   - canonical — optional canonical override (full URL)
 *   - ogImage   — optional OG image URL
 *   - ogTitle / ogDescription — optional social overrides
 *
 * AI generation hits POST /api/seo/generate which streams back through
 * the existing AI Gateway with the Evari voice skill loaded.
 */

export interface SeoDrawerValues {
  title: string;
  meta: string;
  handle: string;
  canonical?: string;
  ogImage?: string;
  ogTitle?: string;
  ogDescription?: string;
}

export interface SeoDrawerEntity {
  /** GID or numeric id from Shopify. */
  id: string;
  /** "product" | "collection" | "page" | "article" */
  type: 'product' | 'collection' | 'page' | 'article';
  /** Human-readable name shown in the drawer header. */
  name: string;
  /** Plain-text description fed to the AI prompt (HTML stripped). */
  body?: string;
  /** Live URL on the storefront, used for the Google preview. */
  url?: string;
  /** Free-form metadata passed straight through to the AI generator. */
  productType?: string;
  vendor?: string;
  tags?: string[];
}

export interface SeoDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: SeoDrawerEntity | null;
  initial: SeoDrawerValues;
  /** Called on Save with the validated values. */
  onSave: (values: SeoDrawerValues) => Promise<void> | void;
  /** Optional: hide the AI buttons entirely (e.g. when the gateway is offline). */
  aiDisabled?: boolean;
}

const TITLE_MIN = 30;
const TITLE_MAX = 60;
const META_MIN = 120;
const META_MAX = 160;

export function SeoDrawer({
  open,
  onOpenChange,
  entity,
  initial,
  onSave,
  aiDisabled,
}: SeoDrawerProps) {
  const [values, setValues] = React.useState<SeoDrawerValues>(initial);
  const [saving, setSaving] = React.useState(false);
  const [generating, setGenerating] = React.useState<null | 'title' | 'meta'>(null);
  const [aiError, setAiError] = React.useState<string | null>(null);

  // Reset local state whenever the entity changes — drawer is reused
  // across rows so we can't rely on unmount.
  React.useEffect(() => {
    setValues(initial);
    setAiError(null);
  }, [initial, entity?.id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(values);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async (field: 'title' | 'meta') => {
    if (!entity) return;
    setGenerating(field);
    setAiError(null);
    try {
      const res = await fetch('/api/seo/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field,
          entity: {
            type: entity.type,
            title: entity.name,
            body: entity.body,
            productType: entity.productType,
            vendor: entity.vendor,
            tags: entity.tags,
          },
        }),
      });
      const json = (await res.json()) as { value?: string; error?: string };
      if (!res.ok || !json.value) {
        throw new Error(json.error || `Generator failed (${res.status})`);
      }
      setValues((v) => ({
        ...v,
        [field === 'title' ? 'title' : 'meta']: json.value!,
      }));
    } catch (err) {
      setAiError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(null);
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0"
        />
        <DialogPrimitive.Content
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[640px] flex-col bg-evari-carbon shadow-[-8px_0_40px_rgba(0,0,0,0.55)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right focus:outline-none"
        >
          <header className="flex items-center justify-between gap-4 px-5 py-4 border-b border-evari-edge/40 shrink-0">
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="text-sm font-medium text-evari-text truncate">
                SEO · {entity?.name ?? 'Untitled'}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-xs text-evari-dim mt-0.5 capitalize">
                {entity?.type} · {entity?.url ?? '—'}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              aria-label="Close"
              className="rounded-md p-1.5 text-evari-dim hover:bg-evari-surface hover:text-evari-text"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
            {aiError && (
              <div className="rounded-md bg-evari-danger/15 ring-1 ring-evari-danger/30 px-3 py-2 text-xs text-evari-text flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-evari-danger" />
                <span>{aiError}</span>
              </div>
            )}

            <Field
              label="Title tag"
              hint={`${values.title.length} / ${TITLE_MAX}`}
              hintTone={lengthTone(values.title.length, TITLE_MIN, TITLE_MAX)}
              action={
                <GenerateButton
                  loading={generating === 'title'}
                  disabled={aiDisabled || !entity}
                  onClick={() => handleGenerate('title')}
                />
              }
            >
              <Input
                value={values.title}
                onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
                placeholder="e.g. Evari Tour — long-distance carbon e-bike | Evari"
                maxLength={120}
              />
            </Field>

            <Field
              label="Meta description"
              hint={`${values.meta.length} / ${META_MAX}`}
              hintTone={lengthTone(values.meta.length, META_MIN, META_MAX)}
              action={
                <GenerateButton
                  loading={generating === 'meta'}
                  disabled={aiDisabled || !entity}
                  onClick={() => handleGenerate('meta')}
                />
              }
            >
              <Textarea
                rows={3}
                value={values.meta}
                onChange={(e) => setValues((v) => ({ ...v, meta: e.target.value }))}
                placeholder="One paragraph, 120–160 characters. Lead with a concrete detail."
                maxLength={300}
              />
            </Field>

            <Field label="URL handle" hint={values.handle ? `/${values.handle}` : undefined}>
              <Input
                value={values.handle}
                onChange={(e) =>
                  setValues((v) => ({
                    ...v,
                    handle: e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9-]/g, '-')
                      .replace(/-+/g, '-'),
                  }))
                }
                placeholder="evari-tour"
              />
            </Field>

            <Field label="Canonical URL" hint="Optional override">
              <Input
                value={values.canonical ?? ''}
                onChange={(e) =>
                  setValues((v) => ({ ...v, canonical: e.target.value || undefined }))
                }
                placeholder="https://evari.cc/products/evari-tour"
              />
            </Field>

            <Field label="OG image URL" hint="1200×630 recommended">
              <Input
                value={values.ogImage ?? ''}
                onChange={(e) =>
                  setValues((v) => ({ ...v, ogImage: e.target.value || undefined }))
                }
                placeholder="https://cdn.shopify.com/…/og.jpg"
              />
            </Field>

            <details className="group">
              <summary className="cursor-pointer list-none text-xs uppercase tracking-[0.14em] text-evari-dimmer hover:text-evari-dim">
                Social overrides ▾
              </summary>
              <div className="mt-3 space-y-4">
                <Field label="OG title">
                  <Input
                    value={values.ogTitle ?? ''}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, ogTitle: e.target.value || undefined }))
                    }
                  />
                </Field>
                <Field label="OG description">
                  <Textarea
                    rows={2}
                    value={values.ogDescription ?? ''}
                    onChange={(e) =>
                      setValues((v) => ({
                        ...v,
                        ogDescription: e.target.value || undefined,
                      }))
                    }
                  />
                </Field>
              </div>
            </details>

            {/* Google preview */}
            <section className="rounded-md bg-evari-surface p-4 ring-1 ring-evari-edge/40">
              <div className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer mb-2">
                Google preview
              </div>
              <GooglePreview
                title={values.title || entity?.name || 'Untitled'}
                url={entity?.url ?? `https://evari.cc/${entity?.type ?? 'page'}s/${values.handle || ''}`}
                description={
                  values.meta ||
                  'Meta description not set — Google will pick a snippet from the page.'
                }
              />
            </section>
          </div>

          <footer className="flex items-center justify-between gap-3 px-5 py-3 border-t border-evari-edge/40 shrink-0">
            <ValidationSummary values={values} />
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                {saving ? 'Saving' : 'Save'}
              </Button>
            </div>
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Field({
  label,
  hint,
  hintTone,
  action,
  children,
}: {
  label: string;
  hint?: string;
  hintTone?: 'good' | 'warn' | 'bad';
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs uppercase tracking-[0.14em] text-evari-dim">
          {label}
        </label>
        <div className="flex items-center gap-2">
          {hint && (
            <span
              className={cn(
                'text-[11px] font-mono tabular-nums',
                hintTone === 'good' && 'text-evari-success',
                hintTone === 'warn' && 'text-evari-warn',
                hintTone === 'bad' && 'text-evari-danger',
                !hintTone && 'text-evari-dimmer',
              )}
            >
              {hint}
            </span>
          )}
          {action}
        </div>
      </div>
      {children}
    </div>
  );
}

function GenerateButton({
  loading,
  disabled,
  onClick,
}: {
  loading: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading || disabled}
      className={cn(
        'inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.06em] text-evari-gold hover:text-evari-gold/80 disabled:text-evari-dimmer disabled:cursor-not-allowed',
      )}
    >
      {loading ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Wand2 className="h-3 w-3" />
      )}
      {loading ? 'Generating' : 'Generate'}
    </button>
  );
}

function lengthTone(
  len: number,
  min: number,
  max: number,
): 'good' | 'warn' | 'bad' {
  if (len === 0) return 'bad';
  if (len < min || len > max) return 'warn';
  return 'good';
}

function ValidationSummary({ values }: { values: SeoDrawerValues }) {
  const issues: string[] = [];
  if (values.title.length < TITLE_MIN || values.title.length > TITLE_MAX)
    issues.push(`title ${values.title.length}c`);
  if (values.meta.length < META_MIN || values.meta.length > META_MAX)
    issues.push(`meta ${values.meta.length}c`);
  if (issues.length === 0) {
    return (
      <Badge variant="success" className="gap-1 text-[10px]">
        <Check className="h-3 w-3" />
        SEO ok
      </Badge>
    );
  }
  return (
    <Badge variant="warning" className="gap-1 text-[10px]">
      <AlertTriangle className="h-3 w-3" />
      {issues.join(' · ')}
    </Badge>
  );
}

function GooglePreview({
  title,
  url,
  description,
}: {
  title: string;
  url: string;
  description: string;
}) {
  // Mimic Google's SERP card layout. Truncation matches Google's actual
  // pixel-width cutoffs roughly enough for an in-house preview.
  return (
    <div className="font-sans">
      <div className="text-[12px] text-evari-dim truncate">{url}</div>
      <div className="text-[16px] text-sky-400 leading-tight mt-0.5 line-clamp-1">
        {title}
      </div>
      <div className="text-[13px] text-evari-dim mt-1 line-clamp-2 leading-snug">
        {description}
      </div>
    </div>
  );
}
