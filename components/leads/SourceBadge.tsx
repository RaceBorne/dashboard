import {
  ShoppingBag,
  Mail,
  Instagram,
  Linkedin,
  Phone,
  HandshakeIcon,
  Search,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LeadSource } from '@/lib/types';

const SOURCES: Record<LeadSource, { label: string; Icon: typeof ShoppingBag }> = {
  shopify_order: { label: 'Shopify order', Icon: ShoppingBag },
  shopify_abandoned: { label: 'Abandoned checkout', Icon: ShoppingBag },
  contact_form: { label: 'Contact form', Icon: Mail },
  instagram_dm: { label: 'Instagram DM', Icon: Instagram },
  linkedin_message: { label: 'LinkedIn', Icon: Linkedin },
  phone: { label: 'Phone', Icon: Phone },
  in_person: { label: 'In person', Icon: HandshakeIcon },
  referral: { label: 'Referral', Icon: Users },
  organic_search: { label: 'Organic search', Icon: Search },
};

export function SourceBadge({ source, className }: { source: LeadSource; className?: string }) {
  const { label, Icon } = SOURCES[source];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[11px] text-evari-dim',
        className,
      )}
    >
      <Icon className="h-3 w-3 text-evari-dimmer" />
      {label}
    </span>
  );
}
