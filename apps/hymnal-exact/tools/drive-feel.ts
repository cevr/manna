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
 * - each dial that stops (capo, placement, tempo, text size, the hundreds
 *   drum) pushed past its end tells `wall` once, as the current app's
 *   dial does (`player/dial.ts` `dragTo`): on the web a wheel carrying a
 *   scroller's row past its end, on iOS a finger dragging it into its
 *   bounce; the drum, a finger dragged off its control's end; and the capo
 *   dial dragged to land on its last fret tells that fret's detent, no wall
 *   (a web finger at a scroller's end is the browser's own pan and tells
 *   nothing, as the current app's web feels nothing);
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

const wallSteps = (target: string, push: string, setUp: ReadonlyArray<string> = []) => [
  ...setUp,
  'state feelTold',
  `tap ${target} ${push}`,
  'clock data',
  'state feelTold',
  'state feelLast',
];
/** A push of the row `dx` px past where it is: a wheel's on the web, a finger's the other way on iOS (its scroller's bounce). */
const wallPush = (dx: number) => (host === 'web' && `wheel ${dx} 0`) || `drag ${-dx} 0 over 400`;
/** The replies ending in a dial's `wallSteps`: its count before, after and the last body. */
const checkWall = (dial: string, replies: ReadonlyArray<unknown>) => {
  const [before, , , after, last] = replies.slice(-5);
  drive.check(
    `the ${dial} dial pushed past its end tells wall, once`,
    Number(after) === Number(before) + 1 && /^wall /u.test(String(last)),
    { before, after, last },
  );
};

const capo = wallSteps('dial-capo-row', wallPush(-300));
const landed = [
  'tap dial-capo-row drag -300 0 over 400',
  'clock settle',
  'tap dial-capo-row drag -300 0 over 400',
  'clock settle',
  'clock data',
  'state keysShown.capo',
  'state feelLast',
];
const dials = await drive.launch(store('capo'), [...onDials, ...capo, 'clock +500', ...landed]);
checkWall('capo', dials.slice(0, onDials.length + capo.length));
const [capoAt, capoLast] = dials.slice(-2);
drive.check(
  'the capo dial landing on its last fret tells its detent, no wall',
  Number(capoAt) === 11 && /^detent-capo /u.test(String(capoLast)),
  { capoAt, capoLast },
);

const sheetOpen = [
  'clock data',
  'tap gear',
  'clock settle',
  'clock data',
  'tap chords-toggle',
  'clock data',
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
const toStop = (stop: string) => [`tap ${stop}`, 'clock data', 'clock settle'];
const sheetWalls = [
  [
    'placement',
    wallSteps('dial-placement-row', wallPush(-300), toStop('dial-placement-stop-beat')),
  ],
  ['tempo', wallSteps('dial-tempo-row', wallPush(-300), toStop('dial-tempo-stop-50'))],
  ['text size', wallSteps('dial-size-row', wallPush(300), toStop('dial-size-stop-7'))],
] as const;
const sheet = await drive.launch(store('sheet'), [
  ...sheetOpen,
  ...sheetWalls.flatMap(([, steps]) => [...steps, 'clock +500']),
]);
let at = sheetOpen.length;
for (const [dial, steps] of sheetWalls) {
  checkWall(dial, sheet.slice(0, at + steps.length));
  at += steps.length + 1;
}

const drum = await drive.launch(store('drum'), [
  'clock data',
  'clock settle',
  'tap find-number',
  'clock data',
  'clock settle',
  ...wallSteps('drum-hundreds', 'drag -75 0 over 400'),
]);
const [drumBefore, , , drumAfter, drumLast] = drum.slice(-5);
drive.check(
  'the hundreds drum dragged off its first digit tells wall last (the touch lands mid-control, so the digits it crosses back tell first)',
  Number(drumAfter) > Number(drumBefore) && /^wall /u.test(String(drumLast)),
  { drumBefore, drumAfter, drumLast },
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
