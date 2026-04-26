import { TopBar } from '@/components/sidebar/TopBar';
import { listAssets } from '@/lib/marketing/assets';
import { AssetsClient } from '@/components/marketing/AssetsClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AssetsPage() {
  const assets = await listAssets();
  return (
    <>
      <TopBar title="Assets" subtitle="Email · Image library" />
      <AssetsClient initialAssets={assets} />
    </>
  );
}
