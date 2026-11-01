/**
 * The verse-starts pin: every hymn 1-695's verse starts, read as the compile
 * reads them (the MIDI bytes through `Midi.parse`, then the exported
 * `Score.fromMidi(midi, stanzas)`), equal the committed table
 * `data/verse-starts.json`. A start is the melody index of the note that
 * opens a verse; `exact` is the reader's own flag. Any reader change that
 * moves one start, or flips one flag, turns this red and names the hymn.
 *
 * The table is a pin. Regenerate it only on purpose, with
 * `bun run verse-starts`, after a review of the hymns this test names; the
 * compile never writes it.
 */
/* oxlint-disable effect/noNodeBuiltinImport -- read-only pin test boundary. */
import { readFileSync } from 'node:fs';
import { expect, test } from 'bun:test';
import { Schema } from 'effect';

import { HYMNS, TABLE, Table, type VerseStarts, readVerseStarts } from '../scripts/verse-starts.js';

const rowOf = (row: VerseStarts | undefined) =>
  row === undefined ? 'none' : `starts=${row.starts.join(',')} exact=${row.exact}`;

test('every hymn verse starts equal the committed table', () => {
  const table = Schema.decodeSync(Schema.fromJsonString(Table))(readFileSync(TABLE, 'utf8')).hymns;
  const reads = readVerseStarts();
  expect(table.length).toBe(HYMNS);
  const moved = reads.flatMap((read, i) => {
    const row = table[i];
    return row !== undefined && row.number === read.number && rowOf(row) === rowOf(read)
      ? []
      : [`hymn ${read.number}: table ${rowOf(row)} read ${rowOf(read)}`];
  });
  expect(moved).toEqual([]);
});
