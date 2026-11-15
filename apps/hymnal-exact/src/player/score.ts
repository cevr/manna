/* oxlint-disable effect/noNullish -- Exact's data module cannot import effect (docs/exact.md): a hymn with no timing is undefined, as Exact's option is null on the wire. */

/**
 * A hymn as the player sings it: how many stanza chips it has, and its
 * recording's time read as sung time under a choice of stanzas. The rules
 * are the current app's, imported: `keptOf` says which sung lines a choice
 * keeps, `cutOf` takes the rest out of the timeline, and the player shows
 * the cut's sung time (`sungAt`), as its `sound.ts` does. A hymn with no
 * timeline sings every line: its sung time is the recording's.
 */

import { chosenOf, countOf, cutOf, keptOf, toggle } from '@manna/hymnal-app/player/stanzas';
import type { Section, Timeline } from '@manna/hymnal-app/player/stanzas';

/** The stanzas chosen, ascending, each once; `[]` is every stanza. */
export type Choice = ReadonlyArray<number>;

export interface Score {
  /** How many stanza chips the hymn has. */
  readonly count: number;
  /** The sung seconds of `recording` seconds of the recording under `choice`. */
  readonly sung: (choice: Choice, recording: number) => number;
  /** The choice after a tap on stanza `stanza`'s chip. */
  readonly toggle: (choice: Choice, stanza: number) => Choice;
  /** The stanzas `choice` sings: each chip's number, chosen or not. */
  readonly chosen: (choice: Choice) => ReadonlyArray<number>;
}

/** The score of a hymn of `sections`, timed by `timeline` when it has one. */
export const scoreOf = (
  sections: ReadonlyArray<Section>,
  timeline: Timeline | undefined,
): Score => {
  const count = countOf(sections);
  const sung = (choice: Choice, recording: number) => {
    if (timeline === undefined || choice.length === 0) return recording;
    return cutOf(timeline, keptOf(sections, choice)).sungAt(recording * 1000) / 1000;
  };
  return {
    count,
    sung,
    toggle: (choice, stanza) => toggle(choice, stanza, count),
    chosen: (choice) => chosenOf(choice, count),
  };
};

/** A score with no stanzas and no timing: the recording's time as it is. */
export const plainScore: Score = scoreOf([], undefined);
