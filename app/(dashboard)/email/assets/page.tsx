import { TopBar } from '@/components/sidebar/TopBar';
import { listAssetsWithVariants } from '@/lib/marketing/assets';
import { AssetsClient } from '@/components/marketing/AssetsClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AssetsPage() {
  const families = await listAssetsWithVariants();
  return (
    <>
      <TopBar title="Assets" subtitle="Email · Image library" />
      <AssetsClient initialFamilies={families} />
    </>
  );
}
