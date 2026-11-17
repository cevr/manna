/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noAsyncFunction, effect/noNullish, effect/noTernary, effect/noAs, effect/noUnknownParameters, effect/noKnownValueWidening, effect/noNewPromise, eslint/no-await-in-loop, node/no-process-env -- a host script that drives the built app through `bun run exact agent` (the kit's drive, one process group per run), reads its replies and a screenshot's pixels and prints what it found; its shots folder is named by SHOTS. */

/**
 * Finding's live checks (spec B), which a `.test.contract` cannot hold at
 * Exact's pin, on the host named (`bun tools/drive-find.ts web|ios`):
 *
 * - the drums are the platform's adjustable controls: `tree --ax` reads
 *   each as a slider whose value is its digit, and an increment (VoiceOver's
 *   swipe up, a desktop reader's arrow) turns one;
 * - a pinch in on the home list shows the tiles and a pinch out closes
 *   them, where the driver can pinch: the web's is a trackpad's, a wheel
 *   with Control held; iOS's is `tap … pinch`, and what each driver gave is
 *   printed beside the check;
 * - a tap outside the drums closes them and opens nothing (on iOS a tap
 *   on UIKit's backdrop, which only a drive can aim at a point);
 * - on the web, a section header's glyphs are painted in the brand's muted
 *   role, light and dark, from a screenshot's pixels;
 * - the motion (spec B of ex-delight-hy-find): the drums pop in (100 ms
 *   after `#`, scaled between 0.96 and 1 and fading, by Open's fill drawn
 *   lighter than once settled) and are gone once the clock settles after a
 *   close; Open held down paints the brand's `pressed`, light and dark; the
 *   tiles grow in from a little larger (60 ms after All at once, scaled
 *   above 1) and Done leaves the list at the row it showed; the search's
 *   Cancel fades in (100 ms after Search, its words drawn lighter than once
 *   settled), and Cancel folds the bar; with chords on, a chord fades in
 *   over its syllable (60 ms after the page shows); under Reduce Motion the
 *   drums and the tiles are at scale 1 throughout. A closed exit and a
 *   reopen leave one drums, open.
 *
 * A transform in flight reads at its end on iOS, so iOS reads the end
 * values and films the drums, the tiles, the bar and the chords under
 * `--timing platform` (`ios-<name>.png` and its frames); there the list
 * after Done is 16 pt lower, on main too, which it prints. The agent's
 * server is the recordings' fixture on this checkout's own port. The
 * bar's three rows, the drums and the tiles are kept in SHOTS, light and
 * dark. Exits 1 on any failed check.
 */

import { join } from 'node:path';

import { bunProcesses, makeDrive } from '@manna/exact-kit/drive';
import { theme } from '@manna/hymnal-app/theme';

import { pixelAt } from './pixel.ts';
import { checkoutPort } from './recordings.ts';

const host = process.argv[2] ?? 'web';
const app = join(import.meta.dir, '..');
const shots = process.env.SHOTS ?? join(app, '.exact/shots/find');
const shotFile = (name: string) => join(shots, `${name}-${host}.png`);
const shot = (name: string) => `screenshot ${shotFile(name)}`;
const backend = `http://127.0.0.1:${checkoutPort()}`;
const processes = {
  ...bunProcesses,
  spawn: (argv: ReadonlyArray<string>, cwd: string) => {
    const child = Bun.spawn([...argv], {
      cwd,
      env: { ...process.env, HYMNAL_RECORDINGS: backend },
      stdout: 'pipe',
      stderr: 'pipe',
      detached: true,
    });
    return {
      pid: child.pid,
      ended: Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]).then(([stdout, stderr, code]) => ({ code, stdout, stderr })),
    };
  },
  signal: (pid: number, signal: 'SIGTERM') => {
    if (pid < -1) process.kill(pid, signal);
  },
  sleep: (ms: number) => Bun.sleep(ms),
};
const drive = makeDrive({ name: 'drive-find', host, appDir: app, processes });
const runId = Date.now().toString(36);
/** A first launch on a fresh store of its own, the agent's server on this checkout's port. */
const launch = (store: string, ops: ReadonlyArray<string>, flags: ReadonlyArray<string> = []) =>
  drive.run(
    [...flags, '--backend', backend, '--storage', `${store}-${runId}`, '--reset-storage'],
    ops,
  );

type Scheme = 'light' | 'dark';

/** A colour's red, green and blue from `#rrggbb`; `[]` when it is not one. */
const channels = (colour: string): ReadonlyArray<number> => {
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/iu.exec(colour);
  if (!hex) return [];
  return hex.slice(1, 4).map((pair) => Number.parseInt(pair, 16));
};

const distance = (a: ReadonlyArray<number>, b: ReadonlyArray<number>) =>
  Math.max(...a.map((value, at) => Math.abs(value - (b[at] ?? 999))));

type Frame = { readonly x: number; readonly y: number; readonly w: number; readonly h: number };

/** A layout reply's frame in the viewport, and the viewport's size. */
const frameOf = (reply: unknown): { frame?: Frame; width: number; height: number } => {
  const shown = reply as
    | { viewport?: { w: number; h: number }; node?: { space?: { viewport?: Frame } } }
    | undefined;
  return {
    frame: shown?.node?.space?.viewport,
    width: shown?.viewport?.w ?? 0,
    height: shown?.viewport?.h ?? 0,
  };
};

/**
 * The glyph pixel of `frame` in the shot `name` farthest from the ground:
 * a text's core, where antialiasing leaves its colour whole.
 */
const corePixel = async (name: string, reply: unknown, scheme: Scheme, span = 120) => {
  const { frame, width, height } = frameOf(reply);
  if (frame === undefined || width === 0 || height === 0) return [];
  const ground = channels(theme[scheme].ground);
  const points: Array<{ x: number; y: number }> = [];
  for (let y = frame.y + frame.h * 0.3; y <= frame.y + frame.h * 0.7; y += frame.h / 8)
    for (let x = frame.x + 1; x < frame.x + Math.min(frame.w, span); x += 1)
      points.push({ x: x / width, y: y / height });
  let core: ReadonlyArray<number> = [];
  for (const at of points) {
    const painted = await pixelAt(shotFile(name), at).catch(() => []);
    if (
      painted.length === 3 &&
      (core.length === 0 || distance(painted, ground) > distance(core, ground))
    )
      core = painted;
  }
  return core;
};

/** Each slider of a `tree --ax` reply, by its testId: its role and value. */
const slidersOf = (reply: unknown) => {
  const elements =
    (
      reply as
        | { ax?: { elements?: Array<{ testId?: string; role?: string; value?: string }> } }
        | undefined
    )?.ax?.elements ?? [];
  return new Map(
    elements
      .filter((each) => each.testId?.startsWith('drum-'))
      .map((each) => [each.testId ?? '', { role: each.role ?? '', value: each.value ?? '' }]),
  );
};

const pinchIn =
  host === 'web' ? 'tap hymn-list wheel 0 40 modifiers Control' : 'tap hymn-list pinch 0.5';
const pinchOut = host === 'web' ? 'tap tiles wheel 0 -60 modifiers Control' : 'tap tiles pinch 2';

const looks = (scheme: Scheme) => [
  `prefer prefers-color-scheme ${scheme}`,
  'clock settle',
  'layout section-adoration-and-praise',
  shot(`folded-${scheme}`),
  'tap find-search',
  'clock settle',
  'clock data',
  'type search "praise"',
  'clock settle',
  'clock data',
  shot(`searching-${scheme}`),
  'tap find-cancel',
  'clock settle',
  'clock data',
  'tap find-number',
  'clock settle',
  shot(`drums-${scheme}`),
  'tap drums-hash',
  'clock settle',
  'tap tiles-show',
  'clock settle',
  'clock data',
  shot(`tiles-${scheme}`),
  'tap tiles-done',
  'clock settle',
];

const launched = await launch('find', [
  'clock data',
  'tap find-number',
  'clock settle',
  'tree --ax',
  'type drum-ones adjust up',
  'clock settle',
  'clock data',
  'state find.number',
  'tree --ax',
  'tap drums-hash',
  'clock settle',
  'clock data',
  ...looks('light'),
  ...looks('dark'),
]);

const before = slidersOf(launched[3]);
drive.check(
  'the drums are three adjustable controls (the web: slider; iOS: adjustable), each its digit as value (1: 0, 0, 1)',
  ['drum-hundreds', 'drum-tens', 'drum-ones'].every((id) =>
    ['slider', 'adjustable'].includes(before.get(id)?.role ?? ''),
  ) &&
    before.get('drum-hundreds')?.value === '0' &&
    before.get('drum-tens')?.value === '0' &&
    before.get('drum-ones')?.value === '1',
  [...before],
);
drive.check('an increment of the ones turns the number to 2', launched[7] === 2, launched[7]);
drive.check(`the ones read 2 after it`, slidersOf(launched[8]).get('drum-ones')?.value === '2', [
  ...slidersOf(launched[8]),
]);
if (host === 'web') {
  const pinched = await launch('find-pinch', [
    'clock data',
    pinchIn,
    'clock settle',
    'clock data',
    'state find.tiles',
    pinchOut,
    'clock settle',
    'clock data',
    'state find.tiles',
  ]);
  drive.check(`a pinch in on the list shows the tiles (${pinchIn})`, pinched[4] === true, {
    reply: pinched[1],
    tiles: pinched[4],
  });
  drive.check(`a pinch out on the tiles closes them (${pinchOut})`, pinched[8] === false, {
    reply: pinched[5],
    tiles: pinched[8],
  });

  const outside = await launch('find-outside', [
    'clock data',
    'tap find-number',
    'clock settle',
    'state find.drums',
    'tap root at 20 800',
    'clock settle',
    'clock data',
    'state find.drums',
    'state find.go.serial',
    'state find.top',
  ]);
  drive.check(
    'a tap outside the drums (tap root at 20 800) closes them and opens nothing',
    outside[3] === true && outside[7] === false && outside[8] === 0 && outside[9] === '/',
    { open: outside[3], tap: outside[4], after: outside[7], go: outside[8], top: outside[9] },
  );
} else {
  console.log(
    `NOTE ${host} no pinch: the driver refuses \`${pinchIn}\` off a transformDragFor pair ("no photo binding"), so tiles-show and Done stand in`,
  );
  console.log(
    `NOTE ${host} no tap outside: the driver refuses \`tap root at 20 800\` ("ScrollView covers its middle"); UIKit's backdrop under the drums is not a target it aims at`,
  );
}

const LOOKS = 12;
if (host === 'web')
  for (const [scheme, base] of [
    ['light', LOOKS],
    ['dark', LOOKS + looks('light').length],
  ] as const) {
    const core = await corePixel(`folded-${scheme}`, launched[base + 2], scheme);
    const muted = channels(theme[scheme].muted);
    const ink = channels(theme[scheme].ink);
    drive.check(
      `a section header is painted the brand's ${scheme} muted, not its ink`,
      core.length === 3 &&
        distance(core, muted) <= 12 &&
        distance(core, muted) < distance(core, ink),
      { core, muted, ink },
    );
  }

/** A run's ops, each a step with an optional name its reply is read back by. */
const named = (steps: ReadonlyArray<string | readonly [string, string]>) => {
  const ops = steps.map((step) => (Array.isArray(step) ? step[1] : step) as string);
  const at = new Map(
    steps.flatMap((step, index) =>
      Array.isArray(step) ? [[step[0] as string, index] as const] : [],
    ),
  );
  return {
    ops,
    reply: (replies: ReadonlyArray<unknown>, name: string) => replies[at.get(name) ?? -1],
  };
};

/** The colour inside a filled button: a little in from its leading edge, at its middle. */
const fillPixel = async (name: string, reply: unknown) => {
  const { frame, width, height } = frameOf(reply);
  if (frame === undefined || width === 0 || height === 0) return [];
  return pixelAt(shotFile(name), {
    x: (frame.x + 6) / width,
    y: (frame.y + frame.h / 2) / height,
  }).catch(() => []);
};

/** A frame's width at a moment over its width at rest: its scale then. */
const scaleOf = (moving: unknown, resting: unknown) => {
  const [now, rest] = [frameOf(moving).frame, frameOf(resting).frame];
  if (now === undefined || rest === undefined || rest.w === 0) return Number.NaN;
  return now.w / rest.w;
};

/** Whether a tree reply lists a node of `testId`, and how many. */
const countIn = (tree: unknown, testId: string) =>
  JSON.stringify(tree ?? null).split(`"testId":"${testId}"`).length - 1;

/** Opens the drums, holds Open down for a shot, lets go (which opens hymn 1) and comes back. */
const heldOpen = (scheme: Scheme): ReadonlyArray<string | readonly [string, string]> => [
  `prefer prefers-color-scheme ${scheme}`,
  'clock settle',
  'tap find-number',
  'clock settle',
  [`open-${scheme}`, 'layout drums-open'],
  'tap drums-open down',
  shot(`open-${scheme}`),
  'tap up',
  'clock settle',
  'clock data',
  'back',
  'clock settle',
];

const moving = named([
  'clock data',
  'prefer prefers-color-scheme light',
  'clock settle',
  'tap find-number',
  'clock +100',
  ['drums-100', 'layout drums'],
  ['fill-100', 'layout drums-open'],
  shot('drums-100'),
  'clock settle',
  ['drums-end', 'layout drums'],
  ['fill-end', 'layout drums-open'],
  shot('drums-end'),
  'tap drums-hash',
  'clock settle',
  ...heldOpen('light'),
  ...heldOpen('dark'),
  'prefer prefers-color-scheme light',
  'clock settle',
  'tap find-number',
  'clock settle',
  host === 'web' ? 'tap root at 20 800' : 'tap drums-hash',
  'clock settle',
  ['drums-gone', 'tree'],
  'tap find-number',
  'clock +50',
  'tap drums-hash',
  'clock settle',
  'tap find-number',
  'clock settle',
  ['drums-again', 'tree'],
  ['drums-open', 'state find.drums'],
  'tap drums-hash',
  'clock settle',
  ['row-before', 'layout hymn-1'],
  'tap tiles-show',
  'clock data',
  'clock +60',
  ['tiles-60', 'layout tiles'],
  'clock settle',
  ['tiles-end', 'layout tiles'],
  'tap tiles-done',
  'clock settle',
  ['row-after', 'layout hymn-1'],
  ['tiles-gone', 'tree'],
  'tap find-search',
  'clock +100',
  ['cancel-100', 'layout find-cancel'],
  shot('bar-100'),
  'clock settle',
  ['cancel-end', 'layout find-cancel'],
  shot('bar-end'),
  'tap find-cancel',
  'clock settle',
  ['folded', 'state find.row'],
]);
const moved = await launch('find-motion', moving.ops);
const at = (name: string) => moving.reply(moved, name);

const drumsScale = scaleOf(at('drums-100'), at('drums-end'));
if (host === 'web') {
  drive.check(
    '100 ms after #, the drums are popping in: scaled between 0.96 and 1',
    drumsScale >= 0.96 && drumsScale < 0.9999,
    { drumsScale, at: frameOf(at('drums-100')).frame, end: frameOf(at('drums-end')).frame },
  );
  const [fading, whole] = [
    await fillPixel('drums-100', at('fill-100')),
    await fillPixel('drums-end', at('fill-end')),
  ];
  const ground = channels(theme.light.ground);
  drive.check(
    '100 ms after #, the drums are fading in: Open’s fill drawn lighter than once settled, and not gone',
    fading.length === 3 &&
      whole.length === 3 &&
      distance(fading, ground) < distance(whole, ground) - 2 &&
      distance(fading, ground) > 2,
    { fading, whole, ground },
  );
} else
  drive.check('settled, the drums show', frameOf(at('drums-end')).frame !== undefined, {
    end: frameOf(at('drums-end')).frame,
  });

for (const scheme of ['light', 'dark'] as const) {
  const painted = await fillPixel(`open-${scheme}`, at(`open-${scheme}`));
  const want = channels(theme[scheme].pressed);
  drive.check(
    `held down, the drums’ Open paints the brand’s ${scheme} pressed fill`,
    painted.length === 3 && distance(painted, want) <= 2,
    { painted, want },
  );
}

drive.check(
  `closed (${host === 'web' ? 'a tap outside' : 'the drums’ #'}), the drums are gone once the clock settles`,
  at('drums-gone') !== undefined && countIn(at('drums-gone'), 'drums') === 0,
  countIn(at('drums-gone'), 'drums'),
);
drive.check(
  'opened again after a close, one drums shows, open',
  countIn(at('drums-again'), 'drums') === 1 && at('drums-open') === true,
  { drums: countIn(at('drums-again'), 'drums'), open: at('drums-open') },
);

const tilesScale = scaleOf(at('tiles-60'), at('tiles-end'));
if (host === 'web')
  drive.check(
    '60 ms after All at once, the tiles are growing in: scaled above 1',
    tilesScale > 1.0001,
    {
      tilesScale,
    },
  );
const [rowBefore, rowAfter] = [frameOf(at('row-before')).frame, frameOf(at('row-after')).frame];
drive.check(
  'Done and the clock settled, the tiles are gone',
  countIn(at('tiles-gone'), 'tiles') === 0,
  {
    tiles: countIn(at('tiles-gone'), 'tiles'),
  },
);
if (host === 'web')
  drive.check(
    'Done and the clock settled, the list is at the row it showed',
    rowBefore !== undefined && rowAfter !== undefined && Math.abs(rowBefore.y - rowAfter.y) <= 0.5,
    { rowBefore, rowAfter },
  );
else
  console.log(
    `NOTE ${host} the list's row after Done moved ${rowBefore !== undefined && rowAfter !== undefined ? rowAfter.y - rowBefore.y : '?'} pt; main's FindTiles, with no motion, moves it the same 16 pt (hymn-1 at 246.33, then 262.33), so it is not this motion's`,
  );

if (host === 'web') {
  const [fading, whole] = [
    await corePixel('bar-100', at('cancel-100'), 'light', 60),
    await corePixel('bar-end', at('cancel-end'), 'light', 60),
  ];
  const ground = channels(theme.light.ground);
  drive.check(
    '100 ms after Search, Cancel is fading in: its words drawn lighter than once settled, and not gone',
    fading.length === 3 &&
      whole.length === 3 &&
      distance(fading, ground) < distance(whole, ground) - 2 &&
      distance(fading, ground) > 2,
    { fading, whole },
  );
}
drive.check(
  'Cancel and the clock settled, the bar is folded',
  at('folded') === 'folded',
  at('folded'),
);

const still = named([
  'clock data',
  'prefer prefers-reduced-motion reduce',
  'clock settle',
  ['still', 'state motionStill'],
  'tap find-number',
  'clock +100',
  ['drums-100', 'layout drums'],
  'clock settle',
  ['drums-end', 'layout drums'],
  'tap drums-hash',
  'clock settle',
  'tap tiles-show',
  'clock data',
  'clock +60',
  ['tiles-60', 'layout tiles'],
  'clock settle',
  ['tiles-end', 'layout tiles'],
]);
const stilled = await launch('find-still', still.ops);
const stillAt = (name: string) => still.reply(stilled, name);
drive.check('Reduce Motion reads as motionStill', stillAt('still') === true, stillAt('still'));
for (const [part, mid, end] of host === 'web'
  ? ([
      ['drums', 'drums-100', 'drums-end'],
      ['tiles', 'tiles-60', 'tiles-end'],
    ] as const)
  : []) {
  const scale = scaleOf(stillAt(mid), stillAt(end));
  drive.check(
    `under Reduce Motion the ${part} do not scale: at scale 1 as they show`,
    Math.abs(scale - 1) < 0.0001,
    {
      scale,
    },
  );
}

const chords = named([
  'clock data',
  'tap gear',
  'clock settle',
  'clock data',
  'tap chords-toggle',
  'clock settle',
  'clock data',
  'tap settings-done',
  'clock settle',
  'tap hymn-2',
  'clock data',
  'clock +60',
  ['chord-60', 'layout chord-1-1-1'],
  shot('chord-60'),
  'clock settle',
  ['chord-end', 'layout chord-1-1-1'],
  shot('chord-end'),
]);
const chorded = await launch('find-chords', chords.ops);
const chordAt = (name: string) => chords.reply(chorded, name);
if (host === 'web') {
  const [fading, whole] = [
    await corePixel('chord-60', chordAt('chord-60'), 'light', 40),
    await corePixel('chord-end', chordAt('chord-end'), 'light', 40),
  ];
  const ground = channels(theme.light.ground);
  drive.check(
    '60 ms after the page shows with chords on, a chord is fading in: drawn lighter than once settled, and not gone',
    fading.length === 3 &&
      whole.length === 3 &&
      distance(fading, ground) < distance(whole, ground) - 2 &&
      distance(fading, ground) > 2,
    { fading, whole },
  );
} else
  drive.check(
    'settled, a chord shows over its syllable',
    frameOf(chordAt('chord-end')).frame !== undefined,
    {
      end: frameOf(chordAt('chord-end')).frame,
    },
  );

if (host === 'ios') {
  const film = (name: string) => `screenshot ${join(shots, `ios-${name}.png`)} over 600 every 50`;
  await launch(
    'find-film',
    [
      'clock settle',
      'tap find-number',
      film('drums'),
      'clock settle',
      'tap drums-hash',
      'clock settle',
      'tap tiles-show',
      film('tiles'),
      'clock settle',
      'tap tiles-done',
      film('tiles-done'),
      'clock settle',
      'tap find-search',
      film('bar'),
      'clock settle',
      'tap find-cancel',
      'clock settle',
      'tap gear',
      'clock settle',
      'tap chords-toggle',
      'clock settle',
      'tap settings-done',
      'clock settle',
      'tap hymn-2',
      film('chords'),
    ],
    ['--timing', 'platform'],
  );
}

process.exit(drive.finish());
