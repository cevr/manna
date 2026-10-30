import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';
import * as Atom from 'effect/reactivity/Atom';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';

import { Player } from '~/player/player';

import { playingNumber } from './playing';

const length = Option.some(120);
const track = (number: number) => ({ number, title: '' });

describe('the playing hymn’s number', () => {
  it('is 0 while idle, then the held hymn’s number', () => {
    const registry = AtomRegistry.make();
    const state = Atom.make<Player>(Player.Idle());
    expect(registry.get(playingNumber(state))).toBe(0);
    registry.set(state, Player.Playing({ track: track(12), at: 0, length }));
    expect(registry.get(playingNumber(state))).toBe(12);
  });

  it('tells its readers nothing on a tick of the same hymn, and tells them when the hymn changes', () => {
    const registry = AtomRegistry.make();
    const state = Atom.make<Player>(Player.Playing({ track: track(12), at: 0, length }));
    const seen: Array<number> = [];
    const stop = registry.subscribe(playingNumber(state), (number) => seen.push(number), {
      immediate: true,
    });
    registry.set(state, Player.Playing({ track: track(12), at: 0.25, length }));
    registry.set(state, Player.Playing({ track: track(12), at: 0.5, length }));
    registry.set(state, Player.Playing({ track: track(40), at: 0, length }));
    stop();
    expect(seen).toEqual([12, 40]);
  });

  it('is one atom for one player', () => {
    const state = Atom.make<Player>(Player.Idle());
    expect(playingNumber(state)).toBe(playingNumber(state));
  });
});
