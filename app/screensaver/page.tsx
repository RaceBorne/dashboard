import { Suspense } from 'react';
import { HomeCanvas } from '@/components/home/HomeCanvas';
import { ScreensaverWake } from '@/components/dashboard/ScreensaverWake';

export const dynamic = 'force-dynamic';

export default function ScreensaverPage() {
  return (
    <>
      <HomeCanvas />
      {/* Wake watcher needs Suspense because it reads useSearchParams. */}
      <Suspense fallback={null}>
        <ScreensaverWake />
      </Suspense>
    </>
  );
}
