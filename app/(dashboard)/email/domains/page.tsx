import { TopBar } from '@/components/sidebar/TopBar';
import { listDomains } from '@/lib/marketing/domains';
import { DomainsListClient } from '@/components/marketing/DomainsListClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function DomainsPage() {
  const domains = await listDomains();
  return (
    <>
      <TopBar title="Domains" subtitle="Email · Sender authentication" />
      <DomainsListClient initialDomains={domains} />
    </>
  );
}
