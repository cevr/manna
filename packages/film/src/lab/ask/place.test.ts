// The place the ask page's URL keeps: an ask or a page of asks read back as
// it was written, each keeping a still open full size.

import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import { pageMove } from '../../core/api.ts';
import { AskPlace, askPlaceOf, stillIn, withStill } from './place.ts';

describe('the place in the URL', () => {
  test('an ask and a page of asks read back as written; any other path is none', () => {
    expect(askPlaceOf('/asks/a0123456780')).toEqual(
      Option.some(AskPlace.Ask({ ask: 'a0123456780' })),
    );
    expect(askPlaceOf('/asks/page/a1')).toEqual(Option.some(AskPlace.AskPage({ page: 'a1' })));
    expect(askPlaceOf('/films/f/export')).toEqual(Option.none());
  });

  test("an ask keeps its Board's still open full size, the ask's place unchanged, its opening a step Back closes", () => {
    const ask = Option.getOrThrow(withStill('/asks/a0123456780', 'board-open.breath'));
    expect(ask).toBe('/asks/a0123456780?still=board-open.breath');
    expect(stillIn(ask)).toEqual(Option.some('board-open.breath'));
    expect(askPlaceOf(ask)).toEqual(askPlaceOf('/asks/a0123456780'));
    expect(withStill(ask, '')).toEqual(Option.some('/asks/a0123456780'));
    expect(pageMove('/asks/a0123456780', ask)).toBe('push');
    const page = Option.getOrThrow(withStill('/asks/page/a1', 'x'));
    expect(stillIn(page)).toEqual(Option.some('x'));
    // Only a page that shows a Zoom keeps one.
    expect(withStill('/films/f/export', 'x')).toEqual(Option.none());
    expect(stillIn('/films/f/export?still=x')).toEqual(Option.none());
  });
});
