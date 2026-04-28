import { TopBar } from '@/components/sidebar/TopBar';
import { getMktSettings } from '@/lib/marketing/settings';
import { MarketingSettingsClient } from '@/components/marketing/MarketingSettingsClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function MarketingSettingsPage() {
  const settings = await getMktSettings();
  return (
    <>
      <TopBar title="Marketing settings" subtitle="Email · Setup · Sender hygiene" />
      <div className="flex-1 min-h-0 overflow-auto bg-evari-ink">
        <div className="px-gutter py-6">
          <MarketingSettingsClient initial={settings} />
        </div>
      </div>
    </>
  );
}
