/** The session lengths a reader chooses from, in minutes, shortest first; see `src/session.ts`. */
export declare const MINUTES: readonly [2, 5, 10, 20];
/** One of the session lengths. */
export type Minutes = (typeof MINUTES)[number];
