/** The first hymn's number and the last's. */
export declare const FIRST: number;
export declare const LAST: number;

/** The three drums, from the left. */
export type Drum = 'hundreds' | 'tens' | 'ones';
export declare const DRUM_ORDER: ReadonlyArray<Drum>;

/** `n` held to the book. */
export declare const held: (n: number) => number;

/** The three digits `number` is dialled by, held to the book first. */
export declare const digitsOf: (number: number) => Readonly<Record<Drum, number>>;

/** The number dialled once `drum`, at `number`, turns to digit `n`. */
export declare const turn: (number: number, drum: Drum, n: number) => number;

/** The offset of the first of `placed` with `number`, or none: the list stays where it is. */
export declare const foundOffset: (
  placed: ReadonlyArray<{ readonly number: number; readonly offset: number }>,
  number: number,
) => { readonly _tag: 'Some'; readonly value: number } | { readonly _tag: 'None' };
