import { notFound } from 'next/navigation';
import { TopBar } from '@/components/sidebar/TopBar';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getPlay } from '@/lib/dashboard/repository';
import { PlayDetailClient } from '@/components/plays/PlayDetailClient';

export default async function VentureDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const play = await getPlay(createSupabaseAdmin(), id);
  if (!play) notFound();
  return (
    <>
      <TopBar title={play.title} subtitle={'Strategy · ' + play.stage} />
      <PlayDetailClient play={play} />
    </>
  );
}
