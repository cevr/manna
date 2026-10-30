import { describe, expect, it } from 'bun:test';

import { Option } from 'effect';

import { pinnedAt, topicStart, topicStarts } from './pin';
import { rowsOf } from './rows';

const hymn = (number: number, topic: string) => ({ number, topic });

// Two topics of two hymns, then one of one: topic rows 36 tall, hymn rows 44, under a 100 pt header.
const { rows } = rowsOf([hymn(1, 'a'), hymn(2, 'a'), hymn(3, 'b'), hymn(4, 'b'), hymn(5, 'c')]);
const size = (kind: 'topic' | 'shelf' | 'hymn') => ({ topic: 36, shelf: 36, hymn: 44 })[kind];
const starts = topicStarts(rows, 100, size);

describe('the pinned topic row', () => {
  it('places each topic row below the header and every row above it', () => {
    expect(starts).toEqual([100, 100 + 36 + 88, 100 + 2 * (36 + 88)]);
  });

  it('pins nothing while the first topic is below the list top', () => {
    expect(pinnedAt(starts, 0, 36).index).toBe(-1);
    expect(pinnedAt(starts, 99.5, 36).index).toBe(-1);
  });

  it('rests the topic whose rows pass under the list top at the top', () => {
    expect(pinnedAt(starts, 100, 36)).toEqual({ index: 0, y: 0 });
    expect(pinnedAt(starts, 150, 36)).toEqual({ index: 0, y: 0 });
    expect(pinnedAt(starts, 224, 36)).toEqual({ index: 1, y: 0 });
  });

  it('lets the next topic push the pinned row up by as much as it overlaps', () => {
    // The next topic's top is 10 pt below the list top: the pinned row sits 26 pt up.
    expect(pinnedAt(starts, 214, 36)).toEqual({ index: 0, y: -26 });
    // Exactly one row below the top: no push yet.
    expect(pinnedAt(starts, 188, 36)).toEqual({ index: 0, y: 0 });
  });

  it('never pushes the last topic', () => {
    expect(pinnedAt(starts, 10_000, 36)).toEqual({ index: 2, y: 0 });
  });

  it('finds the offset that rests a topic named by its name at the top', () => {
    const at = Option.getOrElse(topicStart(rows, 100, size, 'b'), () => Number.NaN);
    expect(at).toBe(100 + 36 + 88);
    expect(pinnedAt(starts, at, 36)).toEqual({ index: 1, y: 0 });
  });

  it('finds no offset for a name no topic row has', () => {
    expect(topicStart(rows, 100, size, 'd')).toEqual(Option.none());
  });
});

describe('the pinned topic row under a layer over the list’s top', () => {
  // A 52 pt field over the list's top: the pin's line is 52 pt down.
  const cover = 52;

  it('pins the topic whose row has reached the layer’s bottom, not the list’s top', () => {
    // The second topic's row (at 224) is 52 pt below the top at 172: it takes the pin there.
    expect(pinnedAt(starts, 171.5, 36, cover).index).toBe(0);
    expect(pinnedAt(starts, 172, 36, cover)).toEqual({ index: 1, y: 0 });
    // The first topic pins once its row meets the layer, 52 pt before it meets the top.
    expect(pinnedAt(starts, 47.5, 36, cover).index).toBe(-1);
    expect(pinnedAt(starts, 48, 36, cover)).toEqual({ index: 0, y: 0 });
  });

  it('lets the next topic push the pinned row up from the layer’s bottom', () => {
    // The next topic's top is 10 pt below the pin's line: the row sits 26 pt up.
    expect(pinnedAt(starts, 162, 36, cover)).toEqual({ index: 0, y: -26 });
  });

  it('is the uncovered pin at a cover of 0', () => {
    for (const scroll of [0, 99.5, 100, 150, 188, 214, 224, 10_000])
      expect(pinnedAt(starts, scroll, 36, 0)).toEqual(pinnedAt(starts, scroll, 36));
  });

  it('holds still through a frame where the cover moves as the list does: the next row meets it at the same place', () => {
    // A field sliding in by 6 pt as the list scrolls up 6 pt: the pin's line
    // stays on the same content point, so the topic and its push are unchanged.
    // At the push, 4 pt above the next topic's row: the row sits 32 pt up both times.
    expect(pinnedAt(starts, 200, 36, 20)).toEqual({ index: 0, y: -32 });
    expect(pinnedAt(starts, 194, 36, 26)).toEqual({ index: 0, y: -32 });
  });
});

describe('a shelf above the topics', () => {
  it('is no pinned row: the first topic starts below its header and its hymns, and nothing pins until it reaches the top', () => {
    const shelved = rowsOf(
      [hymn(1, 'a'), hymn(2, 'b')],
      [{ name: 'Recent', hymns: [hymn(2, 'b'), hymn(1, 'a')], href: '/recent' }],
    );
    const at = topicStarts(shelved.rows, 100, size);
    expect(at).toEqual([100 + 36 + 88, 100 + 36 + 88 + 36 + 44]);
    expect(pinnedAt(at, 150, 36).index).toBe(-1);
    expect(pinnedAt(at, 224, 36)).toEqual({ index: 0, y: 0 });
  });
});
