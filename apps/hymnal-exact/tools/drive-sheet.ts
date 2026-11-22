/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noAs, effect/noNullish, effect/noAsyncFunction, effect/noUnknownParameters, effect/noTernary -- a host script that drives the built app through `bun run exact agent` and reads its untyped JSON replies by the fields it checks. */

/**
 * The player sheet's live checks a `.test.contract` cannot hold: the names
 * the screen reader is given, and the page's drawn lines. Through
 * `@manna/exact-kit/drive` on the host named (`bun tools/drive-sheet.ts
 * web|ios`), on hymn 7 playing with its sheet open:
 *
 * - the sheet's title carries the current FullPlayer's hint "Opens the
 *   hymn's page.", and Reading is the current ReadingSheet's: a group named
 *   "Reading", the dial named "Text size", radio groups "Font" and "Line
 *   spacing" whose rows are named by One's `fontChoices` and
 *   `spacingChoices` with the kept one checked, and a switch "Keep screen
 *   on" (`tree --ax`);
 * - the page's first stanza line, drawn behind the sheet, grows as the
 *   current `readingStyle`'s line height does: from step 2 to step 5, then
 *   from Normal to Roomy spacing, its height's ratio is One's within 2%
 *   (`layout`).
 *
 * Exits 1 on any failed check.
 */

import { join } from 'node:path';

import { readingStyle, defaultReading } from '@manna/hymnal-app/reader/reading';
import { fontChoices, spacingChoices } from '@manna/hymnal-app/reader/reading-choices';
import { makeDrive } from '@manna/exact-kit/drive';

const host = process.argv[2] ?? 'web';
const drive = makeDrive({ name: 'drive-sheet', host, appDir: join(import.meta.dir, '..') });
const store = (name: string) => `sheet-${name}-${host}-${Date.now().toString(36)}`;

interface Ax {
  readonly testId?: string;
  readonly role?: string;
  readonly name?: string;
  readonly description?: string;
  readonly states?: { readonly checked?: boolean };
}

/** The elements of a `tree --ax` reply. */
const axOf = (reply: unknown): ReadonlyArray<Ax> =>
  (reply as { ax?: { elements?: ReadonlyArray<Ax> } } | undefined)?.ax?.elements ?? [];

/** The element of a `tree --ax` reply the id names. */
const axAt = (reply: unknown, id: string): Ax | undefined =>
  axOf(reply).find((element) => element.testId === id);

/** The height a `layout` reply gives its node, in the page's pixels. */
const heightOf = (reply: unknown): number =>
  (reply as { node?: { space?: { viewport?: { h?: number } } } } | undefined)?.node?.space?.viewport
    ?.h ?? Number.NaN;

const opened = [
  'clock data',
  'tap gear',
  'clock settle',
  'tap settings-feel',
  'clock settle',
  'tap settings-done',
  'clock settle',
  'tap hymn-7',
  'clock settle',
  'clock data',
  'tap play',
  'clock data',
  'clock settle',
  'tap bar-title',
  'clock settle',
  'clock data',
];
const replies = await drive.launch(store('names'), [
  ...opened,
  'tree --ax player-title',
  'tree --ax reading',
  'layout line-stanza-1-1',
  'tap dial-size-stop-5',
  'clock data',
  'clock settle',
  'layout line-stanza-1-1',
  'tap reading-spacing-roomy',
  'clock data',
  'clock settle',
  'layout line-stanza-1-1',
]);
const [title, reading, atTwo, , , , atFive, , , , roomy] = replies.slice(opened.length);

const hint = axAt(title, 'player-title');
drive.check(
  'the sheet’s title carries the current hint "Opens the hymn’s page."',
  hint?.description === 'Opens the hymn’s page.' || hint?.description === "Opens the hymn's page.",
  hint,
);
const group = axAt(reading, 'reading');
drive.check('Reading is a group named "Reading"', group?.name === 'Reading', group);
const size = axAt(reading, 'dial-size-value');
drive.check('its dial is named "Text size"', size?.name === 'Text size', size);
for (const [id, label, rows, kept] of [
  ['reading-font', 'Font', fontChoices, 'system'],
  ['reading-spacing', 'Line spacing', spacingChoices, 'normal'],
] as const) {
  const choices = axAt(reading, id);
  drive.check(`"${label}" is a radio group named so`, choices?.name === label, choices);
  for (const row of rows) {
    const at = axAt(reading, `${id}-${row.value}`);
    drive.check(
      `its row ${row.value} is a radio named "${row.label}", checked when kept`,
      at?.role === 'radio' &&
        at.name === row.label &&
        (at.states?.checked === true) === (row.value === kept),
      at,
    );
  }
}
const awake = axAt(reading, 'reading-awake');
drive.check(
  'Keep screen on is a switch named so',
  awake?.name === 'Keep screen on' && (awake.role === 'switch' || awake.role === 'checkbox'),
  awake,
);

const line = (size: number, spacing: 'normal' | 'roomy') =>
  readingStyle({ ...defaultReading, size, spacing }, 1).words.lineHeight;
const near = (got: number, want: number) => Math.abs(got / want - 1) < 0.02;
const two = heightOf(atTwo);
const five = heightOf(atFive);
const wide = heightOf(roomy);
drive.check(
  'from step 2 to step 5 the page’s line grows as the current line height does',
  near(five / two, line(5, 'normal') / line(2, 'normal')),
  { two, five, want: line(5, 'normal') / line(2, 'normal') },
);
drive.check(
  'from Normal to Roomy spacing it grows as the current line height does',
  near(wide / five, line(5, 'roomy') / line(5, 'normal')),
  { five, wide, want: line(5, 'roomy') / line(5, 'normal') },
);

process.exit(drive.finish());
