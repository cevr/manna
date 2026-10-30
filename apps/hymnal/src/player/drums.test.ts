/**
 * The find drums' model: the digits a number is dialled by, the number held
 * to the book (1 to 695), each drum's turn, a fling over a wrapping drum,
 * and a drum's detent felt but not heard while the Sound switch is off.
 */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import type { Haptic, SoundName } from '~/feel/body';
import type { Cue } from '~/feel/cue';
import { feelOver } from '~/feel/feel';

import { DETENT, glide } from './dial';
import { digitOf, digitsOf, DRUMS, drumTell, FIRST, foundOffset, held, LAST, turn } from './drums';

describe('the digits', () => {
  it('reads each drum’s digit of a number', () => {
    expect(digitsOf(1)).toEqual({ hundreds: 0, tens: 0, ones: 1 });
    expect(digitsOf(74)).toEqual({ hundreds: 0, tens: 7, ones: 4 });
    expect(digitsOf(695)).toEqual({ hundreds: 6, tens: 9, ones: 5 });
    expect(digitOf(310, 'tens')).toBe(1);
  });

  it('reads the digits of the number held to the book', () => {
    expect(digitsOf(0)).toEqual(digitsOf(FIRST));
    expect(digitsOf(999)).toEqual(digitsOf(LAST));
  });
});

describe('held', () => {
  it('keeps a number in the book, a whole one', () => {
    expect(held(0)).toBe(1);
    expect(held(-5)).toBe(1);
    expect(held(696)).toBe(695);
    expect(held(NaN)).toBe(1);
    expect(held(Infinity)).toBe(1);
    expect(held(41.6)).toBe(42);
    expect(held(300)).toBe(300);
  });
});

describe('turn', () => {
  it('turns one drum’s digit and keeps the others', () => {
    expect(turn(123, 'ones', 7)).toBe(127);
    expect(turn(123, 'tens', 0)).toBe(103);
    expect(turn(123, 'hundreds', 5)).toBe(523);
  });

  it('wraps the ones and tens drums among their own, the other digits kept', () => {
    expect(turn(129, 'ones', 10)).toBe(120);
    expect(turn(120, 'ones', -1)).toBe(129);
    expect(turn(195, 'tens', 10)).toBe(105);
  });

  it('stops the hundreds drum at 0 and at 6', () => {
    expect(turn(123, 'hundreds', -1)).toBe(23);
    expect(turn(523, 'hundreds', 7)).toBe(623);
    expect(turn(623, 'hundreds', 9)).toBe(623);
  });

  it('holds a dialled number past the book to its ends', () => {
    expect(turn(689, 'tens', 9)).toBe(LAST);
    expect(turn(599, 'hundreds', 6)).toBe(LAST);
    expect(turn(10, 'tens', 0)).toBe(FIRST);
    expect(turn(100, 'hundreds', 0)).toBe(FIRST);
  });

  it('never dials a number outside the book, whatever the turn', () => {
    for (const drum of ['hundreds', 'tens', 'ones'] as const)
      for (let number = 0; number <= 700; number += 37)
        for (let n = -12; n <= 12; n += 1) {
          const dialled = turn(number, drum, n);
          expect(dialled >= FIRST && dialled <= LAST).toBe(true);
        }
  });
});

describe('the drums are dials', () => {
  it('flings the ones drum round past 9, as the key dial wraps', () => {
    const rest = glide(DRUMS.ones, 8 * DETENT, 1500);
    expect(rest.crossed.length).toBeGreaterThan(2);
    expect(rest.crossed).toContain(0);
    expect(rest.index).toBe(rest.crossed.at(-1) ?? -1);
    expect(rest.cues.every((cue) => cue._tag === 'detent' && cue.dial === 'ones')).toBe(true);
  });

  it('stops a fling of the hundreds drum at 6, with a wall', () => {
    const rest = glide(DRUMS.hundreds, 5 * DETENT, 3000);
    expect(rest.index).toBe(6);
    expect(rest.cues.at(-1)).toEqual({ _tag: 'wall' });
  });
});

describe('drumTell over the feel', () => {
  /** The feel over recording ports, `Sounds and haptics` on, through the drums' Tell. */
  const feel = (loud: () => boolean) => {
    const felt: Array<Haptic> = [];
    const heard: Array<SoundName> = [];
    let clock = 0;
    const tell = feelOver({
      haptics: { play: (haptic) => void felt.push(haptic) },
      sound: { play: (sound) => void heard.push(sound) },
      on: () => true,
      now: () => (clock += 1000),
    });
    return { tell: drumTell(tell, loud), felt, heard };
  };
  const detent = (dial: 'ones' | 'tens' | 'hundreds' | 'key', at: number): Cue => ({
    _tag: 'detent',
    dial,
    at,
  });

  it('gives a drum’s detent its haptic and no sound while Sound is off', () => {
    const off = feel(() => false);
    for (const dial of ['hundreds', 'tens', 'ones'] as const) off.tell(detent(dial, 3));
    expect(off.felt).toEqual([{ _tag: 'selection' }, { _tag: 'selection' }, { _tag: 'selection' }]);
    expect(off.heard).toEqual([]);
  });

  it('gives a drum’s detent the thock while Sound is on, the switch read as each cue comes', () => {
    let loud = true;
    const on = feel(() => loud);
    on.tell(detent('ones', 1));
    loud = false;
    on.tell(detent('ones', 2));
    expect(on.felt).toHaveLength(2);
    expect(on.heard).toEqual(['thock']);
  });

  it('passes every other cue on as it came', () => {
    const off = feel(() => false);
    off.tell(detent('key', 2));
    off.tell({ _tag: 'wall' });
    expect(off.heard).toEqual(['key-2']);
    expect(off.felt).toEqual([{ _tag: 'selection' }, { _tag: 'impact', style: 'rigid' }]);
  });
});

describe('the dialled hymn’s row', () => {
  const placed = [
    { number: 12, offset: 300 },
    { number: 4, offset: 340 },
    { number: 12, offset: 900 },
  ];

  it('is the first row with the number, at its offset', () => {
    expect(foundOffset(placed, 12)).toEqual(Option.some(300));
    expect(foundOffset(placed, 4)).toEqual(Option.some(340));
  });

  it('is none when the list holds no row with the number', () => {
    expect(foundOffset(placed, 695)).toEqual(Option.none());
    expect(foundOffset([], 1)).toEqual(Option.none());
  });
});
