import { Badge } from '@/components/ui/badge';
import type { LeadStage } from '@/lib/types';

const TONE: Record<LeadStage, React.ComponentProps<typeof Badge>['variant']> = {
  new: 'info',
  contacted: 'muted',
  discovery: 'muted',
  configuring: 'gold',
  quoted: 'accent',
  won: 'success',
  lost: 'outline',
  cold: 'outline',
};

const LABEL: Record<LeadStage, string> = {
  new: 'New',
  contacted: 'Contacted',
  discovery: 'Discovery',
  configuring: 'Configuring',
  quoted: 'Quoted',
  won: 'Won',
  lost: 'Lost',
  cold: 'Cold',
};

export function StageBadge({ stage }: { stage: LeadStage }) {
  return (
    <Badge variant={TONE[stage]} className="text-[10px]">
      {LABEL[stage]}
    </Badge>
  );
}
