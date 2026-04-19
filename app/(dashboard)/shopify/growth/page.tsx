import { SectionOverview } from '@/components/shopify/SectionOverview';

export default function GrowthPage() {
  return (
    <SectionOverview
      title="Growth"
      subtitle="Discounts · Abandoned · Drafts"
      tiles={[
        {
          href: '/shopify/growth/discounts',
          title: 'Discounts',
          description:
            'Active code and automatic discounts. Create % off / £ off codes inline.',
        },
        {
          href: '/shopify/growth/abandoned',
          title: 'Abandoned checkouts',
          description:
            'Carts the customer left at checkout. Send Shopify recovery emails in one click.',
        },
        {
          href: '/shopify/growth/drafts',
          title: 'Draft orders',
          description:
            'In-flight quotes from the bike-builder flow. Open invoices, jump to Shopify Admin.',
        },
      ]}
    />
  );
}
