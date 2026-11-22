/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noAs, effect/noNullish, effect/noAsyncFunction, effect/noUnknownParameters, effect/noTernary, node/no-process-env -- a host script that drives the built app through `bun run exact agent`, reads its untyped JSON replies by the fields it checks and branches plainly on them; its shots folder is named by SHOTS. */

/**
 * The home list's pinned tab row, read as the screen reader and the eye
 * read it, which a `.test.contract` cannot (it reads no box and no
 * accessibility name): `bun tools/drive-tabs.ts web|ios`.
 *
 * - By `tree --ax`, exactly one tab list "Show hymns by" is reachable at
 *   the list's top, deep in it with the row hidden, deep in it with the row
 *   pinned, and after a tab chosen on the pinned row; the pinned row's tabs
 *   carry the list's own row's names, selected state and hints.
 * - Pinned, its box stands at the safe area's top, and the group header
 *   pinned under it stands at its foot, never behind it.
 * - Under Reduce Motion it fades in place: its box stands at the same place
 *   mid-fade and at rest.
 * - At the largest text its height follows the current app's
 *   `tabRowHeight` at that scale.
 * - After an agent capture mid-list (a screenshot, which can move a
 *   scroller), the row's state still agrees with the list's offset.
 *
 * Prints one PASS or FAIL line a check; exits non-zero on any FAIL.
 */

import { join } from 'node:path';

import { makeDrive } from '@manna/exact-kit/drive';

const host = process.argv[2] === 'ios' ? 'ios' : 'web';
const app = join(import.meta.dir, '..');
const shots = process.env.SHOTS ?? join(app, '.exact/shots/tabs');
const drive = makeDrive({ name: 'drive-tabs', host, appDir: app });
const runId = Date.now().toString(36);

/** iOS's body size at the largest accessibility size, and at the usual size, in points (drive-largest's root sizes). */
const LARGEST = 53;
const BODY = 17;

/** The current app's tab row height at text scale `fontScale` (`home/TabRow.tsx`'s `tabRowHeight`: a 20-point line, 6 above and below, 8 round the row). */
const tabRowHeight = (fontScale: number) => Math.ceil(20 * fontScale) + 2 * 6 + 2 * 8;

interface AxElement {
  readonly role?: string;
  readonly name?: string;
  readonly description?: string;
  readonly states?: Readonly<Record<string, boolean>>;
  readonly testId?: string;
}

/** The accessibility elements a `tree --ax` reply holds. */
const elementsOf = (reply: unknown): ReadonlyArray<AxElement> =>
  (reply as { ax?: { elements?: ReadonlyArray<AxElement> } } | undefined)?.ax?.elements ?? [];

/** The tab lists "Show hymns by" a `tree --ax` reply holds. */
const tabLists = (reply: unknown) =>
  elementsOf(reply).filter(
    (element) => /tablist/iu.test(element.role ?? '') && element.name === 'Show hymns by',
  );

/** Each tab of a copy (`tab-` or `shown-tab-`), without its id: what the reader is told of it. */
const tabsOf = (reply: unknown, prefix: string) =>
  elementsOf(reply)
    .filter((element) => (element.testId ?? '').startsWith(prefix))
    .map(({ role, name, description, states }) => ({ role, name, description, states }));

interface Box {
  readonly x: number;
  readonly y: number;
  readonly h: number;
}

/** The box a `layout` reply gives its node, in the page's points. */
const boxOf = (reply: unknown): Box | undefined => {
  const box = (
    reply as {
      node?: { space?: { viewport?: { x: number; y: number; h?: number; height?: number } } };
    }
  )?.node?.space?.viewport;
  return box === undefined ? undefined : { x: box.x, y: box.y, h: box.h ?? box.height ?? 0 };
};

/** The test ids of a `tree` reply's nodes. */
const testIdsOf = (reply: unknown): ReadonlyArray<string> =>
  [...JSON.stringify(reply ?? '').matchAll(/"testId":"([^"]+)"/gu)].map((found) => found[1] ?? '');

/** A first launch on a fresh store named `store`, with the iOS touch runner where the host has one. */
const launch = (store: string, ops: ReadonlyArray<string>) =>
  drive.run(
    [
      ...['--storage', `${store}-${host}-${runId}`, '--reset-storage'],
      ...(host === 'ios' ? ['--touch', 'platform'] : []),
    ],
    ops,
  );
const settle = ['clock settle', 'clock data'];
const deep = ['tap hymn-list wheel 0 2000', ...settle];
const pinned = ['tap hymn-list wheel 0 -20', ...settle];

const both = ['tree --ax tabs', 'tree --ax shown-tabs-row'];
const reading = [
  'clock data',
  ...both,
  ...deep,
  ...both,
  ...pinned,
  ...both,
  'layout shown-tabs',
  'layout status-scrim',
  'tree',
  `screenshot ${join(shots, `pinned-${host}.png`)}`,
  ...settle,
  'state listTabsAt',
  'state listTabs',
  'layout hymn-list',
  'layout list-head',
  'tap shown-tab-topics',
  ...settle,
  ...both,
];
const read = await launch('tabs-read', reading);
const at = (op: string, nth = 0) =>
  read[
    reading.map((each, index) => [each, index] as const).filter(([each]) => each === op)[
      nth
    ]?.[1] ?? -1
  ];

for (const [nth, where] of [
  [0, 'at the top'],
  [1, 'deep in the list, the row hidden'],
  [2, 'deep in the list, the row pinned'],
  [3, 'after a tab chosen on the pinned row'],
] as const)
  drive.check(
    `exactly one tab list "Show hymns by" is reachable ${where}`,
    tabLists(at('tree --ax tabs', nth)).length +
      tabLists(at('tree --ax shown-tabs-row', nth)).length ===
      1,
    {
      own: tabLists(at('tree --ax tabs', nth)),
      pinned: tabLists(at('tree --ax shown-tabs-row', nth)),
    },
  );

const pinnedTabs = tabsOf(at('tree --ax shown-tabs-row', 2), 'shown-tab-');
const ownTabs = tabsOf(at('tree --ax tabs'), 'tab-');
drive.check(
  'the pinned row tells each tab as the list’s own row does: names, selected state, hints',
  JSON.stringify(pinnedTabs) === JSON.stringify(ownTabs) && pinnedTabs.length === 5,
  { pinned: pinnedTabs, own: ownTabs },
);

const shown = boxOf(at('layout shown-tabs'));
const scrim = boxOf(at('layout status-scrim'));
drive.check(
  'pinned, the row’s box stands at the safe area’s top',
  shown !== undefined && scrim !== undefined && Math.abs(shown.y - (scrim.y + scrim.h)) <= 0.5,
  { shown, scrim },
);

const offset = (() => {
  const list = boxOf(at('layout hymn-list'));
  const head = boxOf(at('layout list-head'));
  return list === undefined || head === undefined ? Number.NaN : list.y - head.y;
})();
const told = at('state listTabs') as { past?: boolean; reach?: boolean } | undefined;
drive.check(
  'after an agent capture mid-list the row’s state agrees with the list’s offset',
  Math.abs(offset - (at('state listTabsAt') as number)) <= 1 &&
    told?.past === true &&
    told.reach === true,
  { offset, at: at('state listTabsAt'), told },
);

const headers = testIdsOf(at('tree')).filter((id) => /^section-.+-row$/u.test(id));
const placing = [
  'clock data',
  ...deep,
  ...pinned,
  'layout shown-tabs',
  ...headers.map((id) => `layout ${id}`),
];
const placed = await launch('tabs-headers', placing);
const pinnedBox = boxOf(placed[placing.indexOf('layout shown-tabs')]);
const headerBoxes = headers.map((id) => ({
  id,
  box: boxOf(placed[placing.indexOf(`layout ${id}`)]),
}));
const foot = pinnedBox === undefined ? Number.NaN : pinnedBox.y + pinnedBox.h;
drive.check(
  'the group header pinned under the row stands at its foot, and no header stands behind it',
  headerBoxes.some(({ box }) => box !== undefined && Math.abs(box.y - foot) <= 1) &&
    headerBoxes.every(
      ({ box }) =>
        box === undefined || box.y + box.h <= (pinnedBox?.y ?? 0) + 0.5 || box.y >= foot - 1,
    ),
  {
    foot,
    near: headerBoxes.filter(({ box }) => box !== undefined && Math.abs(box.y - foot) < 120),
  },
);

const still = [
  'clock data',
  'prefer prefers-reduced-motion reduce',
  ...deep,
  ...pinned,
  'layout shown-tabs-slide',
  'tap hymn-list wheel 0 30',
  'clock +50',
  'layout shown-tabs-slide',
  ...settle,
  'tap hymn-list wheel 0 -30',
  'clock +50',
  'layout shown-tabs-slide',
  ...settle,
  'layout shown-tabs-slide',
];
const stilled = await launch('tabs-still', still);
const slides = still
  .map((op, index) => [op, index] as const)
  .filter(([op]) => op === 'layout shown-tabs-slide')
  .map(([, index]) => boxOf(stilled[index])?.y);
drive.check(
  'under Reduce Motion the row fades in place: its box never moves, mid-fade or at rest',
  slides.length === 4 && slides.every((y) => y !== undefined && y === slides[0]),
  slides,
);

const largest = [
  'clock data',
  `prefer root-font-size ${LARGEST}`,
  'clock settle',
  ...deep,
  ...pinned,
  'layout shown-tabs',
  'state listTabs',
  `screenshot ${join(shots, `largest-${host}.png`)}`,
];
const large = await launch('tabs-largest', largest);
const largeBox = boxOf(large[largest.indexOf('layout shown-tabs')]);
const want = tabRowHeight(LARGEST / BODY);
drive.check(
  `at the largest text the row is the current app's tabRowHeight at that scale (${want} points)`,
  largeBox !== undefined && Math.abs(largeBox.h - want) <= 1,
  { measured: largeBox?.h, want, state: large[largest.indexOf('state listTabs')] },
);

process.exit(drive.finish());
