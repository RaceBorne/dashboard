/**
 * Mojito AI tool registry.
 *
 * Every meaningful action in the dashboard is exposed here as a Claude
 * tool the assistant can invoke. The streaming chat endpoint pulls this
 * registry into `streamText({ tools })` and lets the model chain calls
 * across one or more steps.
 *
 * Conventions
 * -----------
 * - Tools are server-side (this file runs in the API route). They have
 *   admin DB access and may reach into any lib helper.
 * - Tools never throw. They return `{ ok: true, ... }` or
 *   `{ ok: false, error: "..." }` so the model can recover.
 * - Tools that need to drive the UI (navigation, opening drawers,
 *   confirmation gates) return a `clientAction` field in their result;
 *   the AIAssistantPane reads it after each tool call and dispatches
 *   the matching client-side behaviour.
 * - Side-effecting tools (delete, send) include a `requiresConfirmation`
 *   field and DO NOT execute on first call. The model presents the plan,
 *   the user confirms, the model re-calls with `confirm: true`. This is
 *   the soft-confirmation pattern from the architecture proposal.
 */

import { tool } from 'ai';
import { z } from 'zod';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { listPlays, getPlay } from '@/lib/dashboard/repository';
import {
  listShortlist,
  setStatus,
} from '@/lib/marketing/shortlist';
import {
  listCampaigns,
  getCampaign,
  createCampaign as createCampaignRow,
  updateCampaign,
  deleteCampaign,
} from '@/lib/marketing/campaigns';
import { listGroups } from '@/lib/marketing/groups';
import { listSegments } from '@/lib/marketing/segments';
import { getActiveContext, listContexts } from '@/lib/context/activeContext';
import { getTrafficSnapshot } from '@/lib/traffic/repository';
import { listTasksAndLists, updateTaskById } from '@/lib/tasks/repository';
import {
  listShopifyPages,
  listProducts,
  listArticles,
  listBlogs,
  updatePageMetadata,
  updateArticleMetadata,
  updateProduct,
  isShopifyConnected,
} from '@/lib/integrations/shopify';
import { recordAction, findMostRecentUndoable, markUndone, listRecentActions } from './actionLog';

// ---------------------------------------------------------------------------
// Page-aware context, passed in from the chat endpoint, used by tools that
// need to know "where the user is right now" (e.g. resolve playId when the
// user just says "this idea" without naming it).
// ---------------------------------------------------------------------------

export interface PaneContext {
  /** Pathname the user is currently looking at, e.g. /plays/abc/strategy. */
  route: string;
  /** Inferred play / venture id from the route, if any. */
  routePlayId: string | null;
  /** Active context (Evari, etc.), used for branding voice. */
  contextName: string | null;
  /** Free-form notes the surface registered (existing useAISurface flow). */
  surfaceContext: Record<string, unknown> | null;
  /** Surface key, 'campaigns', 'discovery:abc', etc. */
  surface: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function err(message: string) {
  return { ok: false as const, error: message };
}

function ok<T extends Record<string, unknown>>(data: T) {
  return { ok: true as const, ...data };
}

function baseUrl(): string {
  const env = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL || '';
  if (!env) return 'http://localhost:3000';
  return env.startsWith('http') ? env : `https://${env}`;
}

async function resolvePlayIdOrError(
  pane: PaneContext,
  explicitId: string | null | undefined,
): Promise<{ ok: true; playId: string } | { ok: false; error: string }> {
  const id = (explicitId ?? '').trim();
  if (id) return { ok: true, playId: id };
  if (pane.routePlayId) return { ok: true, playId: pane.routePlayId };
  return err(
    'No play / venture id provided and could not infer one from the current page. Use listIdeas first to pick one.',
  );
}

// ---------------------------------------------------------------------------
// Tool registry builder
// ---------------------------------------------------------------------------

export function buildTools(pane: PaneContext) {
  return {
    // -----------------------------------------------------------------------
    // READ-ONLY: page awareness + lookups
    // -----------------------------------------------------------------------

    getCurrentPage: tool({
      description:
        'Return the route the user is currently on plus the inferred venture id (if any) and the active brand context. Call this first whenever an instruction is ambiguous about WHICH play / page is being referenced.',
      inputSchema: z.object({}),
      execute: async () => {
        return ok({
          route: pane.route,
          inferredPlayId: pane.routePlayId,
          contextName: pane.contextName,
          surface: pane.surface,
          surfaceContext: pane.surfaceContext ?? null,
        });
      },
    }),

    getActiveContext: tool({
      description:
        'Return the active brand / tenant context (Evari Speed Bikes, etc.) including its description and voice. Use when generating copy or briefs to ground the AI in the right brand.',
      inputSchema: z.object({}),
      execute: async () => {
        const ctx = await getActiveContext().catch(() => null);
        if (!ctx) return err('No active context.');
        return ok({
          name: ctx.name,
          description: ctx.description,
          voice: ctx.voice ?? null,
          isDefault: ctx.isDefault,
        });
      },
    }),

    listContexts: tool({
      description:
        'List every saved brand context (max 3). Useful when the user asks to switch contexts or wants to know which brand is active.',
      inputSchema: z.object({}),
      execute: async () => {
        const items = await listContexts().catch(() => []);
        return ok({
          contexts: items.map((c) => ({
            id: c.id,
            name: c.name,
            isDefault: c.isDefault,
          })),
        });
      },
    }),

    // -----------------------------------------------------------------------
    // IDEAS / PLAYS
    // -----------------------------------------------------------------------

    listIdeas: tool({
      description:
        'List every idea / play / venture in the dashboard with id, title, stage, and updatedAt. Use when the user references an idea by name and you need to look up its id, or when they ask "what am I working on".',
      inputSchema: z.object({
        search: z
          .string()
          .optional()
          .describe('Optional case-insensitive substring to filter on title or brief.'),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async ({ search, limit }) => {
        const sb = createSupabaseAdmin();
        const plays = await listPlays(sb);
        let arr = plays;
        if (search && search.trim()) {
          const q = search.toLowerCase();
          arr = arr.filter(
            (p) =>
              p.title.toLowerCase().includes(q) ||
              (p.brief ?? '').toLowerCase().includes(q),
          );
        }
        return ok({
          ideas: arr.slice(0, limit ?? 20).map((p) => ({
            id: p.id,
            title: p.title,
            stage: p.stage,
            brief: (p.brief ?? '').slice(0, 200),
            pinned: !!p.pinned,
            updatedAt: p.updatedAt,
          })),
          totalCount: plays.length,
        });
      },
    }),

    findIdea: tool({
      description:
        'Find a single idea by name match. Returns the idea id and basic fields, or an ambiguous-match list if multiple ideas match. Prefer this over listIdeas when you already know roughly what the user means.',
      inputSchema: z.object({
        query: z.string().describe('Case-insensitive substring of the idea title.'),
      }),
      execute: async ({ query }) => {
        const sb = createSupabaseAdmin();
        const plays = await listPlays(sb);
        const q = query.toLowerCase().trim();
        const matches = plays.filter((p) => p.title.toLowerCase().includes(q));
        if (matches.length === 0) return err('No idea matches "' + query + '".');
        if (matches.length > 1) {
          return ok({
            ambiguous: true,
            options: matches.slice(0, 8).map((p) => ({ id: p.id, title: p.title, stage: p.stage })),
          });
        }
        const p = matches[0];
        return ok({ id: p.id, title: p.title, stage: p.stage, brief: p.brief });
      },
    }),

    getIdea: tool({
      description:
        'Fetch the full record for one idea / play including strategy, brief, and recent activity. Use when the user asks "what is the brief for X" or "what stage is X at".',
      inputSchema: z.object({
        playId: z
          .string()
          .optional()
          .describe('Optional. Defaults to the play inferred from the current page.'),
      }),
      execute: async ({ playId }) => {
        const r = await resolvePlayIdOrError(pane, playId);
        if (!r.ok) return r;
        const sb = createSupabaseAdmin();
        const play = await getPlay(sb, r.playId);
        if (!play) return err('Play ' + r.playId + ' not found.');
        return ok({
          id: play.id,
          title: play.title,
          brief: play.brief,
          stage: play.stage,
          strategy: play.strategy ?? null,
          tags: play.tags ?? [],
          updatedAt: play.updatedAt,
        });
      },
    }),

    createIdea: tool({
      description:
        'Create a new idea / play / venture. The bootstrap research and market sizing fire automatically in the background after creation. Returns the new id and the route to navigate to.',
      inputSchema: z.object({
        title: z.string().min(2).describe('Short working title for the idea.'),
        brief: z
          .string()
          .min(5)
          .describe('One-paragraph "why", the pitch, the hypothesis, the customer.'),
        category: z.string().optional(),
      }),
      execute: async ({ title, brief, category }) => {
        const url = baseUrl() + '/api/plays';
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ title, brief, category }),
          });
          const json = (await res.json()) as { ok: boolean; id?: string; error?: string };
          if (!json.ok || !json.id) return err(json.error ?? 'createIdea failed');
          return ok({
            id: json.id,
            title,
            clientAction: { type: 'navigate', route: '/plays/' + json.id + '/strategy' },
          });
        } catch (e) {
          return err(e instanceof Error ? e.message : 'createIdea failed');
        }
      },
    }),

    editIdea: tool({
      description:
        'Edit an idea title, brief, stage, pinned status, or category. Returns the updated record. Use when the user says "rename X to Y", "tighten the brief on X", "archive X", "pin X".',
      inputSchema: z.object({
        playId: z.string().optional().describe('Defaults to the play on the current page.'),
        title: z.string().optional(),
        brief: z.string().optional(),
        stage: z
          .enum(['idea', 'researching', 'building', 'ready', 'live', 'retired'])
          .optional(),
        pinned: z.boolean().optional(),
        category: z.string().optional(),
      }),
      execute: async (args) => {
        const r = await resolvePlayIdOrError(pane, args.playId);
        if (!r.ok) return r;
        const url = baseUrl() + '/api/plays/' + r.playId;
        const { playId: _omit, ...patch } = args;
        try {
          const res = await fetch(url, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(patch),
          });
          const json = (await res.json()) as { ok: boolean; error?: string };
          if (!json.ok) return err(json.error ?? 'editIdea failed');
          return ok({ playId: r.playId, patch });
        } catch (e) {
          return err(e instanceof Error ? e.message : 'editIdea failed');
        }
      },
    }),

    deleteIdea: tool({
      description:
        'Delete an idea / play AND every prospect, lead, and conversation tied to it. DESTRUCTIVE. Always present a confirmation in chat first; only call with confirm:true after the user explicitly approves.',
      inputSchema: z.object({
        playId: z.string().optional(),
        confirm: z
          .boolean()
          .optional()
          .describe('Set true only after the user has explicitly confirmed deletion.'),
      }),
      execute: async ({ playId, confirm }) => {
        const r = await resolvePlayIdOrError(pane, playId);
        if (!r.ok) return r;
        if (!confirm) {
          const sb = createSupabaseAdmin();
          const play = await getPlay(sb, r.playId);
          return ok({
            requiresConfirmation: true,
            playId: r.playId,
            playTitle: play?.title ?? r.playId,
            message: 'About to delete "' + (play?.title ?? r.playId) + '" plus every prospect, lead, and conversation tied to it. Cannot be undone. Confirm?',
          });
        }
        const url = baseUrl() + '/api/plays/' + r.playId;
        const res = await fetch(url, { method: 'DELETE' });
        const json = (await res.json()) as { ok: boolean; error?: string };
        if (!json.ok) return err(json.error ?? 'deleteIdea failed');
        return ok({
          deleted: true,
          playId: r.playId,
          clientAction: { type: 'navigate', route: '/plays' },
        });
      },
    }),

    // -----------------------------------------------------------------------
    // STRATEGY
    // -----------------------------------------------------------------------

    setStrategyField: tool({
      description:
        'Set or update one strategy field on the active play. Fields: hypothesis, sector, targetPersona (strings); messagingAngles, successMetrics, disqualifiers (string arrays); weeklyTarget (number).',
      inputSchema: z.object({
        playId: z.string().optional(),
        field: z.enum([
          'hypothesis',
          'sector',
          'targetPersona',
          'messagingAngles',
          'successMetrics',
          'disqualifiers',
          'weeklyTarget',
        ]),
        value: z
          .union([z.string(), z.number(), z.array(z.string())])
          .describe('String for text fields, number for weeklyTarget, string array for the list fields.'),
      }),
      execute: async ({ playId, field, value }) => {
        const r = await resolvePlayIdOrError(pane, playId);
        if (!r.ok) return r;
        const url = baseUrl() + '/api/plays/' + r.playId;
        const res = await fetch(url, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ strategy: { [field]: value } }),
        });
        const json = (await res.json()) as { ok: boolean; error?: string };
        if (!json.ok) return err(json.error ?? 'setStrategyField failed');
        return ok({ playId: r.playId, field, value });
      },
    }),

    // -----------------------------------------------------------------------
    // DISCOVERY / SHORTLIST
    // -----------------------------------------------------------------------

    listShortlist: tool({
      description:
        'List the shortlisted candidate companies for a play. Returns id, name, domain, fit score, status, and a short about-blurb.',
      inputSchema: z.object({
        playId: z.string().optional(),
        statusFilter: z
          .enum(['candidate', 'shortlisted', 'low_fit', 'removed'])
          .optional()
          .describe('Defaults to all statuses; pass "shortlisted" to see the curated set only.'),
      }),
      execute: async ({ playId, statusFilter }) => {
        const r = await resolvePlayIdOrError(pane, playId);
        if (!r.ok) return r;
        const list = await listShortlist(r.playId);
        const filtered = statusFilter ? list.filter((x) => x.status === statusFilter) : list;
        return ok({
          count: filtered.length,
          rows: filtered.slice(0, 50).map((x) => ({
            id: x.id,
            name: x.name,
            domain: x.domain,
            status: x.status,
            fitScore: x.fitScore,
            about: (x.aboutText ?? x.description ?? '').slice(0, 240),
          })),
        });
      },
    }),

    shortlistDomain: tool({
      description: 'Mark a discovered company as shortlisted. Idempotent.',
      inputSchema: z.object({
        playId: z.string().optional(),
        rowId: z.string().describe('Shortlist row id from listShortlist.'),
      }),
      execute: async ({ playId, rowId }) => {
        const r = await resolvePlayIdOrError(pane, playId);
        if (!r.ok) return r;
        const n = await setStatus(r.playId, [rowId], 'shortlisted');
        return ok({ updated: n });
      },
    }),

    blockDomain: tool({
      description:
        'Mark a domain as a no-go. Per-play scope hides it only from this play; global scope hides it from every play and every Discovery search path.',
      inputSchema: z.object({
        playId: z.string().optional(),
        domain: z.string(),
        scope: z.enum(['play', 'global']).optional(),
        reason: z.string().optional(),
        rejectedName: z.string().optional(),
      }),
      execute: async ({ playId, domain, scope, reason, rejectedName }) => {
        const r = await resolvePlayIdOrError(pane, playId);
        if (!r.ok) return r;
        const url = baseUrl() + '/api/discover/' + r.playId + '/block';
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ domain, scope: scope ?? 'play', reason, rejectedName }),
        });
        const json = (await res.json()) as { ok: boolean; error?: string };
        if (!json.ok) return err(json.error ?? 'blockDomain failed');
        return ok({ blocked: domain, scope: scope ?? 'play' });
      },
    }),

    runDiscoveryAgent: tool({
      description:
        'Kick off the discovery agent for a play. The agent searches the web and adds candidate companies to the shortlist. Returns the route to watch progress on. Long-running, fires-and-forgets.',
      inputSchema: z.object({
        playId: z.string().optional(),
        instructions: z
          .string()
          .optional()
          .describe('Optional natural-language guidance to steer the agent (e.g. "focus on Asia-Pacific clubs").'),
      }),
      execute: async ({ playId, instructions }) => {
        const r = await resolvePlayIdOrError(pane, playId);
        if (!r.ok) return r;
        const url = baseUrl() + '/api/plays/' + r.playId + '/discover-agent';
        // Fire-and-forget so the model is not blocked.
        fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ instructions: instructions ?? '' }),
        }).catch(() => {});
        return ok({
          started: true,
          playId: r.playId,
          clientAction: { type: 'navigate', route: '/plays/' + r.playId + '/discover' },
        });
      },
    }),

    // -----------------------------------------------------------------------
    // CAMPAIGNS
    // -----------------------------------------------------------------------

    listCampaigns: tool({
      description:
        'List every email campaign with id, name, subject, kind (newsletter / direct), and status.',
      inputSchema: z.object({
        statusFilter: z.enum(['draft', 'scheduled', 'sending', 'sent', 'failed']).optional(),
      }),
      execute: async ({ statusFilter }) => {
        const arr = await listCampaigns();
        const filtered = statusFilter ? arr.filter((c) => c.status === statusFilter) : arr;
        return ok({
          count: filtered.length,
          campaigns: filtered.slice(0, 30).map((c) => ({
            id: c.id,
            name: c.name,
            subject: c.subject,
            kind: c.kind,
            status: c.status,
            updatedAt: c.updatedAt,
          })),
        });
      },
    }),

    findCampaign: tool({
      description:
        'Find one campaign by name match. Returns the campaign id or an ambiguous-match list.',
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        const arr = await listCampaigns();
        const q = query.toLowerCase().trim();
        const matches = arr.filter((c) => c.name.toLowerCase().includes(q));
        if (matches.length === 0) return err('No campaign matches "' + query + '".');
        if (matches.length > 1) {
          return ok({
            ambiguous: true,
            options: matches.slice(0, 8).map((c) => ({ id: c.id, name: c.name, status: c.status })),
          });
        }
        const c = matches[0];
        return ok({ id: c.id, name: c.name, subject: c.subject, status: c.status, kind: c.kind });
      },
    }),

    getCampaign: tool({
      description: 'Fetch one campaign with subject, body, audience, and current status.',
      inputSchema: z.object({ campaignId: z.string() }),
      execute: async ({ campaignId }) => {
        const c = await getCampaign(campaignId);
        if (!c) return err('Campaign ' + campaignId + ' not found.');
        return ok({
          id: c.id,
          name: c.name,
          subject: c.subject,
          status: c.status,
          kind: c.kind,
          groupIds: c.groupIds ?? [],
          segmentId: c.segmentId ?? null,
          updatedAt: c.updatedAt,
        });
      },
    }),

    createCampaign: tool({
      description:
        'Create a new email campaign in draft status. Returns the new id and the route to the editor. Audience can be wired up later.',
      inputSchema: z.object({
        name: z.string().min(2),
        subject: z.string().min(2),
        kind: z.enum(['newsletter', 'direct']).optional(),
        groupIds: z.array(z.string()).optional(),
        segmentId: z.string().optional(),
      }),
      execute: async ({ name, subject, kind, groupIds, segmentId }) => {
        const c = await createCampaignRow({
          name,
          subject,
          content: '',
          kind: kind ?? 'newsletter',
          groupIds: groupIds ?? null,
          segmentId: segmentId ?? null,
        });
        if (!c) return err('createCampaign failed');
        return ok({
          id: c.id,
          clientAction: { type: 'navigate', route: '/email/campaigns/' + c.id + '/edit' },
        });
      },
    }),

    editCampaign: tool({
      description:
        'Patch an existing campaign: name, subject, body content, audience (groupIds / segmentId), or schedule.',
      inputSchema: z.object({
        campaignId: z.string(),
        name: z.string().optional(),
        subject: z.string().optional(),
        content: z.string().optional(),
        groupIds: z.array(z.string()).optional(),
        segmentId: z.string().optional(),
        scheduledFor: z.string().optional().describe('ISO timestamp for scheduled send.'),
      }),
      execute: async ({ campaignId, ...patch }) => {
        const c = await updateCampaign(campaignId, patch);
        if (!c) return err('editCampaign failed');
        return ok({ id: c.id, patch });
      },
    }),

    deleteCampaign: tool({
      description:
        'Permanently delete a campaign and its recipient rows. DESTRUCTIVE. Always confirm with the user first; only call with confirm:true after explicit approval.',
      inputSchema: z.object({
        campaignId: z.string(),
        confirm: z.boolean().optional(),
      }),
      execute: async ({ campaignId, confirm }) => {
        if (!confirm) {
          const c = await getCampaign(campaignId);
          return ok({
            requiresConfirmation: true,
            campaignId,
            campaignName: c?.name ?? campaignId,
            message: 'Delete campaign "' + (c?.name ?? campaignId) + '"? Cannot be undone.',
          });
        }
        const okFlag = await deleteCampaign(campaignId);
        return okFlag ? ok({ deleted: true }) : err('deleteCampaign failed');
      },
    }),

    // -----------------------------------------------------------------------
    // AUDIENCE
    // -----------------------------------------------------------------------

    listGroups: tool({
      description: 'List every static contact group (the "Lists" surface) with member counts.',
      inputSchema: z.object({}),
      execute: async () => {
        const arr = await listGroups();
        return ok({
          groups: arr.slice(0, 50).map((g) => ({ id: g.id, name: g.name })),
        });
      },
    }),

    listSegments: tool({
      description: 'List every rule-based segment with name and id.',
      inputSchema: z.object({}),
      execute: async () => {
        const arr = await listSegments();
        return ok({
          segments: arr.slice(0, 50).map((s) => ({ id: s.id, name: s.name })),
        });
      },
    }),

    // -----------------------------------------------------------------------
    // NAVIGATION (the AI moves the user around the app)
    // -----------------------------------------------------------------------

    goTo: tool({
      description:
        'Navigate the user to a specific route in the app. Use this whenever the user asks "open X" or "take me to X". The full list of routes the app actually has is below. Match the user request to the closest one. If nothing fits, do NOT guess; ask the operator which existing surface they meant.\n\n' +
        'HOME + UTILITY:\n' +
        '  /                       Home / morning briefing\n' +
        '  /screensaver            Tile canvas screensaver\n' +
        '  /tasks                  To-do list\n' +
        '  /context                Brand contexts (Evari, etc.)\n' +
        '  /settings               General settings\n' +
        '  /settings/connectors    Connector status\n' +
        '  /users                  User accounts\n' +
        '\n' +
        'PROSPECTING (one idea per row, drilled per-id):\n' +
        '  /ideas                  Idea list\n' +
        '  /ideas/{id}             Idea detail\n' +
        '  /plays                  Plays (legacy alias of ideas detail)\n' +
        '  /plays/{id}             Play detail\n' +
        '  /strategy               Strategy step browser\n' +
        '  /discover               Discovery dashboard\n' +
        '  /discover/search        Discovery search add-companies\n' +
        '  /shortlist              Shortlist surface\n' +
        '  /enrichment             Contact enrichment\n' +
        '  /leads                  Leads CRM\n' +
        '  /leads/{id}             Lead detail\n' +
        '  /prospects              Prospects (legacy)\n' +
        '  /prospecting/exclusions Per-search blocklist settings\n' +
        '  /people                 Person-centric inbox view\n' +
        '  /scoring                Fit score rubric\n' +
        '\n' +
        'EMAIL / MARKETING:\n' +
        '  /email                  Email overview\n' +
        '  /email/campaigns        Campaign list\n' +
        '  /email/campaigns/new    New campaign wizard\n' +
        '  /email/campaigns/{id}   Campaign detail / report\n' +
        '  /email/statistics       Stats + follow-ups inbox\n' +
        '  /email/conversations    Inbox replies\n' +
        '  /email/audience         Lists + segments\n' +
        '  /email/audience/{id}    Specific list / segment\n' +
        '  /email/assets           Asset library\n' +
        '  /email/templates        Template library\n' +
        '  /email/templates/{id}/edit  Edit a template\n' +
        '  /email/flows            Automated flows\n' +
        '  /email/flows/new        New flow\n' +
        '  /email/flows/{id}       Flow detail\n' +
        '  /email/contacts         Contact directory\n' +
        '  /email/contacts/{id}    Contact detail\n' +
        '  /email/domains          Sending domains\n' +
        '  /email/domains/{id}     Domain detail\n' +
        '  /email/suppressions     Suppression list\n' +
        '  /email/brand            Brand kit\n' +
        '  /email/settings         Email settings\n' +
        '\n' +
        'WEB / SEO / TRAFFIC:\n' +
        '  /seo                    SEO Health\n' +
        '  /traffic                Traffic analytics\n' +
        '  /performance            Performance / Core Web Vitals\n' +
        '  /pages                  Page inventory\n' +
        '  /backlinks              Backlinks\n' +
        '  /keywords               Keyword strategy\n' +
        '\n' +
        'CONTENT + SOCIAL:\n' +
        '  /journals               Journal entries (long-form)\n' +
        '  /journals/{id}          Journal detail\n' +
        '  /articles               Article inventory\n' +
        '  /social                 Social calendar\n' +
        '  /social/new             New social post\n' +
        '  /social/instagram       Instagram queue\n' +
        '  /social/linkedin        LinkedIn queue\n' +
        '  /social/tiktok          TikTok queue\n' +
        '  /synopsis               Synopsis (article summarising)\n' +
        '\n' +
        'SHOPIFY:\n' +
        '  /shopify                Shopify overview\n' +
        '  /shopify/products       Products\n' +
        '  /shopify/customers      Customers\n' +
        '  /shopify/orders         Orders\n' +
        '  /shopify/seo            Shopify SEO\n' +
        '  /shopify/seo-health     SEO health view\n' +
        '  /shopify/content        Shopify content overview\n' +
        '  /shopify/content/articles      Articles in Shopify\n' +
        '  /shopify/content/pages         Pages in Shopify\n' +
        '  /shopify/content/navigation    Navigation menus\n' +
        '  /shopify/growth         Growth overview\n' +
        '  /shopify/growth/abandoned      Abandoned carts\n' +
        '  /shopify/growth/discounts      Discount codes\n' +
        '  /shopify/growth/drafts         Draft orders\n' +
        '  /shopify/ops            Ops overview\n' +
        '  /shopify/ops/404s              404 monitor\n' +
        '  /shopify/ops/analytics         Shopify analytics\n' +
        '  /shopify/ops/redirects         Redirects\n' +
        '  /klaviyo                Klaviyo connector\n' +
        '\n' +
        'OTHER:\n' +
        '  /ventures               Ventures (legacy alias of /ideas)\n' +
        '  /ventures/{id}          Venture detail\n' +
        '  /conversations          Conversations (legacy alias)\n' +
        '  /wireframe              Internal wireframe sandbox\n' +
        '\n' +
        'If the user asks for "the audience page" route to /email/audience. ' +
        '"Asset library" -> /email/assets. "Templates" -> /email/templates. ' +
        '"Briefing" or "home" -> /. "Tasks" or "to-do" -> /tasks.',
      inputSchema: z.object({
        route: z.string().describe('Pathname starting with "/". See description for the valid list.'),
      }),
      execute: async ({ route }) => {
        // The full set of routes the app exposes. Generated by walking
        // app/(dashboard)/ + app/ for every page.tsx. Update via that
        // walk if the app gains a new route. Validation rejects any
        // path that does not match an exact route or a prefix of one
        // (so /plays/abc and /email/templates/123/edit both pass).
        const VALID_ROUTES: string[] = [
          '/',
          '/screensaver',
          '/tasks',
          '/context',
          '/settings',
          '/settings/connectors',
          '/users',
          '/ideas',
          '/ideas/',
          '/plays',
          '/plays/',
          '/strategy',
          '/discover',
          '/discover/search',
          '/shortlist',
          '/enrichment',
          '/leads',
          '/leads/',
          '/prospects',
          '/prospecting/exclusions',
          '/people',
          '/scoring',
          '/conversations',
          '/email',
          '/email/campaigns',
          '/email/campaigns/new',
          '/email/campaigns/',
          '/email/statistics',
          '/email/conversations',
          '/email/audience',
          '/email/audience/',
          '/email/assets',
          '/email/templates',
          '/email/templates/',
          '/email/flows',
          '/email/flows/new',
          '/email/flows/',
          '/email/contacts',
          '/email/contacts/',
          '/email/domains',
          '/email/domains/',
          '/email/suppressions',
          '/email/brand',
          '/email/settings',
          '/seo',
          '/traffic',
          '/performance',
          '/pages',
          '/backlinks',
          '/keywords',
          '/journals',
          '/journals/',
          '/articles',
          '/social',
          '/social/new',
          '/social/instagram',
          '/social/linkedin',
          '/social/tiktok',
          '/synopsis',
          '/wireframe',
          '/shopify',
          '/shopify/products',
          '/shopify/customers',
          '/shopify/orders',
          '/shopify/seo',
          '/shopify/seo-health',
          '/shopify/content',
          '/shopify/content/articles',
          '/shopify/content/pages',
          '/shopify/content/navigation',
          '/shopify/growth',
          '/shopify/growth/abandoned',
          '/shopify/growth/discounts',
          '/shopify/growth/drafts',
          '/shopify/ops',
          '/shopify/ops/404s',
          '/shopify/ops/analytics',
          '/shopify/ops/redirects',
          '/klaviyo',
          '/ventures',
          '/ventures/',
        ];
        const raw = route.trim();
        if (!raw.startsWith('/')) {
          return err('route must start with "/", got: ' + raw);
        }
        // Strip query/hash before matching.
        const r = raw.split('?')[0].split('#')[0];
        // A route matches if it is an exact entry, OR an entry ending
        // with '/' is a strict prefix of it (covers /ideas/{id} etc.).
        const valid = VALID_ROUTES.some((entry) => {
          if (entry === r) return true;
          if (entry.endsWith('/') && r.startsWith(entry)) return true;
          return false;
        });
        if (!valid) {
          // Suggest the closest match by checking prefix overlap.
          const candidates = VALID_ROUTES.filter((p) => p !== '/' && r.startsWith(p)).slice(-1);
          const hint = candidates.length > 0 ? ' Did you mean ' + candidates[0] + '?' : '';
          return err('Unknown route: ' + r + '.' + hint + ' Ask the operator which surface they meant; see the tool description for the full route list.');
        }
        return ok({ clientAction: { type: 'navigate', route: r } });
      },
    }),

    getTrafficSnapshot: tool({
      description:
        'Pull the live GA4 traffic snapshot for evari.cc: sessions, active users, conversions, top channels, top pages, top countries / cities, devices, languages, events, demographics, plus week-on-week deltas. Use this whenever the operator asks about website traffic, what is happening on the site, where visitors come from, which pages are hot, mobile vs desktop split, or any performance question. Returns structured data the assistant should narrate in plain English.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const s = await getTrafficSnapshot();
          if (!s.connected) {
            return err('GA4 not connected. Tell the operator to set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, and GA4_PROPERTY_ID in Vercel.');
          }
          if (!s.hasData) {
            return err('GA4 connected but no data yet. Tell the operator to open the Traffic page and click Sync now to run the first ingest.');
          }
          // Trim noisy fields and return only what is useful for narration.
          // Keep top 5 of each list so the model has signal but does not
          // drown in 250-row country tables.
          return ok({
            window: { start: s.windowStart, end: s.windowEnd, days: 28 },
            kpis: {
              activeUsers: { value: s.kpi.activeUsers.value, deltaPct: s.kpi.activeUsers.deltaPct },
              newUsers: { value: s.kpi.newUsers.value, deltaPct: s.kpi.newUsers.deltaPct },
              sessions: { value: s.kpi.sessions.value, deltaPct: s.kpi.sessions.deltaPct },
              events: { value: s.kpi.events.value, deltaPct: s.kpi.events.deltaPct },
            },
            topChannels: s.channels.slice(0, 5).map((c) => ({ channel: c.channel, sessions: c.sessions, conversions: c.conversions })),
            topPages: s.pages.slice(0, 5).map((p) => ({ path: p.pagePath, title: p.pageTitle, views: p.views, users: p.users, bounceRate: p.bounceRate })),
            topCountries: s.countries.slice(0, 5).map((c) => ({ country: c.country, sessions: c.sessions })),
            topCities: s.cities.slice(0, 5).map((c) => ({ city: c.city, country: c.country, sessions: c.sessions })),
            topSources: s.sources.slice(0, 5).map((s2) => ({ source: s2.source, medium: s2.medium, sessions: s2.sessions })),
            devices: s.devices.map((d) => ({ device: d.device, sessions: d.sessions, users: d.users })),
            topEvents: s.events.slice(0, 5).map((e) => ({ name: e.eventName, count: e.eventCount })),
            languages: s.languages.slice(0, 3).map((l) => ({ language: l.language, sessions: l.sessions })),
            lastSyncedAt: s.lastSyncedAt,
          });
        } catch (e) {
          return err(e instanceof Error ? e.message : 'getTrafficSnapshot failed');
        }
      },
    }),

        listOpenTasks: tool({
      description:
        'List every open task on the to-do board (anything that is not status="done"). Returns id, title, description, category, priority, status, due date, notes. Used when the operator says "walk me through my tasks" or "what is on my list". Sort: priority desc (urgent, high, medium, low), then due date asc.',
      inputSchema: z.object({
        category: z.string().optional().describe('Optional. Filter by category (seo, shopify, lead-gen, social, content, etc).'),
      }),
      execute: async ({ category }) => {
        const sb = createSupabaseAdmin();
        if (!sb) return err('DB unavailable');
        try {
          const { tasks } = await listTasksAndLists(sb);
          const PRI: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
          let out = tasks.filter((t) => t.status !== 'done');
          if (category) out = out.filter((t) => t.category === category);
          out.sort((a, b) => {
            const pa = PRI[a.priority] ?? 4;
            const pb = PRI[b.priority] ?? 4;
            if (pa !== pb) return pa - pb;
            const da = a.dueDate ?? '9999-12-31';
            const db = b.dueDate ?? '9999-12-31';
            return da.localeCompare(db);
          });
          return ok({
            count: out.length,
            tasks: out.map((t) => ({
              id: t.id,
              title: t.title,
              description: t.description ?? null,
              category: t.category,
              priority: t.priority,
              status: t.status,
              dueDate: t.dueDate ?? null,
              notes: t.notes ?? null,
            })),
          });
        } catch (e) {
          return err(e instanceof Error ? e.message : 'listOpenTasks failed');
        }
      },
    }),

    markTaskStatus: tool({
      description:
        'Update a task\'s status. Use after walking the operator through a task to mark it done, in-progress, or blocked. Status values: proposed, planned, in-progress, done, blocked.',
      inputSchema: z.object({
        taskId: z.string(),
        status: z.enum(['proposed', 'planned', 'in-progress', 'done', 'blocked']),
        note: z.string().optional().describe('Optional resolution note appended to task.notes (e.g. why blocked, how fixed).'),
      }),
      execute: async ({ taskId, status, note }) => {
        const sb = createSupabaseAdmin();
        if (!sb) return err('DB unavailable');
        try {
          // Append note to existing notes if any.
          let nextNotes: string | undefined;
          if (note && note.trim().length > 0) {
            const { data: cur } = await sb.from('tasks').select('notes').eq('id', taskId).maybeSingle();
            const existing = (cur as { notes?: string } | null)?.notes ?? '';
            const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
            const entry = '[' + stamp + ' Mojito] ' + note.trim();
            nextNotes = existing ? existing + '\n' + entry : entry;
          }
          const updated = await updateTaskById(sb, taskId, {
            status,
            ...(nextNotes !== undefined ? { notes: nextNotes } : {}),
          });
          return ok({ taskId, status: updated.status, title: updated.title });
        } catch (e) {
          return err(e instanceof Error ? e.message : 'markTaskStatus failed');
        }
      },
    }),

    addTaskNote: tool({
      description:
        'Append a timestamped note to a task without changing its status. Use to record findings or analysis as you work through the task.',
      inputSchema: z.object({
        taskId: z.string(),
        note: z.string(),
      }),
      execute: async ({ taskId, note }) => {
        const sb = createSupabaseAdmin();
        if (!sb) return err('DB unavailable');
        try {
          const { data: cur } = await sb.from('tasks').select('notes').eq('id', taskId).maybeSingle();
          const existing = (cur as { notes?: string } | null)?.notes ?? '';
          const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
          const entry = '[' + stamp + ' Mojito] ' + note.trim();
          const next = existing ? existing + '\n' + entry : entry;
          const updated = await updateTaskById(sb, taskId, { notes: next });
          return ok({ taskId, title: updated.title, notesLength: next.length });
        } catch (e) {
          return err(e instanceof Error ? e.message : 'addTaskNote failed');
        }
      },
    }),

        listShopifyPagesWithSeo: tool({
      description:
        'List every Shopify storefront page with its current SEO meta title and description. Use to find pages missing meta data or with weak titles. Returns id, handle, title, current metaTitle, metaDescription, and a flag indicating whether SEO is missing.',
      inputSchema: z.object({}),
      execute: async () => {
        if (!isShopifyConnected()) return err('Shopify not connected. Set SHOPIFY_STORE + SHOPIFY_ACCESS_TOKEN in Vercel.');
        try {
          const pages = await listShopifyPages();
          return ok({
            count: pages.length,
            pages: pages.map((p) => ({
              id: p.id,
              handle: p.handle,
              title: p.title,
              metaTitle: p.seo?.title ?? null,
              metaDescription: p.seo?.description ?? null,
              missingSeo: !p.seo?.title || !p.seo?.description,
            })),
          });
        } catch (e) {
          return err(e instanceof Error ? e.message : 'listShopifyPagesWithSeo failed');
        }
      },
    }),

    updateShopifyPageSeo: tool({
      description:
        'Update the SEO meta title and / or meta description on a single Shopify page. DESTRUCTIVE in the sense that it writes to your live storefront. Always confirm with the operator before calling with confirm:true; first call returns a preview with requiresConfirmation=true.',
      inputSchema: z.object({
        pageId: z.string().describe('Shopify page id (numeric or gid://).'),
        metaTitle: z.string().optional(),
        metaDescription: z.string().optional(),
        confirm: z.boolean().optional(),
      }),
      execute: async ({ pageId, metaTitle, metaDescription, confirm }) => {
        if (!metaTitle && !metaDescription) return err('Provide at least one of metaTitle or metaDescription.');
        if (!confirm) {
          return ok({
            requiresConfirmation: true,
            pageId,
            preview: { metaTitle, metaDescription },
            message: 'About to write SEO meta to Shopify page ' + pageId + '. Title: "' + (metaTitle ?? '(unchanged)') + '". Description: "' + (metaDescription ?? '(unchanged)') + '". Confirm?',
          });
        }
        try {
          const r = await updatePageMetadata({ pageId, metaTitle, metaDescription });
          return ok({ pageId, written: true, response: r });
        } catch (e) {
          return err(e instanceof Error ? e.message : 'updateShopifyPageSeo failed');
        }
      },
    }),

    listShopifyArticlesWithSeo: tool({
      description:
        'List Shopify journal / blog articles with their current SEO meta title and description. Optionally filter by blog. Used to spot articles missing SEO meta.',
      inputSchema: z.object({
        blogId: z.string().optional().describe('Optional. Filter to a specific blog. If omitted, lists from the first blog.'),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      execute: async ({ blogId, limit }) => {
        if (!isShopifyConnected()) return err('Shopify not connected.');
        try {
          let bid = blogId;
          if (!bid) {
            const blogs = await listBlogs();
            bid = blogs[0]?.id;
            if (!bid) return err('No Shopify blogs found.');
          }
          const articles = await listArticles({ blogId: bid, first: limit ?? 50 });
          return ok({
            blogId: bid,
            count: articles.length,
            articles: articles.map((a) => ({
              id: a.id,
              handle: a.handle,
              title: a.title,
              metaTitle: a.seo?.title ?? null,
              metaDescription: a.seo?.description ?? null,
              missingSeo: !a.seo?.title || !a.seo?.description,
            })),
          });
        } catch (e) {
          return err(e instanceof Error ? e.message : 'listShopifyArticlesWithSeo failed');
        }
      },
    }),

    updateShopifyArticleSeo: tool({
      description:
        'Update the SEO meta title / description on a Shopify article. Two-step confirmation; first call returns requiresConfirmation, second call with confirm:true writes.',
      inputSchema: z.object({
        articleId: z.string(),
        metaTitle: z.string().optional(),
        metaDescription: z.string().optional(),
        confirm: z.boolean().optional(),
      }),
      execute: async ({ articleId, metaTitle, metaDescription, confirm }) => {
        if (!metaTitle && !metaDescription) return err('Provide at least one of metaTitle or metaDescription.');
        if (!confirm) {
          return ok({
            requiresConfirmation: true,
            articleId,
            preview: { metaTitle, metaDescription },
            message: 'About to write SEO meta to article ' + articleId + '. Title: "' + (metaTitle ?? '(unchanged)') + '". Description: "' + (metaDescription ?? '(unchanged)') + '". Confirm?',
          });
        }
        try {
          const r = await updateArticleMetadata({ articleId, metaTitle, metaDescription });
          return ok({ articleId, written: true, response: r });
        } catch (e) {
          return err(e instanceof Error ? e.message : 'updateShopifyArticleSeo failed');
        }
      },
    }),

    listShopifyProductsWithSeo: tool({
      description:
        'List Shopify products with their current SEO meta title and description. Returns id, handle, title, current SEO meta, and missingSeo flag. Use to find products that need meta written.',
      inputSchema: z.object({
        limit: z.number().int().min(1).max(250).optional(),
      }),
      execute: async ({ limit }) => {
        if (!isShopifyConnected()) return err('Shopify not connected.');
        try {
          const products = await listProducts({ first: limit ?? 50 });
          return ok({
            count: products.length,
            products: products.map((p) => ({
              id: p.id,
              handle: p.handle,
              title: p.title,
              status: p.status,
              metaTitle: p.seo?.title ?? null,
              metaDescription: p.seo?.description ?? null,
              missingSeo: !p.seo?.title || !p.seo?.description,
            })),
          });
        } catch (e) {
          return err(e instanceof Error ? e.message : 'listShopifyProductsWithSeo failed');
        }
      },
    }),

    updateShopifyProductSeo: tool({
      description:
        'Update SEO meta on a Shopify product. Two-step confirmation. Title goes to product.seo.title (commonly title_tag), description goes to product.seo.description (commonly description_tag).',
      inputSchema: z.object({
        productId: z.string(),
        metaTitle: z.string().optional(),
        metaDescription: z.string().optional(),
        confirm: z.boolean().optional(),
      }),
      execute: async ({ productId, metaTitle, metaDescription, confirm }) => {
        if (!metaTitle && !metaDescription) return err('Provide at least one of metaTitle or metaDescription.');
        if (!confirm) {
          return ok({
            requiresConfirmation: true,
            productId,
            preview: { metaTitle, metaDescription },
            message: 'About to write SEO meta to product ' + productId + '. Title: "' + (metaTitle ?? '(unchanged)') + '". Description: "' + (metaDescription ?? '(unchanged)') + '". Confirm?',
          });
        }
        try {
          const r = await updateProduct({
            id: productId,
            seoTitle: metaTitle,
            seoDescription: metaDescription,
          });
          return ok({ productId, written: true, title: r.title });
        } catch (e) {
          return err(e instanceof Error ? e.message : 'updateShopifyProductSeo failed');
        }
      },
    }),

        readMorningBriefing: tool({
      description:
        'Fetch the latest morning briefing prose (the analyst-style summary of pipeline, traffic, anomalies and so on) and return it as text for the assistant to read aloud. Use whenever the operator asks to hear the briefing, walk through today, or get a status summary.',
      inputSchema: z.object({}),
      execute: async () => {
        const url = baseUrl() + '/api/briefing';
        try {
          const res = await fetch(url);
          if (!res.ok) return err('briefing fetch failed: HTTP ' + res.status);
          const json = (await res.json()) as { markdown?: string; date?: string };
          if (!json.markdown) return err('briefing markdown empty');
          // Strip headings + markdown syntax so the TTS reads it naturally.
          const plain = json.markdown
            .replace(/^#+\s*/gm, '')
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/\*([^*]+)\*/g, '$1')
            .replace(/`([^`]+)`/g, '$1')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
          return ok({ date: json.date ?? null, briefing: plain });
        } catch (e) {
          return err(e instanceof Error ? e.message : 'briefing fetch failed');
        }
      },
    }),

    closeAssistantPane: tool({
      description: 'Hide the AI assistant pane. Use only when the user explicitly asks to close it.',
      inputSchema: z.object({}),
      execute: async () => ok({ clientAction: { type: 'closePane' } }),
    }),

    // -----------------------------------------------------------------------
    // PHASE 3: SEND + EXECUTE
    // -----------------------------------------------------------------------

    prepareSend: tool({
      description:
        'Run the pre-send pipeline on a campaign: image optimisation, missing-image checks, link health, deliverability flags. Returns a report. Non-destructive; nothing leaves the building.',
      inputSchema: z.object({ campaignId: z.string() }),
      execute: async ({ campaignId }) => {
        const url = baseUrl() + '/api/marketing/campaigns/' + campaignId + '/prepare-send';
        try {
          const res = await fetch(url, { method: 'POST' });
          const json = (await res.json().catch(() => ({}))) as { ok?: boolean; report?: unknown; error?: string };
          if (!json.ok) return err(json.error ?? 'prepareSend failed');
          await recordAction({
            toolName: 'prepareSend',
            args: { campaignId },
            result: { campaignId, ranAt: new Date().toISOString() },
            surface: pane.surface,
          });
          return ok({ campaignId, report: json.report ?? null });
        } catch (e) {
          return err(e instanceof Error ? e.message : 'prepareSend failed');
        }
      },
    }),

    sendCampaign: tool({
      description:
        'Send a campaign NOW to its full audience. HARD destructive: emails leave the building and CANNOT be unsent. The model MUST present the audience size + subject and require explicit confirmation. For sends > 10 recipients require the operator to type a confirmation phrase; the assistant pane handles that gating. Only call with confirm:true after the user has typed "send" or said something equivalent.',
      inputSchema: z.object({
        campaignId: z.string(),
        confirm: z.boolean().optional(),
      }),
      execute: async ({ campaignId, confirm }) => {
        const c = await getCampaign(campaignId);
        if (!c) return err('Campaign ' + campaignId + ' not found.');
        if (!confirm) {
          return ok({
            requiresConfirmation: true,
            campaignId,
            campaignName: c.name,
            subject: c.subject,
            kind: c.kind,
            message:
              'About to SEND "' + c.name + '" with subject "' + c.subject + '". Audience: every contact in the linked groups / segments. This cannot be undone once it leaves Gmail. Confirm?',
          });
        }
        const url = baseUrl() + '/api/marketing/campaigns/' + campaignId + '/send';
        try {
          const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
          const json = (await res.json().catch(() => ({}))) as { ok?: boolean; sent?: number; failed?: number; held?: number; error?: string };
          if (!json.ok) return err(json.error ?? 'sendCampaign failed');
          await recordAction({
            toolName: 'sendCampaign',
            args: { campaignId },
            result: json,
            // No inverse: emails cannot be unsent.
            inverse: null,
            surface: pane.surface,
          });
          return ok({ campaignId, sent: json.sent ?? 0, failed: json.failed ?? 0, held: json.held ?? 0 });
        } catch (e) {
          return err(e instanceof Error ? e.message : 'sendCampaign failed');
        }
      },
    }),

    scheduleSend: tool({
      description:
        'Schedule a campaign for a future send. Less destructive than sendCampaign because the operator can still cancel before the scheduled time. Pass an ISO timestamp.',
      inputSchema: z.object({
        campaignId: z.string(),
        when: z.string().describe('ISO 8601 datetime, e.g. 2026-05-02T09:00:00+10:00'),
      }),
      execute: async ({ campaignId, when }) => {
        const c = await updateCampaign(campaignId, { scheduledFor: when });
        if (!c) return err('scheduleSend failed');
        const id = await recordAction({
          toolName: 'scheduleSend',
          args: { campaignId, when },
          result: { campaignId, scheduledFor: when },
          inverse: { tool: 'cancelScheduledSend', args: { campaignId } },
          surface: pane.surface,
        });
        return ok({ campaignId, scheduledFor: when, actionId: id });
      },
    }),

    cancelScheduledSend: tool({
      description:
        'Cancel a previously scheduled campaign send by clearing its scheduledFor field. Used by undoLast to reverse a scheduleSend, also callable directly.',
      inputSchema: z.object({ campaignId: z.string() }),
      execute: async ({ campaignId }) => {
        const c = await updateCampaign(campaignId, { scheduledFor: null });
        if (!c) return err('cancelScheduledSend failed');
        await recordAction({
          toolName: 'cancelScheduledSend',
          args: { campaignId },
          result: { campaignId, scheduledFor: null },
          surface: pane.surface,
        });
        return ok({ campaignId, scheduledFor: null });
      },
    }),

    sendReply: tool({
      description:
        'Send a reply on a marketing conversation thread via Gmail. The body is plain text or simple HTML; the signature is appended server-side from the default OutreachSender. DESTRUCTIVE for irreversible sends; require a confirm:true call after presenting the recipient + body.',
      inputSchema: z.object({
        threadId: z.string(),
        body: z.string().describe('Reply body. Plain text fine; will be wrapped server-side.'),
        confirm: z.boolean().optional(),
      }),
      execute: async ({ threadId, body, confirm }) => {
        if (!confirm) {
          return ok({
            requiresConfirmation: true,
            threadId,
            preview: body.slice(0, 240),
            message:
              'About to send this reply on thread ' + threadId + '. Once it goes via Gmail it cannot be unsent. Confirm?',
          });
        }
        const url = baseUrl() + '/api/conversations/' + threadId + '/reply';
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ body }),
          });
          const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
          if (!json.ok) return err(json.error ?? 'sendReply failed');
          await recordAction({
            toolName: 'sendReply',
            args: { threadId, body },
            result: json,
            inverse: null, // irreversible
            surface: pane.surface,
          });
          return ok({ threadId, sent: true });
        } catch (e) {
          return err(e instanceof Error ? e.message : 'sendReply failed');
        }
      },
    }),

    // -----------------------------------------------------------------------
    // PHASE 3: UNDO + TELEMETRY
    // -----------------------------------------------------------------------

    undoLast: tool({
      description:
        'Undo the most recent reversible action (createIdea, scheduleSend, etc). Reads the action log, finds the latest row with an inverse, and executes the inverse. Sends and other irreversible actions cannot be undone.',
      inputSchema: z.object({
        confirm: z.boolean().optional(),
      }),
      execute: async ({ confirm }) => {
        const last = await findMostRecentUndoable();
        if (!last) return err('Nothing reversible to undo. Sends are permanent; try editing instead.');
        if (!confirm) {
          return ok({
            requiresConfirmation: true,
            tool: last.tool_name,
            inverse: last.inverse.tool,
            args: last.inverse.args,
            message:
              'Undo: ' + last.tool_name + ' (' + new Date(last.created_at).toLocaleTimeString() + ')? Will run ' + last.inverse.tool + '.',
          });
        }
        // Look up the inverse tool in our own registry and call it.
        // We avoid a recursive HTTP call here; same-process invocation
        // is fine because every tool has a self-contained execute().
        const registry = buildTools(pane) as Record<string, { execute?: (args: unknown) => Promise<unknown> }>;
        const inverseTool = registry[last.inverse.tool];
        if (!inverseTool || typeof inverseTool.execute !== 'function') {
          return err('Inverse tool ' + last.inverse.tool + ' not found in registry.');
        }
        const result = await inverseTool.execute({ ...last.inverse.args, confirm: true });
        await markUndone(last.id);
        return ok({ undone: last.tool_name, inverseResult: result });
      },
    }),

    listRecentActions: tool({
      description:
        'List the last few tool calls Mojito made on this dashboard. Useful when the user asks "what have you done today" or "show me recent activity".',
      inputSchema: z.object({ limit: z.number().int().min(1).max(50).optional() }),
      execute: async ({ limit }) => {
        const rows = await listRecentActions(limit ?? 20);
        return ok({
          actions: rows.map((r) => ({
            id: r.id,
            tool: r.tool_name,
            args: r.tool_args,
            result: r.result,
            undone: !!r.undone_at,
            at: r.created_at,
          })),
        });
      },
    }),

    // -----------------------------------------------------------------------
    // PHASE 4: SUGGESTED-NEXT-ACTIONS HELPER
    // -----------------------------------------------------------------------

    getOpenWork: tool({
      description:
        'Return a quick snapshot of what is open across the dashboard: counts of ideas, leads waiting > 5 days, pending follow-ups, draft campaigns. Used by the morning summary and the empty-state suggestions.',
      inputSchema: z.object({}),
      execute: async () => {
        const sb = createSupabaseAdmin();
        if (!sb) return err('DB unavailable');
        try {
          // Run independently and tolerate missing tables (e.g. followups
          // table not yet migrated in some envs) by absorbing each error.
          const playsRes = await sb.from('dashboard_plays').select('id, payload');
          const leadsRes = await sb.from('dashboard_leads').select('payload').eq('tier', 'lead');
          let followupsCount = 0;
          try {
            const r = await sb.from('dashboard_mkt_followups').select('id', { count: 'exact', head: true }).eq('status', 'pending');
            followupsCount = r.count ?? 0;
          } catch { /* table missing */ }
          let draftRows: Array<{ id: string; name: string }> = [];
          let draftCount = 0;
          try {
            const r = await sb.from('dashboard_mkt_campaigns').select('id, name', { count: 'exact' }).eq('status', 'draft');
            draftRows = (r.data ?? []) as Array<{ id: string; name: string }>;
            draftCount = r.count ?? 0;
          } catch { /* table missing */ }
          const plays = (playsRes.data ?? []) as Array<{ id: string; payload: { stage?: string; title?: string } }>;
          const leads = (leadsRes.data ?? []) as Array<{ payload: { lastTouchAt?: string; name?: string } }>;
          const liveIdeas = plays.filter((p) => p.payload?.stage && p.payload.stage !== 'retired').length;
          const fiveDaysAgo = Date.now() - 5 * 24 * 60 * 60 * 1000;
          const staleLeads = leads.filter((l) => {
            const t = l.payload?.lastTouchAt ? new Date(l.payload.lastTouchAt).getTime() : 0;
            return t > 0 && t < fiveDaysAgo;
          }).length;
          return ok({
            ideasActive: liveIdeas,
            ideasTotal: plays.length,
            leadsTotal: leads.length,
            leadsStale5d: staleLeads,
            followupsPending: followupsCount,
            campaignDrafts: draftCount,
            campaignDraftNames: draftRows.slice(0, 5).map((r) => r.name),
          });
        } catch (e) {
          return err(e instanceof Error ? e.message : 'getOpenWork failed');
        }
      },
    }),
  };
}

export type ToolRegistry = ReturnType<typeof buildTools>;
