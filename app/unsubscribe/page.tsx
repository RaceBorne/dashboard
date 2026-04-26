import { Suspense } from 'react';

import { verifyUnsubToken, isSuppressed } from '@/lib/marketing/suppressions';
import { UnsubscribeClient } from '@/components/marketing/UnsubscribeClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Public unsubscribe landing page. Invoked from the link the sender
 * injects into every outbound email (List-Unsubscribe header + body
 * footer). Server-renders the verified email so the user sees what
 * they're unsubscribing immediately; the client confirms.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string }>;
}) {
  const { u } = await searchParams;
  const verified = u ? verifyUnsubToken(u) : null;
  const already = verified ? await isSuppressed(verified.email) : false;
  return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-50 text-zinc-900 p-6">
      <div className="w-full max-w-md rounded-lg bg-white shadow-sm border border-zinc-200 p-6">
        <h1 className="text-xl font-semibold mb-2">Unsubscribe</h1>
        {!verified ? (
          <p className="text-sm text-zinc-600 leading-relaxed">
            This unsubscribe link is invalid or expired. If you received this in error,
            simply ignore the email — no further action is needed.
          </p>
        ) : (
          <Suspense fallback={null}>
            <UnsubscribeClient
              token={u!}
              email={verified.email}
              alreadySuppressed={already}
            />
          </Suspense>
        )}
        <p className="mt-6 text-[11px] text-zinc-400">Evari · Email preferences</p>
      </div>
    </main>
  );
}
