/** `src/remote.ts` as Exact's type check reads it: where the recordings are served, and each one's key and address. */
export declare const HYMNS_ORIGIN: string;

/** A sounding offset in -5..6, octave-equivalent keys sharing one. */
export declare const soundingOffset: (offset: number) => number;

/** The bucket key of hymn `hymn`'s recording at `offset`: `audio/<set>/sdah/<n>.mp3`. */
export declare const audioKey: (hymn: number, offset?: number) => string;

/** The public address of hymn `hymn`'s recording at `offset`. */
export declare const audioUrl: (hymn: number, offset?: number) => string;
