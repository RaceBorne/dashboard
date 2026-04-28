'use client';

import { useAISurface } from '@/components/ai/AIAssistantPane';

export function IdeasAIBinding({ count }: { count: number }) {
  useAISurface({
    surface: 'ideas',
    context: { count },
    suggestions: [
      { title: 'Generate new ideas', subtitle: 'Discover fresh targeting concepts', prompt: 'Suggest 5 fresh targeting concepts for Evari Speed Bikes that I haven\'t tried yet. One per line, name + one-sentence why.' },
      { title: 'Analyse a market', subtitle: 'Get insights and opportunities', prompt: 'Pick the most promising existing idea and give me three angles I should explore: who, what to say, where they live online.' },
      { title: 'Refine an existing idea', subtitle: 'Expand and improve', prompt: 'Take my most recent idea and refine it: tighter audience, sharper objective, two messaging angles.' },
    ],
  });
  return null;
}
