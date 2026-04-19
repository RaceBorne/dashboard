import { TopBar } from '@/components/sidebar/TopBar';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { listUsers, resolveCurrentUserId } from '@/lib/dashboard/repository';
import { UsersClient } from '@/components/users/UsersClient';

export default async function UsersPage() {
  const supabase = createSupabaseAdmin();
  const users = await listUsers(supabase);
  const currentUserId = await resolveCurrentUserId(supabase);
  const active = users.filter((u) => u.status === 'active').length;
  return (
    <>
      <TopBar title="Users" subtitle={active + ' active · invite by email'} />
      <UsersClient initialUsers={users} currentUserId={currentUserId} />
    </>
  );
}
