import { generateText, streamText } from 'ai';
import { gateway } from '@ai-sdk/gateway';
import { loadEvariCopySkill } from './skill';

const DEFAULT_MODEL = process.env.AI_MODEL || 'anthropic/claude-sonnet-4.6';

/**
 * Returns true if we have at least one path to the AI Gateway:
 * either an explicit API key, or a Vercel OIDC token (auto-provisioned).
 */
export function hasAIGatewayCredentials(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
}

interface SystemPromptOptions {
  voice?: 'evari' | 'analyst';
  task: string;
}

export async function buildSystemPrompt({ voice = 'evari', task }: SystemPromptOptions) {
  const sections: string[] = [];

  sections.push(
    `You are an assistant inside the Evari Dashboard, a private operations cockpit for the founder of Evari Speed Bikes (evari.cc). The audience for everything you produce is Craig, the founder.`,
  );

  sections.push(`Today's task: ${task}`);

  if (voice === 'evari') {
    const skill = await loadEvariCopySkill();
    sections.push('---');
    sections.push('# Evari Copy Voice — load before writing customer-facing or marketing prose.');
    sections.push(skill);
  } else {
    sections.push(
      'Tone: an analyst briefing the founder. Specific, calm, honest. No hype. No padding. Numbers cited. Lead with the answer.',
    );
  }

  return sections.join('\n\n');
}

interface GenerateOpts {
  task: string;
  prompt: string;
  voice?: 'evari' | 'analyst';
  model?: string;
}

export async function generateBriefing(opts: GenerateOpts) {
  const system = await buildSystemPrompt({ voice: opts.voice ?? 'analyst', task: opts.task });
  const { text } = await generateText({
    model: gateway(opts.model || DEFAULT_MODEL),
    system,
    prompt: opts.prompt,
  });
  return text;
}

export function streamBriefing(opts: GenerateOpts) {
  return (async () => {
    const system = await buildSystemPrompt({ voice: opts.voice ?? 'analyst', task: opts.task });
    return streamText({
      model: gateway(opts.model || DEFAULT_MODEL),
      system,
      prompt: opts.prompt,
    });
  })();
}
