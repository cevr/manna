/**
 * The find bar's place in the render a hymn page is pushed, before the page
 * says it shows (`findPlace`): over the resting bar on a page the book holds,
 * so the bar never leaves on its way up and glides from where it stood; and
 * nowhere on a number the book does not hold, whose route draws no bar.
 */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import { isHymnPage } from '~/home/opening';

import { FindAt, findPlace } from './bar';
import { Player } from './player';

const track = { number: 8, title: 'Stand-in' };
const playing = Player.Playing({ track, at: 1, length: Option.some(100) });
/** The book's hymns as the hymn route reads a number: 1 to 695, written without leading zeros. */
const holds = (segment: string) => /^[1-9]\d*$/.test(segment) && Number(segment) <= 695;
/** Where the `#` stands on `path`, with no page yet saying it shows and no control raised. */
const placeOn = (path: string, state: Player) =>
  findPlace({ path, holds, shown: Option.none(), state, raised: false });

describe('the find bar on a hymn page not yet shown', () => {
  it('stands over the resting bar on a hymn the book holds, and over the sounding bar while one sounds', () => {
    expect(
      ['/hymns/8', '/hymns/8/', '/base/hymns/12?x=1'].map((path) => placeOn(path, Player.Idle())),
    ).toEqual([
      FindAt.OverBar({ state: Player.Idle() }),
      FindAt.OverBar({ state: Player.Idle() }),
      FindAt.OverBar({ state: Player.Idle() }),
    ]);
    expect(placeOn('/hymns/8', playing)).toEqual(FindAt.OverBar({ state: playing }));
  });

  it('stands nowhere on a number the book does not hold, as its route draws no bar', () => {
    expect(
      ['/hymns/0', '/hymns/696', '/hymns/9999', '/hymns/abc', '/hymns/007'].map(
        (path) => placeOn(path, Player.Idle())._tag,
      ),
    ).toEqual(['Nowhere', 'Nowhere', 'Nowhere', 'Nowhere', 'Nowhere']);
    expect(placeOn('/hymns/9999', playing)).toEqual(FindAt.OverBar({ state: playing }));
  });

  it('reads a hymn page from its path alone', () => {
    expect(
      ['/hymns/6', '/hymns/6/', '/base/hymns/12?x=1', '/', '/settings', '/hymns'].map(isHymnPage),
    ).toEqual([true, true, true, false, false, false]);
  });
});
