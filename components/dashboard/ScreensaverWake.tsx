'use client';

/**
 * Mounted on the screensaver page. Detects user activity (mouse move,
 * key, touch, scroll) and navigates back to the route the user was on
 * when the screensaver kicked in, captured via ?wakeTo=. While we go,
 * we set a sessionStorage flag that the AI pane reads on its next
 * mount, so Mojito greets the user the moment the dashboard reappears.
 *
 * Threshold: ignore the first 600ms after mount so the navigation
 * transition doesn't auto-wake. After that, any meaningful input
 * dismisses.
 */

import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const ARMING_DELAY_MS = 600;
const MIN_MOUSE_MOVE_PX = 8;

export function ScreensaverWake() {
  const router = useRouter();
  const params = useSearchParams();
  const armedRef = useRef(false);
  const initialMouseRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const wakeTo = params?.get('wakeTo') ?? '/';
    const safeWakeTo = wakeTo.startsWith('/') ? wakeTo : '/';

    // Wait a beat so the screensaver actually appears before we start
    // listening for "wake me up" gestures.
    const armTimer = setTimeout(() => {
      armedRef.current = true;
    }, ARMING_DELAY_MS);

    function wake() {
      try {
        sessionStorage.setItem('mojito-wake-greet', '1');
      } catch { /* ignore */ }
      router.push(safeWakeTo);
    }

    function onMouseMove(e: MouseEvent) {
      if (!armedRef.current) return;
      if (!initialMouseRef.current) {
        initialMouseRef.current = { x: e.clientX, y: e.clientY };
        return;
      }
      const dx = Math.abs(e.clientX - initialMouseRef.current.x);
      const dy = Math.abs(e.clientY - initialMouseRef.current.y);
      if (dx + dy > MIN_MOUSE_MOVE_PX) wake();
    }

    function onKey() { if (armedRef.current) wake(); }
    function onTouch() { if (armedRef.current) wake(); }
    function onMouseDown() { if (armedRef.current) wake(); }

    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('keydown', onKey);
    window.addEventListener('touchstart', onTouch, { passive: true });
    window.addEventListener('mousedown', onMouseDown);

    return () => {
      clearTimeout(armTimer);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('touchstart', onTouch);
      window.removeEventListener('mousedown', onMouseDown);
    };
  }, [router, params]);

  return null;
}
