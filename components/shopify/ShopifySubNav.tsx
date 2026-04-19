'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ShoppingBag,
  Receipt,
  UsersRound,
  Sparkles,
  FileText,
  Search,
  Activity,
  Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Sub-navigation rendered inside the /shopify section. Sits between the
 * global app sidebar and the page content. Each entry corresponds to a
 * route from section 1 of the Shopify build spec.
 *
 * Route activation rules:
 *   - "/shopify" matches only itself (overview)
 *   - everything else uses startsWith on the prefix
 */

interface ShopifyNavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** When true, only the exact route activates (used for the index). */
  exact?: boolean;
}

const SHOPIFY_NAV: readonly ShopifyNavItem[] = [
  { href: '/shopify', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/shopify/products', label: 'Products', icon: ShoppingBag },
  { href: '/shopify/orders', label: 'Orders', icon: Receipt },
  { href: '/shopify/customers', label: 'Customers', icon: UsersRound },
  { href: '/shopify/growth', label: 'Growth', icon: Sparkles },
  { href: '/shopify/content', label: 'Content', icon: FileText },
  { href: '/shopify/seo', label: 'SEO', icon: Search },
  { href: '/shopify/seo-health', label: 'SEO Health', icon: Activity },
  { href: '/shopify/ops', label: 'Ops', icon: Wrench },
];

export function ShopifySubNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Shopify sections"
      className="sticky top-0 z-20 border-b border-evari-edge/40 bg-evari-ink/85 backdrop-blur supports-[backdrop-filter]:bg-evari-ink/65"
    >
      <ul className="flex items-center gap-1 px-4 overflow-x-auto no-scrollbar">
        {SHOPIFY_NAV.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  'inline-flex items-center gap-2 px-3 h-10 text-xs uppercase tracking-[0.08em] transition-colors',
                  'border-b-2 border-transparent -mb-px',
                  active
                    ? 'text-evari-text border-evari-gold'
                    : 'text-evari-dim hover:text-evari-text',
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
