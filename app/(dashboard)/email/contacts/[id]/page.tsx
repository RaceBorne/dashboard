import { notFound } from 'next/navigation';

import { TopBar } from '@/components/sidebar/TopBar';
import { getContactWithMeta } from '@/lib/marketing/contacts';
import { listGroups } from '@/lib/marketing/groups';
import { listTags } from '@/lib/marketing/tags';
import { listEventsForContact } from '@/lib/marketing/events';
import { ContactDetailClient } from '@/components/marketing/ContactDetailClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [contact, allGroups, allTags, events] = await Promise.all([
    getContactWithMeta(id),
    listGroups(),
    listTags(),
    listEventsForContact(id, { limit: 100 }),
  ]);
  if (!contact) notFound();
  const subtitle = contact.email;
  const title = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.email;
  return (
    <>
      <TopBar title={title} subtitle={subtitle} />
      <ContactDetailClient
        initialContact={contact}
        allGroups={allGroups}
        allTags={allTags}
        initialEvents={events}
      />
    </>
  );
}
