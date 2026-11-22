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
 * seeker "Seek"; Sound is a switch, as the current bar's. A second run
 * turns Sound off before Play on hymn 2 (the fixture's long recording):
 * nothing loads and the silent clock runs, a seek moves it, and Sound on
 * loads the recording at its place, which plays on. Exits 1 on any failed
 * check.
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

const silent = [
  ...quiet.with(quiet.indexOf('tap hymn-1'), 'tap hymn-2'),
  'tap bar-sound',
  'clock settle',
  'clock data',
  'state playerSound',
  'tap play',
  'clock data',
  'clock settle',
  'clock +2000',
  'clock data',
  'state player.src',
  'state player.ticking',
  'state player.at',
  'tree --ax bar',
  'type seek "60"',
  'clock data',
  'clock settle',
  'state player.at',
  'state player.src',
  'tap bar-sound',
  'clock settle',
  'clock data',
  'state player.src',
  'state player.from',
  'clock +3000 real',
  'clock data',
  'state player.phase',
  'state player.at',
];
const told = await drive.launch(`bar-silent-${host}-${Date.now().toString(36)}`, silent);
const at = (op: string, nth = 0) =>
  told[
    silent.map((each, index) => [each, index] as const).filter(([each]) => each === op)[nth]?.[1] ??
      -1
  ];
drive.check(
  'Sound off is kept before Play',
  at('state playerSound') === false,
  at('state playerSound'),
);
drive.check(
  'with Sound off, Play loads no recording and the silent clock runs the place',
  at('state player.src') === '' &&
    at('state player.ticking') === true &&
    (at('state player.at') as number) >= 2,
  [at('state player.src'), at('state player.ticking'), at('state player.at')],
);
drive.check(
  'with Sound off the playing bar still names Pause and the seeker',
  ['Pause hymn 2', 'Seek'].every((name) => names(at('tree --ax bar')).includes(name)),
  names(at('tree --ax bar')),
);
drive.check(
  'a seek with Sound off moves the silent clock, still with no recording',
  Math.abs((at('state player.at', 1) as number) - 60) < 1 && at('state player.src', 1) === '',
  [at('state player.at', 1), at('state player.src', 1)],
);
drive.check(
  'Sound on mid-play loads the recording at the clock’s place, and it plays on from there',
  at('state player.src', 2) !== '' &&
    Math.abs((at('state player.from') as number) - 60) < 1 &&
    at('state player.phase') === 'playing' &&
    (at('state player.at', 2) as number) >= 61,
  [
    at('state player.src', 2),
    at('state player.from'),
    at('state player.phase'),
    at('state player.at', 2),
  ],
);

process.exit(drive.finish());
