import { readFileSync, writeFileSync } from 'node:fs';
import { Effect, Schema } from 'effect';

import { Midi, Score } from '../src/index.js';

export const VerseStarts = Schema.Struct({
  number: Schema.Int,
  starts: Schema.Array(Schema.Int),
  exact: Schema.Boolean,
});
export type VerseStarts = typeof VerseStarts.Type;

export const Table = Schema.Struct({ hymns: Schema.Array(VerseStarts) });

export const HYMNS = 695;

const data = new URL('../data/', import.meta.url).pathname;

export const TABLE = `${data}verse-starts.json`;

interface SourceText {
  readonly hymns: ReadonlyArray<{
    readonly number: number;
    readonly verses: ReadonlyArray<{ readonly id: number }>;
  }>;
}

const stanzaCounts = (): ReadonlyMap<number, number> => {
  const source = JSON.parse(readFileSync(`${data}source-text.json`, 'utf8')) as SourceText;
  return new Map(
    source.hymns.map((hymn) => [hymn.number, hymn.verses.filter((verse) => verse.id >= 0).length]),
  );
};

export const readVerseStarts = (): ReadonlyArray<VerseStarts> => {
  const stanzas = stanzaCounts();
  return Array.from({ length: HYMNS }, (_, i) => {
    const number = i + 1;
    const bytes = readFileSync(`${data}midi/${String(number).padStart(3, '0')}.mid`);
    const score = Score.fromMidi(Effect.runSync(Midi.parse(bytes)), stanzas.get(number) ?? 0);
    const ons = score.melody.map((note) => note.start);
    return {
      number,
      starts: score.verses.spans.map((span) => ons.indexOf(span.start)),
      exact: score.verses.exact,
    };
  });
};

export const formatTable = (rows: ReadonlyArray<VerseStarts>): string =>
  `{\n  "hymns": [\n${rows
    .map(
      (row) =>
        `    { "number": ${row.number}, "starts": [${row.starts.join(', ')}], "exact": ${row.exact} }`,
    )
    .join(',\n')}\n  ]\n}\n`;

if (import.meta.main) {
  const rows = readVerseStarts();
  writeFileSync(TABLE, formatTable(rows));
  console.log(`verse-starts: wrote ${rows.length} hymns to data/verse-starts.json`);
}
