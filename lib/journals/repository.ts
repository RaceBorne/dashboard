/**
 * Server-only Supabase helpers for Journal drafts.
 *
 * A Journal draft is an in-progress article that lives in the
 * dashboard's Supabase rather than on Shopify. Drafts carry EditorJS
 * JSON (the source of truth for content blocks), metadata, and a
 * target blog lane (CS+ Bike Builds or Blogs). On publish we serialise
 * the editor JSON to Shopify-safe HTML, call `articleCreate`, then
 * stamp `shopify_article_id` on the row so the Journals UI knows the
 * draft is live.
 */
import type { OutputData } from '@editorjs/editorjs';

import { createSupabaseAdmin } from '@/lib/supabase/admin';

export type JournalLane = 'cs_plus' | 'blogs';

export interface JournalDraft {
  id: string;
  blogTarget: JournalLane | string;
  title: string;
  editorData: OutputData | Record<string, unknown>;
  coverImageUrl: string | null;
  summary: string | null;
  tags: string[];
  author: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  shopifyArticleId: string | null;
  shopifyBlogId: string | null;
  publishedAt: string | null;
  /** Departure Lounge — when set, the draft is queued for publish at
   *  this UTC moment. A worker will flip the draft from Studio
   *  Design → Departure Lounge → Published. */
  scheduledFor: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DraftRow {
  id: string;
  blog_target: string;
  title: string;
  editor_data: OutputData | Record<string, unknown>;
  cover_image_url: string | null;
  summary: string | null;
  tags: string[] | null;
  author: string | null;
  seo_title: string | null;
  seo_description: string | null;
  shopify_article_id: string | null;
  shopify_blog_id: string | null;
  published_at: string | null;
  scheduled_for: string | null;
  created_at: string;
  updated_at: string;
}

function rowToDraft(row: DraftRow): JournalDraft {
  return {
    id: row.id,
    blogTarget: row.blog_target,
    title: row.title,
    editorData: row.editor_data ?? {},
    coverImageUrl: row.cover_image_url,
    summary: row.summary,
    tags: row.tags ?? [],
    author: row.author,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    shopifyArticleId: row.shopify_article_id,
    shopifyBlogId: row.shopify_blog_id,
    publishedAt: row.published_at,
    scheduledFor: row.scheduled_for,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function randomId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export async function listDrafts(
  opts: { blogTarget?: string } = {},
): Promise<JournalDraft[]> {
  const sb = createSupabaseAdmin();
  if (!sb) return [];
  let q = sb
    .from('dashboard_journal_drafts')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(500);
  if (opts.blogTarget) q = q.eq('blog_target', opts.blogTarget);
  const { data, error } = await q;
  if (error) {
    console.error('[journals.listDrafts] ', error);
    return [];
  }
  return (data ?? []).map(rowToDraft);
}

/**
 * Drafts queued for publish whose `scheduled_for` is now in the past
 * and that haven't been pushed to Shopify yet. Powers the
 * /api/cron/publish-scheduled worker — anything this returns gets
 * the publish flow run on it.
 */
export async function listDueScheduledDrafts(
  opts: { limit?: number } = {},
): Promise<JournalDraft[]> {
  const sb = createSupabaseAdmin();
  if (!sb) return [];
  const { data, error } = await sb
    .from('dashboard_journal_drafts')
    .select('*')
    .is('shopify_article_id', null)
    .not('scheduled_for', 'is', null)
    .lte('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(opts.limit ?? 25);
  if (error) {
    console.error('[journals.listDueScheduledDrafts] ', error);
    return [];
  }
  return (data ?? []).map(rowToDraft);
}

export async function getDraft(id: string): Promise<JournalDraft | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const { data, error } = await sb
    .from('dashboard_journal_drafts')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.error('[journals.getDraft] ', error);
    return null;
  }
  return data ? rowToDraft(data) : null;
}

export async function createDraft(input: {
  blogTarget: JournalLane | string;
  title?: string;
}): Promise<JournalDraft | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const row = {
    id: randomId('journal'),
    blog_target: input.blogTarget,
    title: input.title ?? '',
    editor_data: { blocks: [] },
  };
  const { data, error } = await sb
    .from('dashboard_journal_drafts')
    .insert(row)
    .select('*')
    .single();
  if (error) {
    console.error('[journals.createDraft] ', error);
    return null;
  }
  return rowToDraft(data);
}

export async function updateDraft(
  id: string,
  patch: Partial<{
    title: string;
    editorData: OutputData | Record<string, unknown>;
    blogTarget: string;
    coverImageUrl: string | null;
    summary: string | null;
    tags: string[];
    author: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
    shopifyArticleId: string | null;
    shopifyBlogId: string | null;
    publishedAt: string | null;
    scheduledFor: string | null;
  }>,
): Promise<JournalDraft | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.editorData !== undefined) row.editor_data = patch.editorData;
  if (patch.blogTarget !== undefined) row.blog_target = patch.blogTarget;
  if (patch.coverImageUrl !== undefined) row.cover_image_url = patch.coverImageUrl;
  if (patch.summary !== undefined) row.summary = patch.summary;
  if (patch.tags !== undefined) row.tags = patch.tags;
  if (patch.author !== undefined) row.author = patch.author;
  if (patch.seoTitle !== undefined) row.seo_title = patch.seoTitle;
  if (patch.seoDescription !== undefined) row.seo_description = patch.seoDescription;
  if (patch.shopifyArticleId !== undefined) row.shopify_article_id = patch.shopifyArticleId;
  if (patch.shopifyBlogId !== undefined) row.shopify_blog_id = patch.shopifyBlogId;
  if (patch.publishedAt !== undefined) row.published_at = patch.publishedAt;
  if (patch.scheduledFor !== undefined) row.scheduled_for = patch.scheduledFor;
  const { data, error } = await sb
    .from('dashboard_journal_drafts')
    .update(row)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) {
    console.error('[journals.updateDraft] ', error);
    return null;
  }
  return data ? rowToDraft(data) : null;
}

export async function deleteDraft(id: string): Promise<boolean> {
  const sb = createSupabaseAdmin();
  if (!sb) return false;
  const { error } = await sb
    .from('dashboard_journal_drafts')
    .delete()
    .eq('id', id);
  if (error) {
    console.error('[journals.deleteDraft] ', error);
    return false;
  }
  return true;
}
