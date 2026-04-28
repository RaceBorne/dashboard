import { notFound } from 'next/navigation';

import { TopBar } from '@/components/sidebar/TopBar';
import { getGroup, listMembers } from '@/lib/marketing/groups';
import { ListDetailClient } from '@/components/marketing/ListDetailClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ListDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [group, members] = await Promise.all([getGroup(id), listMembers(id)]);
  if (!group) notFound();
  return (
    <>
      <TopBar
        title={group.name}
        subtitle={`Email · List · ${members.length} member${members.length === 1 ? '' : 's'}`}
      />
      <ListDetailClient group={group} initialMembers={members} />
    </>
  );
}
