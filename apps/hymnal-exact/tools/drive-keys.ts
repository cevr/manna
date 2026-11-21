/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noAs, effect/noNullish, effect/noAsyncFunction, effect/noUnknownParameters, effect/noTernary -- a host script that drives the built app through `bun run exact agent` and reads its untyped JSON replies by the fields it checks. */

/**
 * The key button's live checks a `.test.contract` cannot hold: the names
 * the screen reader is given, and a held finger. Through
 * `@manna/exact-kit/drive` on the host named (`bun tools/drive-keys.ts
 * web|ios`), on hymn 2 with chords turned on at the key button:
 *
 * - the key button is named "Key" with the key sounding as its value, and
 *   the open dials' controls are named "Capo" and "Key" with One's
 *   `capoSaid` and `keySaid` as their values;
 * - on iOS (Exact scripts a held finger's legs there alone), a hold of the
 *   key button past `HOLD` opens the wheel with One's words, Key ♭, Key ♯,
 *   Reset and Chords off; a slide onto Key ♯ and a lift moves the hymn up a
 *   semitone, once, and closes the wheel;
 * - a swipe up that starts on the key button opens the full player, as the
 *   bar's own swipe does;
 * - under Reduce Motion the dials still open and close.
 *
 * Exits 1 on any failed check.
 */

import { join } from 'node:path';

import { makeDrive } from '@manna/exact-kit/drive';

import { HOLD, ORIGIN_X, slotOf } from '../src/keys/wheel.ts';

const host = process.argv[2] ?? 'web';
const drive = makeDrive({ name: 'drive-keys', host, appDir: join(import.meta.dir, '..') });

interface AxElement {
  readonly role?: string;
  readonly name?: string;
  readonly value?: string;
  readonly testId?: string;
}

/** The accessibility elements a `tree --ax` reply holds. */
const elementsOf = (reply: unknown): ReadonlyArray<AxElement> =>
  (reply as { ax?: { elements?: ReadonlyArray<AxElement> } } | undefined)?.ax?.elements ?? [];

/** The element named `name` in a `tree --ax` reply. */
const named = (reply: unknown, name: string) =>
  elementsOf(reply).find((element) => element.name === name);

/** Whether a `tree` reply holds a node of `testId`. */
const holds = (reply: unknown, testId: string) =>
  JSON.stringify(reply ?? '').includes(`"${testId}"`);

const store = (name: string) => `keys-${name}-${host}-${Date.now().toString(36)}`;

const onHymn = [
  'clock data',
  'tap hymn-list drag 0 -600',
  'clock settle',
  'tap hymn-2',
  'clock settle',
  'clock data',
  'tap key-button',
  'clock data',
  'clock settle',
];

const names = await drive.launch(store('names'), [
  ...onHymn,
  'tree --ax bar',
  'tap key-button',
  'clock data',
  'clock settle',
  'tree --ax dials-panel',
]);
const face = names[onHymn.length];
const dials = names[onHymn.length + 4];
drive.check(
  'the key button is named Key, its value the key sounding',
  named(face, 'Key')?.value === 'D',
  elementsOf(face),
);
drive.check(
  'the open dials name Capo and Key with the current app’s values',
  named(dials, 'Capo')?.value === 'No capo' && named(dials, 'Key')?.value === 'D',
  elementsOf(dials),
);

const swiped = await drive.launch(store('swipe'), [
  ...onHymn,
  'tap play',
  'clock data',
  'clock settle',
  'tap key-button drag 0 -200 over 150',
  'clock data',
  'clock settle',
  'tree',
]);
drive.check(
  'while the hymn sounds, a swipe up from the key button opens the full player',
  holds(swiped[onHymn.length + 6], 'player'),
  swiped[onHymn.length + 6],
);

if (host === 'ios') {
  const up = slotOf('keyUp');
  const at = `at ${ORIGIN_X - 12} 22`;
  const held = await drive.launch(store('wheel'), [
    ...onHymn,
    `tap key-button ${at} drag 0 0 hold ${HOLD + 250} during "state keysWheelItems" then ${up.x} ${up.y} over 200 hold 200`,
    'clock data',
    'clock settle',
    'state keysWheelOpen',
    'state keysShown.keySaid',
    'state chordsMoves',
  ]);
  const [reply, , , open, said, moves] = held.slice(onHymn.length);
  const words = JSON.stringify(reply ?? '');
  drive.check(
    'a hold opens the wheel with the current app’s words, and a slide onto Key ♯ lifts the hymn a semitone, once',
    ['Key ♭', 'Key ♯', 'Reset', 'Chords off'].every((word) => words.includes(word)) &&
      open === false &&
      said === 'Eb' &&
      JSON.stringify(moves) === JSON.stringify(['2:1:0']),
    { reply, open, said, moves },
  );
}

const still = await drive.launch(store('still'), [
  'prefer prefers-reduced-motion reduce',
  'clock settle',
  ...onHymn,
  'tap key-button',
  'clock data',
  'clock settle',
  'tree',
  'tap key-button',
  'clock data',
  'clock settle',
  'tree',
]);
const base = 2 + onHymn.length;
drive.check(
  'under Reduce Motion the dials open and close',
  holds(still[base + 3], 'dials-panel') && !holds(still[base + 7], 'dials-panel'),
  { open: holds(still[base + 3], 'dials-panel'), shut: holds(still[base + 7], 'dials-panel') },
);

process.exit(drive.finish());
