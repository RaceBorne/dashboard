import {
 CircleDot,
 Mail,
 ArrowDownLeft,
 Phone,
 Users,
 StickyNote,
 ArrowUpRight,
 Eye,
 ShoppingCart,
 CreditCard,
 Package,
 Send,
 MailOpen,
 MousePointerClick,
 MailX,
 UserMinus,
 MailCheck,
 MessageSquare,
} from 'lucide-react';
import { format } from 'date-fns';
import type { LeadActivity } from '@/lib/types';

const ICON: Record<LeadActivity['type'], typeof CircleDot> = {
 lead_created: CircleDot,
 email_sent: Mail,
 email_received: ArrowDownLeft,
 call: Phone,
 meeting: Users,
 note: StickyNote,
 stage_change: ArrowUpRight,
 shopify_view: Eye,
 shopify_add_to_cart: ShoppingCart,
 shopify_checkout_started: CreditCard,
 shopify_order_placed: Package,
 // Marketing module (Phase 5)
 campaign_sent: Send,
 campaign_delivered: MailCheck,
 campaign_opened: MailOpen,
 campaign_clicked: MousePointerClick,
 campaign_bounced: MailX,
 campaign_unsubscribed: UserMinus,
 campaign_replied: MessageSquare,
};

export function ActivityTimeline({ activity }: { activity: LeadActivity[] }) {
 const sorted = [...activity].sort(
  (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
 );
 return (
  <ol className="relative space-y-4 pl-6 before:absolute before:left-[9px] before:top-2 before:bottom-2 before:w-px before:bg-evari-edge">
   {sorted.map((a) => {
    const Icon = ICON[a.type] ?? CircleDot;
    return (
     <li key={a.id} className="relative">
      <div className="absolute -left-6 top-0.5 h-[18px] w-[18px] rounded-full bg-evari-carbon flex items-center justify-center">
       <Icon className="h-2.5 w-2.5 text-evari-dim" />
      </div>
      <div className="text-sm text-evari-text leading-snug">{a.summary}</div>
      <div className="text-[11px] text-evari-dimmer font-mono mt-0.5">
       {format(new Date(a.at), "EEE d LLL, HH:mm")}
      </div>
     </li>
    );
   })}
  </ol>
 );
}
