import { usePdfPageRenderer } from '@hooks/usePdfPageRenderer';
import { memo } from 'react';
import { ParagraphMarginNotes } from './ParagraphMarginNotes';
import { PdfHighlightLayer } from './PdfHighlightLayer';
import type { ReaderPageRendererProps } from './ReaderPageEpub';

export type ReaderPagePdfProps = Pick<
  ReaderPageRendererProps,
  'page' | 'highlights' | 'onHighlightClick' | 'onHighlightContextMenu'
>;

export const ReaderPagePdf = memo(function ReaderPagePdf({
  page,
  highlights,
  onHighlightClick,
  onHighlightContextMenu,
}: ReaderPagePdfProps) {
  const { pageNumber } = page;
  const { containerRef, canvasRef, textLayerRef, pageNotes, isNearViewport } = usePdfPageRenderer({
    pageNumber,
    highlights,
  });

  return (
    <div
      ref={containerRef}
      data-testid={`reader-page-pdf-${pageNumber}`}
      className="relative w-full overflow-hidden bg-surface select-text min-h-75"
      style={{ aspectRatio: '1 / 1.414' }}
    >
      {/* 1. Underlying rendered PDF Canvas */}
      <canvas
        ref={canvasRef}
        data-testid={`pdf-canvas-${pageNumber}`}
        className="w-full h-auto block"
      />

      {/* 2. Middle transparent PDF.js text layer for pixel-accurate text selection */}
      <div
        ref={textLayerRef}
        data-testid={`pdf-text-layer-${pageNumber}`}
        className="textLayer absolute inset-0 select-text pointer-events-auto"
      />

      {/* 3. Top AABB Highlight Layer */}
      {isNearViewport && (
        <PdfHighlightLayer
          pageNumber={pageNumber}
          highlights={highlights}
          onHighlightClick={onHighlightClick}
          onHighlightContextMenu={onHighlightContextMenu}
        />
      )}

      {/* 4. Margin Notes if present on this page */}
      <ParagraphMarginNotes notes={pageNotes} onNoteClick={onHighlightClick} />
    </div>
  );
});
