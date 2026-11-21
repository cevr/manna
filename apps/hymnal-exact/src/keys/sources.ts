/* oxlint-disable effect/noNullish, effect/noTernary -- Exact's data module reads no effect here (docs/exact.md): a hymn with no printed key is `undefined`, and a call branches plainly. */

/**
 * The key button's sources, as `app.ts` registers them over the shipped
 * chords (`chords.gen.ts`, decoded only for the hymn asked):
 *
 * - `keysPlaces()`: the current app's measures (`PLACES`);
 * - `keysPage(route, on, moves, open)`: what the key button, its dials and
 *   its wheel show for the route's hymn (`thumb.ts`); the printed key is the
 *   hymn's chords' key in the current app's default Simple style, as its
 *   `useThumb` reads it;
 * - `keysStep(kind, value, route, on, moves, open)`: one event of
 *   `thumb.ts`'s `step`, answered as the stores after it (chords on, the
 *   kept moves, the dials open), its cue, and whether the bar waits
 *   `RESET_WAIT` before it closes the dials (a reset that turned the rows
 *   home);
 * - `keysPress(kind, x, y, t, offered)`: one event of the key button's press
 *   (`wheel.ts`), its state kept here, one per launch, as find's is, so a
 *   press's events step in the order they came. `down` lands at `x`, `y` in
 *   the key button's box; `pan` moves the finger by `x`, `y` since the last;
 *   `up` lifts it at a release speed `y` up the screen; `cancel`; `tick`
 *   tells the clock. The answer says what the press did (a tap, a hold, the
 *   item entered or picked), the wheel as it stands now, and whether the
 *   press slid off before its hold (`swipe`, with the finger's pull up and
 *   its speed), which is the bar's swipe up to open the full player.
 */

import type { Key } from '@manna/hymnal/chord';
import { decodeHymn, hasChords, keyName } from '@manna/hymnal-app/hymns/chords';
import { simple } from '@manna/hymnal-app/hymns/simple';

import { pageAt } from '../hymn/page.ts';
import type { Book } from '../hymns/book.ts';
import { moveOf, movesTo } from '../chords/move.ts';
import {
  capoSaid,
  capoStops,
  faceOf,
  hintOf,
  isStill,
  keyIndexOf,
  keySaid,
  keyStops,
  resetShown,
  rowsOf,
  saidOf,
  stepOn,
  type Thumb,
  type ThumbEvent,
} from './thumb.ts';
import { idle, ITEM, LIFT, ORIGIN_X, slotOf, step, type Wheel, WORDS } from './wheel.ts';

/** The bar's padding at its left, where the key button stands first in its row, in points. */
const BAR_PAD = 12;

/** The key button's height: the wheel's origin lies on its middle. */
const KEY_HEIGHT = 44;

/** The wheel's origin in the key button's own box. */
const ORIGIN = { x: ORIGIN_X - BAR_PAD, y: KEY_HEIGHT / 2 } as const;

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

/** The thumb's event a call names, or none for a kind it does not know. */
export const eventOf = (kind: string, value: number): ThumbEvent | undefined => {
  switch (kind) {
    case 'tap':
    case 'hold':
    case 'page':
    case 'reset':
    case 'shown':
      return { kind };
    case 'key':
      return { kind, pitch: value };
    case 'step':
      return { kind, by: value };
    case 'capo':
      return { kind, capo: value };
    default:
      return undefined;
  }
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
 * letter spacing over the key and of a dial's name.
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
  originX: ORIGIN_X,
  itemWide: ITEM.width,
  itemHigh: ITEM.height,
  itemPad: 12,
  lift: LIFT,
  dim: 0.5,
  pressed: 0.9,
  backdrop: 0.7,
  overSpacing: 0.8,
  titleSpacing: 1.1,
};

/** The press as it stands, one per launch: the rule's state, the finger in the key button's box, its pull up so far, and whether it slid off before its hold. */
interface Press {
  wheel: Wheel;
  at: { x: number; y: number };
  pull: number;
  slid: boolean;
}

export const keysSources = (
  book: Book,
  bundled: ReadonlyArray<readonly [number, string]>,
  decode: Shipped['decode'] = (encoded) => decodeHymn(encoded),
) => {
  const shipped: Shipped = { encoded: new Map(bundled), decode };
  const press: Press = {
    wheel: idle,
    at: { x: 0, y: 0 },
    pull: 0,
    slid: false,
  };
  const thumbOf = (
    on: boolean,
    moves: ReadonlyArray<string>,
    number: number,
    open: boolean,
  ): Thumb => ({
    chords: on,
    move: moveOf(moves, number),
    open,
  });
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
      const face =
        printed === undefined ? { on: false, over: '', key: '' } : faceOf(printed, state);
      const rows = rowsOf(state);
      return {
        number,
        has: printed !== undefined,
        on,
        open,
        face: face.on,
        over: face.over,
        key: face.key,
        said: saidOf(printed, state),
        hint: hintOf(printed, state),
        offered: on && printed !== undefined,
        reset: resetShown(state),
        printedName: printed === undefined ? '' : keyName(printed),
        capoRow: rows.includes('capo'),
        keyStops: printed === undefined ? [] : keyStops(printed).map((stop) => ({ ...stop })),
        keyAt: printed === undefined ? 0 : keyIndexOf(printed, state.move),
        keySaid: printed === undefined ? '' : keySaid(printed, state.move),
        capoStops:
          printed === undefined ? [] : capoStops(printed, state.move).map((stop) => ({ ...stop })),
        capo: state.move.capo,
        capoSaid: printed === undefined ? '' : capoSaid(printed, state.move),
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
        cue: next.cue,
        wait: event.kind === 'reset' && !isStill(state.move) && next.state.open,
      };
    },
    keysPress: ([kind, x, y, t, offered]: readonly [
      string,
      number,
      number,
      number,
      boolean,
    ]): PressView => {
      const was = press.wheel;
      const event =
        kind === 'down'
          ? ({ kind, x, y, t, setup: { wheel: offered, ear: false, origin: ORIGIN } } as const)
          : kind === 'pan'
            ? ({ kind: 'move', x: press.at.x + x, y: press.at.y + y, t } as const)
            : kind === 'up' || kind === 'tick'
              ? ({ kind, t } as const)
              : ({ kind: 'cancel' } as const);
      if (event.kind === 'down') {
        press.at = { x, y };
        press.pull = 0;
        press.slid = false;
      }
      if (event.kind === 'move') {
        press.at = { x: event.x, y: event.y };
        press.pull += y;
      }
      const next = step(was, event);
      press.wheel = next.wheel;
      if (was.kind === 'pressing' && next.wheel.kind === 'idle' && event.kind === 'move')
        press.slid = true;
      const ended = event.kind === 'up';
      const out = (kind: string) => next.outs.find((each) => each.kind === kind);
      const enter = out('enter');
      const pick = out('pick');
      const wheel = next.wheel;
      return {
        tap: out('tap') !== undefined,
        hold: out('hold') !== undefined,
        enter: enter !== undefined && enter.kind === 'enter' ? enter.item : '',
        pick: pick !== undefined && pick.kind === 'pick' ? pick.item : '',
        pressing: wheel.kind === 'pressing',
        open: wheel.kind === 'open',
        over: wheel.kind === 'open' ? (wheel.over ?? '') : '',
        items:
          wheel.kind === 'open'
            ? wheel.items.map((item) => ({ item, word: WORDS[item], ...slotOf(item) }))
            : [],
        swipe: ended && press.slid,
        pull: press.pull,
        speed: ended ? y : 0,
      };
    },
  };
};
