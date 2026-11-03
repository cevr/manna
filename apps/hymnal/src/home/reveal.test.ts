import { describe, expect, it } from 'bun:test';

import {
  hidden,
  inReach,
  jumped,
  type Reveal,
  revealAt,
  shownHeight,
  touched,
  travel,
} from './reveal';

const rest = 49;

const through = (offsets: ReadonlyArray<number>, start: Reveal = hidden(rest)) =>
  offsets.reduce((state, scroll) => revealAt(state, scroll, rest), start);

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
    const higher = through(frames(2990, 2500, 7), shown);
    expect(through([2500 + travel - 0.5], higher).shown).toBe(true);
    expect(through([2500 + travel], higher).shown).toBe(false);
  });

  it('counts the run from where the scroll turned, so a reverse just short of the travel turns nothing', () => {
    expect(through([3000, 2993, 3000, 2993]).shown).toBe(false);
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
    expect(through(frames(-40, 600, 11), shown).shown).toBe(false);
  });
});

describe('a jump the app makes', () => {
  const landed = (start: Reveal, at: number, reports: ReadonlyArray<number>) => {
    const held = through([at, ...reports], jumped(start, at));
    return touched(held, reports.at(-1) ?? at, rest);
  };

  it('turns nothing, and holds the row through the list’s reports until the reader touches it', () => {
    const shown = through([3000, 2900]);
    expect(through([0, 20, 900, 5000], jumped(shown, 5000))).toEqual({
      shown: true,
      from: 5000,
      held: true,
    });
    expect(landed(shown, 5000, [0, 20, 900, 5000])).toEqual({ shown: true, from: 5000 });
    expect(landed(hidden(rest), 400, [0, 400])).toEqual({ shown: false, from: 400 });
  });

  it('after the touch, the reader’s scroll turns it as from any offset', () => {
    const shown = landed(through([3000, 2900]), 5000, [0, 5000]);
    expect(through([5000 + travel - 0.5], shown).shown).toBe(true);
    expect(through([5000 + travel], shown).shown).toBe(false);
    const hiddenThere = landed(hidden(rest), 5000, [0, 5000]);
    expect(through([5000 - travel], hiddenThere).shown).toBe(true);
  });

  it('keeps a held row out of reach at or above the resting place, and hides it there at the touch', () => {
    const held = through([0, rest], jumped(through([3000, 2900]), rest));
    expect(inReach(held, rest, rest)).toBe(false);
    expect(inReach(through([rest + 1], held), rest + 1, rest)).toBe(true);
    expect(touched(held, rest, rest)).toEqual({ shown: false, from: rest });
  });

  it('a touch outside a hold changes nothing', () => {
    const shown = through([3000, 2900]);
    expect(touched(shown, 2950, rest)).toBe(shown);
  });
});

describe('how much of the list’s top the pinned row covers', () => {
  const height = 48;

  it('deep in the list, the slide’s share of the row', () => {
    expect([0, 0.5, 1].map((p) => shownHeight(p, height, 3000, rest))).toEqual([0, 24, 48]);
  });

  it('near the resting place, never less than the list’s own row, which it meets as one', () => {
    expect([0.1, 0.5, 1].map((p) => shownHeight(p, height, rest + 20, rest))).toEqual([28, 28, 48]);
  });

  it('is 0 while hidden and at or above the resting place', () => {
    expect(shownHeight(0, height, rest + 20, rest)).toBe(0);
    expect([rest, rest - 30, -40].map((s) => shownHeight(1, height, s, rest))).toEqual([0, 0, 0]);
  });
});
