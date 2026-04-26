/**
 * Shared types for the internal marketing system. Mirror of the
 * dashboard_mkt_* Supabase tables but in TypeScript camelCase. Repo
 * helpers convert snake_case rows → these types via rowTo* mappers.
 */

export type ContactStatus = 'active' | 'unsubscribed' | 'suppressed';

export interface Contact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
  company: string | null;
  status: ContactStatus;
  source: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContactWithMeta extends Contact {
  groups: Group[];
  tags: Tag[];
}

export interface Group {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
}

export interface Tag {
  id: string;
  name: string;
  createdAt: string;
}
