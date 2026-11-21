/**
 * `@manna/hymnal-app/player/wheel` as Exact's type check reads it (the
 * app's `tsconfig.json` maps it here; the workspace's typecheck reads the
 * source): the press, its events, its states and what it does are `effect`
 * values, named here by the shapes they take at run time. It names only what
 * the port's wheel tests read; `src/keys/held.test.ts` holds it to the
 * source.
 */

import type { Opt } from '@manna/hymnal-app/hymns/chords';

export declare const HOLD: number;
export declare const SLOP: number;
export declare const DEAD: number;
export declare const ORIGIN_X: number;
export declare const ITEM: { readonly width: number; readonly height: number };
export declare const LIFT: number;

export type Item = 'tuner' | 'keyDown' | 'keyUp' | 'reset' | 'chords';

export declare const WORDS: Readonly<Record<Item, string>>;

export declare const itemsOf: (ear: boolean) => ReadonlyArray<Item>;

export interface Point {
  readonly x: number;
  readonly y: number;
}

export declare const slotOf: (item: Item) => Point;

export declare const overOf: (items: ReadonlyArray<Item>, at: Point) => Opt<Item>;

export interface Setup {
  readonly wheel: boolean;
  readonly ear: boolean;
  readonly origin: Point;
}

export type WheelEvent =
  | {
      readonly _tag: 'Down';
      readonly x: number;
      readonly y: number;
      readonly t: number;
      readonly setup: Setup;
    }
  | { readonly _tag: 'Move'; readonly x: number; readonly y: number; readonly t: number }
  | { readonly _tag: 'Up'; readonly t: number }
  | { readonly _tag: 'Cancel' }
  | { readonly _tag: 'Tick'; readonly t: number };

export declare const WheelEvent: {
  readonly Down: (args: {
    readonly x: number;
    readonly y: number;
    readonly t: number;
    readonly setup: Setup;
  }) => WheelEvent;
  readonly Move: (args: {
    readonly x: number;
    readonly y: number;
    readonly t: number;
  }) => WheelEvent;
  readonly Up: (args: { readonly t: number }) => WheelEvent;
  readonly Cancel: () => WheelEvent;
  readonly Tick: (args: { readonly t: number }) => WheelEvent;
};

export type Wheel =
  | { readonly _tag: 'Idle' }
  | { readonly _tag: 'Pressing'; readonly t0: number; readonly at: Point; readonly setup: Setup }
  | {
      readonly _tag: 'Open';
      readonly origin: Point;
      readonly items: ReadonlyArray<Item>;
      readonly over: Opt<Item>;
    };

export type Out =
  | { readonly _tag: 'Tap' }
  | { readonly _tag: 'Hold' }
  | { readonly _tag: 'Enter'; readonly item: Item }
  | { readonly _tag: 'Pick'; readonly item: Item };

export interface Step {
  readonly wheel: Wheel;
  readonly outs: ReadonlyArray<Out>;
}

export declare const idle: Wheel;

export declare const step: (wheel: Wheel, event: WheelEvent) => Step;
