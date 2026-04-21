import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getLead, upsertLead } from '@/lib/dashboard/repository';
import { hasAIGatewayCredentials } from '@/lib/ai/gateway';
import { enrichContacts } from '@/lib/enrichment/contacts';
import type { Lead } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/leads/[id]/enrich-contacts
 *
 * Streams Server-Sent Events while scraping the lead's company website and
 * extracting up to 20 contacts (name, title, email, department, seniority).
 * Saves the result to lead.orgProfile.contacts.
 *
 * Events:
 *   start            — pipeline begins
 *   scraping         — about to fetch pages
 *   scraped-page     — one page fetched (incl. url + char count)
 *   extracting       — scraped text handed to Claude
 *   inferring        — missing emails being pattern-inferred
 *   done             — final result (incl. counts + updated lead)
 *   error            — terminal failure
 *
 * Query: ?regenerate=1 to force a refresh even when contacts already exist.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(req.url);
  const regenerate = url.searchParams.get('regenerate') === '1';
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      function emit(event: Record<string, unknown>): void {
        controller.enqueue(encoder.encode('data: ' + JSON.stringify(event) + '\n\n'));
      }
      function fail(message: string, status = 500): void {
        emit({ phase: 'error', message, status });
        controller.close();
      }

      const supabase = createSupabaseAdmin();
      if (!supabase) {
        fail('Supabase admin client unavailable');
        return;
      }
      const lead = await getLead(supabase, id);
      if (!lead) {
        fail('Lead not found', 404);
        return;
      }
      if (!hasAIGatewayCredentials()) {
        fail('AI gateway not configured');
        return;
      }

      // Cache short-circuit — skip re-running when fresh contacts exist.
      if (
        !regenerate &&
        lead.orgProfile?.contacts &&
        lead.orgProfile.contacts.length > 0
      ) {
        emit({
          phase: 'done',
          cached: true,
          contacts: lead.orgProfile.contacts,
          sourceNote: lead.orgProfile.contactsSourceNote,
          lead,
        });
        controller.close();
        return;
      }

      try {
        const result = await enrichContacts(lead, {
          onProgress: (phase, detail) => emit({ phase, ...(detail ?? {}) }),
        });

        const nowIso = new Date().toISOString();
        const next: Lead = {
          ...lead,
          orgProfile: {
            ...(lead.orgProfile ?? { generatedAt: nowIso }),
            contacts: result.contacts,
            contactsSourceNote: result.sourceNote,
            contactsEnrichedAt: nowIso,
            generatedAt: lead.orgProfile?.generatedAt ?? nowIso,
          },
        };
        const saved = await upsertLead(supabase, next);
        if (!saved) {
          fail('Save failed');
          return;
        }

        emit({
          phase: 'done',
          cached: false,
          contacts: result.contacts,
          sourceNote: result.sourceNote,
          scrapedPaths: result.scrapedPaths,
          failedPaths: result.failedPaths,
          lead: saved,
        });
        controller.close();
      } catch (err) {
        fail('Enrichment failed: ' + (err as Error).message);
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
    },
  });
}
