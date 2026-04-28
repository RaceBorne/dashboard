import { TopBar } from '@/components/sidebar/TopBar';
import { listPeople } from '@/lib/marketing/personFeed';
import { PeopleClient } from '@/components/marketing/PeopleClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PeoplePage() {
  const people = await listPeople({ limit: 300 });
  return (
    <>
      <TopBar title="People" subtitle="One row per person · everything we know about them" />
      <PeopleClient initial={people} />
    </>
  );
}
