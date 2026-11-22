/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noNullish, effect/noAsyncFunction, effect/noAs, effect/noTernary, effect/noUnknownParameters, node/no-process-env -- a host script that sets the driver's launch flag, drives the built app through `bun run exact agent` and reads its untyped JSON replies by the fields it checks. */

/**
 * Move back a stage on Today, live (spec par-hs-back), on the host named
 * (`bun tools/drive-back.ts web|ios`). Its launches set
 * `HEARTSEED_GARDEN_DRIVE`, so Your verses' test controls recall a verse
 * to a stage past a seed, which no `.test.contract` can. John 3:16-18 is
 * planted, John 3:16 recalled once (a seed) and John 3:18 grown past it;
 * then, from the list's page:
 *
 * 1. John 3:18, opened by its row, offers `Move back a stage`, named so;
 * 2. a tap puts the ask in its place, with the reference and the stage
 *    below in its words, `Move back` and `Keep` named so;
 * 3. `Move back` leaves `Moved back to <stage>.`, the stage line already
 *    that stage, and the verse one stage lower (its ask's second press
 *    finds no button: the answer has landed; a press racing its answer is
 *    held by `src/back/back.model.test.ts`);
 * 4. Keep drops a second ask and leaves the stage as it was;
 * 5. a recital under way shows none of it;
 * 6. John 3:16, a seed, offers no control;
 * 7. relaunched on the kept storage, Your verses reads the moved stage.
 *
 * Screenshots go to `.exact/shots/back-<host>-*`. Exits 1 on any failed
 * check.
 */

import { join } from 'node:path';

import { makeDrive } from '@manna/exact-kit/drive';
import { backOf, type Stage } from '@manna/heartseed/garden';
import { askLine, movedLine } from '@manna/heartseed/garden/bar';
import { Option } from 'effect';

const host = process.argv[2] ?? 'web';
const app = join(import.meta.dir, '..');
process.env['HEARTSEED_GARDEN_DRIVE'] = '1';
process.env['SIMCTL_CHILD_HEARTSEED_GARDEN_DRIVE'] = '1';
const drive = makeDrive({ name: 'drive-back', host, appDir: app });
const store = `back-${host}-${Date.now().toString(36)}`;
const shot = (name: string) => `screenshot .exact/shots/back-${host}-${name}.png`;
const DAY = 86_400_000;

interface Verse {
  readonly reference: string;
  readonly stage: string;
}
interface Garden {
  readonly lists: readonly { readonly verses: readonly Verse[] }[];
}

/** Each reply of `ops` by its op, the `nth` of equal ops. */
const replyOf =
  (ops: readonly string[], replies: readonly unknown[]) =>
  (op: string, nth = 0) => {
    let seen = -1;
    return replies[ops.findIndex((each) => each === op && ++seen === nth)];
  };

const stageIn = (garden: unknown, reference: string) =>
  (garden as Garden | undefined)?.lists
    .flatMap((list) => list.verses)
    .find((verse) => verse.reference === reference)?.stage;

/** Whether the accessibility tree `tree` names a node `name`. */
const names = (tree: unknown, name: string) => JSON.stringify(tree ?? '').includes(name);

/** From home, the list's page, then the verse of `slug` by its row. */
const open = (slug: string) => [
  'tap tab-garden',
  'clock data',
  'clock settle',
  'tap row-title-passage-0-43-3-16-18',
  'clock data',
  'clock settle',
  `tap list-row-${slug}`,
  'clock data',
  'clock settle',
];

const ops = [
  'clock data',
  'clock data',
  'tap plant-three',
  'clock data',
  'tap good-John-3-16',
  'clock data',
  ...[1, 2, 3, 4, 5].flatMap(() => [
    'tap good-John-3-18',
    'clock data',
    `clock +${4 * DAY}`,
    'clock data',
  ]),
  'state garden',
  ...open('John-3-18'),
  'state today.reference',
  'state today.back',
  'state today.session.stage',
  'tree --ax',
  shot('offered'),
  'tap back-control',
  'clock data',
  'clock settle',
  'state todayBack',
  'tree --ax',
  shot('asking'),
  'tap back-yes',
  'clock data',
  'clock settle',
  'state todayBack',
  'state today.session.stage',
  'state today.session.stageLine',
  'state garden',
  'tree --ax',
  shot('moved'),
  'tap back-control',
  'clock data',
  'clock settle',
  'tap back-keep',
  'clock data',
  'clock settle',
  'state todayBack',
  'state garden',
  'prefer permission.microphone granted',
  'prefer permission.speech-recognition granted',
  'tap say',
  'clock data',
  'clock settle',
  'state today.phase',
  'state today.back',
  'tree --ax',
  shot('recital'),
  'tap finish',
  'clock data',
  'clock settle',
  ...open('John-3-16'),
  'state today.reference',
  'state today.back',
  'state today.session.stage',
  'state todayBack',
  'tree --ax',
  shot('seed'),
];
const first = replyOf(
  ops,
  await drive.run(['--storage', store, '--reset-storage', '--url', '/verses'], ops),
);

const grown = first('state garden', 0);
const was = (stageIn(grown, 'John 3:18') ?? 'seed') as Stage;
const below = backOf(was);
drive.check(
  'John 3:18 is grown past a seed and John 3:16 is a seed',
  Option.isSome(below) && stageIn(grown, 'John 3:16') === 'seed',
  grown,
);
const landing: Stage = Option.getOrElse(below, (): Stage => 'seed');

drive.check(
  '1 a verse past a seed opened by its row offers Move back a stage',
  first('state today.reference', 0) === 'John 3:18' &&
    first('state today.back', 0) === true &&
    first('state today.session.stage', 0) === was &&
    names(first('tree --ax', 0), 'Move back a stage'),
  { back: first('state today.back', 0), stage: first('state today.session.stage', 0) },
);

const asking = first('state todayBack', 0) as { askLine?: string; status?: string } | undefined;
drive.check(
  '2 the ask names the verse and the stage below, with Move back and Keep',
  asking?.status === 'Asking' &&
    asking.askLine === askLine('John 3:18', landing) &&
    names(first('tree --ax', 1), 'Move back') &&
    names(first('tree --ax', 1), 'Keep'),
  asking,
);

const moved = first('state todayBack', 1) as
  | { moved?: string; alert?: string; status?: string }
  | undefined;
drive.check(
  '3 Move back moves the verse one stage, the stage line and the garden already there',
  moved?.status === 'Moved' &&
    moved.moved === movedLine(landing) &&
    moved.alert === '' &&
    first('state today.session.stage', 1) === landing &&
    stageIn(first('state garden', 1), 'John 3:18') === landing,
  {
    moved,
    stage: first('state today.session.stage', 1),
    line: first('state today.session.stageLine', 1),
    garden: stageIn(first('state garden', 1), 'John 3:18'),
  },
);

const kept = first('state todayBack', 2) as { status?: string } | undefined;
drive.check(
  '4 Keep drops a second ask and the stage stays',
  kept?.status === 'Kept' && stageIn(first('state garden', 2), 'John 3:18') === landing,
  { kept, garden: stageIn(first('state garden', 2), 'John 3:18') },
);

drive.check(
  '5 a recital under way shows no Move back',
  first('state today.phase', 0) === 'listening' &&
    first('state today.back', 1) === false &&
    !names(first('tree --ax', 3), 'Move back a stage'),
  { phase: first('state today.phase', 0), back: first('state today.back', 1) },
);

drive.check(
  '6 a seed opened by its row offers no control',
  first('state today.reference', 1) === 'John 3:16' &&
    first('state today.back', 2) === true &&
    first('state today.session.stage', 2) === 'seed' &&
    !names(first('tree --ax', 4), 'Move back a stage'),
  {
    reference: first('state today.reference', 1),
    back: first('state today.back', 2),
    stage: first('state today.session.stage', 2),
  },
);

const again = ['clock data', 'clock settle', 'tap tab-garden', 'clock data', 'state garden'];
const relaunched = replyOf(again, await drive.relaunch(store, again));
drive.check(
  '7 relaunched, the garden holds the moved stage',
  stageIn(relaunched('state garden'), 'John 3:18') === landing,
  relaunched('state garden'),
);

process.exit(drive.finish());
