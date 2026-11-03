import { type Hymn, type Order, sung } from '@manna/hymnal/hymn';
import { Match, Option } from 'effect';

export type Section =
  | { readonly kind: 'stanza'; readonly n: number; readonly lines: ReadonlyArray<string> }
  | {
      readonly kind: 'refrain';
      readonly stanza: number;
      readonly lines: ReadonlyArray<string>;
    };

export interface HymnText {
  readonly number: number;
  readonly title: string;
  readonly firstLine: string;
  readonly topic: string;
  readonly sections: ReadonlyArray<Section>;
}

interface Run {
  readonly verse: number | 'refrain';
  readonly lines: string[];
}

const stanzaAt = (runs: ReadonlyArray<Run>, at: number): number =>
  Option.fromUndefinedOr(runs[at]).pipe(
    Option.map((run) => run.verse),
    Option.filter((verse): verse is number => verse !== 'refrain'),
    Option.getOrElse(() => 0),
  );

const boundTo = (order: Order, runs: ReadonlyArray<Run>, at: number): number =>
  Match.value(order).pipe(
    Match.whenOr('after-each', 'first-and-after-each', () => stanzaAt(runs, at - 1)),
    Match.when('before-each', () => stanzaAt(runs, at + 1)),
    Match.whenOr('first-and-last', 'after-last', () => 0),
    Match.exhaustive,
  );

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
