/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noAs, effect/noNullish, effect/noAsyncFunction, effect/noUnknownParameters, effect/noTernary -- a host script that drives the built app through `bun run exact agent` and reads its untyped JSON replies by the fields it checks. */

/**
 * The Feel's live checks a `.test.contract` cannot hold: a finger that
 * drives a dial or the list. Through `@manna/exact-kit/drive` on the host
 * named (`bun tools/drive-feel.ts web|ios`):
 *
 * - a drag across the key dial tells a detent as it crosses stops, heard
 *   by the tine of the key it crosses (`state sounds`; a detent while one
 *   rings is felt only, as in the current app), and the dial come to rest
 *   tells nothing more;
 * - a drag down the hymn list tells `section` as another group's header
 *   takes the list's top, felt and never heard;
 * - with Sounds and haptics off the same drags tell nothing.
 *
 * Under the agent no sound plays: the runner records each voice it would
 * play, and `feelLast` says the last body given. Exits 1 on any failed check.
 */

import { join } from 'node:path';

import { makeDrive } from '@manna/exact-kit/drive';

const host = process.argv[2] ?? 'web';
const drive = makeDrive({ name: 'drive-feel', host, appDir: join(import.meta.dir, '..') });

const store = (name: string) => `feel-${name}-${host}-${Date.now().toString(36)}`;

/** The sources of the voices a `state sounds` reply lists. */
const sourcesOf = (reply: unknown): ReadonlyArray<string> =>
  ((reply as { voices?: ReadonlyArray<{ src?: string }> } | undefined)?.voices ?? []).map(
    (voice) => voice.src ?? '',
  );

const onDials = [
  'clock data',
  'tap hymn-2',
  'clock settle',
  'clock data',
  'tap key-button',
  'clock data',
  'tap key-button',
  'clock data',
  'clock settle',
  'state feelTold',
];
const dragDial = ['tap dial-key-row drag -150 0 over 400', 'clock settle', 'clock data'];
const dragList = ['tap hymn-list drag 0 -1500 over 800', 'clock settle', 'clock data'];
const read = ['state feelTold', 'state feelLast', 'state sounds'];

const dial = await drive.launch(store('dial'), [
  ...onDials,
  ...dragDial,
  ...read,
  'clock +500',
  ...read,
]);
const [toldBefore] = dial.slice(onDials.length - 1);
const [told, last, sounds, , toldAfter] = dial.slice(onDials.length + dragDial.length);
const tines = sourcesOf(sounds).filter((src) => src.startsWith('assets/feel/key-'));
drive.check(
  'a drag across the key dial tells its detents, heard by the tine of the key it crosses (one at a time: a tine rings 112 ms)',
  Number(told) > Number(toldBefore) &&
    /^detent-key selection|^detent-key -/u.test(String(last)) &&
    tines.length > 0,
  { toldBefore, told, last, tines },
);
drive.check('the dial come to rest tells nothing more', toldAfter === told, { told, toldAfter });

const list = await drive.launch(store('list'), [
  'clock data',
  'clock settle',
  ...dragList,
  ...read,
]);
const [listTold, listLast, listSounds] = list.slice(2 + dragList.length);
drive.check(
  'a drag down the hymn list tells section as another group takes its top, felt and not heard',
  Number(listTold) > 0 &&
    String(listLast) === 'section impact-light -' &&
    sourcesOf(listSounds).every((src) => !src.startsWith('assets/feel/')),
  { listTold, listLast, sounds: sourcesOf(listSounds) },
);

const quiet = [
  'clock data',
  'tap gear',
  'clock settle',
  'tap settings-feel',
  'clock settle',
  'tap settings-done',
  'clock settle',
];
const off = await drive.launch(store('off'), [
  ...quiet,
  ...dragList,
  ...onDials.slice(1),
  ...dragDial,
  ...read,
]);
const [offTold, , offSounds] = off.slice(-3);
drive.check(
  'with Sounds and haptics off the same drags tell nothing',
  Number(offTold) === 0 && sourcesOf(offSounds).every((src) => !src.startsWith('assets/feel/')),
  { offTold, sounds: sourcesOf(offSounds) },
);

process.exit(drive.finish());
