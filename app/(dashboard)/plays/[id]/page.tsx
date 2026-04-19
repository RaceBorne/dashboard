import { notFound } from 'next/navigation';
import { TopBar } from '@/components/sidebar/TopBar';
import { getMockPlay } from '@/lib/mock/plays';
import { PlayDetailClient } from '@/components/plays/PlayDetailClient';

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const play = getMockPlay(id);
  if (!play) notFound();
  return (
    <>
      <TopBar title={play.title} subtitle={'Play · ' + play.stage} />
      <PlayDetailClient play={play} />
    </>
  );
}
