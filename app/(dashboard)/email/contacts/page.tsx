import { TopBar } from '@/components/sidebar/TopBar';
import { loadContactsBundle } from '@/lib/marketing/leads-as-contacts';
import { ContactsExplorer } from '@/components/marketing/ContactsExplorer';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ContactsPage() {
  const bundle = await loadContactsBundle();
  return (
    <>
      <TopBar
        title="Contacts"
        subtitle="Email · CRM · Folders from Plays"
      />
      <ContactsExplorer initialBundle={bundle} />
    </>
  );
}
