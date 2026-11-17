/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noNullish, effect/noAsyncFunction, effect/noAs, effect/noTernary -- a host script that picks its port by host, drives the built app through `bun run exact agent` and reads its untyped JSON replies by the fields it checks. */

/**
 * Add verses' live checks (spec B's drive), on the host named
 * (`bun tools/drive-add.ts web|ios`), every launch a plain one (no
 * `HEARTSEED_GARDEN_DRIVE`):
 *
 * 1. John 3:16-18 planted on the chapter screen (Any passage opens Go to
 *    over Read) lands as a list; relaunched on the kept storage, the
 *    garden reads it;
 * 2. Psalm 119's 176 verses are drawn and its last is chosen;
 * 3. the chapter offers one verse to the single verses, not as a list;
 *    twenty single verses planted through nineteen short picks and the
 *    chapter are held, a twenty-first pick offers no Plant and says the
 *    single verses' limit, and so does the chapter for one more verse;
 * 4. a plain launch's Your verses has no test control in its tree.
 *
 * Screenshots go to `.exact/shots/add-<host>-*`. Exits 1 on any failed
 * check.
 */

import { join } from 'node:path';

import { makeDrive } from '@manna/exact-kit/drive';

const host = process.argv[2] ?? 'web';
const app = join(import.meta.dir, '..');
const drive = makeDrive({ name: 'drive-add', host, appDir: app });
const store = `add-${host}-${Date.now().toString(36)}`;
/** Chrome keeps a named store per port, so every web launch here, the relaunch too, takes one of the app's spare ports. */
const port = host === 'web' ? ['--port', '8774'] : [];
const shot = (name: string) => `screenshot .exact/shots/add-${host}-${name}.png`;
const SINGLES_LIMIT = '20 single verses, the most for now. Remove one to add another.';

/** From Add verses, Any passage's Go to, then the chapter screen at John 3. */
const toChapter43 = () => [
  'tap shelf-any',
  'clock settle',
  'tap book-43',
  'clock data',
  'clock settle',
  'tap chapter-3',
  'clock data',
  'clock settle',
];

/** Nineteen distinct verses of the first short picks, in Add verses' order (John 3:16 through the chapter makes twenty), and a twenty-first. */
const PICKS = [
  'pick-proverbs-20-4-23-23',
  'pick-proverbs-20-15-1-1',
  'pick-proverbs-20-16-3-3',
  'pick-proverbs-20-18-10-10',
  'pick-proverbs-20-22-6-6',
  'pick-john-43-14-27-27',
  'pick-forgiveness-62-1-9-9',
  'pick-forgiveness-23-1-18-18',
  'pick-forgiveness-19-103-12-12',
  'pick-forgiveness-23-43-25-25',
  'pick-forgiveness-23-44-22-22',
  'pick-forgiveness-49-1-7-7',
  'pick-forgiveness-44-3-19-19',
  'pick-forgiveness-19-86-5-5',
  'pick-forgiveness-23-55-7-7',
  'pick-forgiveness-58-8-12-12',
  'pick-peace-23-26-3-3',
  'pick-peace-60-5-7-7',
  'pick-peace-19-55-22-22',
];
const TWENTY_FIRST = 'pick-peace-19-4-8-8';

/** A pick's shelf: `pick-<shelf>-…`. */
const shelfOf = (slug: string) => slug.split('-')[1] ?? '';

/** The tap that opens `slug`'s shelf, unless the pick before it left that shelf open. */
const opening = (slug: string, before: string) =>
  shelfOf(slug) === shelfOf(before)
    ? []
    : [`tap shelf-${shelfOf(slug)}`, 'clock data', 'clock settle'];

interface GardenVerse {
  readonly reference: string;
}
interface Garden {
  readonly lists: readonly { readonly title: string; readonly verses: readonly GardenVerse[] }[];
  readonly singles: readonly GardenVerse[];
}

/** Each reply of `ops` by its op, the `nth` of equal ops. */
const replyOf =
  (ops: readonly string[], replies: readonly unknown[]) =>
  (op: string, nth = 0) => {
    let seen = -1;
    return replies[ops.findIndex((each) => each === op && ++seen === nth)];
  };

const chosen = [
  'clock data',
  'clock settle',
  'tap add-list',
  'clock data',
  'clock settle',
  shot('shelves'),
  'tap shelf-any',
  'clock settle',
  'tap book-43',
  'clock data',
  'clock settle',
  'tap chapter-3',
  'clock data',
  'clock settle',
  'tap verse-16',
  'clock data',
  'tap verse-18',
  'clock data',
  'state chapterShown',
  shot('chosen'),
  'tap plant-list',
  'clock data',
  'clock settle',
  'state garden',
  'tap chapter-title',
  'clock settle',
  'tap book-19',
  'clock data',
  'clock settle',
  'tap chapter-119',
  'clock data',
  'clock settle',
  'state chooserWords.verses.length',
  'tap verse-176',
  'clock data',
  'state chapterShown.reference',
  shot('psalm-119'),
];
const first = replyOf(
  chosen,
  await drive.run([...port, '--storage', store, '--reset-storage'], chosen),
);
const offered = first('state chapterShown') as { reference?: string; plant?: boolean } | undefined;
drive.check(
  'the chapter offers Plant for John 3:16-18',
  offered?.reference === 'John 3:16-18' && offered.plant === true,
  offered,
);
const planted = first('state garden') as Garden | undefined;
drive.check(
  'planted on the chapter, John 3:16-18 is one list of three',
  planted?.lists.length === 1 &&
    planted.lists[0]?.verses.map((verse) => verse.reference).join(',') ===
      'John 3:16,John 3:17,John 3:18' &&
    planted.singles.length === 0,
  planted,
);
drive.check(
  "Psalm 119's 176 verses are drawn, and its last is chosen",
  first('state chooserWords.verses.length') === 176 &&
    first('state chapterShown.reference') === 'Psalms 119:176',
  [first('state chooserWords.verses.length'), first('state chapterShown.reference')],
);

const reread = ['clock data', 'clock settle', 'state garden', shot('relaunched')];
const again = replyOf(
  reread,
  await drive.run([...port, '--storage', store, '--keep-storage'], reread),
);
const kept = again('state garden') as Garden | undefined;
drive.check(
  'relaunched on the kept storage, the garden reads the list',
  JSON.stringify(kept?.lists.map((list) => list.verses.map((verse) => verse.reference))) ===
    JSON.stringify(planted?.lists.map((list) => list.verses.map((verse) => verse.reference))) &&
    (kept?.lists.length ?? 0) === 1,
  kept,
);

const sown = [
  'clock data',
  'clock settle',
  'tap add-list',
  'clock data',
  'clock settle',
  ...PICKS.flatMap((slug, index) => [
    ...opening(slug, PICKS[index - 1] ?? ''),
    `tap offer-${slug}`,
    'clock data',
    'clock settle',
    'tap shelf-plant',
    'clock data',
    'clock settle',
  ]),
  ...toChapter43(),
  'tap verse-16',
  'clock data',
  'state chapterShown',
  shot('single-offered'),
  'tap plant-singles',
  'clock data',
  'clock settle',
  'state garden.singles.length',
  'tap tab-garden',
  'clock data',
  'clock settle',
  'state addShown.line',
  `tap offer-${TWENTY_FIRST}`,
  'clock data',
  'clock settle',
  'state addListShown',
  shot('singles-full'),
  'back',
  'clock settle',
  ...toChapter43(),
  'tap verse-17',
  'clock data',
  'state chapterShown',
  shot('chapter-singles-full'),
];
const full = replyOf(
  sown,
  await drive.run([...port, '--storage', `${store}-singles`, '--reset-storage'], sown),
);
const single = full('state chapterShown', 0) as
  | { reference?: string; singles?: boolean; plant?: boolean }
  | undefined;
drive.check(
  'the chapter offers John 3:16 alone to the single verses, not as a list',
  single?.reference === 'John 3:16' && single.singles === true && single.plant === false,
  single,
);
drive.check(
  'twenty single verses planted through nineteen picks and the chapter are held',
  full('state garden.singles.length') === 20,
  full('state garden.singles.length'),
);
drive.check(
  "Add verses' foot says the single verses' limit",
  full('state addShown.line') === SINGLES_LIMIT,
  full('state addShown.line'),
);
const refused = full('state addListShown') as
  | { row?: { offer?: string }; line?: string }
  | undefined;
drive.check(
  'a twenty-first pick offers no Plant and says the limit',
  refused?.row?.offer === 'full' && refused.line === SINGLES_LIMIT,
  refused,
);
const shut = full('state chapterShown', 1) as
  | { reference?: string; singles?: boolean; line?: string }
  | undefined;
drive.check(
  'at twenty, the chapter offers John 3:17 nothing and says the limit',
  shut?.reference === 'John 3:17' && shut.singles === false && shut.line === SINGLES_LIMIT,
  shut,
);

const plain = ['clock data', 'clock settle', 'state gardenDriven', 'tree', shot('plain-verses')];
const looked = replyOf(
  plain,
  await drive.run(
    [...port, '--storage', `${store}-plain`, '--reset-storage', '--url', '/verses'],
    plain,
  ),
);
const tree = JSON.stringify(looked('tree') ?? '');
drive.check(
  'a plain launch has no test control in its tree',
  (looked('state gardenDriven') as { on?: boolean } | undefined)?.on === false &&
    tree.includes('verses-add') &&
    !['plant-three', 'plant-one', 'plant-two', 'good-', 'peeked-', 'shown-'].some((id) =>
      tree.includes(id),
    ),
  { driven: looked('state gardenDriven'), tree: tree.slice(0, 400) },
);

process.exit(drive.finish());
