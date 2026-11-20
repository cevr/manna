/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noNullish, effect/noAsyncFunction, effect/noAs, effect/noUnknownParameters, node/no-process-env, eslint/no-await-in-loop -- a host script that drives the built app through `bun run exact agent`, one launch at a time on the one simulator, reads its untyped JSON replies by the fields it checks, and sets the garden's drive controls on its own launch. */

/**
 * What a phone shows at the largest text sizes, held where the port draws
 * it otherwise than the current Heartseed (`bun tools/drive-largest.ts
 * [web|ios]`, exit 1 on any failed check).
 *
 * On both hosts, at the root font of iOS's largest body (53 px) on a
 * 390-wide phone: a word's slot under no cue stays the line's width at most
 * and its unseen word takes no touch, so a tap on a word peeks that word;
 * and a single verse's `Remove` wraps under its verse instead of running
 * off the screen, while at the default size it sits on its verse's line.
 *
 * Below the accessibility sizes, as drawn: at the default size on both hosts,
 * and at 53 px on the web (which keeps the current layout at any size),
 * Today draws one fixed foot with nothing of it in the scroll, Say it and
 * Listen as the 132-pt circles inside it, and a list's page draws its head
 * once, with Practice fixed above the scroll. This is the arm
 * `src/look/roomy.test.ts` reads only as contract text.
 *
 * On iOS alone, at AX1 (28) and AX5 (53), where Exact's
 * `accessibilityTextSize` holds (owner, q160; the web has no such class and
 * keeps the current layout): Today leaves room for the reference and three
 * lines of the verse above its fixed round button, which stays on screen;
 * each round button holds its label and is at least 44 pt each way, inside
 * the screen; once said, Listening and then Next are capsules the line's
 * width holding their labels, at least 44 pt tall, and Say it again and the
 * result's card are drawn once, in the scroll: a drag moves them together
 * while Next stays fixed; and a list's page leaves its scroll room for a
 * verse, with Practice inside it.
 */

import { join } from 'node:path';

import { makeDrive } from '@manna/exact-kit/drive';

import { readBrand } from './look';

const host = process.argv[2] ?? 'web';
if (host !== 'web' && host !== 'ios') {
  console.log(`drive-largest: web or ios, not ${host}`);
  process.exit(2);
}
const app = join(import.meta.dir, '..');
if (process.env.HEARTSEED_GARDEN_DRIVE !== '1') {
  const self = Bun.spawn(['bun', import.meta.path, host], {
    stdout: 'inherit',
    stderr: 'inherit',
    env: { ...process.env, HEARTSEED_GARDEN_DRIVE: '1' },
  });
  process.exit(await self.exited);
}
const drive = makeDrive({ name: 'drive-largest', host, appDir: app });

/** The phone's width verify reads the largest size at, and that size's root font (Exact's `LARGEST_PX`). */
const WIDTH = 390;
const LARGEST = 'prefer root-font-size 53';
/** The accessibility sizes' bodies the iOS checks run at: AX1, where the class begins, and AX5. */
const ACCESSIBILITY_SIZES = [28, 53] as const;
/** The longest word of the verse under no cue (`/cue/none`), the one a slot could run past the line with. */
const LONGEST = 36;
/** The single verse the garden's drive control plants (`plant-one`, `features/garden.contract`). */
const SINGLE = 'Psalms-119-1';
/** The list `hslist.test.contract` plants, and its first verse. */
const LIST_ROW = 'row-title-passage-0-43-3-16-18';
const LIST_VERSE = 'John-3-16';
/** What a frame may differ by between hosts' rounding, in points. */
const SLACK = 0.5;
/** The smallest target iOS allows, in points. */
const TARGET = 44;
/** The round button's circle below the accessibility sizes (`TodayRound`), `size.button` in app.forma. */
const CIRCLE = Number(/size\.button: length = (\d+)px/u.exec(readBrand())?.[1] ?? Number.NaN);
/** `type.word`'s size in rem and its line height (a full-text line, the tallest any cue draws, so the room asked is the most a verse needs), `passage`'s row gap and the recital's gap under the reference (app.forma). */
const WORD_REM = 1.4118;
const WORD_LEADING = 1.5;
const ROW_GAP = 2;
const REFERENCE_GAP = 10;
/** The line's width: the phone less `space.page` on each side (app.forma). */
const LINE =
  WIDTH - 2 * Number(/space\.page: length = (\d+)px/u.exec(readBrand())?.[1] ?? Number.NaN);
/** The microphone and the recognizer granted to the agent's substitute, so Say it listens. */
const GRANTED = [
  'prefer permission.microphone granted',
  'prefer permission.speech-recognition granted',
];
/** How far a drag on Today's scroll (iOS's agent drags only a scroll it starts on) moves it up, in points: less than the scroll's range at AX1. */
const DRAG = -120;

interface Frame {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const frameOf = (reply: unknown): Frame | undefined =>
  (reply as { node?: { space?: { viewport?: Frame } } } | undefined)?.node?.space?.viewport;
const size = ['--size', `${WIDTH}x844`];
const stamp = Date.now().toString(36);
const middle = (f: Frame) => f.y + f.h / 2;
const bottom = (f: Frame) => f.y + f.h;
const inside = (inner: Frame, outer: Frame) =>
  inner.x >= outer.x - SLACK &&
  inner.y >= outer.y - SLACK &&
  inner.x + inner.w <= outer.x + outer.w + SLACK &&
  bottom(inner) <= bottom(outer) + SLACK;
const onScreen = (f: Frame) => f.x >= -SLACK && f.x + f.w <= WIDTH + SLACK;

const today = await drive.run(
  ['--storage', `largest-today-${stamp}`, '--reset-storage', '--url', '/cue/none', ...size],
  [
    'clock data',
    'clock settle',
    LARGEST,
    'clock settle',
    `layout word-${LONGEST}`,
    `layout face-${LONGEST}`,
    'tap word-0',
    'clock settle',
    'state today.peeking',
  ],
);
const [longest, slot] = [4, 5].map((at) => frameOf(today[at]));
drive.check(
  "at the largest size a word's button is the line's width at most",
  longest !== undefined && longest.x + longest.w <= WIDTH + SLACK,
  longest,
);
drive.check(
  "at the largest size a word's slot is the line's width at most",
  slot !== undefined && slot.x + slot.w <= WIDTH + SLACK,
  slot,
);
drive.check(
  'at the largest size a tap on a word under no cue peeks that word',
  today[8] === 0,
  today[8],
);

const singles = [
  'clock data',
  'type root /verses',
  'clock data',
  'tap plant-one',
  'clock data',
  'back',
  'clock data',
  'clock settle',
  `layout single-button-${SINGLE}`,
  `layout single-remove-${SINGLE}`,
  LARGEST,
  'clock settle',
  `layout single-button-${SINGLE}`,
  `layout single-remove-${SINGLE}`,
];
const home = await drive.run(
  ['--storage', `largest-home-${stamp}`, '--reset-storage', ...size],
  singles,
);
const [verse, remove, verseLarge, removeLarge] = [8, 9, 12, 13].map((at) => frameOf(home[at]));
drive.check(
  "at the default size a single verse's Remove sits on its verse's line",
  verse !== undefined && remove !== undefined && Math.abs(middle(verse) - middle(remove)) <= 1,
  { verse, remove },
);
drive.check(
  "at the largest size a single verse's Remove stays on the screen, under its verse",
  verseLarge !== undefined &&
    removeLarge !== undefined &&
    onScreen(removeLarge) &&
    removeLarge.y >= verseLarge.y + verseLarge.h - SLACK,
  { verse: verseLarge, remove: removeLarge },
);

const roundHolds = (
  name: string,
  button: Frame | undefined,
  label: Frame | undefined,
  px: number,
) =>
  drive.check(
    `at ${px} pt ${name} holds its label, at least ${TARGET} pt each way, on the screen`,
    button !== undefined &&
      label !== undefined &&
      inside(label, button) &&
      button.w >= TARGET &&
      button.h >= TARGET &&
      onScreen(button),
    { button, label },
  );

/** A round button at the accessibility sizes: a capsule the line's width (the screen less the page's margins), holding its label, at least 44 pt tall, on the screen. */
const capsuleHolds = (
  name: string,
  button: Frame | undefined,
  label: Frame | undefined,
  px: number,
) =>
  drive.check(
    `at ${px} pt ${name} is a capsule the line's width holding its label, at least ${TARGET} pt tall`,
    button !== undefined &&
      label !== undefined &&
      inside(label, button) &&
      button.w >= LINE - SLACK &&
      button.h >= TARGET &&
      onScreen(button),
    { button, label },
  );

/** The steps that plant `hslist.test.contract`'s list and open its page, then `after`. */
const listSteps = (after: ReadonlyArray<string>) => [
  'clock data',
  'tap add-list',
  'clock data',
  'clock settle',
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
  'tap plant-list',
  'clock data',
  'clock settle',
  'tap tab-garden',
  'clock data',
  'clock settle',
  'back',
  'clock data',
  'clock settle',
  `tap ${LIST_ROW}`,
  'clock data',
  ...after,
];

/** How many nodes of a `tree` reply carry `testId`, at any depth. */
const countOf = (reply: unknown, testId: string): number =>
  JSON.stringify(reply ?? '').split(`"testId":"${testId}"`).length - 1;

/** The root sizes the current layout must hold at: the default on both hosts, and on the web, which has no accessibility class (q160), the largest too. */
const BELOW = [
  { at: 'at the default size', prefer: [], hosts: ['web', 'ios'] },
  { at: 'at 53 px on the web', prefer: [LARGEST, 'clock settle'], hosts: ['web'] },
].filter((each) => each.hosts.includes(host));

for (const { at, prefer } of BELOW) {
  const reads = ['tree', 'layout today-foot', 'layout say', 'layout hear'];
  const recital = await drive.run(
    ['--storage', `largest-below-today-${stamp}`, '--reset-storage', '--url', '/cue/none', ...size],
    ['clock data', 'clock settle', ...prefer, ...reads],
  );
  const base = 2 + prefer.length;
  const tree = recital[base];
  const [foot, say, hear] = [1, 2, 3].map((k) => frameOf(recital[base + k]));
  drive.check(
    `${at} Today draws its foot once, whole and fixed: one foot, no part in the scroll, one Say it and one Listen`,
    countOf(tree, 'today-foot') === 1 &&
      countOf(tree, 'today-foot-rest') === 0 &&
      countOf(tree, 'say') === 1 &&
      countOf(tree, 'hear') === 1,
    ['today-foot', 'today-foot-rest', 'say', 'hear'].map((id) => [id, countOf(tree, id)]),
  );
  drive.check(
    `${at} Today's Say it and Listen are the 132-pt circles, inside the fixed foot`,
    foot !== undefined &&
      say !== undefined &&
      hear !== undefined &&
      [say, hear].every(
        (b) =>
          Math.abs(b.w - CIRCLE) <= SLACK && Math.abs(b.h - CIRCLE) <= SLACK && inside(b, foot),
      ),
    { foot, say, hear },
  );

  const page = await drive.run(
    ['--storage', `largest-below-list-${stamp}`, '--reset-storage', ...size],
    listSteps([...prefer, 'tree', 'layout list-scroll', 'layout list-practice']),
  );
  const listTree = page.at(-3);
  const [scroll, practice] = [-2, -1].map((k) => frameOf(page.at(k)));
  drive.check(
    `${at} a list's page draws its head once`,
    countOf(listTree, 'list-top') === 1 && countOf(listTree, 'list-practice') === 1,
    { top: countOf(listTree, 'list-top'), practice: countOf(listTree, 'list-practice') },
  );
  drive.check(
    `${at} a list's Practice stays fixed above its scroll`,
    scroll !== undefined && practice !== undefined && bottom(practice) <= scroll.y + SLACK,
    { scroll, practice },
  );
}

if (host === 'ios') {
  for (const px of ACCESSIBILITY_SIZES) {
    const prefer = `prefer root-font-size ${px}`;
    const recital = await drive.run(
      [
        '--storage',
        `largest-ax-today-${px}-${stamp}`,
        '--reset-storage',
        '--url',
        '/cue/none',
        ...size,
      ],
      [
        'clock data',
        prefer,
        'clock settle',
        'layout today-top',
        'layout reference',
        'layout passage',
        'layout today-foot',
        'layout today-bottom',
        'layout say',
        'layout say-label',
        'layout hear',
        'layout hear-label',
      ],
    );
    const [top, reference, passage, foot, end, say, sayLabel, hear, hearLabel] = [
      3, 4, 5, 6, 7, 8, 9, 10, 11,
    ].map((at) => frameOf(recital[at]));
    const line = px * WORD_REM * WORD_LEADING;
    const threeLines = 3 * line + 2 * ROW_GAP;
    const needed =
      (reference?.h ?? Number.NaN) + REFERENCE_GAP + Math.min(passage?.h ?? Number.NaN, threeLines);
    const room = (foot?.y ?? Number.NaN) - ((top?.y ?? Number.NaN) + (top?.h ?? Number.NaN));
    drive.check(
      `at ${px} pt Today has room above its fixed foot for the reference and three lines of the verse`,
      room >= needed - SLACK,
      { room, needed },
    );
    drive.check(
      `at ${px} pt Today's fixed foot and its round button stay on the screen`,
      foot !== undefined &&
        end !== undefined &&
        say !== undefined &&
        bottom(foot) <= end.y + SLACK &&
        inside(say, foot),
      { foot, end, say },
    );
    roundHolds('Say it', say, sayLabel, px);
    roundHolds('Listen', hear, hearLabel, px);

    const said = await drive.run(
      [
        '--storage',
        `largest-ax-said-${px}-${stamp}`,
        '--reset-storage',
        '--url',
        '/cue/none',
        ...size,
      ],
      [
        'clock data',
        prefer,
        'clock settle',
        ...GRANTED,
        'tap say',
        'clock settle',
        'layout finish',
        'layout finish-label',
        'clock +5000',
        'tap finish',
        'clock data',
        'clock settle',
        'tree',
        'layout next',
        'layout next-label',
        'layout again',
        'layout grade-1',
        `tap today-scroll drag 0 ${DRAG}`,
        'clock settle',
        'layout next',
        'layout again',
        'layout grade-1',
      ],
    );
    const [finish, finishLabel] = [7, 8].map((at) => frameOf(said[at]));
    const saidTree = said[13];
    const [next, nextLabel, pills, card, nextAfter, pillsAfter, cardAfter] = [
      14, 15, 16, 17, 20, 21, 22,
    ].map((at) => frameOf(said[at]));
    capsuleHolds('Listening', finish, finishLabel, px);
    capsuleHolds('Next', next, nextLabel, px);
    const moved = (before: Frame | undefined, after: Frame | undefined) =>
      (after?.y ?? Number.NaN) - (before?.y ?? Number.NaN);
    const [pillsMoved, cardMoved, nextMoved] = [
      moved(pills, pillsAfter),
      moved(card, cardAfter),
      moved(next, nextAfter),
    ];
    drive.check(
      `at ${px} pt the pills and the result's card are in the scroll, drawn once: a drag moves them together while Next stays fixed`,
      countOf(saidTree, 'again') === 1 &&
        countOf(saidTree, 'grade-1') === 1 &&
        countOf(saidTree, 'next') === 1 &&
        pillsMoved < -SLACK &&
        Math.abs(cardMoved - pillsMoved) <= SLACK &&
        Math.abs(nextMoved) <= SLACK,
      {
        counts: ['again', 'grade-1', 'next'].map((id) => [id, countOf(saidTree, id)]),
        pillsMoved,
        cardMoved,
        nextMoved,
      },
    );

    const reads = ['layout list-scroll', 'layout list-practice', `layout list-row-${LIST_VERSE}`];
    const list = await drive.run(
      ['--storage', `largest-ax-list-${px}-${stamp}`, '--reset-storage', ...size],
      listSteps([prefer, 'clock settle', ...reads]),
    );
    const [scroll, practice, row] = [-3, -2, -1].map((k) => frameOf(list.at(k)));
    drive.check(
      `at ${px} pt a list's page scrolls Practice with its verses, with room for a verse or Practice`,
      scroll !== undefined &&
        practice !== undefined &&
        row !== undefined &&
        scroll.h >= Math.max(row.h, practice.h) - SLACK &&
        practice.y >= scroll.y - SLACK &&
        practice.y < row.y,
      { scroll, practice, row },
    );
  }
}

process.exit(drive.finish());
