"use client";

// Client-side GPC detection. Returns null until mounted (SSR-safe), then
// the boolean value of `navigator.globalPrivacyControl`. Browsers that
// support GPC expose this property; absent or false means "no signal".
//
// Implemented with `useSyncExternalStore` so the SSR snapshot is stable
// (`null`) and the browser snapshot is read directly without a cascading
// render — React 19's react-hooks/set-state-in-effect lint complains about
// the older `useState` + `useEffect` pattern.

import { useSyncExternalStore } from "react";

type GpcNavigator = Navigator & { globalPrivacyControl?: boolean };

// GPC is read-only at runtime — there is no event to subscribe to. Provide a
// no-op subscribe so the store is "stable": React only reads the snapshot once
// per mount and then trusts it.
function subscribe(): () => void {
  return () => {};
}

function getClientSnapshot(): boolean {
  return Boolean((navigator as GpcNavigator).globalPrivacyControl);
}

function getServerSnapshot(): null {
  return null;
}

export function useGpc(): boolean | null {
  return useSyncExternalStore<boolean | null>(
    subscribe,
    getClientSnapshot,
    getServerSnapshot,
  );
}
