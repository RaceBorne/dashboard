import {
  ShoppingBag,
  Mail,
  Instagram,
  Linkedin,
  Phone,
  Handshake,
  Search,
  Users,
  Store,
  Stethoscope,
  CalendarDays,
  Megaphone,
  UserCircle,
  Globe,
  Target,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LeadSource, LeadSourceCategory } from '@/lib/types';

const SOURCES: Record<LeadSource, { label: string; Icon: typeof ShoppingBag }> = {
  shopify_order: { label: 'Shopify order', Icon: ShoppingBag },
  shopify_abandoned: { label: 'Abandoned checkout', Icon: ShoppingBag },
  contact_form: { label: 'Contact form', Icon: Mail },
  instagram_dm: { label: 'Instagram DM', Icon: Instagram },
  linkedin_message: { label: 'LinkedIn', Icon: Linkedin },
  phone: { label: 'Phone', Icon: Phone },
  in_person: { label: 'In person', Icon: Handshake },
  referral: { label: 'Referral', Icon: Users },
  organic_search: { label: 'Organic search', Icon: Search },
  paid_search: { label: 'Paid search', Icon: Target },
  paid_social: { label: 'Paid social', Icon: Target },
  dealer_referral: { label: 'Dealer', Icon: Store },
  medical_partner: { label: 'Medical', Icon: Stethoscope },
  event: { label: 'Event', Icon: CalendarDays },
  press: { label: 'Press', Icon: Megaphone },
  existing_customer: { label: 'Existing customer', Icon: UserCircle },
  outreach_agent: { label: 'Outreach', Icon: Target },
  manual: { label: 'Manual', Icon: UserCircle },
};

export function SourceBadge({
  source,
  className,
}: {
  source: LeadSource;
  className?: string;
}) {
  const entry = SOURCES[source];
  const { label, Icon } = entry ?? { label: source, Icon: Globe };
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

// -- Category meta, used by the filter bar on Leads page --------------------

export const SOURCE_CATEGORY_META: Record<
  LeadSourceCategory,
  { label: string; Icon: typeof ShoppingBag }
> = {
  organic: { label: 'Organic', Icon: Search },
  paid: { label: 'Paid', Icon: Target },
  social: { label: 'Social', Icon: Instagram },
  referral: { label: 'Referral', Icon: Users },
  dealer: { label: 'Bike shops', Icon: Store },
  medical: { label: 'Health', Icon: Stethoscope },
  event: { label: 'Events', Icon: CalendarDays },
  press: { label: 'Press', Icon: Megaphone },
  in_person: { label: 'In person', Icon: Handshake },
  commerce: { label: 'Shopify', Icon: ShoppingBag },
  outreach: { label: 'Outreach', Icon: Target },
  manual: { label: 'Manual', Icon: UserCircle },
};

export const SOURCE_CATEGORY_ORDER: LeadSourceCategory[] = [
  'organic',
  'paid',
  'social',
  'referral',
  'dealer',
  'medical',
  'event',
  'press',
  'in_person',
  'commerce',
  'outreach',
];
