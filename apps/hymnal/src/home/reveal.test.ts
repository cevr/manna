import { describe, expect, it } from 'bun:test';

import { hidden, jumped, type Reveal, revealAt, shownHeight, travel } from './reveal';

/** The list's own tab row meets the list's top 49 pt down, under the title, at the reader's usual text size. */
const rest = 49;

/** The row's state after the list passes through each offset in turn, from its opening. */
const through = (offsets: ReadonlyArray<number>, start: Reveal = hidden(rest)) =>
  offsets.reduce((state, scroll) => revealAt(state, scroll, rest), start);

/** Offsets from `from` to `to` in steps of `step` points, as frames of a scroll report them. */
const frames = (from: number, to: number, step: number) => {
  const out: Array<number> = [];
  const sign = Math.sign(to - from);
  for (let at = from; sign * (to - at) > 0; at += sign * step) out.push(at);
  out.push(to);
  return out;
};

describe('the tab row pinned over the home list', () => {
  it('stays hidden while the reader scrolls down into the list', () => {
    expect(through(frames(rest, 3000, 13)).shown).toBe(false);
  });

  it('comes in on an upward scroll of the travel, and not before', () => {
    const deep = through(frames(rest, 3000, 13));
    expect(through([3000 - travel + 0.5], deep).shown).toBe(false);
    expect(through([3000 - travel], deep).shown).toBe(true);
  });

  it('goes away on a downward scroll of the travel once shown, and not before', () => {
    const shown = through([3000, 2990]);
    expect(shown.shown).toBe(true);
    // A glide on up moves the run's start with it.
    const higher = through(frames(2990, 2500, 7), shown);
    expect(through([2500 + travel - 0.5], higher).shown).toBe(true);
    expect(through([2500 + travel], higher).shown).toBe(false);
  });

  it('counts the run from where the scroll turned, so a reverse just short of the travel turns nothing', () => {
    // Up 7, down 7, up 7: no run of 8 either way.
    expect(through([3000, 2993, 3000, 2993]).shown).toBe(false);
    // Up 7 then up 1 more is a run of 8.
    expect(through([3000, 2993, 2992]).shown).toBe(true);
  });

  it('turns on one large frame of a fast fling', () => {
    expect(through([3000, 1200]).shown).toBe(true);
    expect(through([3000, 1200, 2600]).shown).toBe(false);
  });

  it('is hidden at and above the resting place, and through a pull past the top', () => {
    const shown = through([3000, 2900]);
    expect(through([rest], shown)).toEqual({ shown: false, from: rest });
    expect(through([-40], shown)).toEqual({ shown: false, from: -40 });
    // Back down from the top, the run starts afresh: no row without an upward scroll.
    expect(through(frames(-40, 600, 11), shown).shown).toBe(false);
  });
});

describe('a jump the app makes', () => {
  it('turns nothing, and counts the next run from where it landed', () => {
    const shown = through([3000, 2900]);
    expect(jumped(shown, 5000, rest)).toEqual({ shown: true, from: 5000 });
    expect(jumped(hidden(rest), 400, rest)).toEqual({ shown: false, from: 400 });
    // The reader's scroll on from the landing turns it as from any offset.
    expect(through([5000 + travel], jumped(shown, 5000, rest)).shown).toBe(false);
  });

  it('hides the row when it lands at or above the resting place', () => {
    expect(jumped(through([3000, 2900]), rest, rest).shown).toBe(false);
  });
});

describe('how much of the list’s top the pinned row covers', () => {
  const height = 48;

  it('deep in the list, the slide’s share of the row', () => {
    expect([0, 0.5, 1].map((p) => shownHeight(p, height, 3000, rest))).toEqual([0, 24, 48]);
  });

  it('near the resting place, never less than the list’s own row, which it meets as one', () => {
    // 20 pt past rest the list's own row ends 28 pt down: a row sliding in or away stands there.
    expect([0.1, 0.5, 1].map((p) => shownHeight(p, height, rest + 20, rest))).toEqual([28, 28, 48]);
  });

  it('is 0 while hidden and at or above the resting place', () => {
    expect(shownHeight(0, height, rest + 20, rest)).toBe(0);
    expect([rest, rest - 30, -40].map((s) => shownHeight(1, height, s, rest))).toEqual([0, 0, 0]);
  });
});
