import { startTransition, useEffect, useRef, useState } from 'react';

export interface UseTransitionOverlayOptions {
  /** Whether the overlay is active and visible (declarative control) */
  readonly isVisible?: boolean;
  /** Minimum time in ms the overlay must remain visible to prevent visual flashes (default: 0ms) */
  readonly minDisplayMs?: number;
}

export interface UseTransitionOverlayReturn {
  readonly isMounted: boolean;
}

/**
 * Calculates remaining delay to satisfy minDisplayMs requirement.
 */
export function computeRemainingDelay(
  mountedAt: number,
  minDisplayMs: number,
  currentTime = Date.now()
): number {
  if (minDisplayMs <= 0 || mountedAt <= 0) {
    return 0;
  }
  const elapsed = currentTime - mountedAt;
  return Math.max(0, minDisplayMs - elapsed);
}

/**
 * Hook managing declarative mount/unmount with anti-flicker minDisplayMs
 * wrapped in React 19 startTransition to trigger native <ViewTransition> animations.
 */
export function useTransitionOverlay(
  options: UseTransitionOverlayOptions = {}
): UseTransitionOverlayReturn {
  const { isVisible = false, minDisplayMs = 0 } = options;

  const [isMounted, setIsMounted] = useState(isVisible);
  const mountedAtRef = useRef(isVisible ? Date.now() : 0);

  useEffect(() => {
    let minDisplayTimer: ReturnType<typeof setTimeout> | null = null;

    if (isVisible) {
      mountedAtRef.current = Date.now();
      startTransition(() => {
        setIsMounted(true);
      });
    } else {
      const remainingDelay = computeRemainingDelay(mountedAtRef.current, minDisplayMs);

      minDisplayTimer = setTimeout(() => {
        startTransition(() => setIsMounted(false));
      }, remainingDelay);
    }

    return () => {
      if (minDisplayTimer) {
        clearTimeout(minDisplayTimer);
      }
    };
  }, [isVisible, minDisplayMs]);

  return {
    isMounted,
  };
}
