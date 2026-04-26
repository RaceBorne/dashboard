/**
 * Email templates repository — saved reusable EmailDesign blobs.
 * Powers /email/templates list + /email/templates/[id]/edit full-page
 * editor. Campaigns can clone a template into their own design at
 * creation time so subsequent edits don't drift the original.
 */

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { DEFAULT_EMAIL_DESIGN } from './types';
import type { EmailDesign } from './types';

export type EmailTemplateKind = 'saved' | 'library' | 'autosave';

export interface EmailTemplate {
  id: string;
  name: string;
  design: EmailDesign;
  thumbnailUrl: string | null;
  kind: EmailTemplateKind;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Row {
  id: string;
  name: string;
  design: EmailDesign;
  thumbnail_url: string | null;
  kind: EmailTemplateKind;
  description: string | null;
  created_at: string;
  updated_at: string;
}

function rowToTemplate(r: Row): EmailTemplate {
  return {
    id: r.id,
    name: r.name,
    design: r.design,
    thumbnailUrl: r.thumbnail_url,
    kind: r.kind,
    description: r.description,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listTemplates(filter: { kind?: EmailTemplateKind; search?: string } = {}): Promise<EmailTemplate[]> {
  const sb = createSupabaseAdmin();
  if (!sb) return [];
  let q = sb
    .from('dashboard_mkt_email_templates')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(200);
  if (filter.kind) q = q.eq('kind', filter.kind);
  if (filter.search?.trim()) q = q.ilike('name', `%${filter.search.trim()}%`);
  const { data, error } = await q;
  if (error) {
    console.error('[mkt.templates.list]', error);
    return [];
  }
  return (data as Row[]).map(rowToTemplate);
}

export async function getTemplate(id: string): Promise<EmailTemplate | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const { data, error } = await sb
    .from('dashboard_mkt_email_templates')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return rowToTemplate(data as Row);
}

export async function createTemplate(input: { name: string; design?: EmailDesign; description?: string | null }): Promise<EmailTemplate | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const design = input.design ?? { ...DEFAULT_EMAIL_DESIGN, blocks: [...DEFAULT_EMAIL_DESIGN.blocks] };
  const { data, error } = await sb
    .from('dashboard_mkt_email_templates')
    .insert({
      name: input.name.trim(),
      design,
      description: input.description ?? null,
      kind: 'saved',
    })
    .select('*')
    .single();
  if (error) {
    console.error('[mkt.templates.create]', error);
    return null;
  }
  return rowToTemplate(data as Row);
}

export async function updateTemplate(id: string, patch: Partial<{ name: string; design: EmailDesign; description: string | null; thumbnailUrl: string | null }>): Promise<EmailTemplate | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const dbPatch: Record<string, unknown> = {};
  if ('name' in patch)        dbPatch.name = patch.name?.trim();
  if ('design' in patch)      dbPatch.design = patch.design;
  if ('description' in patch) dbPatch.description = patch.description;
  if ('thumbnailUrl' in patch) dbPatch.thumbnail_url = patch.thumbnailUrl;
  const { data, error } = await sb
    .from('dashboard_mkt_email_templates')
    .update(dbPatch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) {
    console.error('[mkt.templates.update]', error);
    return null;
  }
  return rowToTemplate(data as Row);
}

export async function deleteTemplate(id: string): Promise<boolean> {
  const sb = createSupabaseAdmin();
  if (!sb) return false;
  const { error } = await sb.from('dashboard_mkt_email_templates').delete().eq('id', id);
  if (error) {
    console.error('[mkt.templates.delete]', error);
    return false;
  }
  return true;
}

export async function duplicateTemplate(id: string): Promise<EmailTemplate | null> {
  const original = await getTemplate(id);
  if (!original) return null;
  return createTemplate({
    name: `${original.name} (copy)`,
    design: original.design,
    description: original.description,
  });
}
