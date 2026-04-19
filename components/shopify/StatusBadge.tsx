import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * Status badge mapping shopify enums onto the design-system Badge variants.
 *
 * Centralised so every table renders order/payment/fulfillment status the
 * same way. Exhaustive: any unknown status falls through to a muted pill
 * with the raw enum value lower-cased.
 */
export type StatusKind =
  | 'order-financial'
  | 'order-fulfillment'
  | 'product'
  | 'discount'
  | 'draft';

const TONES: Record<string, { variant: React.ComponentProps<typeof Badge>['variant']; label?: string }> = {
  // Financial
  PAID: { variant: 'success' },
  PARTIALLY_PAID: { variant: 'warning' },
  PENDING: { variant: 'warning' },
  AUTHORIZED: { variant: 'info' },
  REFUNDED: { variant: 'muted' },
  PARTIALLY_REFUNDED: { variant: 'muted' },
  VOIDED: { variant: 'muted' },
  EXPIRED: { variant: 'muted' },
  // Fulfillment
  FULFILLED: { variant: 'success' },
  PARTIALLY_FULFILLED: { variant: 'warning' },
  UNFULFILLED: { variant: 'warning' },
  ON_HOLD: { variant: 'muted' },
  RESTOCKED: { variant: 'muted' },
  IN_PROGRESS: { variant: 'info' },
  // Product
  ACTIVE: { variant: 'success' },
  DRAFT: { variant: 'muted' },
  ARCHIVED: { variant: 'muted' },
  // Draft / discount
  OPEN: { variant: 'info' },
  INVOICE_SENT: { variant: 'warning' },
  COMPLETED: { variant: 'success' },
  SCHEDULED: { variant: 'info' },
};

export function StatusBadge({
  status,
  className,
}: {
  status: string | null | undefined;
  className?: string;
}) {
  if (!status) {
    return (
      <Badge variant="muted" className={cn('uppercase text-[10px]', className)}>
        —
      </Badge>
    );
  }
  const tone = TONES[status] ?? { variant: 'muted' as const };
  const label = tone.label ?? status.replace(/_/g, ' ').toLowerCase();
  return (
    <Badge variant={tone.variant} className={cn('uppercase text-[10px] tracking-wider', className)}>
      {label}
    </Badge>
  );
}
