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
        'Navigate the user to a specific route in the app. Use this whenever the user asks "open X" or "take me to X". Always prefer named routes over made-up paths.',
      inputSchema: z.object({
        route: z
          .string()
          .describe(
            'Pathname starting with "/". Common routes: /plays (ideas list), /plays/{id}/strategy, /plays/{id}/discover, /plays/{id}/shortlist, /email/campaigns, /email/campaigns/{id}/edit, /email/statistics, /email/conversations, /audience/lists, /audience/segments, /context, /assets, /content',
          ),
      }),
      execute: async ({ route }) => {
        return ok({ clientAction: { type: 'navigate', route } });
      },
    }),

    closeAssistantPane: tool({
      description: 'Hide the AI assistant pane. Use only when the user explicitly asks to close it.',
      inputSchema: z.object({}),
      execute: async () => ok({ clientAction: { type: 'closePane' } }),
    }),
  };
}

export type ToolRegistry = ReturnType<typeof buildTools>;
