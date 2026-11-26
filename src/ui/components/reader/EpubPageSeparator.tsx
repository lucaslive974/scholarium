import { memo } from 'react';

export interface EpubPageSeparatorProps {
  readonly pageNumber: number;
}

export const EpubPageSeparator = memo(function EpubPageSeparator({
  pageNumber,
}: EpubPageSeparatorProps) {
  return (
    <div
      role="separator"
      data-testid={`epub-page-separator-${pageNumber}`}
      className="mt-auto pt-8 flex items-center gap-4 select-none pointer-events-none"
    >
      <div className="h-px flex-1 bg-line-subtle" />
      <span className="font-mono text-[0.65rem] tracking-wider uppercase text-tx-muted">
        Page {pageNumber}
      </span>
      <div className="h-px flex-1 bg-line-subtle" />
    </div>
  );
});
