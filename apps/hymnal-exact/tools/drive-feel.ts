/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noAsyncFunction -- a host script that drives the built app through `bun run exact agent` and reads its replies by the fields it checks. */

/**
 * The Feel's live checks a `.test.contract` cannot hold: a finger that
 * drives a dial or the list. Through `@manna/exact-kit/drive` on the host
 * named (`bun tools/drive-feel.ts web|ios`):
 *
 * - a drag across the key dial tells a detent as it crosses stops, heard
 *   by the tine of the key it crosses (`feelSounds`, the sounds sent to the
 *   app's module; a detent while one rings is felt only, as in the current
 *   app), and the dial come to rest tells nothing more;
 * - a drag down the hymn list tells `section` as another group's header
 *   takes the list's top, felt and never heard;
 * - with Sounds and haptics off the same drags tell nothing.
 *
 * No sound plays under the agent, and Exact's runner holds no voice on any
 * host: the voice is the app module's (`tools/drive-web.ts web measure`
 * checks that no load asks for a WAV). Under the agent the web's module
 * says it holds every sound, so what would be sent is counted; `feelLast`
 * says the last body given. Exits 1 on any failed check.
 */

import { join } from 'node:path';

import { makeDrive } from '@manna/exact-kit/drive';

const host = process.argv[2] ?? 'web';
const drive = makeDrive({ name: 'drive-feel', host, appDir: join(import.meta.dir, '..') });

const store = (name: string) => `feel-${name}-${host}-${Date.now().toString(36)}`;

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
const read = ['state feelTold', 'state feelLast', 'state feelSounds'];

const dial = await drive.launch(store('dial'), [
  ...onDials,
  ...dragDial,
  ...read,
  'clock +500',
  ...read,
]);
const [toldBefore] = dial.slice(onDials.length - 1);
const [told, last, sent, , toldAfter] = dial.slice(onDials.length + dragDial.length);
drive.check(
  'a drag across the key dial tells its detents, heard by the tine of the key it crosses (one at a time: a tine rings 112 ms)',
  Number(told) > Number(toldBefore) &&
    /^detent-key (selection|-) (key-\d+|-)$/u.test(String(last)) &&
    Number(sent) > 0 &&
    Number(sent) <= Number(told) - Number(toldBefore),
  { toldBefore, told, last, sent },
);
drive.check('the dial come to rest tells nothing more', toldAfter === told, { told, toldAfter });

const list = await drive.launch(store('list'), [
  'clock data',
  'clock settle',
  ...dragList,
  ...read,
]);
const [listTold, listLast, listSent] = list.slice(2 + dragList.length);
drive.check(
  'a drag down the hymn list tells section as another group takes its top, felt and not heard',
  Number(listTold) > 0 && String(listLast) === 'section impact-light -' && Number(listSent) === 0,
  { listTold, listLast, listSent },
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
const [offTold, , offSent] = off.slice(-3);
drive.check(
  'with Sounds and haptics off the same drags tell nothing, and send no sound',
  Number(offTold) === 0 && Number(offSent) === 0,
  {
    offTold,
    offSent,
  },
);

process.exit(drive.finish());
