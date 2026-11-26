import { computeRemainingDelay } from '@hooks/useTransitionOverlay';
import { describe, expect, it } from 'vitest';

describe('useTransitionOverlay helpers', () => {
  describe('computeRemainingDelay', () => {
    it('returns 0 when minDisplayMs is 0 or negative', () => {
      expect(computeRemainingDelay(1000, 0, 1050)).toBe(0);
      expect(computeRemainingDelay(1000, -100, 1050)).toBe(0);
    });

    it('returns 0 when mountedAt is not initialized', () => {
      expect(computeRemainingDelay(0, 200, 1050)).toBe(0);
    });

    it('calculates remaining time accurately', () => {
      // Mounted at 1000, min 300, now 1100 -> elapsed 100 -> remaining 200
      expect(computeRemainingDelay(1000, 300, 1100)).toBe(200);

      // Elapsed matches or exceeds minDisplayMs -> 0
      expect(computeRemainingDelay(1000, 300, 1300)).toBe(0);
      expect(computeRemainingDelay(1000, 300, 1500)).toBe(0);
    });
  });
});
