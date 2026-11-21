/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noAs, effect/noNullish, effect/noAsyncFunction, effect/noUnknownParameters -- a host script that drives the built app through `bun run exact agent` and reads its untyped JSON replies by the fields it checks. */

/**
 * The bar's VoiceOver names, which a `.test.contract` cannot read at
 * Exact's pin (an authored test reads a node's text and the app's state,
 * never a name the screen reader is given). Through
 * `@manna/exact-kit/drive` on the host named (`bun tools/drive-bar.ts
 * web|ios`), against the loopback fixture `bun run exact` names for the
 * agent: a hymn page's own bar names its buttons as the current
 * `PlayerBar.tsx` does (Sound, Play hymn 1); once the hymn plays, the
 * docked bar's opener is "Open player", its button "Pause hymn 1" and the
 * seeker "Seek"; Sound is a switch, as the current bar's. Exits 1 on any
 * failed check.
 */

import { join } from 'node:path';

import { makeDrive } from '@manna/exact-kit/drive';

const host = process.argv[2] ?? 'web';
const drive = makeDrive({ name: 'drive-bar', host, appDir: join(import.meta.dir, '..') });

interface AxElement {
  readonly role?: string;
  readonly name?: string;
  readonly testId?: string;
}

/** The accessibility elements a `tree --ax` reply holds. */
const elementsOf = (reply: unknown): ReadonlyArray<AxElement> =>
  (reply as { ax?: { elements?: ReadonlyArray<AxElement> } } | undefined)?.ax?.elements ?? [];

const quiet = [
  'clock data',
  'tap gear',
  'clock settle',
  'tap settings-feel',
  'clock settle',
  'tap settings-done',
  'clock settle',
  'tap hymn-1',
  'clock settle',
  'clock data',
];
const playing = ['tap play', 'clock data', 'clock +3000 real', 'clock data', 'clock settle'];
const replies = await drive.launch(`bar-names-${host}-${Date.now().toString(36)}`, [
  ...quiet,
  'tree --ax bar',
  ...playing,
  'tree --ax bar',
]);

const names = (reply: unknown) => elementsOf(reply).map((element) => element.name ?? '');
const resting = replies[quiet.length];
const sounding = replies[quiet.length + 1 + playing.length];

for (const name of ['Sound', 'Play hymn 1'])
  drive.check(`the page's own bar names "${name}"`, names(resting).includes(name), names(resting));
for (const name of ['Open player', 'Sound', 'Pause hymn 1', 'Seek'])
  drive.check(`the playing bar names "${name}"`, names(sounding).includes(name), names(sounding));
const sound = elementsOf(resting).find((element) => element.name === 'Sound');
drive.check(
  'Sound is a switch, as the current PlayerBar.tsx gives it (`role="switch"`, `aria-checked`)',
  /switch/iu.test(sound?.role ?? ''),
  sound,
);

process.exit(drive.finish());
