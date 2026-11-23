/** The pinned row's state: shown or not, the offset the current run counts from, and `held` from the app's move until the reader touches the list. */
export interface Reveal {
  readonly shown: boolean;
  readonly from: number;
  readonly held?: true;
}

/** The distance one way, in points, that turns the row. */
export declare const travel: number;

/** How long the row takes to turn, in milliseconds: its slide, and its fade alone under Reduce Motion. */
export declare const revealTimes: { readonly slide: number; readonly fade: number };

/** The pinned row at the list's opening: hidden, counting from the resting place. */
export declare const hidden: (rest: number) => Reveal;

/** The row's state once the list's offset is `scroll`, its resting place `rest`. */
export declare const revealAt: (state: Reveal, scroll: number, rest: number) => Reveal;

/** The row's state once the app moves the list to `scroll` itself: it turns nothing and holds the row until a touch. */
export declare const jumped: (state: Reveal, scroll: number) => Reveal;

/** The row's state once the reader's finger meets the list at `scroll`. */
export declare const touched: (state: Reveal, scroll: number, rest: number) => Reveal;

/** Whether the pinned row is shown and takes touches. */
export declare const inReach: (state: Reveal, scroll: number, rest: number) => boolean;

/** How many points of the list's top the pinned row covers, its box `height` tall, slid in by `progress`. */
export declare const shownHeight: (
  progress: number,
  height: number,
  scroll: number,
  rest: number,
) => number;
