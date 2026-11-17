/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noNullish, effect/noTernary, effect/noAsyncFunction, effect/noAs, effect/noUnknownParameters, node/no-process-env -- Exact's app folder cannot import effect (docs/exact.md): a host script, its shots folder named by SHOTS, that drives the built app through `bun run exact agent`, awaits each run, and reads its untyped JSON replies by the fields it checks. */

/**
 * The chapter screen's live checks (hs-read-chapter, the drive table), on
 * the host named (`bun tools/drive-chapter.ts web|ios`), plain launches:
 *
 * - Reading: at rest no verse draws a border or ground of its own (the
 *   pixels along a verse's edges are the page's ground), and the verse's
 *   number sits on its first line at 14, 18 and 38 pt;
 * - Assistive (`tree --ax`): each verse one checkbox named by its
 *   reference, the chosen one checked, a planted one said ("in your
 *   field"); the title, the magnifier, Aa and the clear button named;
 * - the bar: it leaves the chapter's last verse in view above it, sits
 *   above the tab bar, offers one filled button at most, and at the
 *   largest text size clips nothing, its button in view once the bar
 *   (which then scrolls inside 70 % of the screen) is scrolled to its end;
 * - opening on a verse: Psalm 119:105 read from Today's book button is in
 *   view a third of the way down what the reader sees of the chapter (on
 *   iOS, between UIKit's navigation bar and tab bar), within one line;
 * - kept: a relaunch on the kept storage opens the chapter left;
 * - motion: the bar's rise runs 150-250 ms; under Reduce Motion it moves
 *   by no translate;
 * - colours: the verses' words at rest and chosen, the planted number,
 *   the bar's reference and "Planted." at AA on the ground under them,
 *   read from pixels, light and dark; the planted line is hs.leaf, its
 *   ratio on the page printed as a note.
 *
 * Psalm 119 at the worst settings (176 built, the last reached, a size
 * step's time) is `tools/drive-type.ts`'s, on this same screen. No verse's
 * words are read or printed: checks read places, frames and colours. The
 * shots go to SHOTS (default `.exact/shots`), named by the prototype's
 * scenes (`read`, `select`, `range`, `planted`, `go`, `go-book`,
 * `go-search`, `field`, `opened`, `largest`), light and dark.
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { makeDrive } from '@manna/exact-kit/drive';
import { theme, type Scheme } from '@manna/heartseed/theme';

import { contrast } from '../src/look/brand';
import { readPng } from './png';

const host = process.argv[2] ?? 'web';
const app = join(import.meta.dir, '..');
const shots = process.env.SHOTS ?? join(app, '.exact/shots');
mkdirSync(shots, { recursive: true });
const drive = makeDrive({
  name: 'drive-chapter',
  host,
  appDir: app,
  timeoutMs: host === 'ios' ? 45 * 60 * 1000 : undefined,
});
const store = `chapter-${host}-${Date.now().toString(36)}`;
/** Every web launch here is a phone's width. */
const size = host === 'web' ? ['--size', '390x844'] : [];
const native = host === 'ios';
/** Dynamic Type's largest body size, AX5. */
const LARGEST = 53;

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
    readonly style?: Record<string, { readonly value?: string; readonly computed?: string }>;
  };
}
interface Element {
  readonly testId?: string;
  readonly role?: string;
  readonly name?: string;
  readonly states?: { readonly checked?: boolean };
  readonly native?: { readonly class?: string; readonly identifier?: string };
  readonly frame?: Frame;
}

/** A run's ops, each read back by the index `step` answers. */
const script = () => {
  const ops: string[] = [];
  const step = (...each: readonly string[]) => {
    ops.push(...each);
    return ops.length - 1;
  };
  return { ops, step };
};

const laid = (replies: readonly unknown[], at: number) => replies[at] as Laid | undefined;
const frameOf = (replies: readonly unknown[], at: number) =>
  laid(replies, at)?.node?.space?.viewport;
const elementsOf = (reply: unknown) =>
  (reply as { ax?: { elements?: ReadonlyArray<Element> } } | undefined)?.ax?.elements ?? [];
/** An element by its test id; on iOS a header control the navigation bar draws is UIKit's bar item, which carries the id as its identifier. */
const element = (reply: unknown, testId: string) =>
  elementsOf(reply).find(
    (each) =>
      (each.testId === testId || each.native?.identifier === testId) && each.role !== 'StaticText',
  );
/** The tab bar's frame: its `layout` on the web, UIKit's `UITabBar` from `tree --ax` on iOS. */
const BAR = native ? 'tree --ax' : 'layout tabs';
const barOf = (replies: readonly unknown[], at: number) =>
  native
    ? elementsOf(replies[at]).find((each) => each.native?.class === 'UITabBar')?.frame
    : frameOf(replies, at);
/** UIKit's navigation bar's frame from `tree --ax` on iOS; the web's header is in flow, above the scroll. */
const navOf = (reply: unknown) =>
  elementsOf(reply).find((each) => each.native?.class === 'UINavigationBar')?.frame;

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
/** Every pixel's colour inside a frame of a screenshot. */
const pixelsOf = (path: string, frame: Frame, width: number) => {
  const image = readPng(path);
  const scale = image.width / width;
  const seen: string[] = [];
  for (let y = Math.ceil(frame.y * scale); y < Math.floor((frame.y + frame.h) * scale); y++)
    for (let x = Math.ceil(frame.x * scale); x < Math.floor((frame.x + frame.w) * scale); x++) {
      const at = (y * image.width + x) * image.channels;
      seen.push(hexOf([image.rows[at] ?? 0, image.rows[at + 1] ?? 0, image.rows[at + 2] ?? 0]));
    }
  return seen;
};
/** A frame's ground (the colour most pixels are) and its mark (the colour farthest in contrast from it). */
const paintOf = (path: string, frame: Frame, width: number) => {
  const counts = new Map<string, number>();
  for (const hex of pixelsOf(path, frame, width)) counts.set(hex, (counts.get(hex) ?? 0) + 1);
  const ground = [...counts.entries()].toSorted((a, b) => b[1] - a[1])[0]?.[0] ?? '#000000';
  const mark = [...counts.keys()].toSorted((a, b) => contrast(b, ground) - contrast(a, ground))[0];
  return { ground, mark: mark ?? ground };
};
/** A frame's edges, `band` points deep: top, bottom, left and right. */
const edgesOf = (frame: Frame, band: number): Frame[] => [
  { x: frame.x, y: frame.y, w: frame.w, h: band },
  { x: frame.x, y: frame.y + frame.h - band, w: frame.w, h: band },
  { x: frame.x, y: frame.y, w: band, h: frame.h },
  { x: frame.x + frame.w - band, y: frame.y, w: band, h: frame.h },
];

const shotPath = (scene: string, scheme: Scheme) =>
  join(shots, `chapter-${host}-${scene}-${scheme}.png`);
const settle = ['clock data', 'clock settle'];
const scheme = (which: Scheme) => [`prefer prefers-color-scheme ${which}`, 'clock settle'];
/** Both schemes' shots of a scene, light left on. */
const both = (s: ReturnType<typeof script>, scene: string) => {
  s.step(...scheme('dark'), `screenshot ${shotPath(scene, 'dark')}`);
  s.step(...scheme('light'), `screenshot ${shotPath(scene, 'light')}`);
};
/** A verse's frame, its number's frame and the type it is drawn in. */
const verseSteps = (s: ReturnType<typeof script>, verse: number) => ({
  verse: s.step(`layout verse-${verse}`),
  number: s.step(`layout verse-number-${verse}`),
  type: s.step('state typeShown'),
});
const goTo = (book: number, chapter: number) => [
  'tap chapter-title',
  ...settle,
  `tap book-${book}`,
  ...settle,
  `tap chapter-${chapter}`,
  ...settle,
];
const aa = (...taps: string[]) => [
  'tap chapter-aa',
  ...settle,
  ...taps.flatMap((tap) => [tap, 'clock data']),
  'tap type-done',
  'clock settle',
];

const a = script();
a.step(...scheme('light'), ...settle, 'tap tab-read', ...settle);
a.step('tap chapter-title', ...settle);
both(a, 'go');
a.step('tap book-43', ...settle);
both(a, 'go-book');
a.step('tap chapter-3', ...settle);
const width = a.step('layout root');
const rest = verseSteps(a, 2);
both(a, 'read');
const axRest = a.step('tree --ax');
a.step('tap verse-16');
const rising = a.step('layout chapter-bar');
a.step('clock settle');
const chosen = verseSteps(a, 16);
both(a, 'select');
const axChosen = a.step('tree --ax');
a.step('tap verse-18', 'clock data', 'clock settle');
const range = a.step('state chapterShown');
const rangeLine = a.step('layout range-line');
both(a, 'range');
a.step('tap plant-list', ...settle);
/** The range's middle verse: the bar keeps the range's last verse in view, which can carry its first under iOS's navigation bar. */
const planted = verseSteps(a, 17);
const plantedLine = a.step('layout chapter-planted');
const landed = a.step('state chapterShown');
both(a, 'planted');
const axPlanted = a.step('tree --ax');
a.step('tap chapter-clear', ...settle);
const field = verseSteps(a, 17);
both(a, 'field');
a.step(...Array.from({ length: 4 }, () => 'tap chapter-scroll wheel 0 20000'), 'clock settle');
a.step('tap verse-36', ...settle);
const last = a.step('layout verse-36');
const barAtLast = a.step('layout chapter-bar');
const tabsAtLast = a.step(BAR);
const lastShown = a.step('state chapterShown');
a.step('tap chapter-clear', ...settle);
a.step(...aa('tap type-smaller', 'tap type-smaller'));
const at14 = verseSteps(a, 16);
a.step(...aa(...Array.from({ length: 12 }, () => 'tap type-larger')));
const at38 = verseSteps(a, 16);
a.step(...aa('tap type-reset'));
a.step(`prefer root-font-size ${LARGEST}`, ...settle, 'tap verse-1', ...settle);
const largest = {
  bar: a.step('layout chapter-bar'),
  line: a.step('layout range-line'),
  clear: a.step('layout chapter-clear'),
  button: a.step('tap chapter-bar wheel 0 2000', 'clock settle', 'layout plant-singles'),
};
const largestTabs = a.step(BAR);
both(a, 'largest');
a.step('prefer root-font-size 17', 'tap chapter-clear', ...settle);
a.step('prefer prefers-reduced-motion reduce', 'clock settle', 'tap verse-2');
const still = a.step('layout chapter-bar');
a.step(
  'clock settle',
  'tap chapter-clear',
  'clock settle',
  'prefer prefers-reduced-motion no-preference',
  'clock settle',
);
a.step('tap chapter-find', ...settle, 'type goto-find "psalm 119:105"', ...settle);
both(a, 'go-search');
a.step('tap goto-done', ...settle);
const first = await drive.run([...size, '--storage', store, '--reset-storage'], a.ops);
const viewWidth = laid(first, width)?.viewport?.w ?? 390;

for (const which of ['light', 'dark'] as const) {
  const frame = frameOf(first, rest.verse);
  const edges =
    frame === undefined
      ? []
      : edgesOf(frame, 2).flatMap((edge) => pixelsOf(shotPath('read', which), edge, viewWidth));
  const off = edges.filter((hex) => distance(hex, theme[which].ground) > 8);
  drive.check(
    `${which} reading: John 3:2 at rest draws no border or ground of its own (its edges are the page's ground)`,
    edges.length > 0 && off.length === 0,
    { pixels: edges.length, off: [...new Set(off)].slice(0, 5) },
  );
  if (frame !== undefined) {
    const paint = paintOf(shotPath('read', which), frame, viewWidth);
    drive.check(
      `${which} colours: a verse's words at AA on the page`,
      contrast(paint.mark, paint.ground) >= 4.5,
      `${contrast(paint.mark, paint.ground).toFixed(2)} (${paint.mark} on ${paint.ground})`,
    );
  }
  const chosenFrame = frameOf(first, chosen.verse);
  if (chosenFrame !== undefined) {
    const paint = paintOf(shotPath('select', which), chosenFrame, viewWidth);
    drive.check(
      `${which} colours: the chosen verse's ground is hs.hearing, its words at AA on it`,
      distance(paint.ground, theme[which].hearing) < distance(paint.ground, theme[which].ground) &&
        contrast(paint.mark, paint.ground) >= 4.5,
      `${contrast(paint.mark, paint.ground).toFixed(2)} (${paint.mark} on ${paint.ground}, hs.hearing ${theme[which].hearing})`,
    );
  } else drive.check(`${which} colours: the chosen verse is laid out`, false, chosenFrame);
  const numberFrame = frameOf(first, field.number);
  const plantedFrame = frameOf(first, field.verse);
  if (numberFrame !== undefined && plantedFrame !== undefined) {
    /**
     * A number is a small glyph: its antialiased pixels never reach its colour, so the darkest one reads under the
     * role's own ratio. The pixels name the role (the mark within reach of it, the ground read under it), and the
     * role's colour is held to AA on that ground.
     */
    for (const [scene, at, name, role] of [
      ['planted', planted.number, 'chosen', theme[which].quiet],
      ['field', field.number, 'at rest', theme[which].sun],
    ] as const) {
      const frame = frameOf(first, at);
      const number =
        frame === undefined ? undefined : paintOf(shotPath(scene, which), frame, viewWidth);
      drive.check(
        `${which} colours: a planted verse's number, ${name}, is drawn in its role at AA on its ground`,
        number !== undefined &&
          distance(number.mark, role) <= 24 &&
          contrast(role, number.ground) >= 4.5,
        number === undefined
          ? 'not laid out'
          : `${contrast(role, number.ground).toFixed(2)} (role ${role}, darkest pixel ${number.mark}, on ${number.ground})`,
      );
    }
    const line = paintOf(
      shotPath('field', which),
      { ...plantedFrame, x: plantedFrame.x + 0.5, w: 2 },
      viewWidth,
    ).ground;
    drive.check(
      `${which} colours: the planted line is hs.leaf`,
      distance(line, theme[which].leaf) <= 12,
      line,
    );
    console.log(
      `NOTE ${host} ${which}: the planted line ${line} on the page ${theme[which].ground} reads ${contrast(line, theme[which].ground).toFixed(2)}:1 (3:1 for a meaningful mark; the number in hs.sun and the spoken label carry the state too)`,
    );
  } else
    drive.check(`${which} colours: the planted verse is laid out`, false, {
      numberFrame,
      plantedFrame,
    });
  for (const [name, at, scene] of [
    ["the bar's reference", rangeLine, 'range'],
    ['"Planted."', plantedLine, 'planted'],
  ] as const) {
    const frame = frameOf(first, at);
    const paint =
      frame === undefined ? undefined : paintOf(shotPath(scene, which), frame, viewWidth);
    drive.check(
      `${which} colours: ${name} at AA on the bar`,
      paint !== undefined && contrast(paint.mark, paint.ground) >= 4.5,
      paint === undefined
        ? 'not laid out'
        : `${contrast(paint.mark, paint.ground).toFixed(2)} (${paint.mark} on ${paint.ground})`,
    );
  }
}

/** Whether a verse's number sits on its first line: its top within the verse's first line box. */
const onFirstLine = (at: ReturnType<typeof verseSteps>) => {
  const verse = frameOf(first, at.verse);
  const number = frameOf(first, at.number);
  const type = first[at.type] as
    | { fontSize?: number; lineHeight?: number; size?: number }
    | undefined;
  const line = (type?.size ?? 18) * (type?.lineHeight ?? 1.6);
  const ok =
    verse !== undefined &&
    number !== undefined &&
    number.y >= verse.y - 0.5 &&
    number.y + number.h <= verse.y + 6 + line + 0.5;
  return { ok, size: type?.size, verse, number, line };
};
for (const [size, at] of [
  [14, at14],
  [18, rest],
  [38, at38],
] as const) {
  const shown = onFirstLine(at);
  drive.check(
    `reading: the number sits on the verse's first line at ${size} pt`,
    shown.ok && shown.size === size,
    shown,
  );
}

const verses = (reply: unknown) =>
  elementsOf(reply).filter(
    (each) => /^verse-\d+$/u.test(each.testId ?? '') && each.role !== 'StaticText',
  );
const restVerses = verses(first[axRest]);
drive.check(
  'assistive: each of John 3’s 36 verses is one checkbox named by its reference',
  restVerses.length === 36 &&
    restVerses.every(
      (each) =>
        /checkbox/iu.test(each.role ?? '') &&
        each.name === `John 3:${(each.testId ?? '').slice(6)}`,
    ),
  restVerses.slice(0, 3).map((each) => [each.testId, each.role, each.name]),
);
/** The navigation bar's buttons: UIKit's `_UIButtonBarButton`s, each the name VoiceOver reads (the control's `aria-label`). */
const barButtons = elementsOf(first[axRest])
  .filter((each) => each.native?.class === '_UIButtonBarButton')
  .map((each) => each.name);
const named = Object.fromEntries(
  [
    ['chapter-title', 'John 3, choose another chapter'],
    ['chapter-find', 'Find a verse, a chapter or words'],
    ['chapter-aa', 'Text settings'],
  ].map(([id = '', name]) => [
    id,
    element(first[axRest], id)?.name ??
      (native && id !== 'chapter-title' ? barButtons.find((each) => each === name) : undefined),
  ]),
);
drive.check(
  'assistive: the title, the magnifier and Aa are named',
  named['chapter-title'] === 'John 3, choose another chapter' &&
    named['chapter-find'] === 'Find a verse, a chapter or words' &&
    named['chapter-aa'] === 'Text settings',
  {
    named,
    header: elementsOf(first[axRest])
      .filter((each) => (each.frame?.y ?? 999) < 120 && each.role !== 'StaticText')
      .map((each) => [each.testId, each.role, each.name, each.native]),
  },
);
const chosenAx = element(first[axChosen], 'verse-16');
drive.check(
  'assistive: the chosen verse is said checked, and the clear button named',
  chosenAx?.states?.checked === true &&
    element(first[axChosen], 'chapter-clear')?.name === 'Clear the selection',
  [chosenAx, element(first[axChosen], 'chapter-clear')?.name],
);
drive.check(
  'assistive: a planted verse is said in your field',
  element(first[axPlanted], 'verse-16')?.name === 'John 3:16, in your field' &&
    element(first[axPlanted], 'verse-15')?.name === 'John 3:15',
  [element(first[axPlanted], 'verse-16')?.name, element(first[axPlanted], 'verse-15')?.name],
);

const filled = (reply: unknown) => {
  const shown = reply as { plant?: boolean; singles?: boolean } | undefined;
  return Number(shown?.plant === true) + Number(shown?.singles === true);
};
drive.check(
  'the bar: one filled button at most (three verses chosen, landed, the last verse chosen)',
  [range, landed, lastShown].every((at) => filled(first[at]) <= 1) && filled(first[range]) === 1,
  [range, landed, lastShown].map((at) => filled(first[at])),
);
const lastFrame = frameOf(first, last);
const barFrame = frameOf(first, barAtLast);
const tabs = barOf(first, tabsAtLast);
drive.check(
  "the bar: John 3's last verse is in view above it",
  lastFrame !== undefined &&
    barFrame !== undefined &&
    laid(first, last)?.node?.visible?.inViewport === true &&
    lastFrame.y + lastFrame.h <= barFrame.y + 0.5,
  { lastFrame, barFrame },
);
drive.check(
  'the bar: it sits above the tab bar',
  barFrame !== undefined && tabs !== undefined && barFrame.y + barFrame.h <= tabs.y + 0.5,
  { barFrame, tabs },
);
const clipped = Object.entries(largest).filter(([, at]) => {
  const node = laid(first, at)?.node;
  return (
    node?.space?.viewport === undefined ||
    node.visible?.clipped === true ||
    node.visible?.inViewport !== true
  );
});
drive.check(
  'the bar: at the largest text size nothing of it is clipped, its button in view once the bar scrolls to its end',
  clipped.length === 0,
  clipped.map(([name, at]) => [name, laid(first, at)?.node?.visible]),
);
const largestBar = frameOf(first, largest.bar);
const largestTabBar = barOf(first, largestTabs);
drive.check(
  'the bar: at the largest text size it still sits above the tab bar',
  largestBar !== undefined &&
    largestTabBar !== undefined &&
    largestBar.y + largestBar.h <= largestTabBar.y + 0.5,
  { largestBar, largestTabBar },
);

/** The style rows that would move the bar, and its animation's duration in ms. */
const motionOf = (at: number) => {
  const style = laid(first, at)?.node?.style ?? {};
  const value = (name: string) => style[name]?.computed ?? style[name]?.value ?? '';
  const animation = [value('animation'), value('animation_name'), value('animation_duration')].join(
    ' ',
  );
  const durations = [...animation.matchAll(/(\d+(?:\.\d+)?)(ms|s)\b/gu)].map(
    (m) => Number(m[1]) * (m[2] === 's' ? 1000 : 1),
  );
  const moving = Object.entries(style)
    .filter(([name]) => /^(translate|transform)/u.test(name))
    .map(([name, row]) => `${name}=${row.computed ?? row.value}`)
    .filter((row) => !/=(none|)$/u.test(row));
  return { animation, durations, moving };
};
const rise = motionOf(rising);
drive.check(
  "motion: the bar's rise runs 150-250 ms",
  /hs-rise/u.test(rise.animation) && rise.durations.some((ms) => ms >= 150 && ms <= 250),
  rise,
);
const reduced = motionOf(still);
drive.check(
  'motion: under Reduce Motion the bar rises by no translate',
  !/hs-rise/u.test(reduced.animation) && reduced.moving.length === 0,
  reduced,
);

const b = script();
b.step(...scheme('light'), ...settle, 'tap tab-read', ...settle, ...goTo(19, 119));
b.step('tap verse-105', 'clock data', 'tap plant-singles', ...settle);
b.step('tap tab-garden', ...settle, 'tap single-button-Psalms-119-105', ...settle);
const todayAt = b.step('state today.reference');
b.step('tap today-read', ...settle);
const opened = b.step('layout verse-105');
const scroll = b.step('layout chapter-scroll');
const openedType = b.step('state typeShown');
const openedVerse = b.step('state readVerse');
const openedHeight = b.step('state chooserScrollHeight');
const openedBars = native ? b.step('tree --ax') : -1;
both(b, 'opened');
const second = await drive.run([...size, '--storage', `${store}-opened`, '--reset-storage'], b.ops);
const verseFrame = frameOf(second, opened);
const scrollFrame = frameOf(second, scroll);
const type = second[openedType] as { size?: number; lineHeight?: number } | undefined;
const oneLine = (type?.size ?? 18) * (type?.lineHeight ?? 1.6);
/** What the reader sees of the chapter: its scroll, less what UIKit's navigation bar and tab bar lie over on iOS. */
const seen = (() => {
  if (scrollFrame === undefined) return undefined;
  const nav = native ? navOf(second[openedBars]) : undefined;
  const tabs = native ? barOf(second, openedBars) : undefined;
  const top = Math.max(scrollFrame.y, nav === undefined ? 0 : nav.y + nav.h);
  const bottom = Math.min(scrollFrame.y + scrollFrame.h, tabs === undefined ? Infinity : tabs.y);
  return { top, bottom, nav, tabs };
})();
const third = seen === undefined ? Number.NaN : seen.top + (seen.bottom - seen.top) / 3;
drive.check(
  "opening on a verse: Psalm 119:105 from Today's button is in view, a third down, within one line",
  second[todayAt] === 'Psalms 119:105' &&
    second[openedVerse] === 105 &&
    verseFrame !== undefined &&
    Math.abs(verseFrame.y - third) <= oneLine,
  {
    today: second[todayAt],
    verse: second[openedVerse],
    top: verseFrame?.y,
    third,
    oneLine,
    scroll: scrollFrame,
    seen,
    height: second[openedHeight],
  },
);

const c = script();
c.step(...settle, 'tap tab-read', ...settle);
const kept = c.step('state chapterShown.heading');
const again = await drive.run([...size, '--storage', `${store}-opened`, '--keep-storage'], c.ops);
drive.check('kept: a relaunch opens the chapter left', again[kept] === 'Psalms 119', again[kept]);

process.exit(drive.finish());
