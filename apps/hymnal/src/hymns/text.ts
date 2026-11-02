/**
 * A hymn's words as the reader shows them: its number, its title, its first
 * line, and its sections in the order the hymnal sings them (each stanza,
 * and the refrain written out each time it is sung). The order is the
 * compiled package's own `sung`; this module only groups its lines.
 *
 * Each refrain section names the stanza it is sung with (`stanza`), so a
 * choice of stanzas keeps it with them, by the hymn's refrain order: after
 * each stanza, the stanza before it; first and after each, the opening
 * refrain the hymn's own (0) and each other the stanza before it; before
 * each stanza, the stanza after it; first and last, and after the last, the
 * hymn's own (0), sung whatever stanzas are chosen.
 *
 * It is derived from the compiled set when the app is bundled
 * (`vite/hymnal.ts`): the words alone, never the chords, which come in a
 * module of their own (`virtual:hymnal-chords`, `chords.ts`).
 */

import { type Hymn, type Order, sung } from '@manna/hymnal/hymn';
import { Match, Option } from 'effect';

export type Section =
  | { readonly kind: 'stanza'; readonly n: number; readonly lines: ReadonlyArray<string> }
  | {
      readonly kind: 'refrain';
      /** The stanza this refrain is sung with, or 0 for the hymn's own refrain, kept with any stanza. */
      readonly stanza: number;
      readonly lines: ReadonlyArray<string>;
    };

export interface HymnText {
  readonly number: number;
  readonly title: string;
  /** The first line of stanza 1, as the hymnal indexes it. */
  readonly firstLine: string;
  /** The hymnal's topical section the hymn is printed in, by its printed name. */
  readonly topic: string;
  readonly sections: ReadonlyArray<Section>;
}

interface Run {
  readonly verse: number | 'refrain';
  readonly lines: string[];
}

/** The stanza the run at `at` sings, or 0 for a refrain's run or none there. */
const stanzaAt = (runs: ReadonlyArray<Run>, at: number): number =>
  Option.fromUndefinedOr(runs[at]).pipe(
    Option.map((run) => run.verse),
    Option.filter((verse): verse is number => verse !== 'refrain'),
    Option.getOrElse(() => 0),
  );

/** The stanza the refrain run at `at` is sung with, by the hymn's refrain `order`. */
const boundTo = (order: Order, runs: ReadonlyArray<Run>, at: number): number =>
  Match.value(order).pipe(
    Match.whenOr('after-each', 'first-and-after-each', () => stanzaAt(runs, at - 1)),
    Match.when('before-each', () => stanzaAt(runs, at + 1)),
    Match.whenOr('first-and-last', 'after-last', () => 0),
    Match.exhaustive,
  );

/** The words of `hymn`, in the topical section named `topic`. */
export const textOf = (hymn: Hymn, topic: string): HymnText => {
  const runs: Array<Run> = [];
  for (const line of sung(hymn)) {
    const last = runs.at(-1);
    if (last?.verse === line.verse) last.lines.push(line.text);
    else runs.push({ verse: line.verse, lines: [line.text] });
  }
  const first = runs.find((run) => run.verse === 1)?.lines[0];
  const order = Option.fromUndefinedOr(hymn.refrain?.order);
  return {
    number: hymn.number,
    title: hymn.title,
    firstLine: Option.getOrElse(Option.fromNullishOr(first), () => ''),
    topic,
    sections: runs.map(({ verse, lines }, at): Section => {
      if (verse !== 'refrain') return { kind: 'stanza', n: verse, lines };
      const stanza = Option.match(order, { onNone: () => 0, onSome: (o) => boundTo(o, runs, at) });
      return { kind: 'refrain', stanza, lines };
    }),
  };
};
