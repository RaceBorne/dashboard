'use client';

/**
 * Idle screensaver watchdog.
 *
 * Mounted in the dashboard layout. Watches for user activity
 * (mousemove, mousedown, keydown, scroll, touchstart) and, after
 * IDLE_MS of no activity, navigates to /screensaver carrying the
 * current path as ?wakeTo so the screensaver page knows where to
 * return the user when they wiggle the mouse.
 *
 * Stays out of the way on the screensaver page itself.
 */

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const IDLE_MS = 5 * 60 * 1000; // 5 minutes

const ACTIVITY_EVENTS: Array<keyof DocumentEventMap> = [
  'mousemove',
  'mousedown',
  'keydown',
  'scroll',
  'touchstart',
];

export function IdleScreensaver() {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  useEffect(() => {
    // Don't run on the screensaver itself, and don't run on the
    // unsubscribe / public marketing routes (they have no sidebar so
    // this component should never mount there anyway, but defensive).
    if (pathname.startsWith('/screensaver')) return;

    function arm() {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        // Don't trip the screensaver if the document is hidden (the
        // user has the tab in the background, switching tabs counts
        // as 'inactive' but isn't what we want to capture).
        if (document.visibilityState === 'hidden') return;
        const wakeTo = encodeURIComponent(pathname || '/');
        router.push('/screensaver?wakeTo=' + wakeTo);
      }, IDLE_MS);
    }

    function onActivity() {
      lastActivityRef.current = Date.now();
      arm();
    }

    arm();

    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, onActivity, { passive: true });
    }
    document.addEventListener('visibilitychange', onActivity);

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, onActivity);
      }
      document.removeEventListener('visibilitychange', onActivity);
    };
  }, [pathname, router]);

  return null;
}
