/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noNullish, effect/noAsyncFunction, effect/noAs, node/no-process-env, no-await-in-loop -- Exact's app folder cannot import effect (docs/exact.md): a host script that drives the built app through `bun run exact agent`, awaits each launch in turn, and reads its untyped JSON replies by the fields it checks. */

/**
 * The daily session's live checks (spec B), on the host named
 * (`bun tools/drive-session.ts web|ios`), with the microphone and the
 * recognizer granted to the agent's substitute and the speech scripted
 * (`speech-recognition.heard`). Every launch sets `HEARTSEED_GARDEN_DRIVE`,
 * so Your verses offers its Good button: the first launch plants John
 * 3:16-21 and Psalm 119:1, says the six Good, and a day on says them
 * Good again (a blade each); every later launch opens a month on
 * (`--epoch`, a minute apart), where Today's plan holds the six as reviews
 * and Psalm 119:1 new, last. On one kept store:
 *
 * 1. the first item said through, Next: the garden keeps one recall of it,
 *    at the matcher's grade, no help, and the next item shows;
 * 2. a peek, said, Next: recorded as Hard at best; Show all, said, Next:
 *    the verse one stage back (web only);
 * 3. said, then left before Next and relaunched: no recall written, the
 *    same item shows;
 * 4. the plan run to its end: the end shows what grew; relaunched: a new
 *    plan offering none of the verses done today;
 * 5. Minutes 2 then 20 mid-run: the counts change, the item stays (web only).
 *
 * iOS runs 1, 3 and 4 (the shared simulator, spec Risks). Exits 1 on any
 * failed check.
 */

import { join } from 'node:path';

import { makeDrive } from '@manna/exact-kit/drive';
import { STAGES } from '@manna/heartseed/garden';

const host = process.argv[2] ?? 'web';
const app = join(import.meta.dir, '..');
if (process.env.HEARTSEED_GARDEN_DRIVE !== '1') {
  const self = Bun.spawn(['bun', import.meta.path, host], {
    stdout: 'inherit',
    stderr: 'inherit',
    env: { ...process.env, HEARTSEED_GARDEN_DRIVE: '1', SIMCTL_CHILD_HEARTSEED_GARDEN_DRIVE: '1' },
  });
  process.exit(await self.exited);
}
const drive = makeDrive({ name: 'drive-session', host, appDir: app });
const store = `session-${host}-${Date.now().toString(36)}`;
const SOWN = Date.parse('2026-11-14T12:00:00Z');
const DAY = 86_400_000;
const ZONE = 'America/New_York';
const HEARD = new Map([
  ['thee', 'the'],
  ['thy', 'thigh'],
  ['yea', 'yeah'],
]);
const REVIEWED = ['John-3-16', 'John-3-17', 'John-3-18', 'John-3-19', 'John-3-20', 'John-3-21'];
const LATER = 30 * DAY;

/** A verse's text as a recognizer writes it: lowercase words, archaic ones as heard. */
const spokenOf = (text: string) =>
  text
    .split(/\s+/u)
    .map((word) => word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((word) => word !== '')
    .map((word) => HEARD.get(word) ?? word)
    .join(' ');

const granted = [
  'prefer permission.microphone granted',
  'prefer permission.speech-recognition granted',
  'clock data',
  'clock settle',
  'type root /today',
  'clock data',
  'clock settle',
];

/** A recital of `text` said through, then Done. */
const recite = (text: string) => [
  `prefer extension speech-recognition.heard=${JSON.stringify(spokenOf(text))}`,
  'tap say',
  'clock settle',
  'clock +15000',
  'clock settle',
  'tap finish',
  'clock settle',
];

interface Item {
  readonly reference: string;
  readonly fresh: boolean;
}
interface Verse {
  readonly reference: string;
  readonly stage: string;
  readonly recalls: number;
  readonly lastGrade: number;
}
interface Today {
  readonly reference: string;
  readonly passage: string;
  readonly session: {
    readonly counts: string;
    readonly ended: boolean;
    readonly item: boolean;
    readonly grown: readonly { readonly reference: string }[];
    readonly wire: { readonly items: readonly Item[] };
  };
  readonly cue: string;
}
interface Result {
  readonly recall: { readonly grade: number; readonly suggested: number };
  readonly help: unknown;
}
interface Garden {
  readonly lists: readonly { readonly verses: readonly Verse[] }[];
  readonly singles: readonly Verse[];
}

const verseIn = (garden: Garden | undefined, reference: string) =>
  [...(garden?.lists ?? []).flatMap((list) => list.verses), ...(garden?.singles ?? [])].find(
    (verse) => verse.reference === reference,
  );

let launches = 0;

/** One launch on the kept store, a month after the sowing and a minute after the launch before; each op's reply by its index. */
const later = async (ops: readonly string[]) => {
  launches += 1;
  const at = new Date(SOWN + LATER + launches * 60_000).toISOString();
  return drive.run(['--storage', store, '--keep-storage', '--epoch', at, '--time-zone', ZONE], ops);
};

/** The ops of a launch that also reads Today and the garden at its end, and the indexes of both reads. */
const reading = (ops: readonly string[]) => {
  const all = [...ops, 'state today', 'type root /verses', 'clock data', 'state garden'];
  return { ops: all, today: all.length - 4, garden: all.length - 1 };
};

await drive.run(
  [
    '--storage',
    store,
    '--reset-storage',
    '--epoch',
    new Date(SOWN).toISOString(),
    '--time-zone',
    ZONE,
  ],
  [
    ...granted,
    'type root /verses',
    'clock data',
    'tap plant-three',
    'clock data',
    'tap plant-three',
    'clock data',
    'tap plant-one',
    'clock data',
    ...REVIEWED.flatMap((slug) => [`tap good-${slug}`, 'clock data']),
    `clock +${DAY}`,
    'clock data',
    ...REVIEWED.flatMap((slug) => [`tap good-${slug}`, 'clock data']),
  ],
);

const look = reading(granted);
const looked = await later(look.ops);
const first = looked[look.today] as Today | undefined;
const planned = first?.session.wire.items ?? [];
drive.check(
  'the plan holds the six reviews, the new verse last',
  planned.length === 7 &&
    planned.at(-1)?.fresh === true &&
    planned.slice(0, -1).every((item) => !item.fresh),
  planned,
);

const one = reading([
  ...granted,
  ...recite(first?.passage ?? ''),
  'state today.pending',
  'tap next',
  'clock data',
  'clock settle',
]);
const ran = await later(one.ops);
const said = first?.reference ?? '';
const was = verseIn(looked[look.garden] as Garden | undefined, said);
const now = verseIn(ran[one.garden] as Garden | undefined, said);
const next = ran[one.today] as Today | undefined;
const pending = ran[one.ops.indexOf('state today.pending')] as Result | null | undefined;
drive.check(
  "B1 Next keeps one recall of the verse said, at the matcher's grade, with no help",
  now !== undefined &&
    pending !== undefined &&
    pending !== null &&
    now.recalls === (was?.recalls ?? 0) + 1 &&
    now.lastGrade === pending.recall.suggested &&
    pending.help === null,
  { was, now, pending },
);
drive.check(
  'B1 the next item shows',
  next !== undefined && next.session.item && next.reference !== said,
  next?.reference,
);

const before = reading(granted);
const leaving = await later(before.ops);
const held = (leaving[before.today] as Today | undefined)?.reference ?? '';
drive.check(
  'B3 an item shows before the try',
  (leaving[before.today] as Today | undefined)?.session.item === true,
  {
    session: (leaving[before.today] as Today | undefined)?.session,
    garden: leaving[before.garden],
  },
);
await later([
  ...granted,
  ...recite((leaving[before.today] as Today | undefined)?.passage ?? ''),
  'type root /verses',
  'clock data',
]);
const back = reading(granted);
const returned = await later(back.ops);
drive.check(
  'B3 leaving before Next and relaunching writes no recall',
  JSON.stringify(verseIn(returned[back.garden] as Garden | undefined, held)) ===
    JSON.stringify(verseIn(leaving[before.garden] as Garden | undefined, held)),
  [
    verseIn(leaving[before.garden] as Garden | undefined, held),
    verseIn(returned[back.garden] as Garden | undefined, held),
  ],
);
drive.check(
  'B3 the same item shows',
  held !== '' && (returned[back.today] as Today | undefined)?.reference === held,
  (returned[back.today] as Today | undefined)?.reference,
);

if (host === 'web') {
  const shown = returned[back.today] as Today | undefined;
  const minutes = [
    ...granted,
    'tap gear',
    'clock settle',
    'tap minutes-2',
    'clock data',
    'clock settle',
    'state today',
    'tap minutes-20',
    'clock data',
    'clock settle',
    'state today',
    'tap settings-done',
    'clock settle',
  ];
  const chosen = await later(minutes);
  const atTwo = chosen[minutes.indexOf('state today')] as Today | undefined;
  const atTwenty = chosen[minutes.lastIndexOf('state today')] as Today | undefined;
  drive.check(
    'B5 the counts change with the Minutes',
    atTwo !== undefined &&
      atTwenty !== undefined &&
      atTwo.session.counts !== atTwenty.session.counts,
    [atTwo?.session.counts, atTwenty?.session.counts],
  );
  drive.check(
    'B5 the item on screen stays',
    atTwo?.reference === shown?.reference && atTwenty?.reference === shown?.reference,
    [shown?.reference, atTwo?.reference, atTwenty?.reference],
  );

  const helped = async (
    name: string,
    help: readonly string[],
    ok: (
      was: Verse | undefined,
      now: Verse | undefined,
      pending: Result | null | undefined,
    ) => boolean,
  ) => {
    const look = reading(granted);
    const looked = await later(look.ops);
    const item = looked[look.today] as Today | undefined;
    const was = verseIn(looked[look.garden] as Garden | undefined, item?.reference ?? '');
    const said = reading([
      ...granted,
      ...help,
      ...recite(item?.passage ?? ''),
      'state today.pending',
      'tap next',
      'clock data',
      'clock settle',
    ]);
    const ran = await later(said.ops);
    const pending = ran[said.ops.indexOf('state today.pending')] as Result | null | undefined;
    const now = verseIn(ran[said.garden] as Garden | undefined, item?.reference ?? '');
    drive.check(name, ok(was, now, pending), { cue: item?.cue, was, now, pending });
  };
  await helped(
    'B2 a peeked try is recorded as Hard at best',
    ['tap word-0', 'clock settle', 'clock +1500', 'clock settle'],
    (was, now, pending) =>
      pending?.help !== null &&
      now !== undefined &&
      now.recalls === (was?.recalls ?? 0) + 1 &&
      now.lastGrade <= 2,
  );
  await helped(
    'B2 a try after Show all moves the verse one stage back',
    ['tap show-all', 'clock settle'],
    (was, now, pending) =>
      pending?.help !== null &&
      was !== undefined &&
      now !== undefined &&
      now.recalls === was.recalls + 1 &&
      STAGES.indexOf(now.stage) === STAGES.indexOf(was.stage) - 1,
  );
}

const done: string[] = [said];
let shown = (await later(reading(granted).ops))[reading(granted).today] as Today | undefined;
for (let n = 0; n < 12 && shown !== undefined && !shown.session.ended; n++) {
  done.push(shown.reference);
  const each = reading([
    ...granted,
    ...recite(shown.passage),
    'tap next',
    'clock data',
    'clock settle',
  ]);
  shown = (await later(each.ops))[each.today] as Today | undefined;
}
drive.check('B4 the run reaches its end', shown?.session.ended === true, shown?.session);
drive.check(
  'B4 the end shows what grew',
  (shown?.session.grown.length ?? 0) > 0,
  shown?.session.grown,
);
const anew = reading(granted);
const renewed = await later(anew.ops);
const fresh = renewed[anew.today] as Today | undefined;
const gardenNow = renewed[anew.garden] as Garden | undefined;
drive.check(
  'B4 a relaunch makes a new plan: no verse done today is offered new, and one offered again is due again',
  fresh !== undefined &&
    fresh.session.wire.items.every(
      (item) =>
        !done.includes(item.reference) ||
        (!item.fresh && verseIn(gardenNow, item.reference)?.dueNow === true),
    ),
  { done, items: fresh?.session.wire.items },
);

process.exit(drive.finish());
