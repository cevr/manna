/* oxlint-disable effect/noNullish, effect/noTernary, effect/noAs -- Exact's data module cannot import effect (docs/exact.md): a hymn with no timing, or a stanza with no place, is undefined, as Exact's option is null on the wire, and `targetAt`'s none is named by the shape it takes at run time. */

/**
 * A hymn as the player sings it: how many stanza chips it has, its
 * recording's time read as sung time under a choice of stanzas and back,
 * the recording's spans a choice leaves out, and where each stanza starts.
 * The rules are the current app's, imported: `keptOf` says which sung lines
 * a choice keeps, `cutOf` takes the rest out of the timeline (its `sungAt`,
 * `recordingAt` and `skips`), and a stanza's place is its first line's
 * target (`targetsOf`, `targetAt`). A hymn with no timeline sings every
 * line: its sung time is the recording's, it skips nothing, and its stanzas
 * have no place.
 */

import { targetAt, targetsOf } from '@manna/hymnal-app/follow/seek-targets';
import { chosenOf, countOf, cutOf, keptOf, toggle } from '@manna/hymnal-app/player/stanzas';
import type { Section, Timeline } from '@manna/hymnal-app/player/stanzas';

/** The stanzas chosen, ascending, each once; `[]` is every stanza. */
export type Choice = ReadonlyArray<number>;

/** A span of the recording a choice does not sing, from `from` up to `to`, in seconds. */
export interface Span {
  readonly from: number;
  readonly to: number;
}

export interface Score {
  /** How many stanza chips the hymn has. */
  readonly count: number;
  /** The sung seconds of `recording` seconds of the recording under `choice`. */
  readonly sung: (choice: Choice, recording: number) => number;
  /** The recording's seconds of `sung` seconds under `choice`: inside a kept line. */
  readonly recording: (choice: Choice, sung: number) => number;
  /** The recording's spans `choice` leaves out, in order. */
  readonly skips: (choice: Choice) => ReadonlyArray<Span>;
  /** Where stanza `stanza` starts in sung seconds under `choice`; none when it is not sung or not timed. */
  readonly stanzaAt: (choice: Choice, stanza: number) => number | undefined;
  /** The choice after a tap on stanza `stanza`'s chip. */
  readonly toggle: (choice: Choice, stanza: number) => Choice;
  /** The stanzas `choice` sings: each chip's number, chosen or not. */
  readonly chosen: (choice: Choice) => ReadonlyArray<number>;
}

/** The index among a hymn's sung lines of stanza `stanza`'s first line; -1 for none. */
const firstLineOf = (sections: ReadonlyArray<Section>, stanza: number): number => {
  let line = 0;
  for (const section of sections) {
    if (section.kind === 'stanza' && section.n === stanza)
      return section.lines.length > 0 ? line : -1;
    line += section.lines.length;
  }
  return -1;
};

/** A line's own place, with no word: `targetAt`'s none. */
const LINE = { _tag: 'None' } as Parameters<typeof targetAt>[2];

/** The score of a hymn of `sections`, timed by `timeline` when it has one; `hymn` places its stanzas. */
export const scoreOf = (
  sections: ReadonlyArray<Section>,
  timeline: Timeline | undefined,
  hymn?: Parameters<typeof targetsOf>[0],
): Score => {
  const count = countOf(sections);
  const cut = (choice: Choice) =>
    timeline === undefined || choice.length === 0
      ? undefined
      : cutOf(timeline, keptOf(sections, choice));
  return {
    count,
    sung: (choice, recording) => {
      const made = cut(choice);
      return made === undefined ? recording : made.sungAt(recording * 1000) / 1000;
    },
    recording: (choice, sung) => {
      const made = cut(choice);
      return made === undefined ? sung : made.recordingAt(sung * 1000) / 1000;
    },
    skips: (choice) =>
      (cut(choice)?.skips ?? []).map((skip) => ({ from: skip.from / 1000, to: skip.to / 1000 })),
    stanzaAt: (choice, stanza) => {
      if (timeline === undefined || hymn === undefined) return undefined;
      const targets = targetsOf(hymn, timeline, choice);
      if (targets._tag === 'None') return undefined;
      const target = targetAt(targets.value, firstLineOf(sections, stanza), LINE);
      return target._tag === 'None' ? undefined : target.value.ms / 1000;
    },
    toggle: (choice, stanza) => toggle(choice, stanza, count),
    chosen: (choice) => chosenOf(choice, count),
  };
};

/** A score with no stanzas and no timing: the recording's time as it is. */
export const plainScore: Score = scoreOf([], undefined);
