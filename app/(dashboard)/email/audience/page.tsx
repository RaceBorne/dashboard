import { TopBar } from '@/components/sidebar/TopBar';
import { loadAudienceBundle } from '@/lib/marketing/audience';
import { AudienceClient } from '@/components/marketing/AudienceClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AudiencePage() {
  const bundle = await loadAudienceBundle();
  return (
    <>
      <TopBar
        title="Lists & Segments"
        subtitle={`Email · ${bundle.totals.lists} list${bundle.totals.lists === 1 ? '' : 's'} · ${bundle.totals.segments} segment${bundle.totals.segments === 1 ? '' : 's'}`}
      />
      <AudienceClient initialBundle={bundle} />
    </>
  );
}
