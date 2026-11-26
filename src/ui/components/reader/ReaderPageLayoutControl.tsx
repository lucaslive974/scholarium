import type { PageLayoutMode } from '@stores/useTypographyStore';
import { memo } from 'react';

export interface ReaderPageLayoutControlProps {
  readonly pageLayoutMode: PageLayoutMode;
  readonly onSelectPageLayoutMode: (mode: PageLayoutMode) => void;
}

const LAYOUT_OPTIONS: readonly { readonly id: PageLayoutMode; readonly label: string }[] = [
  { id: 'continuous', label: 'Continuous' },
  { id: 'separated', label: 'Separated' },
];

export const ReaderPageLayoutControl = memo(function ReaderPageLayoutControl({
  pageLayoutMode,
  onSelectPageLayoutMode,
}: ReaderPageLayoutControlProps) {
  return (
    <div className="flex flex-col gap-1.5 pt-1">
      <span className="text-[0.65rem] uppercase tracking-wider font-medium text-tx-muted">
        Page Layout
      </span>
      <div className="flex items-center gap-1 rounded-lg bg-surface-subtle/80 p-1 border border-line-subtle/70">
        {LAYOUT_OPTIONS.map((option) => {
          const isSelected = pageLayoutMode === option.id;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={isSelected}
              className={`flex-1 text-center py-1 rounded-md text-xs transition cursor-pointer select-none ${
                isSelected
                  ? 'bg-surface text-tx-main shadow-2xs font-semibold border border-line-subtle/80'
                  : 'text-tx-secondary hover:text-tx-main hover:bg-surface/60 border border-transparent'
              }`}
              onClick={() => onSelectPageLayoutMode(option.id)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
});
