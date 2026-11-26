import { Card } from '@ui';
import { memo } from 'react';

export interface BackupListSkeletonProps {
  readonly rows?: number;
}

const DEFAULT_SKELETON_ROWS = 1;

export const BackupListSkeleton = memo(function BackupListSkeleton({
  rows = DEFAULT_SKELETON_ROWS,
}: BackupListSkeletonProps) {
  return (
    <div
      role="status"
      aria-label="Loading backups"
      data-testid="backup-list-skeleton"
      className="flex flex-col gap-2"
    >
      {Array.from({ length: rows }, (_, idx) => (
        <Card
          key={`backup-skeleton-${idx + 1}`}
          variant="subtle"
          padding="sm"
          rounded="lg"
          className="animate-pulse"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="h-3.5 w-32 rounded bg-surface-hover" />
                <div className="h-4 w-12 rounded-full bg-surface-hover/80" />
                <div className="h-4 w-14 rounded-full bg-surface-hover/80" />
              </div>
              <div className="h-3 w-44 rounded bg-surface-hover/70" />
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <div className="h-6 w-16 rounded-md bg-surface-hover/80" />
              <div className="h-6 w-14 rounded-md bg-surface-hover/80" />
              <div className="h-6 w-14 rounded-md bg-surface-hover/80" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
});
