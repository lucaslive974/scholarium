import type { BackupReport } from '@ports/IBackupService';

export function formatBackupSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

export function formatBackupReportSummary(prefix: string, report: BackupReport): string {
  const bookLabel = report.booksCount === 1 ? 'book' : 'books';
  const coverLabel = report.coversCount === 1 ? 'cover' : 'covers';
  return `${prefix}: ${report.booksCount} ${bookLabel}, ${report.coversCount} ${coverLabel} (${formatBackupSize(report.totalBytes)})`;
}

const PLATFORM_DISPLAY_NAMES: Record<string, string> = {
  linux: 'Linux',
  windows: 'Windows',
  android: 'Android',
  ios: 'iOS',
};

export function formatBackupPlatform(platform: string): string {
  const key = platform.trim().toLowerCase();
  return PLATFORM_DISPLAY_NAMES[key] ?? (key ? key[0].toUpperCase() + key.slice(1) : 'Unknown');
}

export function formatBackupDeviceLabel(deviceLabel: string): string {
  const cleaned = deviceLabel.trim().replace(/_/g, ' ');
  if (!cleaned) return 'Unknown Device';
  return cleaned
    .split(/\s+/)
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : ''))
    .join(' ');
}
