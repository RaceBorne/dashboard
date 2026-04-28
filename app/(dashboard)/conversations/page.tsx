import { redirect } from 'next/navigation';

/**
 * /conversations was the venture-pipeline conversation page. The
 * thread + reply UI now lives at /email/conversations (rebuilt
 * around proper thread grouping with outbound persistence). This
 * redirect keeps any deep link working.
 */
export default async function VentureConversationsRedirect() {
  redirect('/email/conversations');
}
