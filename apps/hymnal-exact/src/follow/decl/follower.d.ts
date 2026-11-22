/**
 * The current hymnal's follow on one hymn page (`src/follow/follower.ts`),
 * as Exact's type check reads it (the app's `tsconfig.json` maps
 * `@manna/hymnal-app/follow/follower` here): that check stages a package's
 * declarations, never its source, and the source reaches `effect`. It
 * names what the port reads, in its own terms; `src/follow/follow.model.test.ts`
 * assigns the source's export to it, so a rename or retype fails the typecheck.
 */

import type { Timeline } from '@manna/hymnal-app/player/stanzas';

type Sounding = 'playing' | 'waiting' | 'paused';

/** What the player tells the page: away from it, or here at sung ms `at`, sounding or not, at `rate`. */
export type Report =
  | Readonly<{ _tag: 'Away' }>
  | Readonly<{ _tag: 'Here'; at: number; state: Sounding; rate?: number }>;

/** The follow's host: the time, its timers, the scroll and the dev log. */
export interface Host {
  now(): number;
  wake(after: number, then: () => void): () => void;
  scrollTo(at: number, moves: boolean): void;
  log(said: string): void;
}

/** A page's follow. */
export interface Follower {
  readonly marks: { readonly markOf: (line: number) => number; readonly line: () => number };
  readonly report: (told: Report) => void;
  readonly held: { readonly get: () => boolean };
  readonly drag: () => void;
  readonly seek: () => void;
  readonly resume: () => void;
  readonly show: () => void;
  readonly relayout: () => void;
  readonly beginPreview: () => void;
  readonly endPreview: (restore: boolean, animated: boolean) => void;
  readonly stop: () => void;
}

/** How long before a line is sung the page scrolls to it. */
export declare const LEAD: number;

export declare const followerOf: (timeline: Timeline, host: Host) => Follower;
