/**
 * The find bar's place in the render a hymn page is pushed, before the page
 * says it shows (`pageAwaited`): over the resting bar on a hymn page, so the
 * bar never leaves on its way up and glides from where it stood.
 */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import { isHymnPage } from '~/home/opening';

import { FindAt, pageAwaited } from './bar';
import { Player } from './player';

const track = { number: 8, title: 'Stand-in' };
const places: ReadonlyArray<FindAt> = [
  FindAt.Nowhere(),
  FindAt.Docked(),
  FindAt.Yielded(),
  FindAt.OverBar({ state: Player.Idle() }),
  FindAt.OverBar({ state: Player.Playing({ track, at: 1, length: Option.some(100) }) }),
];

describe('the find bar on a hymn page not yet shown', () => {
  it('stands over the resting bar where it would stand nowhere, and else where findAt puts it', () => {
    expect(places.map((at) => pageAwaited(at, true))).toEqual([
      FindAt.OverBar({ state: Player.Idle() }),
      ...places.slice(1),
    ]);
    expect(places.map((at) => pageAwaited(at, false))).toEqual([...places]);
  });

  it('reads a hymn page from its path alone', () => {
    expect(
      ['/hymns/6', '/hymns/6/', '/base/hymns/12?x=1', '/', '/settings', '/hymns'].map(isHymnPage),
    ).toEqual([true, true, true, false, false, false]);
  });
});
