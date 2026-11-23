/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noAsyncFunction, effect/noAs, effect/noNullish, effect/noUnknownParameters -- a host script that drives the built app through `bun run exact agent` and reads its untyped JSON replies by the fields it checks. */

/**
 * About's version line as drawn, which a `.test.contract` can hold only
 * as a literal at Exact's pin (an authored test compares no expression).
 * Through `@manna/exact-kit/drive` on the host named (`bun
 * tools/drive-about.ts web|ios`): About, opened from the Settings sheet,
 * shows the current Heartseed's version line (`VERSION_PREFIX`) over the
 * version `tools/licences.ts` writes from its `package.json`. Exits 1 on a
 * failed check.
 */

import { join } from 'node:path';

import { makeDrive } from '@manna/exact-kit/drive';

import { fromHome } from './from-home';
import { VERSION_PREFIX } from '@manna/heartseed/about/version';

import { heartseedVersion } from './licences';

const host = process.argv[2] ?? 'web';
const drive = fromHome(
  makeDrive({ name: 'drive-about', host, appDir: join(import.meta.dir, '..') }),
);

interface Node {
  readonly props?: { readonly testId?: string; readonly text?: string };
}

/** The `about-version` node's text in a `tree about-version` reply, if it is there. */
const versionOf = (reply: unknown): string | undefined =>
  (reply as { nodes?: ReadonlyArray<Node> } | undefined)?.nodes?.find(
    (node) => node.props?.testId === 'about-version',
  )?.props?.text;

const ops = [
  'clock data',
  'tap gear',
  'clock settle',
  'clock data',
  'tap about-row',
  'clock settle',
];
const replies = await drive.launch(`about-version-${host}-${Date.now().toString(36)}`, [
  ...ops,
  'tree about-version',
]);
const expected = `${VERSION_PREFIX}${heartseedVersion()}`;
const shown = versionOf(replies[ops.length]);
drive.check(
  `About shows "${expected}", the current Heartseed's line over its version`,
  shown === expected,
  replies[ops.length],
);

process.exit(drive.finish());
