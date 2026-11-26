import {
  type UseTransitionOverlayOptions,
  useTransitionOverlay,
} from '@hooks/useTransitionOverlay';
import { memo, type ReactNode, ViewTransition } from 'react';

export interface TransitionOverlayProps extends UseTransitionOverlayOptions {
  readonly children?: ReactNode;
  readonly className?: string;
  /** Custom z-index class for overlay positioning (default: 'z-30') */
  readonly zIndexClass?: string;
  /** Test identifier attribute */
  readonly testId?: string;
}

/**
 * Full-screen or container overlay animated via React 19 <ViewTransition>.
 * Preserves anti-flicker minDisplayMs while delegating fade-in/fade-out to the browser View Transitions API.
 */
export const TransitionOverlay = memo(function TransitionOverlay({
  isVisible = false,
  minDisplayMs,
  children,
  className = '',
  zIndexClass = 'z-30',
  testId = 'transition-overlay',
}: TransitionOverlayProps) {
  const overlay = useTransitionOverlay({
    isVisible,
    minDisplayMs,
  });

  if (!overlay.isMounted) {
    return null;
  }

  return (
    <ViewTransition enter="overlay-fade" exit="overlay-fade">
      <div data-testid={testId} className={`fixed inset-0 ${zIndexClass} ${className}`}>
        {children}
      </div>
    </ViewTransition>
  );
});
