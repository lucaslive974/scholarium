import type { BookMetadata } from '@domain/BookMetadata';
import { useBookImport } from '@hooks/useBookImport';
import { executeDownloadRemoteBook, executeEvictLocalBook } from '@hooks/useCloudSync';
import { useLibrary } from '@hooks/useLibrary';
import { useNavigation } from '@providers/NavigationContext';
import { useServiceContainer } from '@providers/ServiceContainerContext';
import { useSyncStore } from '@stores/useSyncStore';
import { useEffect, useState } from 'react';
import { BooksGrid } from './library/BooksGrid';
import { DeleteBookDialog } from './library/DeleteBookDialog';
import { EditBookMetadataModal } from './library/EditBookMetadataModal';
import { LibraryAnnotationsTab } from './library/LibraryAnnotationsTab';
import { LibraryCollectionsTab } from './library/LibraryCollectionsTab';
import { LibraryHeader } from './library/LibraryHeader';

export interface LibraryViewProps {
  readonly books?: BookMetadata[];
  readonly onOpenBook?: (book: BookMetadata) => void;
  readonly onImportNewBook?: () => void;
  readonly onOpenSettings?: () => void;
}

export function LibraryView({
  books: propBooks,
  onOpenBook: propOnOpenBook,
  onImportNewBook: propOnImportNewBook,
  onOpenSettings: propOnOpenSettings,
}: LibraryViewProps = {}) {
  const library = useLibrary();
  const navigation = useNavigation();
  const { presenceService, syncService } = useServiceContainer();

  const books = propBooks ?? library.books;
  const onOpenBook = propOnOpenBook ?? navigation.openReader;
  const onOpenSettings = propOnOpenSettings ?? navigation.openSettings;
  const { openImportPicker, fileInputProps } = useBookImport({
    onImported: onOpenBook,
    onOverridePick: propOnImportNewBook,
  });

  const handleOpenBook = async (book: BookMetadata) => {
    if (__ENABLE_CLOUD_SYNC__) {
      const syncState = useSyncStore.getState();
      if (syncState.downloadingHashes[book.bookHash]) {
        return;
      }
      if (syncState.availabilities[book.bookHash] === 'remoteOnly') {
        await executeDownloadRemoteBook(syncService, book.bookHash);
        if (useSyncStore.getState().availabilities[book.bookHash] === 'remoteOnly') {
          return;
        }
      }
    }
    onOpenBook(book);
  };

  const handleEvictBook = (book: BookMetadata) => {
    if (__ENABLE_CLOUD_SYNC__) {
      void executeEvictLocalBook(syncService, book.bookHash);
    }
  };

  const { libraryTab: activeTab, setLibraryTab: setActiveTab } = navigation;
  const [searchQuery, setSearchQuery] = useState('');
  const [bookToRename, setBookToRename] = useState<BookMetadata | null>(null);
  const [bookToDelete, setBookToDelete] = useState<BookMetadata | null>(null);

  useEffect(() => {
    if (activeTab !== 'highlights') {
      void presenceService.updateLibraryPresence(books.length);
    }
  }, [activeTab, books.length, presenceService]);

  const filteredBooks = books.filter((b) => {
    const q = searchQuery.toLowerCase();
    return (
      b.title.toLowerCase().includes(q) || (Boolean(b.author) && b.author.toLowerCase().includes(q))
    );
  });

  return (
    <div className="app-page-shell selection:bg-tx-main selection:text-canvas">
      <LibraryHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        allBooksCount={filteredBooks.length}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onImportClick={openImportPicker}
        onOpenSettings={onOpenSettings}
      />

      <input {...fileInputProps} className="hidden" aria-label="Upload eBook file" />

      <main className="flex-1 w-full px-6 py-6 flex flex-col gap-6">
        {(activeTab === 'recents' || activeTab === 'all') && (
          <BooksGrid
            books={filteredBooks}
            onOpenBook={(book) => void handleOpenBook(book)}
            onRenameBook={setBookToRename}
            onDeleteBook={setBookToDelete}
            onEvictBook={__ENABLE_CLOUD_SYNC__ ? handleEvictBook : undefined}
            onImportClick={openImportPicker}
          />
        )}

        {activeTab === 'highlights' && <LibraryAnnotationsTab searchQuery={searchQuery} />}

        {activeTab === 'lists' && (
          <LibraryCollectionsTab onOpenBook={(book) => void handleOpenBook(book)} />
        )}
      </main>

      <EditBookMetadataModal
        isOpen={Boolean(bookToRename)}
        book={bookToRename}
        onClose={() => setBookToRename(null)}
        onSave={async (hash, input) => {
          await library.updateBookMetadata(hash, input);
        }}
      />

      <DeleteBookDialog
        isOpen={Boolean(bookToDelete)}
        book={bookToDelete}
        onClose={() => setBookToDelete(null)}
        onDelete={async (hash) => {
          await library.deleteBook(hash);
        }}
      />
    </div>
  );
}
