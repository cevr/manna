/**
 * `@manna/hymnal-app/player/wheel` as Exact's type check reads it (the
 * app's `tsconfig.json` maps it here; the workspace's typecheck reads the
 * source): the press, its events, its states and what it does are `effect`
 * values, named here by the shapes they take at run time. It names what the
 * key button's sources and tests read; `src/keys/held.test.ts` holds it to
 * the source.
 */

import type { Opt } from '@manna/hymnal-app/hymns/chords';

/** The hold, the drift a press may make, the dead zone and the origin across the bar. */
export declare const HOLD: number;
export declare const SLOP: number;
export declare const DEAD: number;
export declare const ORIGIN_X: number;

/** An item's box and its scale while the finger is over it. */
export declare const ITEM: { readonly width: number; readonly height: number };
export declare const LIFT: number;

/** The wheel's items. */
export type Item = 'tuner' | 'keyDown' | 'keyUp' | 'reset' | 'chords';

/** Each item's words. */
export declare const WORDS: Readonly<Record<Item, string>>;

/** The items the wheel offers, the Tuner with an ear. */
export declare const itemsOf: (ear: boolean) => ReadonlyArray<Item>;

/** A point from the wheel's origin, in points. */
export type Point = { readonly x: number; readonly y: number };

/** An item's slot from the origin. */
export declare const slotOf: (item: Item) => Point;

/** The item under the finger at `at`, if any. */
export declare const overOf: (items: ReadonlyArray<Item>, at: Point) => Opt<Item>;

/** What a press is told as it lands: whether the wheel is offered, an ear, and the origin. */
export type Setup = { readonly wheel: boolean; readonly ear: boolean; readonly origin: Point };

/** A press's event, by its tag. */
export type WheelEvent =
  | {
      readonly _tag: 'Down';
      readonly x: number;
      readonly y: number;
      readonly t: number;
      readonly setup: Setup;
    }
  | { readonly _tag: 'Move'; readonly x: number; readonly y: number; readonly t: number }
  | { readonly _tag: 'Up' | 'Tick'; readonly t: number }
  | { readonly _tag: 'Cancel' };

/** The events' constructors. */
export declare const WheelEvent: {
  readonly Down: (at: {
    readonly x: number;
    readonly y: number;
    readonly t: number;
    readonly setup: Setup;
  }) => WheelEvent;
  readonly Move: (at: { readonly x: number; readonly y: number; readonly t: number }) => WheelEvent;
  readonly Up: (at: { readonly t: number }) => WheelEvent;
  readonly Cancel: () => WheelEvent;
  readonly Tick: (at: { readonly t: number }) => WheelEvent;
};

/** The press as it stands, by its tag. */
export type Wheel =
  | { readonly _tag: 'Idle' }
  | { readonly _tag: 'Pressing'; readonly t0: number; readonly at: Point; readonly setup: Setup }
  | {
      readonly _tag: 'Open';
      readonly origin: Point;
      readonly items: ReadonlyArray<Item>;
      readonly over: Opt<Item>;
    };

/** What a step does, by its tag. */
export type Out =
  | { readonly _tag: 'Tap' | 'Hold' }
  | { readonly _tag: 'Enter' | 'Pick'; readonly item: Item };

/** A step's wheel after it and what it did. */
export type Step = { readonly wheel: Wheel; readonly outs: ReadonlyArray<Out> };

/** No press. */
export declare const idle: Wheel;

/** The wheel after `event`, and what it did. */
export declare const step: (wheel: Wheel, event: WheelEvent) => Step;
