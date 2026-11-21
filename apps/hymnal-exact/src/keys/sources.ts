/* oxlint-disable effect/noNullish, effect/noTernary -- Exact's data module reads no effect of its own (docs/exact.md): a hymn with no printed key is `undefined`, and a call branches plainly. */

/**
 * The key button's sources, as `app.ts` registers them over the shipped
 * chords (`chords.gen.ts`, decoded only for the hymn asked). Every rule is
 * the current app's own, imported: the key button's model
 * (`@manna/hymnal-app/player/thumb`) and its press
 * (`@manna/hymnal-app/player/wheel`); these sources turn a call's
 * arguments into their events and their answers into plain shapes.
 *
 * - `keysPlaces()`: the current app's measures (`PLACES`);
 * - `keysPage(route, on, moves, open)`: what the key button, its dials and
 *   its wheel show for the route's hymn; the printed key is the hymn's
 *   chords' key in the current app's default Simple style, as its
 *   `useThumb` reads it;
 * - `keysStep(kind, value, route, on, moves, open)`: one event of the
 *   model's `step`, answered as the stores after it (chords on, the kept
 *   moves, the dials open), its cue, and whether the bar waits `RESET_WAIT`
 *   before it closes the dials (a reset that turned the rows home). A hymn
 *   with no printed key takes only a hold, a page tap and a tap with chords
 *   off, stepped from C major, as the current `Dials.tsx` has it;
 * - `keysPress(kind, x, y, t, offered)`: one event of the key button's press,
 *   its state kept here, one per launch, as find's is, so a press's events
 *   step in the order they came. `down` lands at `x`, `y` in the key
 *   button's box; `pan` moves the finger by `x`, `y` since the last; `up`
 *   lifts it at a release speed `y` up the screen; `cancel`; `tick` tells
 *   the clock. The answer says what the press did (a tap, a hold, the item
 *   entered or picked), the wheel as it stands now, and whether the press
 *   slid off before its hold (`swipe`, with the finger's pull up and its
 *   speed), which is the bar's swipe up to open the full player.
 */

import type { Key } from '@manna/hymnal/chord';
import { decodeHymn, hasChords, keyName, soundingKey } from '@manna/hymnal-app/hymns/chords';
import { simple } from '@manna/hymnal-app/hymns/simple';
import * as thumb from '@manna/hymnal-app/player/thumb';
import * as press from '@manna/hymnal-app/player/wheel';

import { moveOf, movesTo } from '../chords/move.ts';
import { pageAt } from '../hymn/page.ts';
import type { Book } from '../hymns/book.ts';

/** The bar's padding at its left, where the key button stands first in its row, in points. */
const BAR_PAD = 12;

/** The key button's height: the wheel's origin lies on its middle. */
const KEY_HEIGHT = 44;

/** The wheel's origin in the key button's own box. */
const ORIGIN = { x: press.ORIGIN_X - BAR_PAD, y: KEY_HEIGHT / 2 };

/**
 * The current app's measures of the key button, its dials and its wheel,
 * in points (or a scale or opacity where named), as `keysPlaces()` answers
 * them for `features/keys.contract`: a dial's stop (`detent`), the panel's
 * padding and row gap, its room from the screen's sides and over the bar
 * (`side`, `gap`), a dial's name column and its inset, the notch, the
 * printed key's dot and its lift, the key button's side, its insets and
 * gap, its ring and the ring's gap, the bar at rest, the wheel's origin
 * across the bar, an item's size, padding and grown scale, the key button
 * dimmed with chords off and pressed in, the backdrop's opacity, and the
 * letter spacing over the key and of a dial's name. `src/keys/held.test.ts`
 * reads each from the current app's files.
 */
export const PLACES = {
  detent: 52,
  pad: 8,
  rowGap: 10,
  side: 12,
  gap: 10,
  title: 58,
  titlePad: 16,
  notch: 9,
  notchWide: 2,
  home: 4,
  homeLow: 5,
  key: KEY_HEIGHT,
  keyLeft: 6,
  keyRight: 12,
  keyGap: 2,
  ring: 2,
  ringGap: 3,
  rest: 56,
  originX: press.ORIGIN_X,
  itemWide: press.ITEM.width,
  itemHigh: press.ITEM.height,
  itemPad: 12,
  lift: press.LIFT,
  dim: 0.5,
  pressed: 0.9,
  backdrop: 0.7,
  overSpacing: 0.8,
  titleSpacing: 1.1,
};

/** The seven letters, each at its pitch class above C, a space at each black key. */
const LETTERS = 'C D EF G A B';

/** The pitch class of a tonic as the hymnal spells it ("Db", "F#"), 0 = C, where the key dial stands. */
export const pitchOf = (tonic: string): number => {
  const letter = Math.max(0, LETTERS.indexOf(tonic.charAt(0)));
  const marks = [...tonic.slice(1)];
  const by =
    marks.filter((mark) => mark === '#').length - marks.filter((mark) => mark === 'b').length;
  return (((letter + by) % 12) + 12) % 12;
};

/** The key a hymn with no printed key steps from. */
const NO_KEY: Key = { tonic: 'C', minor: false };

interface Shipped {
  readonly encoded: ReadonlyMap<number, string>;
  readonly decode: (encoded: string) => ReturnType<typeof decodeHymn>;
}

/** Hymn `number`'s printed key as the dials read it, or none for a hymn with no chords. */
const printedOf = (shipped: Shipped, number: number): Key | undefined => {
  const encoded = shipped.encoded.get(number);
  if (encoded === undefined) return undefined;
  const decoded = shipped.decode(encoded);
  if (decoded._tag === 'None' || !hasChords(decoded.value)) return undefined;
  return simple(decoded.value).key;
};

/** The model's event a call names, or none for a kind it does not know. */
export const eventOf = (kind: string, value: number): thumb.ThumbEvent | undefined => {
  switch (kind) {
    case 'tap':
      return thumb.ThumbEvent.Tap();
    case 'hold':
      return thumb.ThumbEvent.Hold();
    case 'page':
      return thumb.ThumbEvent.TapPage();
    case 'reset':
      return thumb.ThumbEvent.Reset();
    case 'shown':
      return thumb.ThumbEvent.ResetShown();
    case 'key':
      return thumb.ThumbEvent.TurnKey({ pitch: value });
    case 'step':
      return thumb.ThumbEvent.StepKey({ by: value });
    case 'capo':
      return thumb.ThumbEvent.TurnCapo({ capo: value });
    default:
      return undefined;
  }
};

/** The events a hymn with no printed key takes: a hold, a tap on the page, and a tap with chords off. */
const keyless = (event: thumb.ThumbEvent, chords: boolean): boolean =>
  event._tag === 'Hold' || event._tag === 'TapPage' || (event._tag === 'Tap' && !chords);

/** The model's `step` for a hymn whose printed key may be none: none takes only the keyless events, and the rest change nothing. */
export const stepOn = (
  printed: Key | undefined,
  state: thumb.Thumb,
  event: thumb.ThumbEvent,
): thumb.Step => {
  if (printed !== undefined) return thumb.step(printed, state, event);
  if (keyless(event, state.chords)) return thumb.step(NO_KEY, state, event);
  return { state, cues: [] };
};

/** What the wheel answers: the press's outputs, the wheel drawn, and a slide off before the hold. */
export interface PressView {
  readonly tap: boolean;
  readonly hold: boolean;
  readonly enter: string;
  readonly pick: string;
  readonly pressing: boolean;
  readonly open: boolean;
  readonly over: string;
  readonly items: Array<{ item: string; word: string; x: number; y: number }>;
  readonly swipe: boolean;
  readonly pull: number;
  readonly speed: number;
}

/** The press as it stands, one per launch: the model's wheel, the finger in the key button's box, its pull up so far, and whether it slid off before its hold. */
interface Press {
  wheel: press.Wheel;
  at: { x: number; y: number };
  pull: number;
  slid: boolean;
}

/** The press's event a call names. */
const pressEventOf = (
  kind: string,
  x: number,
  y: number,
  t: number,
  offered: boolean,
  at: { readonly x: number; readonly y: number },
): press.WheelEvent => {
  switch (kind) {
    case 'down':
      return press.WheelEvent.Down({
        x,
        y,
        t,
        setup: { wheel: offered, ear: false, origin: ORIGIN },
      });
    case 'pan':
      return press.WheelEvent.Move({ x: at.x + x, y: at.y + y, t });
    case 'up':
      return press.WheelEvent.Up({ t });
    case 'tick':
      return press.WheelEvent.Tick({ t });
    default:
      return press.WheelEvent.Cancel();
  }
};

/** The item an output names, or "" for none of that kind. */
const itemOf = (outs: ReadonlyArray<press.Out>, tag: 'Enter' | 'Pick'): string => {
  for (const out of outs) if (out._tag === tag) return out.item;
  return '';
};

export const keysSources = (
  book: Book,
  bundled: ReadonlyArray<readonly [number, string]>,
  decode: Shipped['decode'] = (encoded) => decodeHymn(encoded),
) => {
  const shipped: Shipped = { encoded: new Map(bundled), decode };
  const held: Press = { wheel: press.idle, at: { x: 0, y: 0 }, pull: 0, slid: false };
  const thumbOf = (
    on: boolean,
    moves: ReadonlyArray<string>,
    number: number,
    open: boolean,
  ): thumb.Thumb => ({ chords: on, move: moveOf(moves, number), open });
  return {
    keysPlaces: () => ({ ...PLACES }),
    keysPage: ([route, on, moves, open]: readonly [
      string,
      boolean,
      ReadonlyArray<string>,
      boolean,
    ]) => {
      const number = pageAt(book, route).number;
      const printed = number === 0 ? undefined : printedOf(shipped, number);
      const state = thumbOf(on, moves, number, open);
      const face = printed === undefined ? undefined : thumb.faceOf(printed, state);
      const lit = face !== undefined && face._tag === 'Key';
      return {
        number,
        has: printed !== undefined,
        on,
        open,
        face: lit,
        over: lit ? face.over : '',
        key: lit ? face.key : '',
        said:
          printed === undefined ? (on ? 'No chords' : 'Chords off') : thumb.saidOf(printed, state),
        offered: on && printed !== undefined,
        reset: thumb.chipsOf(state).includes('reset'),
        printedName: printed === undefined ? '' : keyName(printed),
        capoRow: thumb.shownOf(state).includes('capo'),
        keyStops: printed === undefined ? [] : thumb.keyStops(printed).map((stop) => ({ ...stop })),
        keyAt: printed === undefined ? 0 : pitchOf(soundingKey(printed, state.move).tonic),
        keySaid: printed === undefined ? '' : thumb.keySaid(printed, state.move),
        capoStops:
          printed === undefined
            ? []
            : thumb.capoStops(printed, state.move).map((stop) => ({ ...stop })),
        capo: state.move.capo,
        capoSaid: printed === undefined ? '' : thumb.capoSaid(printed, state.move),
      };
    },
    keysStep: ([kind, value, route, on, moves, open]: readonly [
      string,
      number,
      string,
      boolean,
      ReadonlyArray<string>,
      boolean,
    ]) => {
      const number = pageAt(book, route).number;
      const event = eventOf(kind, value);
      const state = thumbOf(on, moves, number, open);
      if (number === 0 || event === undefined)
        return { chords: on, moves: [...moves], open, cue: '', wait: false };
      const next = stepOn(printedOf(shipped, number), state, event);
      return {
        chords: next.state.chords,
        moves: movesTo(moves, number, next.state.move),
        open: next.state.open,
        cue: next.cues[0]?._tag ?? '',
        wait: event._tag === 'Reset' && !thumb.isStill(state.move) && next.state.open,
      };
    },
    keysPress: ([kind, x, y, t, offered]: readonly [
      string,
      number,
      number,
      number,
      boolean,
    ]): PressView => {
      const was = held.wheel;
      const event = pressEventOf(kind, x, y, t, offered, held.at);
      if (event._tag === 'Down') {
        held.at = { x, y };
        held.pull = 0;
        held.slid = false;
      }
      if (event._tag === 'Move') {
        held.at = { x: event.x, y: event.y };
        held.pull += y;
      }
      const next = press.step(was, event);
      held.wheel = next.wheel;
      if (was._tag === 'Pressing' && next.wheel._tag === 'Idle' && event._tag === 'Move')
        held.slid = true;
      const ended = event._tag === 'Up';
      const wheel = next.wheel;
      return {
        tap: next.outs.some((out) => out._tag === 'Tap'),
        hold: next.outs.some((out) => out._tag === 'Hold'),
        enter: itemOf(next.outs, 'Enter'),
        pick: itemOf(next.outs, 'Pick'),
        pressing: wheel._tag === 'Pressing',
        open: wheel._tag === 'Open',
        over: wheel._tag === 'Open' && wheel.over._tag === 'Some' ? wheel.over.value : '',
        items:
          wheel._tag === 'Open'
            ? wheel.items.map((item) => ({ item, word: press.WORDS[item], ...press.slotOf(item) }))
            : [],
        swipe: ended && held.slid,
        pull: held.pull,
        speed: ended ? y : 0,
      };
    },
  };
};
