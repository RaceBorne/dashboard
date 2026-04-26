import { TopBar } from '@/components/sidebar/TopBar';
import { listSuppressions } from '@/lib/marketing/suppressions';
import { SuppressionsClient } from '@/components/marketing/SuppressionsClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function SuppressionsPage() {
  const suppressions = await listSuppressions();
  return (
    <>
      <TopBar title="Suppressions" subtitle="Email · Unsubscribe + bounces" />
      <SuppressionsClient initialSuppressions={suppressions} />
    </>
  );
}
