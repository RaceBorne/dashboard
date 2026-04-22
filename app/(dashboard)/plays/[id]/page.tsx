import { redirect } from 'next/navigation';

// Legacy route — see /plays/page.tsx.
export default async function PlaysIdRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect('/ventures/' + id);
}
