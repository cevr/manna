/**
 * Reads every hymn's verse starts as the compile reads them, and writes the
 * pin `data/verse-starts.json` that `src/verse-starts.slow.test.ts` holds the
 * reader to. Each hymn's MIDI bytes go to `Midi.parse`, then to
 * `Score.fromMidi(midi, stanzas)`, where the stanzas are its source-text
 * verses with `id >= 0`. A start is the melody index of the note that opens
 * the verse's span. The table holds numbers and booleans only, no words.
 *
 * The table is a pin. Regenerate it only on purpose, after a review of the
 * reads that moved; the compile never writes it.
 *
 *   bun run verse-starts
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { Effect, Schema } from 'effect';

import { Midi, Score } from '../src/index.js';

export const VerseStarts = Schema.Struct({
  number: Schema.Int,
  starts: Schema.Array(Schema.Int),
  exact: Schema.Boolean,
});
export type VerseStarts = typeof VerseStarts.Type;

/** The table file: `{ "hymns": [ { "number", "starts", "exact" }, … ] }`, in number order. */
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

/** Each hymn's stanza count: its source-text verses that are not a refrain (`id >= 0`). */
const stanzaCounts = (): ReadonlyMap<number, number> => {
  const source = JSON.parse(readFileSync(`${data}source-text.json`, 'utf8')) as SourceText;
  return new Map(
    source.hymns.map((hymn) => [hymn.number, hymn.verses.filter((verse) => verse.id >= 0).length]),
  );
};

/** Every hymn 1-695's verse starts, in number order, read through `Score.fromMidi`. */
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

/** One row a line, in the layout the formatter keeps. */
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
