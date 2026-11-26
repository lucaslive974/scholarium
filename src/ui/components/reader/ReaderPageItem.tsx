import type { Highlight } from '@domain/Highlight';
import { BookFormat } from '@domain/types';
import type { DocumentPage } from '@ports/IReaderService';
import type { PageLayoutMode } from '@stores/useTypographyStore';
import { memo } from 'react';
import { ReaderPageEpub, type ReaderPageRendererProps } from './ReaderPageEpub';
import { ReaderPagePdf } from './ReaderPagePdf';

export { type TextChunk, tokenizeTextWithHighlights } from './ReaderPageParagraphs';

export type PageRendererComponent = React.ComponentType<ReaderPageRendererProps>;

export const PAGE_RENDERERS: Record<BookFormat, PageRendererComponent> = {
  [BookFormat.EPUB]: ReaderPageEpub,
  [BookFormat.PDF]: ReaderPagePdf,
};

/**
 * Returns the article container classes for a page slot based on book format
 * and visual page layout mode.
 */
export function getReaderPageArticleClass(isPdf: boolean, pageLayoutMode: PageLayoutMode): string {
  const isSeparated = pageLayoutMode === 'separated';
  if (isPdf) {
    return isSeparated
      ? 'w-full flex flex-col rounded-md overflow-hidden border border-line-subtle shadow-md bg-surface'
      : 'w-full flex flex-col';
  }
  return isSeparated
    ? 'w-full min-h-225 flex flex-col gap-6 py-8'
    : 'w-full min-h-225 flex flex-col gap-6';
}

export interface ReaderPageItemProps {
  readonly page: DocumentPage;
  readonly totalPages: number;
  readonly bookHash?: string;
  readonly bookTitle: string;
  readonly bookAuthor?: string;
  readonly bookFormat?: BookFormat;
  readonly pageLayoutMode?: PageLayoutMode;
  readonly highlights: readonly Highlight[];
  readonly showChapterHeader?: boolean;
  readonly onHighlightClick: (highlight: Highlight, coords: { x: number; y: number }) => void;
  readonly onHighlightContextMenu: (e: React.MouseEvent, text: string, pageNumber: number) => void;
}

export const ReaderPageItem = memo(function ReaderPageItem({
  page,
  totalPages,
  bookHash,
  bookTitle,
  bookAuthor,
  bookFormat = BookFormat.EPUB,
  pageLayoutMode = 'separated',
  highlights,
  showChapterHeader = true,
  onHighlightClick,
  onHighlightContextMenu,
}: ReaderPageItemProps) {
  const Renderer = PAGE_RENDERERS[bookFormat] ?? ReaderPageEpub;
  const isPdf = bookFormat === BookFormat.PDF;

  return (
    <article
      data-page-number={page.pageNumber}
      className={getReaderPageArticleClass(isPdf, pageLayoutMode)}
    >
      <Renderer
        page={page}
        totalPages={totalPages}
        bookHash={bookHash}
        bookTitle={bookTitle}
        bookAuthor={bookAuthor}
        pageLayoutMode={pageLayoutMode}
        highlights={highlights}
        showChapterHeader={showChapterHeader}
        onHighlightClick={onHighlightClick}
        onHighlightContextMenu={onHighlightContextMenu}
      />
    </article>
  );
});
