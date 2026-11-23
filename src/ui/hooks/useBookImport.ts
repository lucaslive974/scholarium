import type { BookMetadata } from '@domain/BookMetadata';
import { useLibrary } from '@hooks/useLibrary';
import { appLogger } from '@utils/logger';
import { type ChangeEvent, type RefObject, useCallback, useRef } from 'react';

export interface OpenBookPickerParams {
  readonly isMobile: boolean;
  readonly pickAndImportBook: () => Promise<BookMetadata | null>;
  readonly triggerFileInput: () => void;
  readonly onImported?: (book: BookMetadata) => void;
  readonly onOverridePick?: () => void;
}

export interface ImportSelectedFileParams {
  readonly file: File;
  readonly importBookFile: (file: File) => Promise<BookMetadata>;
  readonly onImported?: (book: BookMetadata) => void;
  readonly onError?: (err: unknown) => void;
}

export async function executeOpenBookPicker({
  isMobile,
  pickAndImportBook,
  triggerFileInput,
  onImported,
  onOverridePick,
}: OpenBookPickerParams): Promise<void> {
  if (onOverridePick) {
    onOverridePick();
    return;
  }
  if (isMobile) {
    triggerFileInput();
    return;
  }
  try {
    const book = await pickAndImportBook();
    if (book) {
      onImported?.(book);
    }
  } catch {
    triggerFileInput();
  }
}

export async function executeImportSelectedFile({
  file,
  importBookFile,
  onImported,
  onError,
}: ImportSelectedFileParams): Promise<void> {
  try {
    const imported = await importBookFile(file);
    onImported?.(imported);
  } catch (err) {
    onError?.(err);
  }
}

export interface UseBookImportOptions {
  readonly onImported?: (book: BookMetadata) => void;
  readonly onOverridePick?: () => void;
}

export interface UseBookImportReturn {
  readonly openImportPicker: () => Promise<void>;
  readonly fileInputProps: {
    readonly ref: RefObject<HTMLInputElement | null>;
    readonly type: 'file';
    readonly accept: string;
    readonly onChange: (e: ChangeEvent<HTMLInputElement>) => Promise<void>;
  };
}

export function useBookImport({
  onImported,
  onOverridePick,
}: UseBookImportOptions = {}): UseBookImportReturn {
  const { pickAndImportBook, importBookFile } = useLibrary();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openImportPicker = useCallback(
    () =>
      executeOpenBookPicker({
        isMobile: __IS_MOBILE__,
        pickAndImportBook,
        triggerFileInput: () => fileInputRef.current?.click(),
        onImported,
        onOverridePick,
      }),
    [onImported, onOverridePick, pickAndImportBook]
  );

  const handleFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        await executeImportSelectedFile({
          file,
          importBookFile,
          onImported,
          onError: (err) => {
            appLogger.error(`Failed to import book: ${String(err)}`, 'library');
          },
        });
      } finally {
        e.target.value = '';
      }
    },
    [importBookFile, onImported]
  );

  return {
    openImportPicker,
    fileInputProps: {
      ref: fileInputRef,
      type: 'file',
      accept: '.epub,.pdf',
      onChange: handleFileChange,
    },
  };
}
