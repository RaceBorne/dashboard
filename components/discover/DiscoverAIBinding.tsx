'use client';

import { useAISurface } from '@/components/ai/AIAssistantPane';

interface Props { playId?: string | null; playTitle?: string | null }

export function DiscoverAIBinding({ playId, playTitle }: Props) {
  useAISurface({
    surface: 'discovery',
    scopeId: playId ?? null,
    context: { playTitle: playTitle ?? null },
    suggestions: [
      { title: 'Analyse the top matches', subtitle: 'Review the highest fit companies', prompt: 'Look at the current Discovery results and tell me the top 5 candidates and why they\'re strong.' },
      { title: 'Expand the search', subtitle: 'Find more similar companies', prompt: 'Suggest three search angles I haven\'t tried yet to expand this audience without losing fit.' },
      { title: 'Refine the filters', subtitle: 'Adjust criteria to improve results', prompt: 'Given the current filters and the top hits, what one filter change would most improve the median fit score?' },
    ],
  });
  return null;
}
