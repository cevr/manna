/** The rail's gutter at the list's right edge, in points. */
export declare const GUTTER: number;

/** A label's type size and line height at a text size of 1, in points. */
export declare const LABEL_SIZE: number;
export declare const LABEL_LINE: number;

/** The most a label's type grows with the reader's text size. */
export declare const LABEL_SCALE: number;

/** The top of label `index` of `count`, as a percent of the rail's height. */
export declare const labelAt: (index: number, count: number) => number;

/** The band under a touch at `y` on a rail `length` tall, cut into `count` bands. */
export declare const markAt: (y: number, length: number, count: number) => number;

/** The topics a drag passes going from topic place `before` to `now`. */
export declare const crossings: (before: number, now: number) => number;

/** `shown` places spread evenly from the first to the last of `count`. */
export declare const labelsOf: (count: number, shown: number) => ReadonlyArray<number>;
