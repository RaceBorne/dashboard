'use client';

/**
 * Mounted on the screensaver page. Any user activity wakes the
 * dashboard back to the route the user came from (?wakeTo=). Sets
 * sessionStorage flag so the AI pane greets on return.
 *
 * Simpler implementation: a 400ms arming delay (so the navigation
 * transition that just brought us here doesn't auto-wake), then ANY
 * mousemove / mousedown / keydown / touchstart fires the wake.
 */

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const ARMING_DELAY_MS = 400;

export function ScreensaverWake() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const wakeTo = params?.get('wakeTo') ?? '/';
    const safeWakeTo = wakeTo.startsWith('/') && !wakeTo.startsWith('/screensaver') ? wakeTo : '/';

    let armed = false;
    let woken = false;
    const armTimer = setTimeout(() => { armed = true; }, ARMING_DELAY_MS);

    function wake() {
      if (!armed || woken) return;
      woken = true;
      try { sessionStorage.setItem('mojito-wake-greet', '1'); } catch { /* ignore */ }
      router.push(safeWakeTo);
    }

    window.addEventListener('mousemove', wake, { passive: true });
    window.addEventListener('mousedown', wake);
    window.addEventListener('keydown', wake);
    window.addEventListener('touchstart', wake, { passive: true });
    window.addEventListener('wheel', wake, { passive: true });

    return () => {
      clearTimeout(armTimer);
      window.removeEventListener('mousemove', wake);
      window.removeEventListener('mousedown', wake);
      window.removeEventListener('keydown', wake);
      window.removeEventListener('touchstart', wake);
      window.removeEventListener('wheel', wake);
    };
  }, [router, params]);

  return null;
}
