/** The hymnal's app module on the page (`index.js`), as the workspace's typecheck and the Bun tests read it. */

export declare function connect(host: {
  readonly changed: (topic: string) => void;
  readonly agent: boolean;
  readonly now: () => number;
}): void;

/** A request's and an answer's fields: an op's name and numbers, an answer's counts and words. */
type Fields = Readonly<Record<string, string | number | boolean>>;

export declare function later(request: Fields): Promise<Fields>;

/** A finger down, in the page's points. */
interface Point {
  readonly x: number;
  readonly y: number;
}

/** The pinch's tracker (`index.js`): fed each touch, it answers the report it made, or "" with none. */
export declare function pinchTracker(
  report?: (word: string) => void,
): (
  kind: 'start' | 'move' | 'end' | 'cancel',
  points: ReadonlyArray<Point>,
  time: number,
  enabled: boolean,
) => string;

/** A hatch's handle as the page module is handed it (Exact's `host/web-js/hatches.js`). */
interface Hatched {
  readonly hatch: string;
  readonly data: Readonly<Partial<Record<string, string>>>;
  readonly element: EventTarget & { readonly localName: string };
  readonly isNew: boolean;
  readonly diagnostics: { log(line: string): void };
}

export declare function element(e: Hatched): void;
export declare function elementEnded(e: Hatched): void;
