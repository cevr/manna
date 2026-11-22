/**
 * Today's hold on the words while the voice reads, as the current
 * Heartseed's (`@manna/heartseed/reading/hold`): a finger that rests still
 * on the words for `HOLD_MS` holds the word under it and the reading
 * pauses; each move holds the word under the finger; the lift reads on from
 * the held word. The current app's pan is the recognizer's (a long press
 * that fails past `HOLD_SLOP`); here the contact is a pure reducer over the
 * pointer's down, moves and up and the timer's end, so a swipe that moves
 * past the slop before the time scrolls and holds nothing. Each moment of a
 * hold is the current app's own rule (`activate`, `update`, `finalize`,
 * `drop`), over the words' boxes read at that moment (`wordUnder`), never
 * kept across a layout.
 *
 * Exact ends a cancelled pointer with its `pointerup` (`buttons` 0), so a
 * cancel is told from a lift by where it ends: a lift ends where the finger
 * last moved (within the slop), and an end elsewhere (the web's cancel
 * ends at 0, 0) resumes where the reading paused, as the current app's
 * cancel does, rather than reading on from a word the reader did not lift on.
 */

import { activate, drop, finalize, LONG_PRESS, update } from '@manna/heartseed/reading/hold';
import type { Ask } from '@manna/heartseed/reading/hold';
import { wordAt, type Box } from '@manna/heartseed/reading/words';
import { Match, Option } from 'effect';

export type { Ask } from '@manna/heartseed/reading/hold';

/** How long a finger rests still before the hold takes it: the current app's `LONG_PRESS`. */
export const HOLD_MS = LONG_PRESS;

/**
 * How far a finger may move before the time and still hold, in points:
 * the allowable movement of the current app's pan with
 * `activateAfterLongPress` (react-native-gesture-handler's
 * `RNPanHandler.m`, a squared distance over 100 fails it).
 */
export const HOLD_SLOP = 10;

/** A point in the viewport, `frame()`'s space and a pointer's `clientX`, `clientY`. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A word's box as Exact's `frame(id)` answers it. */
export interface Frame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly unavailable: boolean;
}

/** The contact on the words: none; a still press waiting for the time; a hold; or a contact that holds nothing until it lifts. */
export type Contact =
  | { readonly _tag: 'idle' }
  | {
      readonly _tag: 'pressing';
      readonly pointer: number;
      readonly from: Point;
      readonly at: Point;
      readonly key: number;
    }
  | { readonly _tag: 'held'; readonly pointer: number; readonly at: Point }
  | { readonly _tag: 'spent'; readonly pointer: number };

/** The hold: its contact, the word held, and how many presses began (each press's timer key). */
export interface Hold {
  readonly contact: Contact;
  readonly held: Option.Option<number>;
  readonly presses: number;
}

export type ContactInput =
  | { readonly _tag: 'down'; readonly pointer: number; readonly at: Point }
  | { readonly _tag: 'elapsed'; readonly key: number; readonly frames: readonly Frame[] }
  | {
      readonly _tag: 'move';
      readonly pointer: number;
      readonly at: Point;
      readonly frames: readonly Frame[];
    }
  | { readonly _tag: 'up'; readonly pointer: number; readonly at: Point }
  | { readonly _tag: 'gone' };

/** The hold after one input, and what it asks of the voice. */
export interface HoldStep {
  readonly hold: Hold;
  readonly ask: Option.Option<Ask>;
}

export const idleHold: Hold = { contact: { _tag: 'idle' }, held: Option.none(), presses: 0 };

/** The word under `at` over the words' frames (word `i` the `i`th), as the current app finds it (`wordAt`); a frame not laid out is no word's. */
export const wordUnder = (at: Point, frames: readonly Frame[]): Option.Option<number> => {
  const boxes = new Map<number, Box>(
    frames.flatMap((frame, index) => {
      if (frame.unavailable) return [];
      return [[index, { x: frame.x, y: frame.y, width: frame.width, height: frame.height }]];
    }),
  );
  return wordAt(at.x, at.y, boxes);
};

/** Whether `a` and `b` lie further apart than the slop. */
const past = (a: Point, b: Point): boolean => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 > HOLD_SLOP ** 2;

const stay = (hold: Hold): HoldStep => ({ hold, ask: Option.none() });

/** The pointer the contact follows, none at rest. */
const pointerOf = (contact: Contact): Option.Option<number> => {
  if (contact._tag === 'idle') return Option.none();
  return Option.some(contact.pointer);
};

const ours = (hold: Hold, pointer: number): boolean =>
  Option.contains(pointerOf(hold.contact), pointer);

/** A press begins only at rest and while `reading`; a second finger is not heard. */
const onDown = (hold: Hold, pointer: number, at: Point, reading: boolean): HoldStep => {
  if (hold.contact._tag !== 'idle' || !reading) return stay(hold);
  const key = hold.presses + 1;
  return stay({ ...hold, presses: key, contact: { _tag: 'pressing', pointer, from: at, at, key } });
};

/** The time of a still press: the word under the finger held and the pause asked for; with none under it, the contact holds nothing. */
const onElapsed = (hold: Hold, key: number, frames: readonly Frame[]): HoldStep => {
  const { contact } = hold;
  if (contact._tag !== 'pressing' || contact.key !== key) return stay(hold);
  const moment = activate(hold.held, wordUnder(contact.at, frames));
  if (Option.isNone(moment.held))
    return stay({ ...hold, contact: { _tag: 'spent', pointer: contact.pointer } });
  return {
    hold: {
      ...hold,
      held: moment.held,
      contact: { _tag: 'held', pointer: contact.pointer, at: contact.at },
    },
    ask: moment.ask,
  };
};

/** A move: a press that moves past the slop holds nothing; a hold holds the word under the finger. */
const onMove = (hold: Hold, at: Point, frames: readonly Frame[]): HoldStep => {
  const { contact } = hold;
  if (contact._tag === 'pressing') {
    if (past(contact.from, at))
      return stay({ ...hold, contact: { _tag: 'spent', pointer: contact.pointer } });
    return stay({ ...hold, contact: { ...contact, at } });
  }
  if (contact._tag !== 'held') return stay(hold);
  const moment = update(hold.held, wordUnder(at, frames));
  return { hold: { ...hold, held: moment.held, contact: { ...contact, at } }, ask: moment.ask };
};

/** The contact's end: a hold asks once, a seek where it lifted and a resume where it was cancelled; any other contact asks nothing. */
const onUp = (hold: Hold, at: Point): HoldStep => {
  const { contact } = hold;
  const rest: Hold = { ...hold, contact: { _tag: 'idle' } };
  if (contact._tag !== 'held') return stay({ ...rest, held: Option.none() });
  const moment = finalize(hold.held, past(contact.at, at));
  return { hold: { ...rest, held: moment.held }, ask: moment.ask };
};

/** The reading ended under the contact: the held word dropped, and the contact holds nothing until it lifts. */
const onGone = (hold: Hold): HoldStep => {
  const { contact } = hold;
  const held = drop(hold.held).held;
  if (contact._tag === 'idle') return stay({ ...hold, held });
  return stay({ ...hold, held, contact: { _tag: 'spent', pointer: contact.pointer } });
};

/** The hold after `input`, a reading under way or not (`reading`). */
export const holdStep = (hold: Hold, input: ContactInput, reading: boolean): HoldStep =>
  Match.valueTags(input, {
    down: ({ pointer, at }) => onDown(hold, pointer, at, reading),
    elapsed: ({ key, frames }) => onElapsed(hold, key, frames),
    move: ({ pointer, at, frames }) => {
      if (!ours(hold, pointer)) return stay(hold);
      return onMove(hold, at, frames);
    },
    up: ({ pointer, at }) => {
      if (!ours(hold, pointer)) return stay(hold);
      return onUp(hold, at);
    },
    gone: () => onGone(hold),
  });
