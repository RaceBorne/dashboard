import { TopBar } from '@/components/sidebar/TopBar';
import { MOCK_PAGES } from '@/lib/mock/seo';
import { PagesClient } from '@/components/pages/PagesClient';

export default function PagesPage() {
  return (
    <>
      <TopBar title="Pages" subtitle={String(MOCK_PAGES.length) + ' tracked'} />
      <PagesClient initialPages={MOCK_PAGES} />
    </>
  );
}
