import { TopBar } from '@/components/sidebar/TopBar';
import { MOCK_USERS, CURRENT_USER_ID } from '@/lib/mock/users';
import { UsersClient } from '@/components/users/UsersClient';

export default function UsersPage() {
  const active = MOCK_USERS.filter((u) => u.status === 'active').length;
  return (
    <>
      <TopBar title="Users" subtitle={active + ' active · invite by email'} />
      <UsersClient
        initialUsers={MOCK_USERS}
        currentUserId={CURRENT_USER_ID}
      />
    </>
  );
}
