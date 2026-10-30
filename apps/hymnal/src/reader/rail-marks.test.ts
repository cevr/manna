import { describe, expect, it } from 'bun:test';

import {
  crossings,
  GUTTER,
  LABEL_LINE,
  LABEL_SCALE,
  LABEL_SIZE,
  labelAt,
  labelHeight,
  labelsOf,
  markAt,
  marksOf,
  railShift,
} from './rail-marks';
import { rowsOf } from './rows';

const hymn = (number: number, topic: string) => ({ number, topic });

// Recent holds hymn 4 above two topics of two hymns and one of one: topic and shelf rows 36 tall, hymn rows 44, under a 100 pt header.
const { rows } = rowsOf(
  [hymn(1, 'a'), hymn(2, 'a'), hymn(3, 'b'), hymn(4, 'b'), hymn(5, 'c')],
  [{ name: 'Recent', hymns: [hymn(4, 'b')], href: '/recent' }],
);
const size = (kind: 'topic' | 'shelf' | 'hymn') => ({ topic: 36, shelf: 36, hymn: 44 })[kind];
const marks = marksOf(rows, 100, size);

describe('the rail’s hymns', () => {
  it('holds each hymn of the topics in the list’s order, with its topic’s place, and leaves Recent off', () => {
    expect(marks.map((mark) => [mark.number, mark.section])).toEqual([
      [1, 0],
      [2, 0],
      [3, 1],
      [4, 1],
      [5, 2],
    ]);
  });

  it('shows a topic’s first hymn at its topic row, and each other hymn just under the pinned row', () => {
    // Recent's header and hymn take 80 pt, so the first topic row starts at 180.
    expect(marks.map((mark) => mark.offset)).toEqual([180, 180 + 44, 304, 304 + 44, 428]);
  });
});

describe('the band under the touch', () => {
  it('cuts the rail into one equal band per hymn', () => {
    expect(markAt(0, 500, 5)).toBe(0);
    expect(markAt(99, 500, 5)).toBe(0);
    expect(markAt(100, 500, 5)).toBe(1);
    expect(markAt(499, 500, 5)).toBe(4);
  });

  it('holds a touch past either end to the first or last band', () => {
    expect(markAt(-40, 500, 5)).toBe(0);
    expect(markAt(500, 500, 5)).toBe(4);
    expect(markAt(900, 500, 5)).toBe(4);
  });

  it('gives the first band before the rail has a height or a hymn', () => {
    expect(markAt(50, 0, 5)).toBe(0);
    expect(markAt(50, 500, 0)).toBe(0);
  });
});

describe('the ticks', () => {
  it('gives one tick per topic passed, either way, and none within a topic', () => {
    expect(crossings(0, 0)).toBe(0);
    expect(crossings(0, 1)).toBe(1);
    expect(crossings(2, 7)).toBe(5);
    expect(crossings(7, 2)).toBe(5);
  });
});

describe('the rail’s labels', () => {
  it('spreads its labels from the first hymn to the last', () => {
    expect(labelsOf(695, 6)).toEqual([0, 139, 278, 416, 555, 694]);
    expect(labelsOf(11, 3)).toEqual([0, 5, 10]);
  });

  it('labels every hymn of a list shorter than its labels, and none of an empty one', () => {
    expect(labelsOf(3, 6)).toEqual([0, 1, 2]);
    expect(labelsOf(0, 6)).toEqual([]);
  });
});

describe('the rail’s gutter', () => {
  it('is wide enough for a finger', () => {
    expect(GUTTER).toBeGreaterThanOrEqual(44);
  });
});

describe('the rail’s top', () => {
  it('rests at the header’s bottom', () => {
    expect(railShift(120, 0)).toBe(120);
  });

  it('moves down with the header while the list is pulled past its top', () => {
    expect(railShift(120, -60)).toBe(180);
  });

  it('moves up with the header as the list scrolls, and stops at the gutter’s top, where the header’s top rests', () => {
    expect(railShift(120, 50)).toBe(70);
    expect(railShift(120, 120)).toBe(0);
    expect(railShift(120, 900)).toBe(0);
  });
});

describe('a label’s place', () => {
  it('is its band’s middle, as a percent of the rail', () => {
    expect(labelAt(0, 4)).toBe(12.5);
    expect(labelAt(3, 4)).toBe(87.5);
    expect(labelAt(0, 1)).toBe(50);
  });

  it('is the rail’s top when the rail has no bands', () => {
    expect(labelAt(0, 0)).toBe(0);
  });
});

describe('a label’s box', () => {
  it('is its line at the default text size', () => {
    expect(labelHeight(1)).toBe(LABEL_LINE);
  });

  it('holds the whole scaled line at every larger text size up to the cap, so no digit is cut', () => {
    for (const scale of [0.82, 1, 1.118, 1.235, 1.353, 1.5, 1.79, 2]) {
      expect(labelHeight(scale)).toBeGreaterThanOrEqual(LABEL_LINE * scale);
    }
  });

  it('stops growing at the cap, where the label’s type stops growing too', () => {
    expect(labelHeight(3.12)).toBe(labelHeight(LABEL_SCALE));
    expect(labelHeight(LABEL_SCALE)).toBeGreaterThanOrEqual(LABEL_LINE * LABEL_SCALE);
  });

  it('fits three digits in the gutter at the cap', () => {
    // A tabular digit of the system face is under 0.62 em wide.
    expect(3 * 0.62 * LABEL_SIZE * LABEL_SCALE).toBeLessThanOrEqual(GUTTER);
  });
});
