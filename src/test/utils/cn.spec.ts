import { cn } from '@utils/cn';
import { describe, expect, it } from 'vitest';

describe('cn', () => {
  it('merges conditional and falsy class values cleanly', () => {
    expect(cn('flex-1', false && 'hidden', undefined, null, 'min-h-0')).toBe('flex-1 min-h-0');
  });

  it('resolves conflicting Tailwind utility classes keeping the last one', () => {
    expect(cn('py-4 px-2', 'py-12 px-4')).toBe('py-12 px-4');
    expect(cn('bg-surface text-tx-secondary', 'text-tx-main')).toBe('bg-surface text-tx-main');
  });

  it('supports object and array class syntax from clsx', () => {
    expect(cn(['flex', 'flex-col'], { 'gap-6': true, 'gap-12': false })).toBe(
      'flex flex-col gap-6'
    );
  });
});
