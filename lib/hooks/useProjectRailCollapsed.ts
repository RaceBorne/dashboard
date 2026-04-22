'use client';

/**
 * useProjectRailCollapsed — subscribes to the ProjectRail collapse state
 * so other components on the page can reflow when the rail toggles.
 *
 * The state lives in localStorage under 'evari.project-rail.collapsed' and
 * ProjectRail dispatches a window event 'evari:project-rail-toggled' (with
 * { collapsed: boolean } detail) whenever it changes. Components that
 * import this hook get the live boolean.
 */
import { useEffect, useState } from 'react';

const LS_KEY = 'evari.project-rail.collapsed';
const EVENT = 'evari:project-rail-toggled';

export function useProjectRailCollapsed(): boolean {
  // Default false on SSR + first render so layout stays predictable until
  // hydration. The width transition then animates from there.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    // Hydrate from localStorage.
    try {
      const v = window.localStorage.getItem(LS_KEY);
      if (v === '1') setCollapsed(true);
    } catch {
      // Non-fatal — default to expanded.
    }

    function onToggle(e: Event) {
      const ce = e as CustomEvent<{ collapsed?: boolean }>;
      if (typeof ce.detail?.collapsed === 'boolean') {
        setCollapsed(ce.detail.collapsed);
      }
    }
    window.addEventListener(EVENT, onToggle);
    return () => window.removeEventListener(EVENT, onToggle);
  }, []);

  return collapsed;
}
