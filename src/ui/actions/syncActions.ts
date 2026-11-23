import type { ISyncService } from '@core/ports/ISyncService';
import type { IHighlightService, ILibraryService } from '@ports';
import { useHighlightStore } from '@stores/useHighlightStore';
import { useLibraryStore } from '@stores/useLibraryStore';
import { useSyncStore } from '@stores/useSyncStore';

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function withSyncBusy<T>(fallback: T, action: () => Promise<T>): Promise<T> {
  const store = useSyncStore.getState();
  store.setIsBusy(true);
  store.setError(null);
  try {
    return await action();
  } catch (err) {
    useSyncStore.getState().setError(toErrorMessage(err));
    return fallback;
  } finally {
    useSyncStore.getState().setIsBusy(false);
  }
}

export async function rehydrateSyncedStores(
  libraryService: ILibraryService,
  highlightService: IHighlightService,
  syncService: ISyncService
): Promise<void> {
  const [books, highlights, nextAvailabilities] = await Promise.all([
    libraryService.listLibraryBooks(),
    highlightService.loadAllHighlights(),
    syncService.listBookAvailabilities(),
  ]);
  useLibraryStore.getState().setBooks(books);
  useHighlightStore.getState().setHighlights(highlights);
  useSyncStore.getState().setAvailabilities(nextAvailabilities);
}

export async function executeRefreshSyncStatus(syncService: ISyncService): Promise<void> {
  try {
    const [nextStatus, nextAvailabilities] = await Promise.all([
      syncService.getCloudSyncStatus(),
      syncService.listBookAvailabilities(),
    ]);
    const store = useSyncStore.getState();
    store.setStatus(nextStatus);
    store.setAvailabilities(nextAvailabilities);
    store.setError(null);
  } catch (err) {
    useSyncStore.getState().setError(toErrorMessage(err));
  }
}

export async function executeBeginGoogleOAuth(
  syncService: ISyncService,
  clientIdOverride?: string
): Promise<string | null> {
  return withSyncBusy<string | null>(null, async () => {
    const res = await syncService.beginGoogleOAuth(clientIdOverride);
    useSyncStore.getState().setPendingAuthUrl(res.authUrl);
    return res.authUrl;
  });
}

export async function executeConnectGoogleDrive(syncService: ISyncService): Promise<void> {
  await withSyncBusy<void>(undefined, async () => {
    const nextStatus = await syncService.connectGoogleDrive();
    const store = useSyncStore.getState();
    store.setStatus(nextStatus);
    store.setPendingAuthUrl(null);
  });
}

export async function executeDisconnectCloud(
  syncService: ISyncService,
  libraryService?: ILibraryService,
  highlightService?: IHighlightService
): Promise<void> {
  await withSyncBusy<void>(undefined, async () => {
    const nextStatus = await syncService.disconnectCloudProvider();
    const store = useSyncStore.getState();
    store.setStatus(nextStatus);
    store.setPendingAuthUrl(null);
    if (libraryService && highlightService) {
      await rehydrateSyncedStores(libraryService, highlightService, syncService);
    } else {
      await executeRefreshSyncStatus(syncService);
    }
  });
}

export async function executeSyncNow(
  syncService: ISyncService,
  libraryService: ILibraryService,
  highlightService: IHighlightService
): Promise<void> {
  await withSyncBusy<void>(undefined, async () => {
    const report = await syncService.triggerCloudSync();
    if (report.pulledBooks > 0 || report.deletedBooks > 0) {
      await rehydrateSyncedStores(libraryService, highlightService, syncService);
    } else {
      await executeRefreshSyncStatus(syncService);
    }
  });
}

export async function executeSetSyncInterval(
  syncService: ISyncService,
  intervalSecs: number
): Promise<void> {
  useSyncStore.getState().setError(null);
  try {
    const nextStatus = await syncService.setCloudSyncInterval(intervalSecs);
    useSyncStore.getState().setStatus(nextStatus);
  } catch (err) {
    useSyncStore.getState().setError(toErrorMessage(err));
  }
}

export async function executeDownloadRemoteBook(
  syncService: ISyncService,
  bookHash: string
): Promise<void> {
  const store = useSyncStore.getState();
  store.setBookDownloading(bookHash, true);
  store.setError(null);
  try {
    await syncService.downloadRemoteBook(bookHash);
    useSyncStore.getState().setBookAvailability(bookHash, 'local');
  } catch (err) {
    useSyncStore.getState().setError(toErrorMessage(err));
  } finally {
    useSyncStore.getState().setBookDownloading(bookHash, false);
  }
}

export async function executeEvictLocalBook(
  syncService: ISyncService,
  bookHash: string
): Promise<void> {
  useSyncStore.getState().setError(null);
  try {
    await syncService.evictLocalBook(bookHash);
    useSyncStore.getState().setBookAvailability(bookHash, 'remoteOnly');
  } catch (err) {
    useSyncStore.getState().setError(toErrorMessage(err));
  }
}

export async function executeClearCloudData(
  syncService: ISyncService,
  libraryService?: ILibraryService,
  highlightService?: IHighlightService
): Promise<number> {
  return withSyncBusy<number>(0, async () => {
    const deleted = await syncService.clearCloudSyncData();
    if (libraryService && highlightService) {
      await rehydrateSyncedStores(libraryService, highlightService, syncService);
    } else {
      await executeRefreshSyncStatus(syncService);
    }
    return deleted;
  });
}
