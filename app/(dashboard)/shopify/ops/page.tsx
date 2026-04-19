import { SectionOverview } from '@/components/shopify/SectionOverview';

export default function OpsPage() {
  return (
    <SectionOverview
      title="Ops"
      subtitle="Redirects · 404s · Analytics"
      tiles={[
        {
          href: '/shopify/ops/redirects',
          title: 'URL redirects',
          description:
            'Manage 301 redirects when you rename a product, page, or article.',
        },
        {
          href: '/shopify/ops/404s',
          title: '404 monitor',
          description:
            'Surface broken inbound links once an analytics source is wired up.',
        },
        {
          href: '/shopify/ops/analytics',
          title: 'Analytics',
          description:
            '30-day sales-by-day chart with order count and average-order value.',
        },
      ]}
    />
  );
}
