import type { Highlight } from '@domain/Highlight';
import type { DocumentPage } from '@ports/IReaderService';
import {
  FONT_FAMILY_DEFINITIONS,
  type PageLayoutMode,
  useTypographyStore,
} from '@stores/useTypographyStore';
import { memo } from 'react';
import { EpubPageSeparator } from './EpubPageSeparator';
import { ReaderPageCover } from './ReaderPageCover';
import { ReaderPageHeader } from './ReaderPageHeader';
import { ReaderPageParagraphs } from './ReaderPageParagraphs';

export interface ReaderPageRendererProps {
  readonly page: DocumentPage;
  readonly totalPages: number;
  readonly bookHash?: string;
  readonly bookTitle: string;
  readonly bookAuthor?: string;
  readonly pageLayoutMode: PageLayoutMode;
  readonly highlights: readonly Highlight[];
  readonly showChapterHeader: boolean;
  readonly onHighlightClick: (highlight: Highlight, coords: { x: number; y: number }) => void;
  readonly onHighlightContextMenu: (e: React.MouseEvent, text: string, pageNumber: number) => void;
}

export const ReaderPageEpub = memo(function ReaderPageEpub({
  page,
  totalPages,
  bookHash,
  bookTitle,
  bookAuthor,
  pageLayoutMode,
  highlights,
  showChapterHeader,
  onHighlightClick,
  onHighlightContextMenu,
}: ReaderPageRendererProps) {
  const fontSize = useTypographyStore((s) => s.fontSize);
  const fontFamily = useTypographyStore((s) => s.fontFamily);
  const lineSpacing = useTypographyStore((s) => s.lineSpacing);

  const def = FONT_FAMILY_DEFINITIONS[fontFamily];
  const showPageSeparator = pageLayoutMode === 'separated' && page.pageNumber < totalPages;

  return (
    <>
      {page.pageNumber === 1 && (
        <ReaderPageCover bookHash={bookHash} bookTitle={bookTitle} bookAuthor={bookAuthor} />
      )}

      {showChapterHeader && (
        <ReaderPageHeader
          chapterTitle={page.chapterTitle}
          bookAuthor={bookAuthor}
          pageNumber={page.pageNumber}
          totalPages={totalPages}
          cssFontFamily={def.cssFontFamily}
        />
      )}

      <ReaderPageParagraphs
        pageNumber={page.pageNumber}
        paragraphs={page.paragraphs}
        highlights={highlights}
        cssFontFamily={def.cssFontFamily}
        fontSize={fontSize}
        lineSpacing={lineSpacing}
        onHighlightClick={onHighlightClick}
        onHighlightContextMenu={onHighlightContextMenu}
      />

      {showPageSeparator && <EpubPageSeparator pageNumber={page.pageNumber} />}
    </>
  );
});
