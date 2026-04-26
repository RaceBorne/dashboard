import { notFound } from 'next/navigation';

import { getTemplate } from '@/lib/marketing/templates';
import { getBrand } from '@/lib/marketing/brand';
import { TemplateEditor } from '@/components/marketing/TemplateEditor';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function TemplateEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [template, brand] = await Promise.all([getTemplate(id), getBrand()]);
  if (!template) notFound();
  return <TemplateEditor template={template} brand={brand} />;
}
