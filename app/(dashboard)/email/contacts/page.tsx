import { TopBar } from '@/components/sidebar/TopBar';
import { listContacts } from '@/lib/marketing/contacts';
import { ContactsClient } from '@/components/marketing/ContactsClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ContactsPage() {
  const contacts = await listContacts();
  return (
    <>
      <TopBar
        title="Contacts"
        subtitle="Email · CRM"
      />
      <ContactsClient initialContacts={contacts} />
    </>
  );
}
