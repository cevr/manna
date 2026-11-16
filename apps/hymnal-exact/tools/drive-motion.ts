/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noAsyncFunction, effect/noNullish, effect/noTernary, effect/noAs, effect/noUnknownParameters, effect/noNewPromise, eslint/no-await-in-loop, node/no-process-env -- a host script that drives the built app through `bun run exact agent` (the kit's drive, one process group per run), reads the frames its layout replies name and a screenshot's pixels, and prints what it found; its shots folder is named by SHOTS. */

/**
 * The hymnal's motion and its Sounds and haptics setting, live (spec B),
 * on the host named (`bun --preload ./src/test/setup.ts
 * tools/drive-motion.ts web|ios`). Every Play here is made with Sounds
 * and haptics off.
 *
 * - **Press:** held down, a filled button (the page's Play, then its
 *   Pause) paints the brand's `pressed` fill, light and dark.
 * - **Bar enter:** 100 ms after Play the docked bar is still rising (its
 *   frame lies below where it rests, by less than its height), and after
 *   the clock settles it rests. Under Reduce Motion it does not move: at
 *   100 ms it rests and its words are fading in, drawn lighter than once
 *   settled.
 * - **Bar exit:** Settings opened, the bar is gone once the clock settles;
 *   closed, the bar rises again.
 * - **Room:** the hymn's last part, scrolled to the end, lies above the bar.
 * - **The setting:** turned off, it stays off after a relaunch on the kept
 *   store.
 * - **Haptics:** whether the agent says a haptic played is printed once
 *   (`note`), from a tap's reply and the state after it.
 *
 * On iOS a native transform in flight reads at its end value, so iOS reads
 * the end values and films the bar's rise and sink under `--timing
 * platform` instead (`ios-rise-<n>.png`, `ios-sink-<n>.png`). The agent's
 * server is the recordings' fixture on this checkout's own port, as the
 * player's drive has it. Exits 1 on any failed check.
 */

import { join } from 'node:path';

import { makeDrive } from '@manna/exact-kit/drive';
import { theme } from '@manna/hymnal-app/theme';

import { sourcesAt } from '../src/sources.ts';
import { pixelAt } from './pixel.ts';
import { checkoutPort } from './recordings.ts';

const host = process.argv[2] ?? 'web';
const app = join(import.meta.dir, '..');
const shots = process.env.SHOTS ?? join(app, '.exact/shots/motion');
const shotFile = (name: string) => join(shots, `${name}-${host}.png`);
const shot = (name: string) => `screenshot ${shotFile(name)}`;
const backend = `http://127.0.0.1:${checkoutPort()}`;
/** Chrome keeps a named store per port, so every web launch here, the relaunch too, takes one of the app's spare ports. */
const port = host === 'web' ? ['--port', '8777'] : [];
const env = { ...process.env, HYMNAL_RECORDINGS: backend };
const processes = {
  spawn: (argv: ReadonlyArray<string>, cwd: string) => {
    const child = Bun.spawn([...argv], {
      cwd,
      env,
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
  sleep: (ms: number) =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, ms).unref();
    }),
};
const drive = makeDrive({ name: 'drive-motion', host, appDir: app, processes });
const store = `motion-${host}-${Date.now().toString(36)}`;

/** Hymn 1's last part, as the page draws it: the row the room must leave above the bar. */
const lastPart =
  sourcesAt('https://hymns.cvr.im', []).hymnPage(['1']).parts.at(-1)?.key ?? 'stanza-1';

interface Frame {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** A layout reply's frame in the viewport, and the viewport's size. */
const frameOf = (reply: unknown) => {
  const shown = reply as
    | { viewport?: { w: number; h: number }; node?: { space?: { viewport?: Frame } } }
    | undefined;
  return {
    frame: shown?.node?.space?.viewport,
    width: shown?.viewport?.w ?? 0,
    height: shown?.viewport?.h ?? 0,
  };
};

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

type Scheme = 'light' | 'dark';

/** A colour as its red, green and blue, 0 to 255, from `#rrggbb`. */
const channels = (colour: string): ReadonlyArray<number> =>
  (/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/iu.exec(colour)?.slice(1, 4) ?? []).map((pair) =>
    Number.parseInt(pair, 16),
  );

const distance = (one: ReadonlyArray<number>, other: ReadonlyArray<number>) =>
  Math.max(...one.map((value, at) => Math.abs(value - (other[at] ?? 0))));

/** The colour painted inside a button's fill: a little in from its leading edge, at its middle. */
const fillPixel = async (name: string, reply: unknown) => {
  const { frame, width, height } = frameOf(reply);
  if (frame === undefined || width === 0) return [];
  return pixelAt(shotFile(name), {
    x: (frame.x + 6) / width,
    y: (frame.y + frame.h / 2) / height,
  }).catch(() => []);
};

/** The pixel of a text's frame farthest from the ground: its core. */
const corePixel = async (name: string, reply: unknown, scheme: Scheme) => {
  const { frame, width, height } = frameOf(reply);
  if (frame === undefined || width === 0) return [];
  const ground = channels(theme[scheme].ground);
  let core: ReadonlyArray<number> = [];
  for (let y = frame.y + frame.h * 0.3; y <= frame.y + frame.h * 0.7; y += frame.h / 8)
    for (let x = frame.x + 1; x < frame.x + Math.min(frame.w, 120); x += 1) {
      const painted = await pixelAt(shotFile(name), { x: x / width, y: y / height }).catch(
        () => [],
      );
      if (
        painted.length === 3 &&
        (core.length === 0 || distance(painted, ground) > distance(core, ground))
      )
        core = painted;
    }
  return core;
};

const feelOff = [
  'tap gear',
  'clock settle',
  'clock data',
  'tap settings-feel',
  'clock settle',
  'clock data',
  'tap settings-done',
  'clock settle',
];

const scrollDown = [
  'tap hymn-words drag 0 -600',
  'clock settle',
  'tap hymn-words drag 0 -600',
  'clock settle',
];

const first = named([
  'clock data',
  'prefer prefers-color-scheme light',
  'clock settle',
  'tap gear',
  'clock settle',
  'clock data',
  ['haptic-tap', 'tap appearance-system'],
  ['haptic-state', 'state'],
  'clock settle',
  'tap settings-done',
  'clock settle',
  ...feelOff,
  ['kept', 'state settingsFeelKept'],
  'tap hymn-1',
  'clock settle',
  'clock data',
  ['play-light', 'layout play'],
  'tap play down',
  shot('press-light'),
  'tap up',
  'clock data',
  'clock +100',
  ['rise-100', 'layout bar'],
  shot('rise-100'),
  'clock settle',
  ['rise-end', 'layout bar'],
  shot('rise-end'),
  'prefer prefers-color-scheme dark',
  'clock settle',
  ['play-dark', 'layout play'],
  'tap play down',
  shot('press-dark'),
  'tap up',
  'clock data',
  'clock settle',
  'prefer prefers-color-scheme light',
  'clock settle',
  ...scrollDown,
  ['room-last', `layout ${lastPart}`],
  ['room-bar', 'layout bar'],
  shot('room'),
  'back',
  'clock settle',
  'tap gear',
  'clock data',
  'clock settle',
  ['exit-tree', 'tree'],
  shot('exit-end'),
  'tap settings-done',
  'clock data',
  'clock +100',
  ['again-100', 'layout bar'],
  'clock settle',
  ['again-end', 'layout bar'],
]);

const firstRun = () =>
  drive.run([...port, '--backend', backend, '--storage', store, '--reset-storage'], first.ops);
const firstReplies = await firstRun();
const read = (name: string) => first.reply(firstReplies, name);

const tapReply = JSON.stringify(read('haptic-tap') ?? null);
const stateReply = (read('haptic-state') ?? {}) as object;
console.log(
  `note ${host}: haptics visible to the agent: ${/haptic/iu.test(tapReply) || /haptic/iu.test(JSON.stringify(stateReply)) ? 'yes' : 'no'}; a haptic tap's reply ${tapReply}; the state's keys ${JSON.stringify(Object.keys(stateReply))}`,
);

drive.check('Sounds and haptics turned off is kept as "off"', read('kept') === 'off', read('kept'));

for (const scheme of ['light', 'dark'] as const) {
  const painted = await fillPixel(`press-${scheme}`, read(`play-${scheme}`));
  const want = channels(theme[scheme].pressed);
  drive.check(
    `held down, Play paints the brand's ${scheme} pressed fill`,
    painted.length === 3 && distance(painted, want) <= 2,
    { painted, want },
  );
}

const rising = frameOf(read('rise-100')).frame;
const rested = frameOf(read('rise-end')).frame;
if (host === 'web')
  drive.check(
    'at 100 ms the bar is still rising: below its rest by less than its height',
    rising !== undefined &&
      rested !== undefined &&
      rising.y - rested.y > 0.5 &&
      rising.y - rested.y < rested.h,
    { rising, rested },
  );
drive.check(
  'settled, the bar rests at the screen’s foot',
  rested !== undefined && Math.abs(rested.y + rested.h - frameOf(read('rise-end')).height) <= 1,
  { rested, height: frameOf(read('rise-end')).height },
);

const last = frameOf(read('room-last')).frame;
const bar = frameOf(read('room-bar')).frame;
drive.check(
  `scrolled to the end, the hymn's last part (${lastPart}) lies above the bar`,
  last !== undefined && bar !== undefined && last.y + last.h <= bar.y + 0.5,
  { last, bar },
);

const exitTree = JSON.stringify(read('exit-tree') ?? null);
drive.check(
  'Settings open, the bar is gone once the clock settles',
  exitTree.includes('"settings"') && !exitTree.includes('"bar"'),
  exitTree.slice(0, 400),
);
const again = frameOf(read('again-100')).frame;
const againEnd = frameOf(read('again-end')).frame;
if (host === 'web')
  drive.check(
    'Settings closed, the bar rises again',
    again !== undefined &&
      againEnd !== undefined &&
      again.y - againEnd.y > 0.5 &&
      again.y - againEnd.y < againEnd.h,
    { again, againEnd },
  );
else drive.check('Settings closed, the bar is back', againEnd !== undefined, { againEnd });

const kept = await drive.run(
  [...port, '--backend', backend, '--storage', store, '--keep-storage'],
  ['clock data', 'state settingsFeelKept', 'state settingsFeel'],
);
drive.check(
  'a relaunch on the kept store: Sounds and haptics stays off',
  kept[1] === 'off' && kept[2] === false,
  kept.slice(1),
);

const still = named([
  'clock data',
  'prefer prefers-color-scheme light',
  'prefer prefers-reduced-motion reduce',
  'clock settle',
  ['still', 'state motionStill'],
  ...feelOff,
  'tap hymn-1',
  'clock settle',
  'clock data',
  'tap play',
  'clock data',
  'clock +100',
  ['bar-100', 'layout bar'],
  ['words-100', 'layout bar-hymn'],
  shot('still-100'),
  'clock settle',
  ['bar-end', 'layout bar'],
  ['words-end', 'layout bar-hymn'],
  shot('still-end'),
]);
const stillReplies = await drive.run(
  [...port, '--backend', backend, '--storage', `${store}-still`, '--reset-storage'],
  still.ops,
);
const stillRead = (name: string) => still.reply(stillReplies, name);
drive.check('Reduce Motion reads as motionStill', stillRead('still') === true, stillRead('still'));
const stillAt = frameOf(stillRead('bar-100')).frame;
const stillEnd = frameOf(stillRead('bar-end')).frame;
drive.check(
  'under Reduce Motion the bar does not move: at 100 ms it rests',
  stillAt !== undefined && stillEnd !== undefined && Math.abs(stillAt.y - stillEnd.y) <= 0.5,
  { stillAt, stillEnd },
);
if (host === 'web') {
  const ink = channels(theme.light.ink);
  const ground = channels(theme.light.ground);
  const fading = await corePixel('still-100', stillRead('words-100'), 'light');
  const whole = await corePixel('still-end', stillRead('words-end'), 'light');
  drive.check(
    'under Reduce Motion the bar fades in: at 100 ms its words are drawn lighter than once settled, and not gone',
    fading.length === 3 &&
      whole.length === 3 &&
      distance(fading, ground) < distance(whole, ground) - 2 &&
      distance(fading, ground) > 2,
    { fading, whole, ink, ground },
  );
}

if (host === 'ios') {
  const film = (name: string) => `screenshot ${join(shots, `ios-${name}.png`)} over 600 every 50`;
  await drive.run(
    ['--timing', 'platform', '--backend', backend, '--storage', `${store}-film`, '--reset-storage'],
    [
      ...feelOff,
      'tap hymn-1',
      'clock settle',
      'tap play',
      film('rise'),
      'back',
      'clock settle',
      'tap gear',
      film('sink'),
      'tap settings-done',
      'prefer prefers-color-scheme dark',
      'clock settle',
      'tap gear',
      'clock settle',
      'tap settings-done',
      film('rise-dark'),
    ],
  );
}

process.exit(drive.finish());
