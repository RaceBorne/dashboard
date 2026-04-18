import type { Lead, Thread, BriefingPayload, SocialPost, SocialPlatform } from '@/lib/types';

// -- Morning briefing --------------------------------------------------------

export function morningBriefingPrompt(payload: BriefingPayload) {
  return `Write Craig's morning briefing for the Evari Dashboard.

Context (you may quote selectively, do not repeat verbatim):
${payload.contextForAI}

Format the briefing as Markdown. Length: ~180-260 words. Structure:
- A one-line headline summarising the state of play
- Three short paragraphs: Pipeline, Website, Action for today
- A final \`### Action for today\` line of one or two sentences telling Craig the single most leveraged thing to do before lunch.

Voice: senior analyst briefing the founder. Specific. Honest. Cite numbers. No hype, no marketing language. No emojis. No exclamation marks.`;
}

// -- Reply suggestion --------------------------------------------------------

export function replySuggestionPrompt(thread: Thread, lead?: Lead) {
  const transcript = thread.messages
    .map((m) => `${m.isFromEvari ? 'Craig' : m.from.name}:\n${m.bodyMarkdown}`)
    .join('\n\n---\n\n');

  const leadContext = lead
    ? `\nLead context:\n- Stage: ${lead.stage}\n- Intent: ${lead.intent}\n- Product interest: ${lead.productInterest ?? 'unspecified'}\n- Estimated value: £${lead.estimatedValue ?? '?'}\n- Tags: ${lead.tags.join(', ')}\n${lead.notes ? `- Owner notes: ${lead.notes}` : ''}`
    : '';

  return `Draft Craig's next reply in this thread.

Subject: ${thread.subject}
${leadContext}

Transcript so far (most recent at the bottom):

${transcript}

Now write Craig's next message. Markdown. Sign off "Craig" only — no full name, no signature block. Address them by their first name. Match the voice you have in the Evari skill: short, specific, calm, no hype, no exclamation marks. If you would normally write "I hope this finds you well" or "Just following up", do not. If a question is unanswered, answer it directly. If the right move is to suggest a next step (a call, a fitting, a test ride), suggest one specific time.`;
}

// -- Social post draft -------------------------------------------------------

export function socialPostPrompt(args: {
  platform: SocialPlatform;
  topic: string;
  link?: string;
  productInterest?: string;
}) {
  const limits: Record<SocialPlatform, string> = {
    linkedin: 'Up to 220 words. Two short paragraphs. End with a quiet question or a link.',
    instagram: '90-140 words. One hook line, then 2-3 short sentences. End with 3-5 lowercase hashtags.',
    tiktok: 'A 25-45 word caption to overlay on a short video. Punchy, almost a haiku. End with 3-5 lowercase hashtags.',
  };

  return `Draft a single ${args.platform} post for Evari about: ${args.topic}.

Constraints: ${limits[args.platform]}

${args.link ? `Include this link inline naturally: ${args.link}` : ''}
${args.productInterest ? `Mention the ${args.productInterest} product line if it fits naturally.` : ''}

Output Markdown only — the caption, ready to paste. No commentary, no preamble, no "Here is your post". Match the Evari voice precisely: restrained, specific, no exclamation marks, no hype, no emoji.`;
}
