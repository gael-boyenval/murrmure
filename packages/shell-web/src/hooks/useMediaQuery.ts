import { useSyncExternalStore } from "react";

/**
 * Subscribe to a CSS media query. Server / first paint without `window` uses `serverFallback`.
 * Tests without matchMedia also get `serverFallback` (default true → mobile drawer paths).
 */
export function useMediaQuery(query: string, serverFallback = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
        return () => {};
      }
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
        return serverFallback;
      }
      return window.matchMedia(query).matches;
    },
    () => serverFallback,
  );
}

/** True when viewport is below the Tailwind `md` breakpoint (768px). */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 767px)", true);
}
