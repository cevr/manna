/* oxlint-disable effect/noNullish, effect/noTernary -- Exact's data module cannot import effect (docs/exact.md): a hymn with no timing is undefined, as Exact's option is null on the wire. */

/**
 * The timeline a hymn page's follow reads, as the current hymnal makes it:
 * the hymn's bundled timeline cut to its chosen stanzas (`useSung` in its
 * `follow.tsx`: `cutOf` and `keptOf`, in the sung time the player's place
 * is read in), and the line its count-in is drawn over (`useCountLine`:
 * the line the follow holds at the first sung line's start). The marks
 * themselves are the current follower's (`follow.ts`).
 */

import { placeAt, timelineOf } from '@manna/hymnal-app/follow/timeline';
import { type Section, type Timeline, cutOf, keptOf } from '@manna/hymnal-app/player/stanzas';

/** Hymn `number`'s bundled timeline, decoded; undefined when it has none that decodes. */
export const timelineIn = (
  timing: ReadonlyMap<number, string>,
  number: number,
): Timeline | undefined => {
  const decoded = timelineOf(timing.get(number) ?? '');
  return decoded._tag === 'Some' ? decoded.value : undefined;
};

/** The timeline as Play sings it under `choice` (`[]` every stanza): the current `useSung`. */
export const sungOf = (
  timeline: Timeline,
  sections: ReadonlyArray<Section>,
  choice: ReadonlyArray<number>,
): Timeline => cutOf(timeline, keptOf(sections, choice)).timeline;

/** The line the count-in is drawn over: the sung line at the uncut timeline's first line's start. */
export const countLineOf = (sung: Timeline, first: number): number =>
  Math.max(0, placeAt(sung, first).line);
