import { NextResponse } from 'next/server';
import { generateBriefing, hasAIGatewayCredentials } from '@/lib/ai/gateway';
import { getKeywordWorkspace } from '@/lib/keywords/workspace';
import type { KeywordList, KeywordMember, KeywordWorkspace } from '@/lib/keywords/workspace';
import { listCachedGmailThreads } from '@/lib/integrations/gmail';
import type { GmailThreadSummary } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * POST /api/keywords/chat
 *
 * Strategy spitball-mode for the Keywords page. Grounded in the full
 * workspace — every own list, every competitor domain, every keyword with
 * its market data (volume, CPC, KD, intent) and our rank vs theirs.
 *
 * Intent: Craig wants to ask things like "what are the best keywords in
 * ebikes?" or "where's the gap in adventure-touring terms?" and get a
 * reply that actually looks at what's already on the shelf. So we stuff
 * the current workspace into the system context and let the model reason
 * over it.
 *
 * Request body: { message: string; history?: ChatMessage[] }
 * Response:     { markdown: string; mock?: boolean }
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    message?: string;
    history?: ChatMessage[];
  };
  const message = (body.message ?? '').trim();
  if (!message) {
    return NextResponse.json(
      { ok: false, error: 'empty message' },
      { status: 400 },
    );
  }

  const [workspace, gmailContext] = await Promise.all([
    getKeywordWorkspace(),
    safeGmailContextForKeywords(),
  ]);

  const prompt = [
    buildWorkspaceBriefing(workspace),
    gmailContext,
    '',
    '---',
    'Conversation so far:',
    ...(body.history ?? [])
      .slice(-12)
      .map((m) => `${m.role === 'user' ? 'Craig' : 'You'}: ${m.content}`),
    '',
    `Craig: ${message}`,
  ]
    .filter(Boolean)
    .join('\n');

  const task = [
    'Help Craig develop a keyword strategy for Evari Speed Bikes (evari.cc).',
    'Use the workspace snapshot above as the factual base — cite specific keywords,',
    'lists, and competitor domains when it strengthens the answer.',
    '',
    'How to be useful:',
    '- Lead with a clear recommendation, then the reasoning.',
    '- When suggesting new keywords, note estimated volume/KD band and why they fit.',
    '- Flag overlap with existing lists so we don\'t double-track.',
    '- If a request is fuzzy ("what\'s best in X"), shortlist 8–15 candidate terms',
    '  grouped by intent (informational / commercial / navigational) and tag any',
    '  already in the workspace.',
    '- Prefer UK English, bike-industry specifics, and Evari\'s adventure-touring +',
    '  Class-3 electric positioning.',
    '- Keep replies punchy and decision-oriented. Markdown OK.',
  ].join('\n');

  if (!hasAIGatewayCredentials()) {
    return NextResponse.json({
      mock: true,
      markdown:
        `**Offline — AI Gateway not wired.** I can see the workspace (` +
        `${workspace.lists.length} lists, ` +
        `${Object.values(workspace.membersByList).reduce((a, arr) => a + arr.length, 0)} keywords tracked). ` +
        `Once \`ANTHROPIC_API_KEY\` or the gateway is configured, I'll reply here with real strategy.`,
    });
  }

  try {
    const text = await generateBriefing({ voice: 'analyst', task, prompt });
    return NextResponse.json({ ok: true, mock: false, markdown: text });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      ok: false,
      mock: true,
      markdown:
        'Something went wrong calling the AI Gateway — ' + reason + '. Check the logs or try again.',
    });
  }
}

// ---------------------------------------------------------------------------
// Workspace → prompt snapshot. Compact but dense: every list named, every
// competitor's top keywords (by volume) with our rank vs theirs. We cap each
// list at 40 rows and each competitor's backlinks summary to headline numbers
// so the prompt stays under ~6k tokens even with 5+ competitors.
// ---------------------------------------------------------------------------

function buildWorkspaceBriefing(w: KeywordWorkspace): string {
  const ownLists = w.lists.filter((l) => l.kind === 'own');
  const competitorLists = w.lists.filter((l) => l.kind === 'competitor');

  const blocks: string[] = [];
  blocks.push('# Evari keyword workspace snapshot');
  blocks.push(
    `Own domain: evari.cc · Lists: ${w.lists.length} (${ownLists.length} own, ${competitorLists.length} competitor).`,
  );
  blocks.push('');

  // --- Own lists (our keywords) ---
  if (ownLists.length > 0) {
    blocks.push('## Our lists');
    for (const list of ownLists) {
      const members = w.membersByList[list.id] ?? [];
      blocks.push(summarizeOwnList(list, members));
    }
  }

  // --- Competitor lists ---
  if (competitorLists.length > 0) {
    blocks.push('## Competitor lists');
    for (const list of competitorLists) {
      const members = w.membersByList[list.id] ?? [];
      const backlinks = list.targetDomain
        ? w.backlinksByDomain[list.targetDomain.toLowerCase()]
        : undefined;
      blocks.push(summarizeCompetitorList(list, members, backlinks));
    }
  }

  if (ownLists.length === 0 && competitorLists.length === 0) {
    blocks.push('_Workspace is empty — no lists or competitors tracked yet._');
  }

  return blocks.join('\n');
}

function summarizeOwnList(list: KeywordList, members: KeywordMember[]): string {
  const lines: string[] = [];
  lines.push(
    `### ${list.label} · own · ${members.length} keywords` +
      (list.targetDomain ? ` · ${list.targetDomain}` : ''),
  );
  if (list.notes) lines.push(`_${list.notes}_`);

  const top = [...members]
    .sort((a, b) => {
      // Priority: where we rank best first, then highest volume.
      const ap = a.ourPosition ?? Number.POSITIVE_INFINITY;
      const bp = b.ourPosition ?? Number.POSITIVE_INFINITY;
      if (ap !== bp) return ap - bp;
      return (b.searchVolume ?? 0) - (a.searchVolume ?? 0);
    })
    .slice(0, 40);

  if (top.length === 0) {
    lines.push('_(no members yet)_');
  } else {
    lines.push('| kw | vol | KD | CPC | intent | our rank |');
    lines.push('|---|---|---|---|---|---|');
    for (const m of top) {
      lines.push(
        `| ${m.keyword} | ${fmtNum(m.searchVolume)} | ${fmtNum(m.keywordDifficulty)} | ${fmtCpc(m.cpc)} | ${m.searchIntent ?? '—'} | ${fmtRank(m.ourPosition)} |`,
      );
    }
    if (members.length > top.length) {
      lines.push(`_…and ${members.length - top.length} more._`);
    }
  }
  return lines.join('\n');
}

function summarizeCompetitorList(
  list: KeywordList,
  members: KeywordMember[],
  backlinks: { backlinks: number; referringDomains: number } | undefined,
): string {
  const lines: string[] = [];
  lines.push(
    `### ${list.label} · competitor · ${list.targetDomain ?? '(no domain)'} · ${members.length} keywords`,
  );
  if (list.notes) lines.push(`_${list.notes}_`);
  if (backlinks) {
    lines.push(
      `Authority: ${fmtNum(backlinks.referringDomains)} ref domains · ${fmtNum(backlinks.backlinks)} total links.`,
    );
  }

  // Top 30 competitor keywords by search volume (where they actually rank).
  const top = [...members]
    .filter((m) => m.theirPosition != null)
    .sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0))
    .slice(0, 30);

  if (top.length === 0) {
    lines.push('_(no ranked keywords ingested yet)_');
  } else {
    lines.push('| kw | vol | KD | intent | them | us |');
    lines.push('|---|---|---|---|---|---|');
    for (const m of top) {
      lines.push(
        `| ${m.keyword} | ${fmtNum(m.searchVolume)} | ${fmtNum(m.keywordDifficulty)} | ${m.searchIntent ?? '—'} | ${fmtRank(m.theirPosition)} | ${fmtRank(m.ourPosition)} |`,
      );
    }
    if (members.length > top.length) {
      lines.push(`_…and ${members.length - top.length} more._`);
    }
  }
  return lines.join('\n');
}

function fmtNum(n: number | null | undefined): string {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-GB');
}

function fmtCpc(n: number | null | undefined): string {
  if (n == null) return '—';
  return '£' + Number(n).toFixed(2);
}

function fmtRank(n: number | null | undefined): string {
  if (n == null) return '—';
  return '#' + n;
}

// ---------------------------------------------------------------------------
// Gmail context — same pattern as the Plays chat. Pulls recent customer +
// klaviyo-reply threads (support is highest-signal for "what are customers
// asking about" and informs keyword/content priorities). Never throws.
// ---------------------------------------------------------------------------
async function safeGmailContextForKeywords(): Promise<string> {
  try {
    const [support, klaviyoReply] = await Promise.all([
      listCachedGmailThreads({ category: 'support', limit: 10 }),
      listCachedGmailThreads({ category: 'klaviyo-reply', limit: 5 }),
    ]);
    const threads = [...support, ...klaviyoReply];
    if (threads.length === 0) return '';
    return (
      '\n## Recent customer context (Gmail, 30d)\n' +
      'Use these to anchor keyword strategy to real customer language — if\n' +
      'three different customers ask about "stem length" in a week, that\'s a\n' +
      'real keyword signal, not a guess.\n\n' +
      threads.map((t) => `- [${t.category}] ${formatGmailRowKw(t)}`).join('\n')
    );
  } catch {
    return '';
  }
}

function formatGmailRowKw(t: GmailThreadSummary): string {
  const when = t.lastMessageAt.slice(0, 10);
  const subject = t.subject.replace(/\s+/g, ' ').trim().slice(0, 120);
  const snippet = t.snippet.replace(/\s+/g, ' ').trim().slice(0, 160);
  return `${when} · "${subject}" — ${snippet}`;
}
