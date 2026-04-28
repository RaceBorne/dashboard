import { TopBar } from '@/components/sidebar/TopBar';
import { HomeTilesClient } from '@/components/home/HomeTilesClient';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  return (
    <>
      <TopBar title="Home" subtitle="Pick where you want to land" />
      <HomeTilesClient />
    </>
  );
}
