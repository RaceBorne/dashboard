import type { TaskCategory } from '@/lib/types';

export interface TaskCategoryMeta {
  key: TaskCategory;
  label: string;
  description: string;
  accent: string;
  icon:
    | 'Search'
    | 'ShoppingBag'
    | 'Inbox'
    | 'Megaphone'
    | 'FileText'
    | 'Heart'
    | 'MessageSquare'
    | 'Boxes'
    | 'Wrench'
    | 'Sparkles'
    | 'FolderKanban';
}

export const TASK_CATEGORY_META: Record<TaskCategory, TaskCategoryMeta> = {
  seo: {
    key: 'seo',
    label: 'SEO management',
    description: 'On-page, technical, content, rankings',
    accent: 'text-evari-dim',
    icon: 'Search',
  },
  shopify: {
    key: 'shopify',
    label: 'Shopify',
    description: 'Store, products, theme, structured data',
    accent: 'text-evari-dim',
    icon: 'ShoppingBag',
  },
  'lead-gen': {
    key: 'lead-gen',
    label: 'Lead generation',
    description: 'Capture, nurture, scoring, attribution',
    accent: 'text-evari-dim',
    icon: 'Inbox',
  },
  social: {
    key: 'social',
    label: 'Social media',
    description: 'Posting, channels, DMs',
    accent: 'text-evari-dim',
    icon: 'Megaphone',
  },
  content: {
    key: 'content',
    label: 'Content',
    description: 'Articles, briefs, pillar pages',
    accent: 'text-evari-dim',
    icon: 'FileText',
  },
  'medical-rehab': {
    key: 'medical-rehab',
    label: 'Medical / rehab',
    description: 'Knee-op vertical, clinics, outreach',
    accent: 'text-evari-dim',
    icon: 'Heart',
  },
  conversations: {
    key: 'conversations',
    label: 'Conversations',
    description: 'Email, DMs, phone follow-ups',
    accent: 'text-evari-dim',
    icon: 'MessageSquare',
  },
  commerce: {
    key: 'commerce',
    label: 'Commerce',
    description: 'Bike builder, quotes, orders, invoicing',
    accent: 'text-evari-dim',
    icon: 'Boxes',
  },
  infra: {
    key: 'infra',
    label: 'Infrastructure',
    description: 'Vercel, Supabase, auth, domains',
    accent: 'text-evari-dim',
    icon: 'Wrench',
  },
  'ai-automation': {
    key: 'ai-automation',
    label: 'AI & automation',
    description: 'Briefings, drafts, auto-pilot flows',
    accent: 'text-evari-dim',
    icon: 'Sparkles',
  },
  general: {
    key: 'general',
    label: 'General',
    description: 'Uncategorised / admin',
    accent: 'text-evari-dim',
    icon: 'FolderKanban',
  },
};

export const TASK_CATEGORY_ORDER: TaskCategory[] = [
  'infra',
  'seo',
  'shopify',
  'lead-gen',
  'content',
  'medical-rehab',
  'social',
  'conversations',
  'commerce',
  'ai-automation',
  'general',
];
