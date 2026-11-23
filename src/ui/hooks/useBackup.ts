import type { BookMetadata } from '@domain/BookMetadata';
import type { Highlight } from '@domain/Highlight';
import type {
  BackupArtifact,
  BackupReport,
  CreateBackupResult,
  IBackupService,
} from '@ports/IBackupService';
import type { IHighlightService } from '@ports/IHighlightService';
import type { ILibraryService } from '@ports/ILibraryService';
import { useServiceContainer } from '@providers/ServiceContainerContext';
import { useHighlightStore } from '@stores/useHighlightStore';
import { useLibraryStore } from '@stores/useLibraryStore';
import { appLogger } from '@utils/logger';
import { useCallback, useEffect, useState } from 'react';

export function formatBackupSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

export function formatBackupReportSummary(prefix: string, report: BackupReport): string {
  const bookLabel = report.booksCount === 1 ? 'book' : 'books';
  const coverLabel = report.coversCount === 1 ? 'cover' : 'covers';
  return `${prefix}: ${report.booksCount} ${bookLabel}, ${report.coversCount} ${coverLabel} (${formatBackupSize(report.totalBytes)})`;
}

const PLATFORM_DISPLAY_NAMES: Record<string, string> = {
  linux: 'Linux',
  windows: 'Windows',
  android: 'Android',
  ios: 'iOS',
};

export function formatBackupPlatform(platform: string): string {
  const key = platform.trim().toLowerCase();
  return PLATFORM_DISPLAY_NAMES[key] ?? (key ? key[0].toUpperCase() + key.slice(1) : 'Unknown');
}

export function formatBackupDeviceLabel(deviceLabel: string): string {
  const cleaned = deviceLabel.trim().replace(/_/g, ' ');
  if (!cleaned) return 'Unknown Device';
  return cleaned
    .split(/\s+/)
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : ''))
    .join(' ');
}

export async function executeCreateBackup(
  backupService: Pick<IBackupService, 'createLocalBackup'>,
  uploadToCloud = false
): Promise<CreateBackupResult> {
  return backupService.createLocalBackup(uploadToCloud);
}

export interface RestoreBackupDependencies {
  readonly backupId: string;
  readonly backupService: Pick<IBackupService, 'restoreLocalBackup'>;
  readonly libraryService: Pick<ILibraryService, 'listLibraryBooks'>;
  readonly highlightService: Pick<IHighlightService, 'loadAllHighlights'>;
  readonly setBooks: (books: readonly BookMetadata[]) => void;
  readonly setHighlights: (highlights: readonly Highlight[]) => void;
}

export async function executeRestoreBackup(deps: RestoreBackupDependencies): Promise<BackupReport> {
  const report = await deps.backupService.restoreLocalBackup(deps.backupId);
  const [books, highlights] = await Promise.all([
    deps.libraryService.listLibraryBooks(),
    deps.highlightService.loadAllHighlights(),
  ]);
  deps.setBooks(books);
  deps.setHighlights(highlights);
  return report;
}

export interface ImportBackupDependencies {
  readonly backupService: Pick<IBackupService, 'importAndRestoreBackup'>;
  readonly libraryService: Pick<ILibraryService, 'listLibraryBooks'>;
  readonly highlightService: Pick<IHighlightService, 'loadAllHighlights'>;
  readonly setBooks: (books: readonly BookMetadata[]) => void;
  readonly setHighlights: (highlights: readonly Highlight[]) => void;
  readonly uploadToCloud?: boolean;
}

export async function executeImportBackup(
  deps: ImportBackupDependencies
): Promise<BackupReport | null> {
  const report = await deps.backupService.importAndRestoreBackup(deps.uploadToCloud);
  if (!report) {
    return null;
  }
  const [books, highlights] = await Promise.all([
    deps.libraryService.listLibraryBooks(),
    deps.highlightService.loadAllHighlights(),
  ]);
  deps.setBooks(books);
  deps.setHighlights(highlights);
  return report;
}

export interface UseBackupReturn {
  readonly backups: readonly BackupArtifact[];
  readonly backupState: BackupState;
  readonly uploadToCloud: boolean;
  readonly pendingRestoreId: string | null;
  readonly statusMessage: string | null;
  readonly error: string | null;
  setUploadToCloud(enabled: boolean): void;
  refreshBackups(): Promise<void>;
  createBackup(): Promise<void>;
  requestRestore(backupId: string): void;
  cancelRestore(): void;
  confirmRestore(backupId: string): Promise<void>;
  deleteBackup(backupId: string): Promise<void>;
  uploadBackupToCloud(backupId: string): Promise<void>;
  deleteRemoteBackup(backupId: string): Promise<void>;
  exportBackup(backupId: string): Promise<void>;
  importBackup(): Promise<void>;
}

export type BackupState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'creating' }
  | { readonly status: 'restoring' }
  | { readonly status: 'uploading'; readonly backupId: string }
  | { readonly status: 'exporting'; readonly backupId: string }
  | { readonly status: 'deleting'; readonly backupId: string };

export type ActiveBackupState = Exclude<BackupState, { status: 'idle' }>;

export function isBackupBusy(state: BackupState): boolean {
  return state.status === 'creating' || state.status === 'restoring';
}

export function isBackupStatus(state: BackupState, status: BackupState['status']): boolean {
  return state.status === status;
}

export function isBackupActiveFor(
  state: BackupState,
  status: 'uploading' | 'exporting' | 'deleting',
  backupId: string
): boolean {
  return state.status === status && state.backupId === backupId;
}

export interface BackupOperationState {
  readonly state: BackupState;
  readonly statusMessage: string | null;
  readonly error: string | null;
}

const INITIAL_OPERATION_STATE: BackupOperationState = {
  state: { status: 'idle' },
  statusMessage: null,
  error: null,
};

export function useBackup(): UseBackupReturn {
  const { backupService, libraryService, highlightService } = useServiceContainer();
  const setBooks = useLibraryStore((s) => s.setBooks);
  const setHighlights = useHighlightStore((s) => s.setHighlights);
  const [backups, setBackups] = useState<readonly BackupArtifact[]>([]);
  const [uploadToCloud, setUploadToCloud] = useState(false);
  const [pendingRestoreId, setPendingRestoreId] = useState<string | null>(null);
  const [opState, setOpState] = useState<BackupOperationState>(INITIAL_OPERATION_STATE);

  const runOperation = useCallback(
    async (
      nextState: ActiveBackupState,
      logErrorPrefix: string,
      action: () => Promise<string | undefined>,
      clearStatus = false,
      logLevel: 'error' | 'warn' = 'error'
    ) => {
      setOpState((prev) => ({
        state: nextState,
        error: null,
        statusMessage: clearStatus ? null : prev.statusMessage,
      }));
      try {
        const statusMessage = await action();
        setOpState((prev) => ({
          ...prev,
          state: { status: 'idle' },
          statusMessage: statusMessage ?? prev.statusMessage,
        }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        appLogger[logLevel](`${logErrorPrefix}: ${msg}`, 'backup');
        setOpState((prev) => ({
          ...prev,
          state: { status: 'idle' },
          error: msg,
        }));
      }
    },
    []
  );

  const refreshBackups = useCallback(
    () =>
      runOperation(
        { status: 'loading' },
        'Failed to list local backups',
        async () => {
          setBackups(await backupService.listLocalBackups());
          return undefined;
        },
        false,
        'warn'
      ),
    [backupService, runOperation]
  );

  useEffect(() => {
    void refreshBackups();
  }, [refreshBackups]);

  const createBackup = useCallback(
    () =>
      runOperation(
        { status: 'creating' },
        'Failed to create local backup',
        async () => {
          const result = await executeCreateBackup(backupService, uploadToCloud);
          setBackups(await backupService.listLocalBackups());
          return formatBackupReportSummary('Backup created', result.report);
        },
        true
      ),
    [backupService, runOperation, uploadToCloud]
  );

  const requestRestore = useCallback((backupId: string) => {
    setPendingRestoreId(backupId);
  }, []);

  const cancelRestore = useCallback(() => {
    setPendingRestoreId(null);
  }, []);

  const confirmRestore = useCallback(
    (backupId: string) =>
      runOperation(
        { status: 'restoring' },
        `Failed to restore backup ${backupId}`,
        async () => {
          const report = await executeRestoreBackup({
            backupId,
            backupService,
            libraryService,
            highlightService,
            setBooks,
            setHighlights,
          });
          setPendingRestoreId(null);
          return formatBackupReportSummary('Backup restored', report);
        },
        true
      ),
    [backupService, highlightService, libraryService, runOperation, setBooks, setHighlights]
  );

  const deleteBackup = useCallback(
    (backupId: string) =>
      runOperation(
        { status: 'deleting', backupId },
        `Failed to delete backup ${backupId}`,
        async () => {
          await backupService.deleteLocalBackup(backupId);
          setPendingRestoreId((curr) => (curr === backupId ? null : curr));
          setBackups(await backupService.listLocalBackups());
          return undefined;
        }
      ),
    [backupService, runOperation]
  );

  const uploadBackupToCloud = useCallback(
    (backupId: string) =>
      runOperation(
        { status: 'uploading', backupId },
        `Failed to upload backup ${backupId}`,
        async () => {
          await backupService.uploadBackupToCloud(backupId);
          setBackups(await backupService.listLocalBackups());
          return `Uploaded backup ${backupId} to cloud`;
        },
        true
      ),
    [backupService, runOperation]
  );

  const deleteRemoteBackup = useCallback(
    (backupId: string) =>
      runOperation(
        { status: 'deleting', backupId },
        `Failed to delete remote backup ${backupId}`,
        async () => {
          await backupService.deleteRemoteBackup(backupId);
          setPendingRestoreId((curr) => (curr === backupId ? null : curr));
          setBackups(await backupService.listLocalBackups());
          return undefined;
        }
      ),
    [backupService, runOperation]
  );

  const exportBackup = useCallback(
    (backupId: string) =>
      runOperation(
        { status: 'exporting', backupId },
        `Failed to export backup ${backupId}`,
        async () => {
          const exportedPath = await backupService.exportLocalBackup(backupId);
          return exportedPath ? `Backup exported to ${exportedPath}` : undefined;
        }
      ),
    [backupService, runOperation]
  );

  const importBackup = useCallback(
    () =>
      runOperation(
        { status: 'restoring' },
        'Failed to import backup',
        async () => {
          const report = await executeImportBackup({
            backupService,
            libraryService,
            highlightService,
            setBooks,
            setHighlights,
            uploadToCloud,
          });
          if (!report) {
            return undefined;
          }
          setPendingRestoreId(null);
          setBackups(await backupService.listLocalBackups());
          return formatBackupReportSummary('Backup imported', report);
        },
        true
      ),
    [
      backupService,
      highlightService,
      libraryService,
      runOperation,
      setBooks,
      setHighlights,
      uploadToCloud,
    ]
  );

  return {
    backups,
    backupState: opState.state,
    uploadToCloud,
    pendingRestoreId,
    statusMessage: opState.statusMessage,
    error: opState.error,
    setUploadToCloud,
    refreshBackups,
    createBackup,
    requestRestore,
    cancelRestore,
    confirmRestore,
    deleteBackup,
    uploadBackupToCloud,
    deleteRemoteBackup,
    exportBackup,
    importBackup,
  };
}
