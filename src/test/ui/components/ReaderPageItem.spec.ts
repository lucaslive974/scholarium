import { ReaderPageHeader } from '@components/reader/ReaderPageHeader';
import { ReaderPageItem } from '@components/reader/ReaderPageItem';
import { getReaderStreamContentClass } from '@components/reader/ReaderStream';
import { BookFormat } from '@domain/types';
import { ServiceContainerProvider } from '@providers/ServiceContainerContext';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

describe('ReaderPageHeader', () => {
  it('renders chapter title, author, and page number', () => {
    const markup = renderToStaticMarkup(
      React.createElement(ReaderPageHeader, {
        chapterTitle: 'Chapter 1: The Beginning',
        bookAuthor: 'Marcus Aurelius',
        pageNumber: 1,
        totalPages: 100,
        cssFontFamily: 'sans-serif',
      })
    );

    expect(markup).toContain('Chapter 1: The Beginning');
    expect(markup).toContain('Marcus Aurelius • Page 1 of 100');
  });

  it('renders without author prefix when author is not provided', () => {
    const markup = renderToStaticMarkup(
      React.createElement(ReaderPageHeader, {
        chapterTitle: 'Introduction',
        pageNumber: 5,
        totalPages: 50,
        cssFontFamily: 'serif',
      })
    );

    expect(markup).toContain('Introduction');
    expect(markup).toContain('Page 5 of 50');
    expect(markup).not.toContain('•');
  });
});

describe('ReaderPageItem running header and chapter header behavior', () => {
  const defaultPage = {
    pageNumber: 2,
    chapterTitle: 'Chapter 2: Motion',
    paragraphs: ['First paragraph of chapter 2.', 'Second paragraph.'],
    cfiBase: 'page-2',
  };

  const renderItem = (props: Partial<React.ComponentProps<typeof ReaderPageItem>> = {}) => {
    return renderToStaticMarkup(
      React.createElement(
        ServiceContainerProvider,
        null,
        React.createElement(ReaderPageItem, {
          page: defaultPage,
          totalPages: 10,
          bookTitle: 'Physics',
          bookAuthor: 'Aristotle',
          bookFormat: BookFormat.EPUB,
          highlights: [],
          showChapterHeader: true,
          onHighlightClick: vi.fn(),
          onHighlightContextMenu: vi.fn(),
          ...props,
        })
      )
    );
  };

  it('renders ReaderPageHeader when showChapterHeader is true for EPUB', () => {
    const markup = renderItem({ showChapterHeader: true });

    // Prominent chapter heading
    expect(markup).toContain('<h2');
    expect(markup).toContain('Chapter 2: Motion</h2>');
  });

  it('omits ReaderPageHeader when showChapterHeader is false for EPUB', () => {
    const markup = renderItem({ showChapterHeader: false });

    // Big chapter title is omitted to prevent repeated headings across continuing pages
    expect(markup).not.toContain('<h2');
    expect(markup).not.toContain('Chapter 2: Motion</h2>');
  });

  it('omits ReaderPageHeader completely for PDF format', () => {
    const markup = renderItem({
      bookFormat: BookFormat.PDF,
      showChapterHeader: true,
    });

    expect(markup).not.toContain('<h2');
    expect(markup).not.toContain('Chapter 2: Motion</h2>');
    expect(markup).toContain('data-testid="reader-page-pdf-2"');
  });

  it('omits visual page separator for EPUB in continuous layout mode', () => {
    const markup = renderItem({
      bookFormat: BookFormat.EPUB,
      pageLayoutMode: 'continuous',
    });

    expect(markup).not.toContain('role="separator"');
    expect(markup).not.toContain('data-testid="epub-page-separator-2"');
  });

  it('renders visual page separator indicator for EPUB in separated layout mode', () => {
    const markup = renderItem({
      bookFormat: BookFormat.EPUB,
      pageLayoutMode: 'separated',
    });

    expect(markup).toContain('role="separator"');
    expect(markup).toContain('data-testid="epub-page-separator-2"');
    expect(markup).toContain('Page 2');
  });

  it('omits visual page separator on the final EPUB page in separated layout mode', () => {
    const markup = renderItem({
      bookFormat: BookFormat.EPUB,
      page: { ...defaultPage, pageNumber: 10 },
      totalPages: 10,
      pageLayoutMode: 'separated',
    });

    expect(markup).not.toContain('role="separator"');
  });

  it('renders PDF page without individual sheet border and shadow in continuous mode', () => {
    const markup = renderItem({
      bookFormat: BookFormat.PDF,
      pageLayoutMode: 'continuous',
    });

    expect(markup).toContain('data-page-number="2"');
    expect(markup).not.toContain('shadow-md');
    expect(markup).not.toContain('border-line-subtle');
  });

  it('renders PDF page as an individual separated sheet in separated mode', () => {
    const markup = renderItem({
      bookFormat: BookFormat.PDF,
      pageLayoutMode: 'separated',
    });

    expect(markup).toContain('data-page-number="2"');
    expect(markup).toContain('shadow-md');
    expect(markup).toContain('border-line-subtle');
    expect(markup).toContain('rounded-md');
  });
});

describe('getReaderStreamContentClass', () => {
  it('returns continuous ribbon classes for PDF in continuous mode', () => {
    const cls = getReaderStreamContentClass(true, 'continuous');
    expect(cls).toContain('shadow-md');
    expect(cls).toContain('bg-surface');
    expect(cls).not.toContain('gap-6');
  });

  it('returns spaced container classes without outer ribbon for PDF in separated mode', () => {
    const cls = getReaderStreamContentClass(true, 'separated');
    expect(cls).toContain('gap-6');
    expect(cls).not.toContain('shadow-md');
    expect(cls).not.toContain('bg-surface');
  });

  it('returns seamless flow spacing for EPUB in continuous mode', () => {
    const cls = getReaderStreamContentClass(false, 'continuous');
    expect(cls).toContain('gap-6');
  });

  it('returns separated spacing for EPUB in separated mode', () => {
    const cls = getReaderStreamContentClass(false, 'separated');
    expect(cls).toContain('gap-12');
  });
});
