import { TopBar } from '@/components/sidebar/TopBar';
import { listTemplates } from '@/lib/marketing/templates';
import { TemplatesClient } from '@/components/marketing/TemplatesClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function TemplatesPage() {
  const templates = await listTemplates();
  return (
    <>
      <TopBar
        title="Templates"
        subtitle={`Email · ${templates.length} saved`}
      />
      <TemplatesClient initialTemplates={templates} />
    </>
  );
}
