import { useCloudSyncListener } from '@hooks/useCloudSync';
import type { CloudSyncState } from '@ports/ISyncService';
import { useSyncStore } from '@stores/useSyncStore';
import { CloudCheckIcon, CloudIcon } from '@ui';
import { hasDocument } from '@utils/dom';
import { memo, useEffect, useReducer } from 'react';
import { createPortal } from 'react-dom';

export interface BadgeAction {
  readonly connected: boolean;
  readonly state: CloudSyncState | undefined;
}

export function badgeReducer(current: CloudSyncState, action: BadgeAction): CloudSyncState {
  if (!action.connected) return 'idle';
  switch (action.state) {
    case 'syncing':
      return 'syncing';
    case 'synced':
    case 'error':
      return current === 'syncing' ? action.state : 'idle';
    default:
      return 'idle';
  }
}

export const CloudSyncOverlay = memo(function CloudSyncOverlay() {
  useCloudSyncListener();

  const connected = useSyncStore((s) => s.status?.connected ?? false);
  const syncState = useSyncStore((s) => s.status?.state);
  const [phase, dispatch] = useReducer(badgeReducer, 'idle');

  useEffect(() => {
    dispatch({ connected, state: syncState });
  }, [connected, syncState]);

  useEffect(() => {
    if (phase !== 'synced' && phase !== 'error') {
      return;
    }
    const timer = setTimeout(
      () => dispatch({ connected: true, state: 'idle' }),
      phase === 'synced' ? 1600 : 2800
    );
    return () => clearTimeout(timer);
  }, [phase]);

  if (phase === 'idle') {
    return null;
  }

  let label = 'Syncing...';
  let toneClass = 'text-tx-secondary';
  if (phase === 'synced') {
    label = 'Synced';
    toneClass = 'text-emerald-600 dark:text-emerald-400';
  } else if (phase === 'error') {
    label = 'Sync error';
    toneClass = 'text-amber-600 dark:text-amber-400';
  }

  const badge = (
    <output
      aria-live="polite"
      data-testid="cloud-sync-overlay"
      className={`fixed safe-bottom-4 safe-left-4 z-30 pointer-events-none inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.7rem] font-medium cover-overlay-chip shadow-md transition-opacity duration-300 ${toneClass}`}
    >
      {phase === 'synced' ? (
        <CloudCheckIcon className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <CloudIcon
          className={`h-3.5 w-3.5 shrink-0 ${phase === 'syncing' ? 'animate-pulse' : ''}`}
        />
      )}
      <span>{label}</span>
    </output>
  );

  if (hasDocument() && document.body) {
    return createPortal(badge, document.body);
  }
  return badge;
});
