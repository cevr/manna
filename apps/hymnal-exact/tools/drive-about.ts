/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noAs, effect/noNullish, effect/noAsyncFunction, effect/noUnknownParameters -- a host script that drives the built app through `bun run exact agent` and reads its untyped JSON replies by the fields it checks. */

/**
 * About's credit links, which a `.test.contract` cannot read at Exact's pin
 * (an authored test reads a node's text, never its role). Through
 * `@manna/exact-kit/drive` on the host named (`bun tools/drive-about.ts
 * web|ios`): each credit About answers (`aboutPage`, whose address is the
 * current hymnal's `licenceUrl`, held by `src/settings/sources.test.ts`)
 * draws its licence as a link, named the licence, where it has an address,
 * as the current hymnal's `Credit` opens it; and no link where it has none.
 * A topic row of About this hymn opens home's Topics with that topic's
 * header at the list's top (a test reads no frame), as the current
 * hymnal's `openAtTopic`. Exits 1 on any failed check.
 */

import { join } from 'node:path';

import { makeDrive } from '@manna/exact-kit/drive';

import { aboutPage } from '../src/settings/about.ts';

const host = process.argv[2] ?? 'web';
const drive = makeDrive({ name: 'drive-about', host, appDir: join(import.meta.dir, '..') });

interface AxElement {
  readonly role?: string;
  readonly name?: string;
  readonly testId?: string;
}

/** The accessibility elements a `tree --ax` reply holds. */
const elementsOf = (reply: unknown): ReadonlyArray<AxElement> =>
  (reply as { ax?: { elements?: ReadonlyArray<AxElement> } } | undefined)?.ax?.elements ?? [];

const credits = aboutPage().credits;
const open = [
  'clock data',
  'tap gear',
  'clock settle',
  'clock data',
  'tap about-row',
  'clock settle',
  'clock data',
];
const replies = await drive.launch(`about-links-${host}-${Date.now().toString(36)}`, [
  ...open,
  ...credits.map((credit) => `tree --ax about-${credit.part}`),
]);

credits.forEach((credit, at) => {
  const links = elementsOf(replies[open.length + at]).filter((element) =>
    /link/iu.test(element.role ?? ''),
  );
  const named = links.filter((element) => element.name === credit.licence);
  if (credit.url === '')
    drive.check(
      `${credit.part}'s licence is plain text, as it has no address`,
      links.length === 0,
      links,
    );
  else
    drive.check(
      `${credit.part}'s licence is a link named ${credit.licence}, as it has an address`,
      named.length > 0,
      elementsOf(replies[open.length + at]),
    );
});
drive.check(
  'About answers a credit with an address',
  credits.some((credit) => credit.url !== ''),
  credits,
);

/** The viewport box a `layout` reply gives. */
const boxOf = (reply: unknown): { readonly y: number } | undefined =>
  (reply as { node?: { space?: { viewport?: { y: number } } } } | undefined)?.node?.space?.viewport;

const landing = [
  'clock data',
  'tap hymn-2',
  'clock settle',
  'clock data',
  'tap hymn-about',
  'clock settle',
  'clock data',
  'tap about-topic-1',
  'clock settle',
  'clock data',
  'layout hymn-list',
  'layout group-power-in-nature-row',
  'layout group-adoration-and-praise-row',
];
const landed = await drive.launch(`about-landing-${host}-${Date.now().toString(36)}`, landing);
const list = boxOf(landed[landing.length - 3]);
const header = boxOf(landed[landing.length - 2]);
const first = boxOf(landed[landing.length - 1]);
drive.check(
  'a topic further down (hymn 2’s Power in Nature) opens Topics with its header at the list’s top, as the current About’s openAtTopic',
  list !== undefined && header !== undefined && Math.abs(header.y - list.y) <= 1,
  { list, header },
);
drive.check(
  'the Topics list has left its first topic’s header behind',
  list !== undefined && (first === undefined || first.y < list.y),
  { list, first },
);

process.exit(drive.finish());
