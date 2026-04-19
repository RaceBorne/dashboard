import { SectionOverview } from '@/components/shopify/SectionOverview';

export default function ContentPage() {
  return (
    <SectionOverview
      title="Content"
      subtitle="Pages · Articles · Navigation"
      tiles={[
        {
          href: '/shopify/content/pages',
          title: 'Pages',
          description:
            'Online-store pages (About, Finance, FAQ, …) with inline SEO editor.',
        },
        {
          href: '/shopify/content/articles',
          title: 'Articles',
          description:
            'Blog articles across every blog. SEO drawer + AI-assisted titles.',
        },
        {
          href: '/shopify/content/navigation',
          title: 'Navigation',
          description:
            'Read-only view of every storefront menu and its nested items.',
        },
      ]}
    />
  );
}
