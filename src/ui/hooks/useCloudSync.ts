import {
  executeBeginGoogleOAuth,
  executeClearCloudData,
  executeConnectGoogleDrive,
  executeDisconnectCloud,
  executeDownloadRemoteBook,
  executeEvictLocalBook,
  executeRefreshSyncStatus,
  executeSetSyncInterval,
  executeSyncNow,
  rehydrateSyncedStores,
} from '@actions/syncActions';
import type { BookAvailability, CloudSyncStatus } from '@core/ports/ISyncService';
import { useServiceContainer } from '@providers/ServiceContainerContext';
import { useSyncStore } from '@stores/useSyncStore';
import { hasDocument } from '@utils/dom';
import { useCallback, useEffect } from 'react';

export interface UseCloudSyncReturn {
  readonly status: CloudSyncStatus | null;
  readonly availabilities: Readonly<Record<string, BookAvailability>>;
  readonly downloadingHashes: Readonly<Record<string, boolean>>;
  readonly pendingAuthUrl: string | null;
  readonly isBusy: boolean;
  readonly error: string | null;
  refreshStatus(): Promise<void>;
  beginGoogleOAuth(clientIdOverride?: string): Promise<string | null>;
  connectGoogleDrive(): Promise<void>;
  disconnect(): Promise<void>;
  syncNow(): Promise<void>;
  setIntervalSecs(intervalSecs: number): Promise<void>;
  downloadBook(bookHash: string): Promise<void>;
  evictLocalBook(bookHash: string): Promise<void>;
  clearCloudData(): Promise<number>;
}

export interface UseBookSyncActionsReturn {
  readonly downloadBook: (bookHash: string) => Promise<void>;
  readonly evictLocalBook: (bookHash: string) => Promise<void>;
}

/**
 * Global listener mounted once at the app root (when `__ENABLE_CLOUD_SYNC__` is true).
 * Subscribes to backend `sync:status` events, triggers resume checks on visibility change,
 * and rehydrates library/highlight stores whenever remote changes are pulled.
 */
export function useCloudSyncListener(): void {
  const { syncService, libraryService, highlightService } = useServiceContainer();

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | null = null;

    void executeRefreshSyncStatus(syncService);
    (async () => {
      const fn = await syncService.subscribeStatus((nextStatus) => {
        if (!active) return;
        useSyncStore.getState().setStatus(nextStatus);
        if (nextStatus.connected) {
          useSyncStore.getState().setPendingAuthUrl(null);
        }
        if (
          nextStatus.state === 'synced' &&
          (nextStatus.lastPulledBooks > 0 || (nextStatus.lastDeletedBooks ?? 0) > 0)
        ) {
          void rehydrateSyncedStores(libraryService, highlightService, syncService);
        }
      });

      if (active) {
        unlisten = fn;
      } else {
        fn();
      }
    })();

    const handleVisibilityChange = () => {
      if (hasDocument() && !document.hidden) {
        void syncService.notifyAppResumed().then((report) => {
          if (active && report && (report.pulledBooks > 0 || report.deletedBooks > 0)) {
            void rehydrateSyncedStores(libraryService, highlightService, syncService);
          }
        });
      }
    };

    if (hasDocument()) {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      active = false;
      unlisten?.();
      if (hasDocument()) {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [syncService, libraryService, highlightService]);
}

export function useBookSyncActions(): UseBookSyncActionsReturn {
  const { syncService } = useServiceContainer();

  const downloadBook = useCallback(
    (bookHash: string) => executeDownloadRemoteBook(syncService, bookHash),
    [syncService]
  );
  const evictLocalBook = useCallback(
    (bookHash: string) => executeEvictLocalBook(syncService, bookHash),
    [syncService]
  );

  return { downloadBook, evictLocalBook };
}

export function useCloudSync(): UseCloudSyncReturn {
  const { syncService, libraryService, highlightService } = useServiceContainer();
  const status = useSyncStore((s) => s.status);
  const availabilities = useSyncStore((s) => s.availabilities);
  const downloadingHashes = useSyncStore((s) => s.downloadingHashes);
  const pendingAuthUrl = useSyncStore((s) => s.pendingAuthUrl);
  const isBusy = useSyncStore((s) => s.isBusy);
  const error = useSyncStore((s) => s.error);

  const refreshStatus = useCallback(() => executeRefreshSyncStatus(syncService), [syncService]);

  const beginGoogleOAuth = useCallback(
    (clientIdOverride?: string) => executeBeginGoogleOAuth(syncService, clientIdOverride),
    [syncService]
  );
  const connectGoogleDrive = useCallback(
    () => executeConnectGoogleDrive(syncService),
    [syncService]
  );
  const disconnect = useCallback(
    () => executeDisconnectCloud(syncService, libraryService, highlightService),
    [syncService, libraryService, highlightService]
  );
  const syncNow = useCallback(
    () => executeSyncNow(syncService, libraryService, highlightService),
    [syncService, libraryService, highlightService]
  );
  const setIntervalSecs = useCallback(
    (intervalSecs: number) => executeSetSyncInterval(syncService, intervalSecs),
    [syncService]
  );
  const downloadBook = useCallback(
    (bookHash: string) => executeDownloadRemoteBook(syncService, bookHash),
    [syncService]
  );
  const evictLocalBook = useCallback(
    (bookHash: string) => executeEvictLocalBook(syncService, bookHash),
    [syncService]
  );
  const clearCloudData = useCallback(
    () => executeClearCloudData(syncService, libraryService, highlightService),
    [syncService, libraryService, highlightService]
  );

  return {
    status,
    availabilities,
    downloadingHashes,
    pendingAuthUrl,
    isBusy,
    error,
    refreshStatus,
    beginGoogleOAuth,
    connectGoogleDrive,
    disconnect,
    syncNow,
    setIntervalSecs,
    downloadBook,
    evictLocalBook,
    clearCloudData,
  };
}
