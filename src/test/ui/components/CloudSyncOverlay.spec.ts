import { NoopSyncService } from '@adapters/ipc/NoopSyncService';
import {
  badgeReducer,
  CloudSyncOverlay,
  getSyncBadgePresentation,
} from '@components/CloudSyncOverlay';
import { ServiceContainerProvider } from '@providers/ServiceContainerContext';
import { useSyncStore } from '@stores/useSyncStore';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { MockBackend } from '../../mocks/MockBackend';

describe('CloudSyncOverlay', () => {
  beforeEach(() => {
    useSyncStore.getState().reset();
  });

  it('transitions idle => syncing => synced => idle cleanly', () => {
    expect(badgeReducer('idle', { connected: true, state: 'synced' })).toBe('idle');

    const syncing = badgeReducer('idle', { connected: true, state: 'syncing' });
    expect(syncing).toBe('syncing');

    const synced = badgeReducer(syncing, { connected: true, state: 'synced' });
    expect(synced).toBe('synced');

    expect(badgeReducer(synced, { connected: true, state: 'idle' })).toBe('idle');
  });

  it('transitions syncing => error => idle and resets on disconnect', () => {
    const syncing = badgeReducer('idle', { connected: true, state: 'syncing' });
    const errored = badgeReducer(syncing, { connected: true, state: 'error' });
    expect(errored).toBe('error');
    expect(badgeReducer(errored, { connected: true, state: 'idle' })).toBe('idle');

    expect(badgeReducer('syncing', { connected: false, state: 'syncing' })).toBe('idle');
  });

  it('renders nothing when disconnected or idle', () => {
    const backend = new MockBackend();
    const markup = renderToStaticMarkup(
      React.createElement(
        ServiceContainerProvider,
        {
          readerService: backend,
          libraryService: backend,
          highlightService: backend,
          presenceService: backend,
          syncService: new NoopSyncService(),
        },
        React.createElement(CloudSyncOverlay)
      )
    );

    expect(markup).toBe('');
  });

  it('returns the expected label and tone class for each sync phase', () => {
    expect(getSyncBadgePresentation('syncing')).toEqual({
      label: 'Syncing...',
      toneClass: 'text-tx-secondary',
    });
    expect(getSyncBadgePresentation('synced')).toEqual({
      label: 'Synced',
      toneClass: 'text-emerald-600 dark:text-emerald-400',
    });
    expect(getSyncBadgePresentation('error')).toEqual({
      label: 'Sync error',
      toneClass: 'text-amber-600 dark:text-amber-400',
    });
  });
});
