import { describe, expect, it } from 'bun:test';

import { hidden, reachable, type Reveal, revealAt, shownHeight, travel } from './reveal';

/** The list resting with its field 52 pt down, as the home list does at the reader's usual text size. */
const rest = 52;

/** The field's state after the list passes through each offset in turn, from its opening. */
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

describe('the search field over the home list', () => {
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
    // Back down from the top, the run starts afresh: no field without an upward scroll.
    expect(through(frames(-40, 600, 11), shown).shown).toBe(false);
  });
});

describe('how much of the field shows', () => {
  const height = 52;

  it('is the slide’s share of the field', () => {
    expect([0, 0.5, 1].map((p) => shownHeight(p, height, 3000, rest))).toEqual([0, 26, 52]);
  });

  it('never exceeds how far the list is past its resting place, reaching 0 there', () => {
    expect(
      [rest + 60, rest + 20, rest, rest - 30].map((s) => shownHeight(1, height, s, rest)),
    ).toEqual([52, 20, 0, 0]);
  });
});

describe('when the shown field takes a touch', () => {
  /** The home list's title (49 pt) and the field's margin (8 pt) at the reader's usual text size. */
  const title = 49;
  const margin = 8;
  const at = (cover: number, scroll: number) => reachable(cover, scroll, rest, title, margin);

  it('never while the field is off screen', () => {
    expect(at(0, 3000)).toBe(false);
  });

  it('deep in the list, once any of its box shows', () => {
    expect([52, 9, 8].map((cover) => at(cover, 3000))).toEqual([true, true, false]);
  });

  it('not near the top, where the title covers the whole field', () => {
    // 20 pt past rest: the field shows 20 pt, its box ends at 12, the title's bottom is at 29.
    expect(at(20, rest + 20)).toBe(false);
    expect(at(28, rest + 28)).toBe(false);
  });

  it('as the box comes out from under the title', () => {
    // 29 pt past rest the box ends at 21, the title at 20.
    expect(at(29, rest + 29)).toBe(true);
    expect(at(52, rest + 52)).toBe(true);
  });
});
