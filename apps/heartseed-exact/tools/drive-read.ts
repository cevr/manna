/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noNullish, effect/noTernary, effect/noAsyncFunction, effect/noAs, effect/noUnknownParameters, node/no-process-env -- Exact's app folder cannot import effect (docs/exact.md): a host script, its shots folder named by SHOTS, that drives the built app through `bun run exact agent`, awaits each run, and reads its untyped JSON replies by the fields it checks. */

/**
 * The tabs' live checks, which a `.test.contract` cannot hold at Exact's
 * pin (an authored test reads no selected state, no drawn colour and no
 * native relaunch), on the host named (`bun tools/drive-read.ts web|ios`),
 * in a driver's launch (`HEARTSEED_GARDEN_DRIVE`), whose Read tab carries
 * the two ways in no screen calls yet (`ReadDriven`): the bar's two tabs
 * by `tree --ax`, their names and the one selected; the bar's ground and
 * each tab's mark by pixel, light and dark, the chosen tab in the tint and
 * the other in the quiet ink, both at AA on the ground; `readOpenAt` to
 * Psalm 119:176 brings that verse into view, above the bar, and a tap on
 * verse 170 raises the chapter's bar above the tab bar too, also at the
 * largest text size;
 * `readFollow` to John 3:16 and Back to the chapter left; a session
 * started in Garden, then Read and back, holds its item and its recital;
 * and a relaunch on the kept storage opens Read on the place kept. No
 * verse's words are read or printed: checks read places, frames and
 * colours. The bar's screens (Garden, light and dark) go to SHOTS
 * (default `.exact/shots`); the chapter's stay under `.exact/shots`.
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { makeDrive } from '@manna/exact-kit/drive';

import { fromHome } from './from-home';
import { theme, type Scheme } from '@manna/heartseed/theme';

import { contrast } from '../src/look/brand';
import { readPng } from './png';

const host = process.argv[2] ?? 'web';
const app = join(import.meta.dir, '..');
const shots = process.env.SHOTS ?? join(app, '.exact/shots');
const own = shots;
mkdirSync(shots, { recursive: true });
mkdirSync(own, { recursive: true });
/** A driver's launch: `makeDrive`'s agent inherits this process's environment as it started, so the drive runs itself again with the launch's variable set (the web's build reads it, the simulator's launch through `SIMCTL_CHILD_`). */
if (process.env.HEARTSEED_GARDEN_DRIVE !== '1') {
  const again = Bun.spawnSync([process.execPath, ...process.argv.slice(1)], {
    env: {
      ...process.env,
      HEARTSEED_GARDEN_DRIVE: '1',
      SIMCTL_CHILD_HEARTSEED_GARDEN_DRIVE: '1',
    },
    stdio: ['inherit', 'inherit', 'inherit'],
  });
  process.exit(again.exitCode ?? 1);
}
/** An iOS run waits its turn on the shared simulator's lock before it starts (wave3's lesson 18), and its timeout counts that wait. */
const drive = fromHome(
  makeDrive({
    name: 'drive-read',
    host,
    appDir: app,
    timeoutMs: host === 'ios' ? 45 * 60 * 1000 : undefined,
  }),
);
const store = `read-${host}-${Date.now().toString(36)}`;
/** The tint, as `app.forma`'s `AccentColor`: the ink by day, the soil by night. */
const TINT: Readonly<Record<Scheme, string>> = { light: theme.light.ink, dark: theme.dark.soil };
/** Dynamic Type's largest body size, AX5. */
const LARGEST = 53;

/** A drive's steps, each read back by the index `step` answers. */
const script = () => {
  const ops: string[] = [];
  const step = (...each: readonly string[]) => {
    ops.push(...each);
    return ops.length - 1;
  };
  return { ops, step };
};

interface Frame {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

interface Laid {
  readonly viewport?: { readonly w?: number; readonly h?: number };
  readonly node?: {
    readonly space?: { readonly viewport?: Frame };
    readonly visible?: { readonly inViewport?: boolean; readonly clipped?: boolean };
  };
}

interface Accessible {
  readonly ax?: {
    readonly elements?: ReadonlyArray<{
      readonly testId?: string;
      readonly role?: string;
      readonly name?: string;
      readonly states?: { readonly selected?: boolean; readonly checked?: boolean };
      readonly native?: { readonly class?: string };
      readonly frame?: Frame;
    }>;
  };
}

/**
 * iOS draws the bar with UIKit (`UITabBar`, a `_UITabButton` per tab), outside Exact's
 * layout: `layout` answers no frame for it, and its tabs carry no test id of ours. There
 * the bar and its tabs are read from `tree --ax`, by class and by name; on the web, by
 * `layout` of their test ids.
 */
const native = host === 'ios';
const elementsOf = (reply: unknown) => (reply as Accessible | undefined)?.ax?.elements ?? [];
const tabButtonsOf = (reply: unknown) =>
  elementsOf(reply).filter((element) => element.native?.class === '_UITabButton');

/** A node's frame in the viewport: from `layout` on the web, and on iOS the bar's or a tab's from `tree --ax`. */
const frameOf = (reply: unknown) => (reply as Laid | undefined)?.node?.space?.viewport;
const barFrameOf = (reply: unknown) =>
  native
    ? elementsOf(reply).find((element) => element.native?.class === 'UITabBar')?.frame
    : frameOf(reply);
const tabFrameOf = (reply: unknown, tab: 'garden' | 'read') =>
  native
    ? tabButtonsOf(reply).find((element) => element.name?.toLowerCase() === tab)?.frame
    : frameOf(reply);

/** The bar's tabs as `tree --ax` reads them: each tab's test id, its name, and whether it is selected. */
const tabsOf = (reply: unknown) =>
  (native
    ? tabButtonsOf(reply).map((element) => ({
        ...element,
        testId: `tab-${element.name?.toLowerCase() ?? ''}`,
      }))
    : elementsOf(reply)
        .filter((element) => element.testId === 'tab-garden' || element.testId === 'tab-read')
        .filter((element) => element.role !== 'StaticText')
  ).map((element) => ({
    id: element.testId,
    name: element.name,
    selected: element.states?.selected === true,
  }));

const hexOf = (rgb: readonly number[]) =>
  `#${rgb.map((each) => each.toString(16).padStart(2, '0')).join('')}`;

/** Channel distance between two `#rrggbb` colours: the largest of the three. */
const distance = (one: string, other: string) =>
  Math.max(
    ...[1, 3, 5].map((at) =>
      Math.abs(
        Number.parseInt(one.slice(at, at + 2), 16) - Number.parseInt(other.slice(at, at + 2), 16),
      ),
    ),
  );

/** What a screenshot holds inside a frame: its ground (the colour most pixels are) and its mark (the colour farthest in contrast from that ground). */
const paintOf = (shot: string, frame: Frame, width: number) => {
  const image = readPng(shot);
  const scale = image.width / width;
  const counts = new Map<string, number>();
  const seen: string[] = [];
  for (let y = Math.ceil(frame.y * scale); y < Math.floor((frame.y + frame.h) * scale); y++)
    for (let x = Math.ceil(frame.x * scale); x < Math.floor((frame.x + frame.w) * scale); x++) {
      const at = (y * image.width + x) * image.channels;
      const hex = hexOf([image.rows[at] ?? 0, image.rows[at + 1] ?? 0, image.rows[at + 2] ?? 0]);
      counts.set(hex, (counts.get(hex) ?? 0) + 1);
      seen.push(hex);
    }
  const ground = [...counts.entries()].toSorted((a, b) => b[1] - a[1])[0]?.[0] ?? '#000000';
  const mark = [...counts.keys()].toSorted((a, b) => contrast(b, ground) - contrast(a, ground))[0];
  /** The pixel nearest a colour: over a floating glass bar the content under it shows through, so the farthest pixel can be the page's text, not the tab's mark. */
  const nearest = (hex: string) =>
    [...counts.keys()].toSorted((a, b) => distance(a, hex) - distance(b, hex))[0] ?? ground;
  return { ground, mark: mark ?? ground, nearest };
};

/** The step that reads the bar's frame: its `layout` on the web, the tree on iOS. */
const BAR = native ? 'tree --ax' : 'layout tabs';

/** The bar read at one scheme: the bar's and the tabs' frames, the viewport's width and a screenshot. */
const barSteps = (s: ReturnType<typeof script>, name: string) => {
  const width = s.step('layout root');
  const bar = s.step(BAR);
  return {
    width,
    bar,
    garden: native ? bar : s.step('layout tab-garden'),
    read: native ? bar : s.step('layout tab-read'),
    shot: s.step(`screenshot ${join(own, `read-${host}-${name}.png`)}`),
    path: join(own, `read-${host}-${name}.png`),
  };
};

/** The bar's checks at one scheme, the tab `chosen` selected. */
const barChecks = (
  replies: readonly unknown[],
  at: ReturnType<typeof barSteps>,
  scheme: Scheme,
  chosen: 'garden' | 'read',
) => {
  const width = (replies[at.width] as Laid | undefined)?.viewport?.w ?? 0;
  const bar = barFrameOf(replies[at.bar]);
  const tabs = {
    garden: tabFrameOf(replies[at.garden], 'garden'),
    read: tabFrameOf(replies[at.read], 'read'),
  };
  if (bar === undefined || tabs.garden === undefined || tabs.read === undefined || width === 0) {
    drive.check(`${scheme} ${chosen}: the bar and its tabs are laid out`, false, {
      bar,
      tabs,
      width,
    });
    return;
  }
  const ground = paintOf(at.path, bar, width).ground;
  drive.check(
    `${scheme} ${chosen}: the bar's ground is hs.ground`,
    distance(ground, theme[scheme].ground) <= 6,
    ground,
  );
  for (const tab of ['garden', 'read'] as const) {
    const frame = tabs[tab];
    if (frame === undefined) continue;
    const paint = paintOf(at.path, frame, width);
    const mark = native && tab === chosen ? paint.nearest(TINT[scheme]) : paint.mark;
    if (tab === chosen)
      drive.check(
        `${scheme} ${chosen}: ${tab}'s mark is the tint`,
        distance(mark, TINT[scheme]) <= 24,
        `${mark} for ${TINT[scheme]}`,
      );
    else if (native)
      drive.check(
        `${scheme} ${chosen}: ${tab}'s mark is UIKit's own unselected ink, not the tint`,
        distance(mark, TINT[scheme]) > 24,
        `${mark}, the tint ${TINT[scheme]}`,
      );
    else
      drive.check(
        `${scheme} ${chosen}: ${tab}'s mark is hs.quiet`,
        distance(mark, theme[scheme].quiet) <= 24,
        `${mark} for ${theme[scheme].quiet}`,
      );
    drive.check(
      `${scheme} ${chosen}: ${tab}'s mark reads at AA on the ground under it`,
      contrast(mark, paint.ground) >= 4.5,
      `${contrast(mark, paint.ground).toFixed(2)} (${mark} on ${paint.ground})`,
    );
    drive.check(
      `${scheme} ${chosen}: ${tab}'s target is 44 points or more`,
      frame.h >= 44 && frame.w >= 44,
      frame,
    );
  }
};

/** Whether a node lies inside the viewport and wholly above the bar. */
const aboveBar = (replies: readonly unknown[], node: number, bar: number) => {
  const frame = frameOf(replies[node]);
  const top = barFrameOf(replies[bar]);
  const visible = (replies[node] as Laid | undefined)?.node?.visible;
  const inView = visible?.inViewport === true && visible.clipped !== true;
  if (frame === undefined || top === undefined) return { ok: false, frame, bar: top, inView };
  return { ok: inView && frame.y + frame.h <= top.y + 0.5, frame, bar: top, inView };
};

const placeOf = (reply: unknown) => {
  const place = reply as { book?: number; chapter?: number; verse?: number } | undefined;
  return [place?.book, place?.chapter, place?.verse];
};

const settle = ['clock data', 'clock settle'];
const moved =
  host === 'ios' ? ['clock data', 'clock settle', 'clock +600 real', 'clock settle'] : settle;
const light = ['prefer prefers-color-scheme light', 'clock settle'];
const dark = ['prefer prefers-color-scheme dark', 'clock settle'];

const a = script();
a.step(...light, ...settle);
const axGarden = a.step('tree --ax');
const gardenLight = barSteps(a, 'garden-light');
a.step(...dark);
const gardenDark = barSteps(a, 'garden-dark');
a.step(...light, 'tap tab-read', ...settle);
const axRead = a.step('tree --ax');
const fresh = a.step('state readShown');
const readLight = barSteps(a, 'read-light');
a.step(...dark);
const readDark = barSteps(a, 'read-dark');
a.step(...light, 'tap read-open-psalm', ...moved);
const psalm = a.step('state readShown');
const psalmVerse = a.step('state readVerse');
const psalmKept = a.step('state readBookKept');
const lastVerse = a.step('layout verse-176');
a.step('tap verse-170', ...settle);
const footer = a.step('layout chapter-bar');
const barAtPsalm = a.step(BAR);
a.step(`screenshot ${join(own, `read-${host}-psalm.png`)}`);
a.step('tap read-follow-john', ...moved);
const followed = a.step('state readShown');
const followedVerse = a.step('layout verse-16');
const barAtJohn = a.step(BAR);
a.step('back', ...settle);
const left = a.step('state readShown');
a.step(`prefer root-font-size ${LARGEST}`, 'tap read-open-psalm', ...moved);
const largestVerse = a.step('layout verse-176');
/** The verse is chosen at the default size and the text grown after, so the bar it raises is measured at the largest text. */
a.step(
  'prefer root-font-size 17',
  ...settle,
  'tap verse-170',
  ...settle,
  `prefer root-font-size ${LARGEST}`,
  ...settle,
);
const largestFooter = a.step('layout chapter-bar');
const largestBar = a.step(BAR);
const largestTab = native ? largestBar : a.step('layout tab-read');
a.step(`screenshot ${join(own, `read-${host}-largest.png`)}`);
a.step('prefer root-font-size 17', 'clock settle', 'tap tab-garden', ...settle);
a.step('type root /verses', ...settle, 'tap plant-three', ...settle, 'type root /', ...settle);
a.step('tap today-action', ...settle);
const itemBefore = a.step('state today.session.item');
a.step(
  'prefer permission.microphone granted',
  'prefer permission.speech-recognition granted',
  'tap say',
  'clock settle',
);
const phaseBefore = a.step('state today.phase');
a.step('tap tab-read', ...settle, 'tap tab-garden', ...settle);
const itemAfter = a.step('state today.session.item');
const phaseAfter = a.step('state today.phase');
const heldAfter = a.step('state today.session.held');
a.step(`screenshot ${join(shots, `read-${host}-session-light.png`)}`);
a.step(...dark, `screenshot ${join(shots, `read-${host}-session-dark.png`)}`, ...light);
a.step('prefer extension speech-recognition.heard="for god so"', 'clock +15000', 'clock settle');
a.step('tap finish', 'clock settle');
const graded = a.step('state today.phase');
const first = await drive.run(['--storage', store, '--reset-storage'], a.ops);

drive.check(
  'the bar names its two tabs, Garden selected at launch',
  Bun.deepEquals(tabsOf(first[axGarden]), [
    { id: 'tab-garden', name: 'Garden', selected: true },
    { id: 'tab-read', name: 'Read', selected: false },
  ]),
  tabsOf(first[axGarden]),
);
drive.check(
  'Read selected once tapped',
  Bun.deepEquals(tabsOf(first[axRead]), [
    { id: 'tab-garden', name: 'Garden', selected: false },
    { id: 'tab-read', name: 'Read', selected: true },
  ]),
  tabsOf(first[axRead]),
);
barChecks(first, gardenLight, 'light', 'garden');
barChecks(first, gardenDark, 'dark', 'garden');
barChecks(first, readLight, 'light', 'read');
barChecks(first, readDark, 'dark', 'read');
drive.check(
  'a fresh Read shows John 1',
  Bun.deepEquals(placeOf(first[fresh]), [43, 1, 0]),
  first[fresh],
);
drive.check(
  'readOpenAt keeps Psalm 119 and opens on verse 176',
  Bun.deepEquals(placeOf(first[psalm]).slice(0, 2), [19, 119]) &&
    first[psalmVerse] === 176 &&
    first[psalmKept] === '19',
  [first[psalm], first[psalmVerse], first[psalmKept]],
);
const shownLast = aboveBar(first, lastVerse, barAtPsalm);
drive.check('Psalm 119:176 is in view, above the bar', shownLast.ok, shownLast);
const shownFooter = aboveBar(first, footer, barAtPsalm);
drive.check(
  "the chapter's bar, raised by a tap on verse 170, is above the tab bar",
  shownFooter.ok,
  shownFooter,
);
drive.check(
  'readFollow shows John 3 on verse 16',
  Bun.deepEquals(placeOf(first[followed]), [43, 3, 16]),
  first[followed],
);
const shownFollowed = aboveBar(first, followedVerse, barAtJohn);
drive.check('John 3:16 is in view, above the bar', shownFollowed.ok, shownFollowed);
drive.check(
  'Back from the followed reference shows Psalm 119 again',
  Bun.deepEquals(placeOf(first[left]).slice(0, 2), [19, 119]),
  first[left],
);
/** At the largest text Psalm 119:176 can be taller than the room between iOS's navigation bar and the tab bar: then its start is in view, below the one and above the other. */
const largestLast = (() => {
  const shown = aboveBar(first, largestVerse, largestBar);
  const nav = native
    ? elementsOf(first[largestBar]).find((element) => element.native?.class === 'UINavigationBar')
        ?.frame
    : undefined;
  const navBottom = nav === undefined ? 0 : nav.y + nav.h;
  const { frame, bar } = shown;
  if (shown.ok || frame === undefined || bar === undefined) return { ...shown, navBottom };
  const tall = frame.h > bar.y - navBottom;
  return { ...shown, navBottom, tall, ok: tall && frame.y >= navBottom - 0.5 && frame.y < bar.y };
})();
drive.check(
  'at the largest text, Psalm 119:176 is in view above the bar (its start, when taller than the room)',
  largestLast.ok,
  largestLast,
);
const largestFoot = aboveBar(first, largestFooter, largestBar);
drive.check(
  "at the largest text, the chapter's bar is above the tab bar",
  largestFoot.ok,
  largestFoot,
);
const largestRead = tabFrameOf(first[largestTab], 'read');
drive.check(
  "at the largest text, Read's tab is still 44 points or more",
  largestRead !== undefined && largestRead.h >= 44,
  largestRead,
);
drive.check(
  'a session started in Garden shows an item, and Say it listens',
  first[itemBefore] !== null &&
    first[itemBefore] !== undefined &&
    first[phaseBefore] === 'listening',
  [first[itemBefore], first[phaseBefore]],
);
drive.check(
  "after Read and back, Today's item is kept",
  Bun.deepEquals(first[itemAfter], first[itemBefore]) && first[itemAfter] !== undefined,
  first[itemAfter],
);
drive.check(
  'after Read and back, the recital is still listening and the item held',
  first[phaseAfter] === 'listening' && first[heldAfter] === true,
  [first[phaseAfter], first[heldAfter]],
);
drive.check('the recital ends in its grades', first[graded] === 'graded', first[graded]);

const b = script();
b.step(...light, ...settle, 'tap tab-read', ...settle);
const relaunched = b.step('state readShown');
const keptBook = b.step('state readBookKept');
b.step(`screenshot ${join(own, `read-${host}-relaunched.png`)}`);
const again = await drive.run(['--storage', store, '--keep-storage'], b.ops);
drive.check(
  'a relaunch opens Read on Psalm 119, the place kept',
  Bun.deepEquals(placeOf(again[relaunched]).slice(0, 2), [19, 119]) && again[keptBook] === '19',
  [again[relaunched], again[keptBook]],
);

process.exit(drive.finish());
