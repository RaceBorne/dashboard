'use client';

/**
 * Hero banner at the top of /ventures. Greeting + three big AI
 * action cards that drop a pre-built prompt into the AI Assistant
 * pane on click.
 */

import { useEffect, useState } from 'react';
import { LineChart, RefreshCw, Sparkles, X } from 'lucide-react';

import { useAIPane } from '@/components/ai/AIAssistantPane';

export function IdeasHero() {
  const { askPane } = useAIPane();
  const [greeting, setGreeting] = useState('Hello');
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const h = new Date().getHours();
    if (h < 12) setGreeting('Good morning');
    else if (h < 18) setGreeting('Good afternoon');
    else setGreeting('Good evening');
  }, []);

  if (hidden) return null;

  return (
    <section className="rounded-panel bg-evari-surface border border-evari-gold/20 p-4 mb-4 relative">
      <button type="button" onClick={() => setHidden(true)} className="absolute top-2 right-2 text-evari-dim hover:text-evari-text p-1 rounded transition" title="Hide for this session"><X className="h-3.5 w-3.5" /></button>
      <div className="flex items-start gap-3 mb-3">
        <span className="inline-flex items-center justify-center h-9 w-9 rounded-md bg-evari-gold/15 text-evari-gold shrink-0">
          <Sparkles className="h-4.5 w-4.5" />
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="text-[15px] font-semibold text-evari-text">{greeting}, Maddog.</h2>
          <p className="text-[12px] text-evari-dim mt-0.5">What would you like to explore today?</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <ActionCard
          icon={<Sparkles className="h-4 w-4" />}
          title="Generate new ideas"
          subtitle="Let AI suggest targets"
          onClick={() => askPane('Suggest 5 fresh targeting concepts for Evari Speed Bikes that I haven\'t explored yet. For each: who, what to say, why now. One per line.')}
        />
        <ActionCard
          icon={<RefreshCw className="h-4 w-4" />}
          title="Refine existing ideas"
          subtitle="Improve and expand"
          onClick={() => askPane('Pick the most promising existing idea in my list and refine it: tighter audience, sharper objective, two distinct messaging angles.')}
        />
        <ActionCard
          icon={<LineChart className="h-4 w-4" />}
          title="Analyse a market"
          subtitle="Get AI insights"
          onClick={() => askPane('Walk me through a 3-bullet market analysis on the segment that overlaps most with my existing ideas: size, who buys, where they live online.')}
        />
      </div>
    </section>
  );
}

function ActionCard({ icon, title, subtitle, onClick }: { icon: React.ReactNode; title: string; subtitle: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group rounded-md border border-evari-edge/30 bg-evari-ink/30 hover:border-evari-gold hover:bg-evari-gold/5 transition p-3 text-left">
      <div className="flex items-center gap-2 mb-1">
        <span className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-evari-gold/15 text-evari-gold">{icon}</span>
        <span className="text-[12px] font-semibold text-evari-text">{title}</span>
      </div>
      <p className="text-[11px] text-evari-dim">{subtitle}</p>
    </button>
  );
}
