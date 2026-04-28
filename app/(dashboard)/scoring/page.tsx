import { TopBar } from '@/components/sidebar/TopBar';
import { getFitCriteria } from '@/lib/marketing/fitScore';
import { ScoringRubricClient } from '@/components/marketing/ScoringRubricClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ScoringPage() {
  const criteria = await getFitCriteria();
  return (
    <>
      <TopBar title="Fit scoring" subtitle="Setup · How candidates get ranked across Discovery and Shortlist" />
      <div className="flex-1 min-h-0 overflow-auto bg-evari-ink">
        <div className="max-w-3xl mx-auto px-gutter py-6">
          <ScoringRubricClient initial={criteria} />
        </div>
      </div>
    </>
  );
}
