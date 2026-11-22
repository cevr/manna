/* oxlint-disable effect/noTernary, effect/noNullish, effect/noAs -- a Bun test drawing generated histories with the app's seeded generator; a hymn with no chords has no printed key; a Bun test in an Exact app's folder imports no effect, so the option the current app's `hintOf` takes is named by the shape it takes at run time. */

/**
 * The key button's sources answer as the current app's own model and press
 * do, model-based: generated histories of the current app's events (taps,
 * holds, page taps, key and capo turns past either end, key steps, resets
 * and the reset's close) over hymns of every printed key, sent through
 * `keysStep` as the bar sends them (its kept moves in and out), give the
 * state and cue of `@manna/hymnal-app/player/thumb`'s `step`; after each,
 * `keysPage` shows that model's face, said value, hint, chips, rows and stops,
 * and the key dial stands on the sounding key's stop. A hymn with no chords
 * takes only the keyless events, from C major. Generated presses sent
 * through `keysPress` (a finger landing, panning by deltas, the clock
 * ticking, a lift, a cancel) give the taps, holds, enters, picks and wheel
 * of `@manna/hymnal-app/player/wheel`'s `step`, and a finger that slides
 * off before its hold answers a swipe with its pull and speed.
 */

import { describe, expect, test } from 'bun:test';

import type { Key } from '@manna/hymnal/chord';
import { hasChords, keyName, type Move } from '@manna/hymnal-app/hymns/chords';
import { simple, styled } from '@manna/hymnal-app/hymns/simple';
import { chordStyles } from '@manna/hymnal-app/chord-choices';
import * as thumb from '@manna/hymnal-app/player/thumb';
import * as press from '@manna/hymnal-app/player/wheel';

import { bundled, currentBook } from '../chords/shipped.testing.ts';
import { moveOf } from '../chords/move.ts';
import { book } from '../hymns/book.ts';
import { below, pick, type Random, seeded } from '../test/random.ts';
import { styleOf } from '../settings/chords.ts';
import { keysSources, pitchOf } from './sources.ts';

/** One hymn of each printed key, with that key as the dials read it. */
const keyed = (() => {
  const seen = new Map<string, { number: number; printed: Key }>();
  for (const hymn of book.hymns) {
    const chords = currentBook.of(hymn.number);
    if (chords._tag !== 'Some' || !hasChords(chords.value)) continue;
    const printed = simple(chords.value).key;
    if (!seen.has(keyName(printed))) seen.set(keyName(printed), { number: hymn.number, printed });
  }
  return [...seen.values()];
})();

/** Hymn `number`'s printed key in the chord style kept as `style`, as the current app's `useThumb` reads it. */
const printedIn = (number: number, style: string): Key | undefined => {
  const chords = currentBook.of(number);
  return chords._tag === 'Some' ? styled(chords.value, styleOf(style)).key : undefined;
};

/** The current app's hint for the key button over `printed`, `""` for none, as the view draws it. */
const hintFor = (printed: Key | undefined, state: thumb.Thumb): string => {
  const hint = thumb.hintOf(
    (printed === undefined ? { _tag: 'None' } : { _tag: 'Some', value: printed }) as Parameters<
      typeof thumb.hintOf
    >[0],
    state,
  );
  return hint._tag === 'Some' ? hint.value : '';
};

/** A hymn the hymnal has with no chords. */
const unchorded =
  book.hymns.find((hymn) => {
    const chords = currentBook.of(hymn.number);
    return chords._tag !== 'Some' || !hasChords(chords.value);
  })?.number ?? 0;

/** A generated event, as the bar sends it and as the current app makes it. */
const eventOf = (random: Random): readonly [string, number, thumb.ThumbEvent] => {
  const roll = below(random, 9);
  if (roll === 1) return ['hold', 0, thumb.ThumbEvent.Hold()];
  if (roll === 2) return ['page', 0, thumb.ThumbEvent.TapPage()];
  if (roll === 3) {
    const pitch = below(random, 12);
    return ['key', pitch, thumb.ThumbEvent.TurnKey({ pitch })];
  }
  if (roll === 4) {
    const by = pick(random, [-1, 1]);
    return ['step', by, thumb.ThumbEvent.StepKey({ by })];
  }
  if (roll === 5) {
    const capo = below(random, 14) - 1;
    return ['capo', capo, thumb.ThumbEvent.TurnCapo({ capo })];
  }
  if (roll === 6) return ['reset', 0, thumb.ThumbEvent.Reset()];
  if (roll === 7) return ['shown', 0, thumb.ThumbEvent.ResetShown()];
  return ['tap', 0, thumb.ThumbEvent.Tap()];
};

type Point = { readonly x: number; readonly y: number };

/** A generated press event at `t`, as the bar sends it and as the current app makes it, and where the finger is after it. */
const pressOf = (
  random: Random,
  t: number,
  setup: { readonly wheel: boolean; readonly ear: boolean; readonly origin: Point },
  at: Point,
): readonly [readonly [string, number, number], press.WheelEvent, Point] => {
  const roll = below(random, 10);
  if (roll === 0) {
    const down = {
      x: setup.origin.x + below(random, 8) - 4,
      y: setup.origin.y + below(random, 6) - 3,
    };
    return [['down', down.x, down.y], press.WheelEvent.Down({ ...down, t, setup }), down];
  }
  if (roll <= 4) {
    const far = random() < 0.6;
    const [dx, dy] = far
      ? [below(random, 160) - 60, -below(random, 160) + 20]
      : [below(random, 8) - 4, below(random, 8) - 4];
    const moved = { x: at.x + dx, y: at.y + dy };
    return [['pan', dx, dy], press.WheelEvent.Move({ ...moved, t }), moved];
  }
  if (roll <= 6) return [['tick', 0, 0], press.WheelEvent.Tick({ t }), at];
  if (roll === 7) return [['cancel', 0, 0], press.WheelEvent.Cancel(), at];
  return [['up', 0, 0], press.WheelEvent.Up({ t }), at];
};

const tagsOf = (cues: ReadonlyArray<{ readonly _tag: string }>) => cues.map((cue) => cue._tag);

const sources = keysSources(book, bundled);

describe('the key button’s sources, against the current app’s model', () => {
  test('the hymnal prints its hymns in more than one key, and some hymns have no chords', () => {
    expect(keyed.length).toBeGreaterThan(8);
    expect(unchorded).toBeGreaterThan(0);
  });

  test('every spelling’s pitch class is the one the current app transposes from and to', () => {
    for (const { printed } of keyed) {
      expect(pitchOf(printed.tonic)).toBe(((-thumb.transposeTo(printed, 0) % 12) + 12) % 12);
      for (const stop of thumb.keyStops(printed))
        expect(pitchOf(stop.name.replace('m', ''))).toBe(stop.pitch);
    }
  });

  test('generated histories through keysStep give the model’s state and cues, and keysPage its drawing', () => {
    const random = seeded(23);
    for (const { number } of keyed)
      for (let run = 0; run < 6; run++) {
        const route = `${number}`;
        const style = pick(random, ['', ...chordStyles.map((choice) => choice.value)]);
        const printed = printedIn(number, style);
        expect(printed).toBeDefined();
        if (printed === undefined) continue;
        let [on, moves, open] = [random() < 0.5, [] as ReadonlyArray<string>, false];
        let theirs: thumb.Thumb = { chords: on, move: { transpose: 0, capo: 0 }, open };
        for (let k = 0; k < 30; k++) {
          const [kind, value, event] = eventOf(random);
          const got = sources.keysStep([kind, value, route, on, moves, open, style]);
          const want = thumb.step(printed, theirs, event);
          const move: Move = moveOf(got.moves, number);
          expect({ chords: got.chords, move, open: got.open }).toEqual(want.state);
          expect(got.cue === '' ? [] : [got.cue]).toEqual(tagsOf(want.cues));
          expect(got.wait).toBe(
            event._tag === 'Reset' && !thumb.isStill(theirs.move) && want.state.open,
          );
          [on, moves, open, theirs] = [got.chords, got.moves, got.open, want.state];
          const page = sources.keysPage([route, on, moves, open, style]);
          const face = thumb.faceOf(printed, theirs);
          expect([page.face, page.over, page.key]).toEqual(
            face._tag === 'Key' ? [true, face.over, face.key] : [false, '', ''],
          );
          expect(page.said).toBe(thumb.saidOf(printed, theirs));
          expect(page.hint).toBe(hintFor(printed, theirs));
          expect(page.hint).not.toBe('');
          expect(page.reset).toBe(thumb.chipsOf(theirs).includes('reset'));
          expect(page.capoRow).toBe(thumb.shownOf(theirs).includes('capo'));
          expect(page.keyStops).toEqual([...thumb.keyStops(printed)]);
          expect(page.keyStops[page.keyAt]?.name).toBe(thumb.keySaid(printed, theirs.move));
          expect(page.capoStops).toEqual([...thumb.capoStops(printed, theirs.move)]);
          expect([page.capo, page.capoSaid, page.keySaid]).toEqual([
            theirs.move.capo,
            thumb.capoSaid(printed, theirs.move),
            thumb.keySaid(printed, theirs.move),
          ]);
          expect(page.offered).toBe(on);
        }
      }
  });

  test('a hymn with no chords takes only the keyless events, from C major, and offers no wheel', () => {
    const random = seeded(5);
    const route = `${unchorded}`;
    const c: Key = { tonic: 'C', minor: false };
    let [on, moves, open] = [false, [] as ReadonlyArray<string>, false];
    for (let k = 0; k < 300; k++) {
      const [kind, value, event] = eventOf(random);
      const got = sources.keysStep([kind, value, route, on, moves, open, '']);
      const keyless =
        event._tag === 'Hold' || event._tag === 'TapPage' || (event._tag === 'Tap' && !on);
      const state = { chords: on, move: moveOf(moves, unchorded), open };
      const want = keyless ? thumb.step(c, state, event) : { state, cues: [] };
      expect({ chords: got.chords, move: moveOf(got.moves, unchorded), open: got.open }).toEqual(
        want.state,
      );
      expect(got.cue === '' ? [] : [got.cue]).toEqual(tagsOf(want.cues));
      [on, moves, open] = [got.chords, got.moves, got.open];
      const page = sources.keysPage([route, on, moves, open, '']);
      expect([page.has, page.face, page.offered, page.said]).toEqual([
        false,
        false,
        false,
        on ? 'No chords' : 'Chords off',
      ]);
      expect(page.hint).toBe(
        hintFor(undefined, { chords: on, move: moveOf(moves, unchorded), open }),
      );
      expect(page.hint).toBe(on ? '' : 'Turns chords on');
    }
  });
});

describe('the key button’s press, against the current app’s', () => {
  test('generated presses through keysPress make the current app’s taps, holds, enters, picks and wheel', () => {
    const random = seeded(41);
    const press0 = keysSources(book, []);
    const origin = { x: press.ORIGIN_X - 12, y: 22 };
    let seen = { tap: 0, hold: 0, enter: 0, pick: 0 };
    let theirs: press.Wheel = press.idle;
    let at = { x: 0, y: 0 };
    let t = 0;
    for (let run = 0; run < 300; run++) {
      const offered = random() < 0.7;
      const setup = { wheel: offered, ear: false, origin };
      t += below(random, 1000);
      for (let k = 0; k < 30; k++) {
        t += pick(random, [0, 16, 50, 120, 200, 360, 600]);
        const [call, event, next] = pressOf(random, t, setup, at);
        at = next;
        const got = press0.keysPress([call[0], call[1], call[2], t, offered]);
        const want = press.step(theirs, event);
        theirs = want.wheel;
        const item = (tag: string) =>
          want.outs.flatMap((out) => (out._tag === tag && 'item' in out ? [out.item] : []))[0] ??
          '';
        expect([got.tap, got.hold, got.enter, got.pick]).toEqual([
          want.outs.some((out) => out._tag === 'Tap'),
          want.outs.some((out) => out._tag === 'Hold'),
          item('Enter'),
          item('Pick'),
        ]);
        expect([got.pressing, got.open]).toEqual([
          theirs._tag === 'Pressing',
          theirs._tag === 'Open',
        ]);
        if (theirs._tag === 'Open') {
          expect(got.items.map((each) => each.item)).toEqual([...theirs.items]);
          expect(got.over).toBe(theirs.over._tag === 'Some' ? theirs.over.value : '');
        }
        seen = {
          tap: seen.tap + Number(got.tap),
          hold: seen.hold + Number(got.hold),
          enter: seen.enter + Number(got.enter !== ''),
          pick: seen.pick + Number(got.pick !== ''),
        };
      }
    }
    expect(Math.min(seen.tap, seen.hold, seen.enter, seen.pick)).toBeGreaterThan(5);
  });

  test('a hold opens the wheel with the current app’s words; a slide picks; a slide before the hold is a swipe', () => {
    const { keysPress } = keysSources(book, []);
    keysPress(['down', 35, 22, 0, true]);
    const open = keysPress(['tick', 0, 0, press.HOLD, true]);
    expect(open.open).toBe(true);
    expect(open.items.map((each) => each.word)).toEqual(['Key ♭', 'Key ♯', 'Reset', 'Chords off']);
    const slot = press.slotOf('keyUp');
    const entered = keysPress(['pan', slot.x, slot.y, press.HOLD + 50, true]);
    expect(entered.enter).toBe('keyUp');
    const picked = keysPress(['up', 0, 0, press.HOLD + 80, true]);
    expect([picked.pick, picked.open, picked.swipe]).toEqual(['keyUp', false, false]);
    keysPress(['down', 35, 22, 1000, true]);
    const tapped = keysPress(['up', 0, 0, 1100, true]);
    expect([tapped.tap, tapped.swipe]).toEqual([true, false]);
    keysPress(['down', 35, 22, 2000, true]);
    keysPress(['pan', 0, -40, 2050, true]);
    keysPress(['pan', 0, -30, 2080, true]);
    const swiped = keysPress(['up', 0, -900, 2100, true]);
    expect([swiped.tap, swiped.swipe, swiped.pull, swiped.speed]).toEqual([false, true, -70, -900]);
    keysPress(['down', 35, 22, 3000, false]);
    expect(keysPress(['tick', 0, 0, 3000 + press.HOLD, false]).hold).toBe(true);
  });
});
