import type { BookMetadata } from '@domain/BookMetadata';
import type { Highlight } from '@domain/Highlight';
import type { BackupReport, CreateBackupResult, IBackupService } from '@ports/IBackupService';
import type { IHighlightService } from '@ports/IHighlightService';
import type { ILibraryService } from '@ports/ILibraryService';

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
