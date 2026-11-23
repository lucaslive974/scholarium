import type { BookMetadata } from '@domain/BookMetadata';
import { BookFormat } from '@domain/types';
import { executeImportSelectedFile, executeOpenBookPicker } from '@hooks/useBookImport';
import { describe, expect, it, vi } from 'vitest';

const dummyBook: BookMetadata = {
  bookHash: 'import-test-hash',
  title: 'Meditations',
  author: 'Marcus Aurelius',
  format: BookFormat.EPUB,
  currentPage: 1,
  totalPages: 120,
  percentage: 0,
  tags: [],
  lastReadAt: new Date(1_700_000_000_000),
  updatedAt: new Date(1_700_000_000_000),
};

describe('useBookImport helpers', () => {
  it('calls onOverridePick when provided', async () => {
    const onOverridePick = vi.fn();
    const pickAndImportBook = vi.fn();
    const triggerFileInput = vi.fn();

    await executeOpenBookPicker({
      isMobile: false,
      onOverridePick,
      pickAndImportBook,
      triggerFileInput,
    });

    expect(onOverridePick).toHaveBeenCalledTimes(1);
    expect(pickAndImportBook).not.toHaveBeenCalled();
    expect(triggerFileInput).not.toHaveBeenCalled();
  });

  it('triggers file input directly on mobile', async () => {
    const pickAndImportBook = vi.fn();
    const triggerFileInput = vi.fn();

    await executeOpenBookPicker({
      isMobile: true,
      pickAndImportBook,
      triggerFileInput,
    });

    expect(triggerFileInput).toHaveBeenCalledTimes(1);
    expect(pickAndImportBook).not.toHaveBeenCalled();
  });

  it('uses pickAndImportBook on desktop and notifies onImported when book is returned', async () => {
    const onImported = vi.fn();
    const pickAndImportBook = vi.fn().mockResolvedValue(dummyBook);
    const triggerFileInput = vi.fn();

    await executeOpenBookPicker({
      isMobile: false,
      pickAndImportBook,
      onImported,
      triggerFileInput,
    });

    expect(pickAndImportBook).toHaveBeenCalledTimes(1);
    expect(onImported).toHaveBeenCalledWith(dummyBook);
    expect(triggerFileInput).not.toHaveBeenCalled();
  });

  it('falls back to file input when pickAndImportBook throws', async () => {
    const pickAndImportBook = vi.fn().mockRejectedValue(new Error('dialog unavailable'));
    const triggerFileInput = vi.fn();

    await executeOpenBookPicker({
      isMobile: false,
      pickAndImportBook,
      triggerFileInput,
    });

    expect(triggerFileInput).toHaveBeenCalledTimes(1);
  });

  it('imports selected file and notifies onImported', async () => {
    const file = { name: 'meditations.epub' } as File;
    const importBookFile = vi.fn().mockResolvedValue(dummyBook);
    const onImported = vi.fn();
    const onError = vi.fn();

    await executeImportSelectedFile({ file, importBookFile, onImported, onError });

    expect(importBookFile).toHaveBeenCalledWith(file);
    expect(onImported).toHaveBeenCalledWith(dummyBook);
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports error when importBookFile fails', async () => {
    const file = { name: 'broken.epub' } as File;
    const err = new Error('corrupt archive');
    const importBookFile = vi.fn().mockRejectedValue(err);
    const onImported = vi.fn();
    const onError = vi.fn();

    await executeImportSelectedFile({ file, importBookFile, onImported, onError });

    expect(onImported).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(err);
  });
});
