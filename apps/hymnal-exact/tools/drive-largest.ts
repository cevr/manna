/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noAs, effect/noNullish, effect/noAsyncFunction, effect/noUnknownParameters, effect/noTernary, node/no-process-env, eslint/no-await-in-loop -- a host script that drives the built app through `bun run exact agent`, one run at a time, reads its untyped JSON replies by the fields it checks, branches plainly on them, and loads Exact's own accept matcher from the clone `EXACT` names, as the wrapper does. */

/**
 * The port's own layout at the largest text, held through the agent's own
 * `check` (the judge `exact verify` runs) and `layout` boxes on a 390 × 844
 * page: `bun tools/drive-largest.ts web`.
 *
 * - With chords on, each line of a hymn's part stays inside the part, at the
 *   default text size and at the largest (root 53 px, iOS's body at AX5):
 *   the words' gap is the row's `column-gap`, as the current hymnal's
 *   `columnGap`, not a margin the row reaches past its part for.
 * - At the largest text, a hymn's title breaks a word longer than its line,
 *   as UIKit breaks the current hymnal's, and home's `Hymns` ends in an
 *   ellipsis, as the current hymnal's does: neither text spills its box.
 * - A drum's digits take no touch, so the drum's control over them does not
 *   cover them.
 * - At the largest text Settings' Done keeps its room beside the title, so
 *   the title wraps short of it (owner, q161), and at the default size and
 *   the largest its button's box is at least 44 × 44 while its word sits
 *   where the room is: as far from the sheet's trailing edge, on the room's
 *   middle, so the larger target moves no pixel of the word.
 * - At the largest text the bar's key button is a 44-point target in the
 *   bar, and it and its open dials (a capo set, so Reset shows) are not
 *   clipped and share no area with the floating find bar.
 * - Scrolled to its end, with no player and with the player's bar docked,
 *   the home list's last row ends above the find bar's controls, as the
 *   current hymnal's `ListEnd` keeps it, at the default text size
 *   and root 28, 40 and 53; All at once, Search and # stand in the capsule
 *   there, sharing no area, each at least 44 × 44, and while searching the
 *   box and Cancel stand apart. On home, the capsule and its three controls
 *   clear the player's bar both while a hymn sounds (the bar 88 tall, its
 *   seeker showing) and at rest (56). The Topics tab's grouped
 *   list ends in the same end room, starting above the find bar.
 * - At the largest text each of the rail's labels but the last lies inside
 *   the rail, the first at its top (the current hymnal's "1" sits below the
 *   tab row at AX5); the last hangs half its line under the rail's bottom, as
 *   the current hymnal's (`Rail.tsx`, `marginTop: -box / 2` at `labelAt`'s
 *   `(index + 0.5) / count`); none is taller than its capped line.
 * - At the largest text a chord shape's marks, dots and barre leave no
 *   finding `app.json` does not accept, and its accepts, read by Exact's own
 *   matcher, take each of those roles' verified kinds and no sibling role's
 *   (a mark's or a barre's overlap, the sheet's name, another shape).
 *
 * `web` or `ios`: every op it uses runs on both; on iOS it scales
 * by the root font size, while the simulator's own text size is what
 * `verify ios` reads. Exits 1 on any failed check.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';

import { makeDrive } from '@manna/exact-kit/drive';
import { LABEL_LINE, LABEL_SCALE } from '@manna/hymnal-app/reader/rail-marks';

const host = process.argv[2] ?? 'web';
const drive = makeDrive({ name: 'drive-largest', host, appDir: join(import.meta.dir, '..') });

/** iOS's body size at the largest accessibility size, in points: the root font size verify's largest pass takes on the web. */
const LARGEST = 53;

interface TreeNode {
  readonly id: number;
  readonly props?: { readonly testId?: string };
  readonly children?: ReadonlyArray<number>;
}

interface Finding {
  readonly kind: string;
  readonly id: number;
}

/** The nodes a `tree` reply holds. */
const nodesOf = (reply: unknown): ReadonlyArray<TreeNode> =>
  (reply as { nodes?: ReadonlyArray<TreeNode> } | undefined)?.nodes ?? [];

/** The findings a `check` reply holds, over each scheme it judged. */
const findingsOf = (reply: unknown): ReadonlyArray<Finding> =>
  (
    (reply as { check?: ReadonlyArray<{ findings?: ReadonlyArray<Finding> }> } | undefined)
      ?.check ?? []
  ).flatMap((run) => run.findings ?? []);

/** The ids of the nodes whose testId `named` takes, and of every node under them. */
const under = (nodes: ReadonlyArray<TreeNode>, named: (testId: string) => boolean) => {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const found = new Set<number>();
  const take = (id: number) => {
    if (found.has(id)) return;
    found.add(id);
    for (const child of byId.get(id)?.children ?? []) take(child);
  };
  for (const node of nodes) if (named(node.props?.testId ?? '')) take(node.id);
  return found;
};

/** The findings of `kind` on the nodes `named` takes or under them, from a `tree` reply and the `check` reply after it. */
const findingsOn = (
  tree: unknown,
  check: unknown,
  kind: string,
  named: (id: string) => boolean,
) => {
  const ids = under(nodesOf(tree), named);
  return findingsOf(check).filter((finding) => finding.kind === kind && ids.has(finding.id));
};

const flags = (store: string) => [
  '--storage',
  `${store}-${host}-${Date.now().toString(36)}`,
  '--reset-storage',
  '--size',
  '390x844',
];
const largest = [`prefer root-font-size ${LARGEST}`, 'clock settle'];
const chordsOn = [
  'clock data',
  'tap gear',
  'clock settle',
  'tap chords-toggle',
  'clock settle',
  'clock data',
  'tap settings-done',
  'clock settle',
];

const chorded = await drive.run(flags('largest-chords'), [
  ...chordsOn,
  'type root /hymns/2',
  'clock data',
  'clock settle',
  'tree',
  'check',
  ...largest,
  'tree',
  'check',
]);
const line = (id: string) => /^line-\d+-\d+$/u.test(id);
for (const [at, size] of [
  [chordsOn.length + 3, 'the default text size'],
  [chordsOn.length + 7, 'the largest text'],
] as const) {
  const spills = findingsOn(chorded[at], chorded[at + 1], 'overflow', line);
  drive.check(
    `with chords on, each line of hymn 2 stays inside its part at ${size}`,
    chorded[at + 1] !== undefined && spills.length === 0,
    spills,
  );
}
const named = findingsOn(
  chorded[chordsOn.length + 7],
  chorded[chordsOn.length + 8],
  'clipped',
  (id) => id === 'hymn-name',
);
drive.check(
  `at the largest text hymn 2's number and title fit their row`,
  chorded[chordsOn.length + 8] !== undefined && named.length === 0,
  named,
);

const home = await drive.run(flags('largest-home'), [
  'clock data',
  'clock settle',
  ...largest,
  'tree',
  'check',
]);
const title = findingsOn(home[4], home[5], 'clipped', (id) => id === 'title');
drive.check(
  'at the largest text home’s title ends in an ellipsis, not cut',
  home[5] !== undefined && title.length === 0,
  title,
);

const drums = await drive.run(flags('largest-drums'), [
  'clock data',
  'tap find-search',
  'clock settle',
  'clock data',
  'type search zzqx',
  'clock settle',
  'clock data',
  'tap find-number',
  'clock settle',
  'clock data',
  'tree',
  'check',
]);
const covered = findingsOn(drums[10], drums[11], 'covered', (id) => id.startsWith('drum-face-'));
drive.check(
  'with the search open, the drums’ digits are not covered by their own control',
  drums[11] !== undefined && covered.length === 0,
  covered,
);

const settings = await drive.run(flags('largest-settings'), [
  'clock data',
  'tap gear',
  'clock settle',
  'clock data',
  ...largest,
  'tree',
  'check',
]);
const done = findingsOn(settings[6], settings[7], 'overlap', (id) => id === 'settings-done');
drive.check(
  'at the largest text Settings’ Done keeps its room beside the title (q161)',
  settings[7] !== undefined && done.length === 0,
  done,
);

interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** The box a `layout` reply gives its node, in the page's pixels. */
const boxOf = (reply: unknown): Box | undefined => {
  const seen = (
    reply as
      | {
          node?: {
            space?: {
              viewport?: {
                x: number;
                y: number;
                w?: number;
                h?: number;
                width?: number;
                height?: number;
              };
            };
          };
        }
      | undefined
  )?.node?.space?.viewport;
  if (seen === undefined) return undefined;
  return { x: seen.x, y: seen.y, w: seen.w ?? seen.width ?? 0, h: seen.h ?? seen.height ?? 0 };
};

/** Whether `a` and `b` stand apart, with room between them: no point of either's box is the other's. */
const apart = (a: Box, b: Box) =>
  a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y;

/** Whether `a` and `b` share no area: they may touch at an edge, as two halves of one capsule do. */
const unshared = (a: Box, b: Box) =>
  a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;

/** Each pair of `boxes`, by name, that `held` does not hold. */
const meeting = (
  boxes: ReadonlyArray<readonly [string, Box | undefined]>,
  held: (a: Box, b: Box) => boolean = apart,
) =>
  boxes.flatMap(([a, boxA], i) =>
    boxes
      .slice(i + 1)
      .filter(([, boxB]) => boxA === undefined || boxB === undefined || !held(boxA, boxB))
      .map(([b]) => `${a} meets ${b}`),
  );

/** The platform's least tap target, in points (iOS's 44 × 44): Settings' Done is held to it on both hosts. */
const TARGET = 44;
/** Done's button, its drawn word, the unseen room the title wraps short of, and the sheet, read in this order at each size. */
const DONE_PARTS = [
  'settings-done',
  'settings-done-word',
  'settings-done-room',
  'settings',
] as const;
/** How far, in pixels, Done's word may sit from its room's place: half a pixel of rounding. */
const HELD = 0.5;

const doneTarget = await drive.run(flags('target-settings'), [
  'clock data',
  'tap gear',
  'clock settle',
  'clock data',
  ...DONE_PARTS.map((id) => `layout ${id}`),
  ...largest,
  ...DONE_PARTS.map((id) => `layout ${id}`),
]);
for (const [at, size] of [
  [4, 'the default text size'],
  [4 + DONE_PARTS.length + largest.length, 'the largest text'],
] as const) {
  const [box, word, room, sheet] = DONE_PARTS.map((_, i) => boxOf(doneTarget[at + i]));
  drive.check(
    `Settings’ Done takes a tap over at least ${TARGET} × ${TARGET} at ${size}`,
    box !== undefined && box.w >= TARGET && box.h >= TARGET,
    box,
  );
  const fromEdge = (part: Box) =>
    sheet === undefined ? Number.NaN : sheet.x + sheet.w - (part.x + part.w);
  const middle = (part: Box) => part.y + part.h / 2;
  drive.check(
    `Settings’ Done draws its word where its room is, as far from the sheet’s trailing edge and on the room’s middle, at ${size}`,
    word !== undefined &&
      room !== undefined &&
      Math.abs(fromEdge(word) - fromEdge(room)) <= HELD &&
      Math.abs(middle(word) - middle(room)) <= HELD,
    {
      word,
      room,
      fromEdge: word && room && [fromEdge(word), fromEdge(room)],
    },
  );
}

/** The bar's key button and its open dials, on a hymn's page with chords on and a capo set. */
const KEY_PARTS = ['key-button', 'dials-reset', 'dial-capo', 'dial-key'] as const;
/** The find bar's controls that float over a hymn's page: its capsule. */
const FLOATING = ['find-capsule'] as const;
const keysAt = [
  ...chordsOn,
  'type root /hymns/2',
  'clock data',
  'clock settle',
  ...largest,
  'tap key-button',
  'clock data',
  'clock settle',
  'tap dial-capo-stop-1',
  'clock data',
  'clock settle',
  'tree',
  'check',
  ...[...KEY_PARTS, ...FLOATING, 'bar'].map((id) => `layout ${id}`),
];
const keysTree = chordsOn.length + 3 + largest.length + 6;
const keysFrom = keysTree + 2;
const keyed = await drive.run(flags('largest-keys'), keysAt);
const keyBoxes = KEY_PARTS.map((id, i) => [id, boxOf(keyed[keysFrom + i])] as const);
const keyFloating = FLOATING.map(
  (id, i) => [id, boxOf(keyed[keysFrom + KEY_PARTS.length + i])] as const,
);
const barBox = boxOf(keyed[keysFrom + KEY_PARTS.length + FLOATING.length]);
const keyButton = keyBoxes[0]?.[1];
const keyClipped = findingsOn(
  keyed[keysTree],
  keyed[keysTree + 1],
  'clipped',
  (id) => id === 'key-button' || id === 'dials-reset',
);
const keyMet = keyBoxes.flatMap(([id, box]) =>
  keyFloating.flatMap(([other, floatBox]) =>
    box !== undefined && floatBox !== undefined && !unshared(box, floatBox)
      ? [`${id} meets ${other}`]
      : [],
  ),
);
drive.check(
  `at the largest text the bar's key button is a ${TARGET}-point target in the bar, and it and its open dials are not clipped and stand clear of the floating find bar`,
  keyBoxes.every(([, box]) => box !== undefined) &&
    keyButton !== undefined &&
    keyButton.w >= TARGET &&
    keyButton.h >= TARGET &&
    barBox !== undefined &&
    keyButton.y >= barBox.y &&
    keyButton.y + keyButton.h <= barBox.y + barBox.h &&
    keyClipped.length === 0 &&
    keyMet.length === 0,
  { keyBoxes, keyFloating, barBox, keyClipped, keyMet },
);

/** The text sizes the end and the bar are held at: the default, then the root font sizes up to iOS's largest. */
const SIZES = [undefined, 28, 40, LARGEST] as const;
const sized = (size: number | undefined) =>
  size === undefined ? [] : [`prefer root-font-size ${size}`, 'clock settle'];
const BAR = ['tiles-show', 'find-capsule', 'find-search', 'find-number'] as const;
const atEnd = [
  'tap hymn-list wheel 0 999999',
  'clock settle',
  'tap hymn-list wheel 0 2400',
  'clock settle',
  'layout hymn-695',
  ...BAR.map((id) => `layout ${id}`),
];
const docked = [
  'type root /hymns/1',
  'clock data',
  'clock settle',
  'tap play',
  'clock settle',
  'clock data',
  'clock settle',
  'type root /',
  'clock data',
  'clock settle',
  'layout bar-room',
];

for (const [how, before] of [
  ['with no player', []],
  ['with the player’s bar docked', docked],
] as const) {
  const ops = [
    'clock data',
    'clock settle',
    ...before,
    ...SIZES.flatMap((size) => [...sized(size), ...atEnd]),
  ];
  const replies = await drive.run(flags('largest-end'), ops);
  if (before.length > 0)
    drive.check(
      'the player’s bar is docked under the home list',
      boxOf(replies[1 + before.length]) !== undefined,
    );
  let at = 2 + before.length;
  for (const size of SIZES) {
    at += sized(size).length + 4;
    const [row, tiles, capsule, search, hash] = [0, 1, 2, 3, 4].map((i) => boxOf(replies[at + i]));
    at += 5;
    const named = size === undefined ? 'the default text size' : `root ${size}`;
    const top = Math.min(...[tiles, capsule].map((box) => box?.y ?? Number.NEGATIVE_INFINITY));
    drive.check(
      `${how}, at the list's end the last hymn's row clears the find bar at ${named}`,
      row !== undefined && row.y + row.h <= top,
      { row, top },
    );
    const met = meeting(
      [
        ['tiles-show', tiles],
        ['find-search', search],
        ['find-number', hash],
      ],
      unshared,
    );
    const inCapsule =
      tiles !== undefined &&
      capsule !== undefined &&
      tiles.x >= capsule.x &&
      tiles.x + tiles.w <= capsule.x + capsule.w;
    const small = (
      [
        ['tiles-show', tiles],
        ['find-search', search],
        ['find-number', hash],
      ] as const
    ).filter(([, box]) => box === undefined || box.w < TARGET || box.h < TARGET);
    drive.check(
      `${how}, All at once, Search and # stand in the capsule, share no area and are each a ${TARGET}-point target, at ${named}`,
      met.length === 0 && inCapsule && small.length === 0,
      { met, inCapsule, small: small.map(([id]) => id), tiles, capsule },
    );
  }
}

/** The capsule and its three controls, then the player's bar, measured on home. */
const RIDE = ['find-capsule', 'tiles-show', 'find-search', 'find-number', 'bar'] as const;
const rideOps = RIDE.map((id) => `layout ${id}`);
const ride = await drive.run(flags('largest-ride'), [
  'clock data',
  'clock settle',
  'type root /hymns/1',
  'clock data',
  'clock settle',
  'tap play',
  'clock data',
  'clock +3000 real',
  'clock data',
  'clock settle',
  'type root /',
  'clock data',
  'clock settle',
  ...rideOps,
  'tap bar-toggle',
  'clock data',
  'clock settle',
  ...rideOps,
]);
const rideAt = (from: number) => RIDE.map((_, i) => boxOf(ride[from + i]));
const sounding = rideAt(13);
const resting = rideAt(13 + RIDE.length + 3);
for (const [named, boxes] of [
  ['while a hymn sounds (the seeker shows)', sounding],
  ['at rest (paused)', resting],
] as const) {
  const [capsule, tiles, search, hash, bar] = boxes;
  const inside = [tiles, search, hash].every(
    (box) =>
      box !== undefined &&
      capsule !== undefined &&
      box.x >= capsule.x &&
      box.x + box.w <= capsule.x + capsule.w &&
      box.y + box.h <= (bar?.y ?? Number.NEGATIVE_INFINITY),
  );
  drive.check(
    `the capsule and its three controls clear the player's bar ${named}`,
    capsule !== undefined && bar !== undefined && capsule.y + capsule.h <= bar.y && inside,
    { capsule, tiles, search, hash, bar },
  );
}
const [, , , , soundingBar] = sounding;
const [, , , , restingBar] = resting;
drive.check(
  'the bar stands 32 points taller while its seeker shows (88 against 56), so both heights were measured',
  soundingBar !== undefined &&
    restingBar !== undefined &&
    Math.abs(soundingBar.h - restingBar.h - 32) <= 1,
  { soundingBar, restingBar },
);

const topicsEnd = [
  'tap hymn-list wheel 0 999999',
  'clock settle',
  'layout list-end',
  'layout tiles-show',
  'layout find-capsule',
];
const topics = await drive.run(flags('largest-topics'), [
  'clock data',
  'clock settle',
  'tap tab-topics',
  'clock settle',
  'clock data',
  'clock settle',
  ...SIZES.flatMap((size) => [...sized(size), ...topicsEnd]),
]);
let topicsAt = 6;
for (const size of SIZES) {
  topicsAt += sized(size).length + 2;
  const [end, tiles, capsule] = [0, 1, 2].map((i) => boxOf(topics[topicsAt + i]));
  topicsAt += 3;
  const top = Math.min(...[tiles, capsule].map((box) => box?.y ?? Number.NEGATIVE_INFINITY));
  drive.check(
    `on the Topics tab, at the list's end its end room starts above the find bar, so the last row clears it, at ${size === undefined ? 'the default text size' : `root ${size}`}`,
    end !== undefined && end.h > 0 && end.y <= top,
    { end, top },
  );
}

const searching = await drive.run(flags('largest-search'), [
  'clock data',
  'clock settle',
  'tap find-search',
  'clock settle',
  ...SIZES.flatMap((size) => [...sized(size), 'layout find-capsule', 'layout find-cancel']),
]);
let at = 4;
for (const size of SIZES) {
  at += sized(size).length;
  const met = meeting([
    ['find-capsule', boxOf(searching[at])],
    ['find-cancel', boxOf(searching[at + 1])],
  ]);
  at += 2;
  drive.check(
    `searching, the box and Cancel stand apart at ${size === undefined ? 'the default text size' : `root ${size}`}`,
    met.length === 0,
    met,
  );
}

const railTree = await drive.run(flags('largest-rail-tree'), [
  'clock data',
  'clock settle',
  'tree',
]);
const railLabels = nodesOf(railTree[2])
  .map((node) => node.props?.testId ?? '')
  .filter((id) => id.startsWith('rail-label-'));
const railOps = ['rail', ...railLabels].map((id) => `layout ${id}`);
const railRuns = await drive.run(flags('largest-rail'), [
  'clock data',
  'clock settle',
  ...largest,
  ...railOps,
]);
const railFrom = 2 + largest.length;
const railBox = boxOf(railRuns[railFrom]);
const railOut = railLabels.filter((_, i) => {
  const label = boxOf(railRuns[railFrom + 1 + i]);
  const last = i === railLabels.length - 1;
  const bottom = label === undefined ? 0 : last ? label.y + label.h / 2 : label.y + label.h;
  return (
    railBox === undefined ||
    label === undefined ||
    label.y < railBox.y ||
    bottom > railBox.y + railBox.h ||
    label.x < railBox.x ||
    label.x + label.w > railBox.x + railBox.w ||
    label.h > LABEL_LINE * LABEL_SCALE + 1
  );
});
drive.check(
  'at the largest text every rail label but the last lies inside the rail, the first at its top, the last hangs no more than half its line under it, and none is taller than the current hymnal’s capped line (`LABEL_LINE * LABEL_SCALE`)',
  railLabels.length === 6 && railOut.length === 0,
  { labels: railLabels, out: railOut, rail: railBox },
);

const fingering = await drive.run(flags('largest-fingering'), [
  ...chordsOn,
  'type root /hymns/2',
  'clock data',
  'clock settle',
  'tap chord-1-1-6',
  'clock settle',
  'clock data',
  ...largest,
  'tree',
  'check',
]);
const fingeringAt = chordsOn.length + 8;
const fingeringFound = ['clipped', 'overlap'].flatMap((kind) =>
  findingsOn(fingering[fingeringAt], fingering[fingeringAt + 1], kind, (id) =>
    id.startsWith('shape-'),
  ),
);

/** Exact's own matcher of `verify.accept`, from the clone `bun run exact` runs. */
const { accepts } = (await import(
  join(process.env.EXACT ?? join(homedir(), 'Developer/vendor/exact'), 'scripts/agent-check.mjs')
)) as {
  accepts: (
    entries: ReadonlyArray<{ finding: string; node: string }>,
    finding: { kind: string; id: number },
    nodes: ReadonlyMap<number, TreeNode>,
  ) => unknown;
};
const listed = (
  (await Bun.file(join(import.meta.dir, '..', 'app.json')).json()) as {
    verify: { accept: ReadonlyArray<{ finding: string; node: string }> };
  }
).verify.accept;
const fingeringNodes = new Map(nodesOf(fingering[fingeringAt]).map((node) => [node.id, node]));
const unaccepted = fingeringFound.filter(
  (finding) => accepts(listed, finding, fingeringNodes) === undefined,
);
drive.check(
  'at the largest text a chord shape’s marks, dots and barre spill as the current hymnal’s, each finding one app.json accepts',
  fingeringFound.length > 0 && unaccepted.length === 0,
  { found: fingeringFound.length, unaccepted },
);
const taken = (kind: string, testId: string) =>
  accepts(listed, { kind, id: 1 }, new Map([[1, { id: 1, props: { testId } }]])) !== undefined;
for (const [kind, testId, take] of [
  ['clipped', 'shape-0-mark-0', true],
  ['clipped', 'shape-0-dot-2', true],
  ['clipped', 'shape-0-barre-0', true],
  ['overlap', 'shape-0-dot-1', true],
  ['overlap', 'shape-0-mark-0', false],
  ['overlap', 'shape-0-barre-0', false],
  ['clipped', 'shape-name', false],
  ['clipped', 'shape-done', false],
  ['clipped', 'shape-1-dot-0', false],
  ['clipped', 'shape-0-fret-0', false],
] as const)
  drive.check(
    `app.json's accepts ${take ? 'take' : 'do not take'} a ${kind} finding on ${testId}`,
    taken(kind, testId) === take,
  );

process.exit(drive.finish());
