/* oxlint-disable effect/noNodeBuiltinImport, effect/noAs, effect/noAsyncFunction -- the current app's table module is imported by its path and typed by what it holds; a build-time host script, imported by src/hymns/make.ts before each Exact command: it writes the current app's meaning table as files the iOS app ships; it runs under Bun, never in the data module. */

/**
 * The current app's meaning table (`apps/hymnal/assets/meaning/meaning.js`)
 * as files the iOS app ships under `Resources/meaning` (`app.json`
 * `host.ios.resources`), one field a file (`MEANING_FIELDS`), with the
 * table's notice and terms beside them, so the data module reads the table
 * at the first search (`src/results/table.ts`) and never bundles it. A file
 * is written only when its text changes. None of them is committed.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { MEANING_FIELDS } from './fields.ts';

const source = new URL('../../../hymnal/assets/meaning/', import.meta.url);
const folder = new URL('../../meaning/', import.meta.url).pathname;

const { meaning } = (await import(new URL('meaning.js', source).href)) as {
  readonly meaning: () => Readonly<Record<string, string | number>>;
};
const file = meaning();

const files: ReadonlyArray<readonly [string, string]> = [
  ...MEANING_FIELDS.map((field) => [field, String(file[field])] as const),
  ...['LICENSE', 'NOTICE', 'gemma-terms.js'].map(
    (name) => [name, readFileSync(new URL(name, source), 'utf8')] as const,
  ),
];

mkdirSync(folder, { recursive: true });
for (const [name, text] of files) {
  const path = `${folder}${name}`;
  if (!existsSync(path) || readFileSync(path, 'utf8') !== text) writeFileSync(path, text);
}
