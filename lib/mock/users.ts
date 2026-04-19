import type { User } from '@/lib/types';

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};
const hoursAgo = (n: number) => {
  const d = new Date();
  d.setHours(d.getHours() - n);
  return d.toISOString();
};

export const MOCK_USERS: User[] = [
  {
    id: 'user_craig',
    email: 'craig@raceborne.com',
    fullName: 'Craig McDonald',
    role: 'super_admin',
    scopes: ['all'],
    status: 'active',
    invitedAt: daysAgo(30),
    lastSeenAt: new Date().toISOString(),
  },
  {
    id: 'user_jordan',
    email: 'jordan@evari.cc',
    fullName: 'Jordan Reeves',
    role: 'member',
    scopes: ['broadcast'],
    status: 'active',
    invitedAt: daysAgo(12),
    lastSeenAt: hoursAgo(4),
  },
  {
    id: 'user_maya',
    email: 'maya@evari.cc',
    fullName: 'Maya Okonkwo',
    role: 'member',
    scopes: ['pipeline', 'today'],
    status: 'pending',
    invitedAt: daysAgo(1),
  },
];

/** The "current" logged-in user — for now just Craig. */
export const CURRENT_USER_ID = 'user_craig';
