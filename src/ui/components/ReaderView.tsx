import type { BookMetadata } from '@domain/BookMetadata';
import { BookFormat } from '@domain/types';
import { useReaderBootstrapper } from '@hooks/useReaderBootstrapper';
import { useReaderView } from '@hooks/useReaderView';
import { useReaderStore } from '@stores/useReaderStore';
import { useReaderUIStore } from '@stores/useReaderUIStore';
import { LoadingSplash, TransitionOverlay } from '@ui';
import { memo, useCallback, useRef } from 'react';
import { isValidAuthor } from './library/BookCover';
import { ReaderBottomBar } from './reader/ReaderBottomBar';
import { ReaderHeader } from './reader/ReaderHeader';
import { ReaderOverlays } from './reader/ReaderOverlays';
import { ReaderStream, type ReaderStreamHandle } from './reader/ReaderStream';
import { ReaderViewportChapterIndicator } from './reader/ReaderViewportChapterIndicator';

export interface ReaderViewProps {
  readonly book?: BookMetadata | null;
  readonly onClose?: () => void;
}

export const ReaderView = memo(function ReaderView({ book, onClose }: ReaderViewProps) {
  const isBootstrapping = useReaderBootstrapper(book);

  const loadedPages = useReaderStore((s) => s.loadedPages);
  const document = useReaderStore((s) => s.document);

  const isReady = !isBootstrapping && loadedPages.byPage.size > 0;
  const isPdf = document.format === BookFormat.PDF;
  const chapterTitle = useReaderStore((s) => s.chapterTitle) || document.chapterTitle;
  const isChromeVisible = useReaderUIStore((s) => s.isChromeVisible);

  const streamRef = useRef<ReaderStreamHandle>(null);
  const { handleCloseReader, handleViewportClick, toggleChrome } = useReaderView({ onClose });
  const handleScrollToPage = useCallback((targetPage: number) => {
    void streamRef.current?.goToPage(targetPage);
  }, []);

  return (
    <section
      aria-label="Book Reader Document"
      className="relative h-screen w-full bg-canvas text-tx-main flex flex-col justify-between overflow-hidden select-text transition-colors duration-200 outline-none"
      onClick={handleViewportClick}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          toggleChrome();
        }
      }}
    >
      <ReaderHeader onClose={handleCloseReader} />
      <ReaderViewportChapterIndicator
        chapterTitle={chapterTitle}
        isVisible={!isPdf && !isChromeVisible}
      />
      <TransitionOverlay
        isVisible={!isReady}
        minDisplayMs={3000}
        zIndexClass="z-40"
        testId="reader-transition-overlay"
      >
        <LoadingSplash
          title={document.bookTitle || 'Loading Document'}
          subtitle={isValidAuthor(document.bookAuthor) ? document.bookAuthor : ''}
          message="Preparing book for reading..."
          testId="reader-loading-view"
        />
      </TransitionOverlay>
      {isReady && <ReaderStream ref={streamRef} />}
      <ReaderBottomBar onScrollToPage={handleScrollToPage} />
      <ReaderOverlays />
    </section>
  );
});
