/** A recital's start, with the zone's offset (minutes east of UTC) at it when its record keeps one. */
export interface Started {
  readonly startedAt: number;
  readonly offset?: number;
}

/** The reader's day number of `recital`: its local date in a day that turns at 04:00, by its own offset. */
export declare const dayOf: (recital: Started) => number;
