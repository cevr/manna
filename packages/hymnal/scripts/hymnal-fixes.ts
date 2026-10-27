/**
 * Applies printed corrections to independent source text, recompiles JSON,
 * then rebuilds SQLite through its sole writer, compile-db.ts:
 *
 *   bun packages/hymnal/scripts/hymnal-fixes.ts [--out <absolute-db-file>]
 *
 * A printed source is `data/fixes/<NNN>.json`: the hymn as its page prints
 * it, each line with where it was read. Its refrain is a list of lines, and a
 * part of it that the page prints once for each stanza (`varies`, each with
 * the stanzas it follows) stands among them. The row is laid out as the
 * compiler reads it:
 *
 * - a refrain that varies: no single refrain fits every stanza, so each
 *   stanza is written with the refrain sung after it, its own part in place,
 *   as ids 0 to n - 1, and the hymn has no refrain of its own;
 * - a refrain that does not vary: the stanzas as ids 0 to n - 1 and the
 *   refrain as id -1 (where it is sung is `data/fixes/refrains.json`'s);
 * - no refrain: the stanzas as ids 0 to n - 1.
 *
 * Only the rows with a printed source are written. The output depends on the
 * sources alone, so a rerun writes the same rows. `--out` selects the generated
 * database; it never selects an input database.
 */

import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, Schema } from 'effect';
import { readdirSync } from 'node:fs';
import path from 'node:path';

import { buildDatabase, OUTPUT, readDatabaseSources } from './compile-db.js';
import { readSourceText, SOURCE_TEXT } from './source-text.js';

const Line = Schema.Struct({ text: Schema.String, from: Schema.String });
const Lines = Schema.Array(Line);
const Varies = Schema.Struct({
  varies: Schema.Array(Schema.Struct({ after: Schema.Array(Schema.Int), lines: Lines })),
});
const Printed = Schema.fromJsonString(
  Schema.Struct({
    number: Schema.Int,
    title: Schema.String,
    print: Schema.String,
    stanzas: Schema.Array(Lines),
    refrain: Schema.optionalKey(
      Schema.Struct({ lines: Schema.Array(Schema.Union([Line, Varies])) }),
    ),
  }),
);
type Printed = typeof Printed.Type;
const Verses = Schema.fromJsonString(
  Schema.Array(Schema.Struct({ id: Schema.Int, text: Schema.String })),
);

const textOf = (lines: ReadonlyArray<{ readonly text: string }>) =>
  lines.map((line) => line.text).join('\n');

/** The refrain's lines as sung after stanza `n` (1-based), its varying part resolved. */
const refrainAfter = (printed: Printed, n: number) =>
  (printed.refrain?.lines ?? []).flatMap((item) => {
    if (!('varies' in item)) return [item];
    const part = item.varies.find((one) => one.after.includes(n));
    if (part === undefined)
      throw new Error(`hymn ${printed.number}: no refrain part for stanza ${n}`);
    return part.lines;
  });

/** The row's verses as the compiler reads them. */
const versesOf = (printed: Printed): typeof Verses.Type => {
  const refrain = printed.refrain;
  if (refrain !== undefined && refrain.lines.some((item) => 'varies' in item))
    return printed.stanzas.map((stanza, n) => ({
      id: n,
      text: textOf([...stanza, ...refrainAfter(printed, n + 1)]),
    }));
  const stanzas = printed.stanzas.map((stanza, n) => ({ id: n, text: textOf(stanza) }));
  return refrain === undefined
    ? stanzas
    : [{ id: -1, text: textOf(refrainAfter(printed, 1)) }, ...stanzas];
};

if (import.meta.main) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--out');
  const file = at < 0 ? OUTPUT : path.resolve(args[at + 1] ?? '');
  const dir = path.resolve(import.meta.dir, '../data/fixes');
  const sources = readdirSync(dir)
    .filter((name) => /^\d{3}\.json$/.test(name))
    .toSorted();
  const source = await Effect.runPromise(readSourceText().pipe(Effect.provide(BunServices.layer)));
  const hymns = [...source.hymns];
  for (const name of sources) {
    const printed = Schema.decodeSync(Printed)(await Bun.file(path.join(dir, name)).text());
    if (`${String(printed.number).padStart(3, '0')}.json` !== name)
      throw new Error(`${name} prints hymn ${printed.number}`);
    const before = hymns[printed.number - 1];
    if (before?.number !== printed.number)
      throw new Error(`hymn ${printed.number} is not in source text`);
    const verses = versesOf(printed);
    hymns[printed.number - 1] = { ...before, verses };
    console.log(`hymnal-fixes ${printed.number} wrote ids ${verses.map((v) => v.id).join(' ')}`);
  }
  if (JSON.stringify(hymns) !== JSON.stringify(source.hymns))
    await Bun.write(SOURCE_TEXT, `${JSON.stringify({ ...source, hymns }, null, 2)}\n`);
  const compiled = Bun.spawnSync(['bun', path.resolve(import.meta.dir, 'compile.ts')], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (compiled.exitCode !== 0) throw new Error('hymnal-fixes: compile failed');
  await Effect.runPromise(
    Effect.gen(function* () {
      yield* buildDatabase(file, yield* readDatabaseSources());
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );
}
