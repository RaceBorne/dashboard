import { notFound } from 'next/navigation';

import { TopBar } from '@/components/sidebar/TopBar';
import { getDomain, verifyDomain } from '@/lib/marketing/domains';
import { DomainDetailClient } from '@/components/marketing/DomainDetailClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function DomainDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const domain = await getDomain(id);
  if (!domain) notFound();
  // First load triggers a verification pass so the user lands on a
  // populated state instead of empty checks. Cheap (one DNS lookup
  // per record + Postmark sync).
  const status = await verifyDomain(id);
  return (
    <>
      <TopBar title={domain.domainName} subtitle="Email · Sender authentication" />
      <DomainDetailClient initialStatus={status ?? { domain, checks: [], fullyVerified: false }} />
    </>
  );
}
