import { redirect } from 'next/navigation';
export default async function PlayIdRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect('/ideas/' + id);
}
