/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noAsyncFunction, effect/noNullish, effect/noTernary, effect/noAs, effect/noUnknownParameters, node/no-process-env -- a host script that drives the built app through `bun run exact agent` (the kit's drive, one process group per run), reads the colours its layout replies name and prints what it found; its shots folder is named by SHOTS. */

/**
 * Settings' live colour checks (spec B2, B3), which a `.test.contract`
 * cannot hold at Exact's pin: an authored test reads text, state and the
 * tree, never a painted colour. The agent's `layout` names each node's
 * colours, so the same steps run here, on the host named
 * (`bun tools/drive-settings.ts web|ios`):
 *
 * - at launch, light and dark, the list's ground, a section's header and a
 *   hymn's row, and a hymn's page, read the brand's roles;
 * - Dark chosen with the system light turns the list under the sheet dark
 *   at once, and a relaunch on the kept store draws its first frame dark,
 *   the sheet showing Dark chosen; System then follows the system.
 *
 * The brand's colours are the current hymnal's theme (`app.tamber` is held
 * to it by `src/look/brand.test.ts`). With `SHOTS=<dir>`, the list, a hymn
 * and the sheet are kept there, light and dark. Exits 1 on any failed check.
 */

import { join } from 'node:path';

import { makeDrive } from '@manna/exact-kit/drive';
import { theme } from '@manna/hymnal-app/theme';

import { pixelAt } from './pixel.ts';

const host = process.argv[2] ?? 'web';
const app = join(import.meta.dir, '..');
const shots = process.env.SHOTS ?? join(app, '.exact/shots/settings');
const shot = (name: string) => `screenshot ${join(shots, `${name}-${host}.png`)}`;
const drive = makeDrive({ name: 'drive-settings', host, appDir: app });

type Scheme = 'light' | 'dark';
type Role = keyof (typeof theme)['light'];

/** A colour as its red, green and blue, 0 to 255, from `rgb(…)`, `rgba(…)` or `#rrggbb`; `[]` when it is none of them. */
const channels = (colour: string): ReadonlyArray<number> => {
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/iu.exec(colour);
  if (hex) return hex.slice(1, 4).map((pair) => Number.parseInt(pair, 16));
  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/u.exec(colour);
  if (rgb) return rgb.slice(1, 4).map((part) => Math.round(Number(part)));
  return [];
};

/** The colour a layout reply names for `property` (`background_color`, `text_color`), or "". */
const colourOf = (reply: unknown, property: string): string => {
  const style = (reply as { node?: { style?: Record<string, { value?: string }> } } | undefined)
    ?.node?.style;
  return style?.[property]?.value ?? '';
};

/** Whether `colour` is the brand's `role` in `scheme`, to the channel. */
const isRole = (colour: string, scheme: Scheme, role: Role) => {
  const got = channels(colour);
  const want = channels(theme[scheme][role]);
  return got.length === 3 && got.every((value, at) => Math.abs(value - (want[at] ?? -9)) <= 1);
};

const expectRole = (name: string, reply: unknown, property: string, scheme: Scheme, role: Role) => {
  const colour = colourOf(reply, property);
  drive.check(`${name} is the brand's ${scheme} ${role}`, isRole(colour, scheme, role), colour);
};

/** A point at the screen's trailing edge, halfway down: inside every screen's padding, clear of its words and bars. */
const EDGE = { x: 0.985, y: 0.55 };

/** Checks the colour painted at `EDGE` in the shot `name` is the brand's `role`. */
const expectPainted = async (check: string, name: string, scheme: Scheme, role: Role) => {
  const file = join(shots, `${name}-${host}.png`);
  const painted = await pixelAt(file, EDGE).catch(() => []);
  const colour = painted.length === 3 ? `rgb(${painted.join(', ')})` : '';
  drive.check(
    `${check} is painted the brand's ${scheme} ${role}`,
    isRole(colour, scheme, role),
    colour,
  );
};

const looks = (scheme: Scheme) => [
  `prefer prefers-color-scheme ${scheme}`,
  'clock settle',
  'layout hymn-list',
  'layout section-adoration-and-praise',
  'layout hymn-1',
  shot(`list-${scheme}`),
];

const launched = await drive.launch('settings', [
  'clock data',
  ...looks('light'),
  ...looks('dark'),
  'tap hymn-1',
  'clock settle',
  'clock data',
  'layout hymn-topic',
  'layout hymn-title',
  shot('hymn-dark'),
  'prefer prefers-color-scheme light',
  'clock settle',
  'layout hymn-topic',
  'layout hymn-title',
  shot('hymn-light'),
  'back',
  'clock settle',
  'tap gear',
  'clock settle',
  'clock data',
  'layout settings',
  shot('sheet-light'),
  'tap appearance-dark',
  'clock settle',
  'clock data',
  'layout hymn-list',
  'layout settings',
  shot('sheet-dark'),
]);

const at = (from: ReadonlyArray<unknown>, index: number) => from[index];
for (const [scheme, base] of [
  ['light', 1],
  ['dark', 7],
] as const) {
  expectRole(
    `at launch the list's ground`,
    at(launched, base + 2),
    'background_color',
    scheme,
    'ground',
  );
  expectRole(`a section's header`, at(launched, base + 3), 'text_color', scheme, 'ink');
  expectRole(`a hymn's row`, at(launched, base + 4), 'text_color', scheme, 'ink');
}
expectRole(`a hymn's topic`, at(launched, 16), 'text_color', 'dark', 'muted');
expectRole(`a hymn's title`, at(launched, 17), 'text_color', 'dark', 'ink');
expectRole(`a hymn's topic`, at(launched, 21), 'text_color', 'light', 'muted');
expectRole(`a hymn's title`, at(launched, 22), 'text_color', 'light', 'ink');
await expectPainted(`a hymn's page ground`, 'hymn-dark', 'dark', 'ground');
await expectPainted(`a hymn's page ground`, 'hymn-light', 'light', 'ground');
expectRole(`the sheet's ground`, at(launched, 29), 'background_color', 'light', 'ground');
expectRole(
  `Dark at once: the list under the sheet`,
  at(launched, 34),
  'background_color',
  'dark',
  'ground',
);
expectRole(`Dark at once: the sheet`, at(launched, 35), 'background_color', 'dark', 'ground');

const again = await drive.relaunch('settings', [
  'prefer prefers-color-scheme light',
  shot('first-frame'),
  'layout hymn-list',
  'clock data',
  'layout hymn-list',
  'tap gear',
  'clock settle',
  'clock data',
  'state settingsLooks',
  'tap appearance-system',
  'clock settle',
  'clock data',
  'prefer prefers-color-scheme dark',
  'clock settle',
  'layout hymn-list',
  'prefer prefers-color-scheme light',
  'clock settle',
  'layout hymn-list',
]);

expectRole(`kept: the first frame's list`, at(again, 2), 'background_color', 'dark', 'ground');
await expectPainted(`kept: the first frame`, 'first-frame', 'dark', 'ground');
expectRole(`kept: the list`, at(again, 4), 'background_color', 'dark', 'ground');
const rows = at(again, 8) as ReadonlyArray<{ value?: string; chosen?: boolean }> | undefined;
drive.check(
  'kept: the sheet shows Dark chosen',
  rows?.find((row) => row.chosen === true)?.value === 'dark',
  rows,
);
expectRole(`System follows a dark system`, at(again, 14), 'background_color', 'dark', 'ground');
expectRole(`System follows a light system`, at(again, 17), 'background_color', 'light', 'ground');

process.exit(drive.finish());
