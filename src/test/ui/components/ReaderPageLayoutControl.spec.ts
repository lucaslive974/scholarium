import { ReaderPageLayoutControl } from '@components/reader/ReaderPageLayoutControl';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

describe('ReaderPageLayoutControl', () => {
  it('renders Continuous as active when pageLayoutMode is continuous', () => {
    const markup = renderToStaticMarkup(
      React.createElement(ReaderPageLayoutControl, {
        pageLayoutMode: 'continuous',
        onSelectPageLayoutMode: vi.fn(),
      })
    );

    expect(markup).toContain('Page Layout');
    expect(markup).toContain('Continuous');
    expect(markup).toContain('Separated');
    expect(markup).toMatch(/aria-pressed="true"[^>]*>Continuous</);
    expect(markup).toMatch(/aria-pressed="false"[^>]*>Separated</);
  });

  it('renders Separated as active when pageLayoutMode is separated', () => {
    const markup = renderToStaticMarkup(
      React.createElement(ReaderPageLayoutControl, {
        pageLayoutMode: 'separated',
        onSelectPageLayoutMode: vi.fn(),
      })
    );

    expect(markup).toMatch(/aria-pressed="false"[^>]*>Continuous</);
    expect(markup).toMatch(/aria-pressed="true"[^>]*>Separated</);
  });
});
