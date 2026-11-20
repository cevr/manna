/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noAs, effect/noNullish, effect/noAsyncFunction, effect/noUnknownParameters -- a host script that drives the built app through `bun run exact agent` and reads its untyped JSON replies by the fields it checks. */

/**
 * The layout findings `exact verify` made on the web that were the port's
 * own (hy-verify), held through the agent's own `check` (the judge verify
 * runs) on a 390 × 844 page: `bun tools/drive-largest.ts web`.
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
 *
 * Web only: iOS's largest text is the simulator's own size, which
 * `verify ios` reads. Exits 1 on any failed check.
 */

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

process.exit(drive.finish());
