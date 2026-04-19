import { TopBar } from '@/components/sidebar/TopBar';
import { MOCK_KEYWORDS } from '@/lib/mock/seo';
import { KeywordsClient } from '@/components/keywords/KeywordsClient';

export default function KeywordsPage() {
  return (
    <>
      <TopBar
        title="Keywords"
        subtitle={String(MOCK_KEYWORDS.length) + ' tracked'}
      />
      <KeywordsClient initialKeywords={MOCK_KEYWORDS} />
    </>
  );
}
