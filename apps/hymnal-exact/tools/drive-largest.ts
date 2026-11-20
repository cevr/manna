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
 * - At the largest text a hymn's key and capo controls, which may rest
 *   under the floating find bar as the current hymnal's chords do, scroll
 *   fully clear of it into view.
 * - Scrolled to its end, with no player and with the player's bar docked,
 *   the home list's last row ends above the find bar's controls, as the
 *   current hymnal's `ListEnd` keeps it, at the default text size
 *   and root 28, 40 and 53; All at once, Search and # stand in the capsule
 *   there, sharing no area, each at least 44 × 44, and while searching the
 *   box and Cancel stand apart. The Topics tab's grouped
 *   list ends in the same end room, starting above the find bar.
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

/** The chords' key and capo controls on a hymn's page. */
const KEYS = ['transpose-down', 'transpose-up', 'capo-down', 'capo-up'] as const;
/** The find bar's controls that float over a hymn's page: its capsule, Search and # (All at once is home's alone). */
const FLOATING = ['find-capsule'] as const;
const keysAt = [
  ...chordsOn,
  'type root /hymns/2',
  'clock data',
  'clock settle',
  ...largest,
  ...[...KEYS, ...FLOATING, 'hymn-words'].map((id) => `layout ${id}`),
];
const keysFrom = chordsOn.length + 5;
const restKeys = await drive.run(flags('largest-keys'), keysAt);
const keyBoxes = KEYS.map((_, i) => boxOf(restKeys[keysFrom + i]));
const floatTop = Math.min(
  ...FLOATING.map((_, i) => boxOf(restKeys[keysFrom + KEYS.length + i])?.y ?? Infinity),
);
const lowest = Math.max(...keyBoxes.map((box) => (box === undefined ? 0 : box.y + box.h)));
const lift = Math.max(0, Math.ceil(lowest - floatTop) + 16);
const lifted = await drive.run(flags('largest-keys'), [
  ...keysAt,
  `tap hymn-words wheel 0 ${lift}`,
  'clock settle',
  ...[...KEYS, ...FLOATING, 'hymn-words'].map((id) => `layout ${id}`),
]);
const liftedFrom = keysAt.length + 2;
const words = boxOf(lifted[liftedFrom + KEYS.length + FLOATING.length]);
const floating = FLOATING.flatMap((id, i) => {
  const box = boxOf(lifted[liftedFrom + KEYS.length + i]);
  return box === undefined ? [] : [[id, box] as const];
});
const liftedMet = KEYS.flatMap((key, i) =>
  meeting([[key, boxOf(lifted[liftedFrom + i])], ...floating]).filter((pair) =>
    pair.startsWith(`${key} `),
  ),
);
const shown = KEYS.every((_, i) => {
  const box = boxOf(lifted[liftedFrom + i]);
  return box !== undefined && words !== undefined && box.y >= words.y;
});
drive.check(
  `at the largest text a hymn's key and capo controls scroll fully clear of the floating find bar, in view (lifted ${lift})`,
  keyBoxes.every((box) => box !== undefined) &&
    floating.length > 0 &&
    shown &&
    liftedMet.length === 0,
  { lift, liftedMet, floating, words },
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
