/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noAsyncFunction, effect/noNullish, effect/noAs, node/no-process-env -- a host script that drives the built app through `bun run exact agent`, reads its JSON replies as the shapes the app answers and its screenshots, and prints what it found. */

/**
 * Home's live checks a `.test.contract` cannot make (spec B, the drive), on
 * the host named (`bun tools/drive-home.ts web|ios`): a pressed plant looks
 * pressed (a screenshot at rest and one during a held touch differ inside
 * the plant's box and nowhere else in its row); `tree --ax` reads each plant
 * and each single verse as a button named by its reference and stage, and a
 * row's subtree holds no image and no text but its title and caption; a
 * grown plant's Move back on its list's page asks, then lowers its stage by
 * one; a relaunch with the storage kept reads the same rows. Growing a verse
 * takes the garden's drive controls, so every launch sets
 * `HEARTSEED_GARDEN_DRIVE`. Screenshots go to `.exact/shots/home-<host>-*`.
 * Exits 1 on any failed check.
 */

import { join } from 'node:path';

import { makeDrive } from '@manna/exact-kit/drive';

import { readPng } from './png';

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
const drive = makeDrive({ name: 'drive-home', host, appDir: app });
const store = `home-${host}-${Date.now().toString(36)}`;
const DAY = 86_400_000;
const ROW = 'row-passage-0-43-3-16-18';
const PLANT = 'plant-John-3-16';

const shot = (name: string) => `.exact/shots/home-${host}-${name}.png`;

interface Frame {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
interface Laid {
  readonly viewport?: { readonly w?: number };
  readonly node?: { readonly space?: { readonly viewport?: Frame } };
}
interface Element {
  readonly i: number;
  readonly parent: number | null;
  readonly role: string;
  readonly name: string;
  readonly testId?: string;
  readonly frame?: Frame;
}
interface Plant {
  readonly reference: string;
  readonly label: string;
  readonly slug: string;
  readonly id: string;
}
interface Shown {
  readonly rows: readonly {
    readonly title: string;
    readonly caption: string;
    readonly plants: readonly Plant[];
  }[];
  readonly singles: readonly {
    readonly reference: string;
    readonly label: string;
    readonly slug: string;
  }[];
}
interface ListVerse {
  readonly reference: string;
  readonly stage: string;
  readonly backTo: string;
}

const ops = [
  'clock data',
  'type root /verses',
  'clock data',
  'tap plant-three',
  'clock data',
  'tap plant-one',
  'clock data',
  ...[1, 2, 3, 4, 5].flatMap(() => [
    'tap good-John-3-18',
    'clock data',
    `clock +${4 * DAY}`,
    'clock data',
  ]),
  'back',
  'clock data',
  'clock settle',
  'state homeShown',
  `layout ${PLANT}`,
  `layout ${ROW}`,
  `screenshot ${shot('rest')}`,
  `tap ${PLANT} down`,
  `screenshot ${shot('pressed')}`,
  'tap up',
  'clock data',
  'clock settle',
  'back',
  'clock data',
  'clock settle',
  'tree --ax',
  `tap row-title-${ROW.slice('row-'.length)}`,
  'clock data',
  'clock settle',
  'state listShown',
  'tap list-back-John-3-18',
  'state listAsking',
  'tap ask-yes',
  'clock data',
  'clock settle',
  'state listShown',
  'back',
  'clock data',
  'clock settle',
  'state homeShown',
];
const at = (op: string, nth = 0) => {
  let seen = -1;
  return ops.findIndex((each) => each === op && ++seen === nth);
};
const first = await drive.launch(store, ops);

const home = first[at('state homeShown')] as Shown | undefined;
const plantLaid = first[at(`layout ${PLANT}`)] as Laid | undefined;
const rowLaid = first[at(`layout ${ROW}`)] as Laid | undefined;

/** How many pixels differ between the two screenshots inside `inside`, and inside `row` outside `inside`, in viewport points. */
const pressedDiff = () => {
  const plant = plantLaid?.node?.space?.viewport;
  const row = rowLaid?.node?.space?.viewport;
  if (plant === undefined || row === undefined) return undefined;
  const rest = readPng(join(app, shot('rest')));
  const pressed = readPng(join(app, shot('pressed')));
  const scale = rest.width / (rowLaid?.viewport?.w ?? rest.width);
  let inside = 0;
  let outside = 0;
  for (let y = Math.ceil(row.y * scale); y < Math.floor((row.y + row.h) * scale); y++)
    for (let x = Math.ceil(row.x * scale); x < Math.floor((row.x + row.w) * scale); x++) {
      const index = (y * rest.width + x) * rest.channels;
      const differs = [0, 1, 2].some(
        (channel) => rest.rows[index + channel] !== pressed.rows[index + channel],
      );
      if (!differs) continue;
      const within =
        x >= plant.x * scale - 1 &&
        x <= (plant.x + plant.w) * scale + 1 &&
        y >= plant.y * scale - 1 &&
        y <= (plant.y + plant.h) * scale + 1;
      if (within) inside++;
      else outside++;
    }
  return { inside, outside };
};
const diff = pressedDiff();
drive.check(
  'a pressed plant looks pressed: the held touch changes its box and nothing else in its row',
  diff !== undefined && diff.inside > 20 && diff.outside === 0,
  diff,
);

const tree = (first[at('tree --ax')] as { ax?: { elements?: readonly Element[] } } | undefined)?.ax
  ?.elements;
const byId = (id: string) => tree?.find((each) => each.testId === id && each.role === 'button');
const plants = home?.rows.flatMap((row) => row.plants) ?? [];
const named = [
  ...plants.map((plant) => ({
    id: `plant-${plant.id}`,
    label: plant.label,
    reference: plant.reference,
  })),
  ...(home?.singles ?? []).map((single) => ({
    id: `single-button-${single.slug}`,
    label: single.label,
    reference: single.reference,
  })),
];
const misnamed = named.filter(
  ({ id, label, reference }) =>
    byId(id)?.name !== label ||
    !label.startsWith(`${reference}, `) ||
    !/not planted|seed|blade|ear|full corn/u.test(label),
);
drive.check(
  'tree --ax reads each plant and single verse as a button named by its reference and stage',
  named.length === 4 && misnamed.length === 0,
  { named: named.length, misnamed, sample: named.map(({ id }) => byId(id)) },
);

const rowFrame = rowLaid?.node?.space?.viewport;
/** Whether `element` lies inside the row's box: the accessibility tree leaves a plain column out, so the row is found by its frame. */
const under = (element: Element) =>
  rowFrame !== undefined &&
  element.frame !== undefined &&
  element.frame.x >= rowFrame.x - 0.5 &&
  element.frame.y >= rowFrame.y - 0.5 &&
  element.frame.x + element.frame.w <= rowFrame.x + rowFrame.w + 0.5 &&
  element.frame.y + element.frame.h <= rowFrame.y + rowFrame.h + 0.5;
const inRow = tree?.filter(under) ?? [];
const texts = [
  ...new Set(inRow.filter((each) => /text/iu.test(each.role)).map((each) => each.name)),
];
const images = inRow.filter((each) => /image|img|graphic/iu.test(each.role));
const buttons = inRow.filter((each) => each.role.toLowerCase() === 'button');
const row = home?.rows[0];
drive.check(
  "a row's subtree holds no image and no text but its title and caption",
  buttons.length === 4 &&
    images.length === 0 &&
    texts.every((text) => text === row?.title || text === row?.caption),
  { buttons: buttons.map((each) => each.name), images, texts },
);

const before = (
  first[at('state listShown', 0)] as { verses?: readonly ListVerse[] } | undefined
)?.verses?.find((verse) => verse.reference === 'John 3:18');
const asking = first[at('state listAsking')];
const after = (
  first[at('state listShown', 1)] as { verses?: readonly ListVerse[] } | undefined
)?.verses?.find((verse) => verse.reference === 'John 3:18');
const lowered = ['A seed', 'A blade', 'An ear', 'Full corn'];
drive.check(
  'Move back on a grown plant asks, then lowers its stage by one',
  before !== undefined &&
    after !== undefined &&
    asking === 'John 3:18' &&
    lowered.indexOf(after.stage) === lowered.indexOf(before.stage) - 1 &&
    before.backTo === after.stage,
  { before, asking, after },
);

const ended = first[at('state homeShown', 1)] as Shown | undefined;
const again = await drive.relaunch(store, ['clock data', 'clock settle', 'state homeShown']);
const relaunched = again[2] as Shown | undefined;
/** A label's reference and stage, without the day's ready mark, which a relaunch at another instant may change. */
const stageOf = (label: string) => label.split(', ').slice(0, 2).join(', ');
const rowsOf = (shown: Shown | undefined) =>
  JSON.stringify({
    rows: shown?.rows.map((each) => ({
      title: each.title,
      plants: each.plants.map((plant) => stageOf(plant.label)),
    })),
    singles: shown?.singles.map((single) => stageOf(single.label)),
  });
drive.check(
  'a relaunch with the storage kept reads the same rows',
  ended !== undefined && rowsOf(ended) === rowsOf(relaunched),
  { ended: rowsOf(ended), relaunched: rowsOf(relaunched) },
);

process.exit(drive.finish());
