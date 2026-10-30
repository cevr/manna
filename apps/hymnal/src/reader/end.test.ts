import { describe, expect, it } from 'bun:test';

import { endSpace, listEndSpace } from './end';

describe('the list end space', () => {
  it.each([0, 21, 34])('keeps at least 24 pt over a bottom inset of %d pt', (bottom) => {
    expect(endSpace(bottom)).toBeGreaterThanOrEqual(bottom + 24);
  });

  it('grows with the inset, point for point', () => {
    expect(endSpace(34) - endSpace(0)).toBe(34);
  });

  it('clears the bar’s `#` where it stands higher than the inset', () => {
    // The idle `#` docked on the home list, over a 34 pt inset: 34 + 6 + 44.
    expect(listEndSpace(34, 84)).toBe(endSpace(84));
    expect(listEndSpace(34, 0)).toBe(endSpace(34));
    expect(listEndSpace(0, 52)).toBe(endSpace(52));
  });
});
