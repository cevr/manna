/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noAsyncFunction, effect/noNewError, effect/noNewPromise, effect/noNullish, effect/noTernary, effect/noThrowStatement, effect/noUnknownParameters, effect/noAs, effect/noRuntimeTypeof, effect/noTryCatch, eslint/no-await-in-loop, node/no-process-env -- Exact's app folder cannot import effect (docs/exact.md): a host script that starts the recordings' fixture and drives the built app through `bun run exact agent`, each in a process group of its own, waits on the fixture's first answer in turn, passes its environment to the agent with the fixture's origin, reads the agent's JSON replies and prints what it found; a group that has already ended cannot be signalled. */

/**
 * The player's live checks a `.test.contract` cannot hold (spec B): a
 * test's server runs for the whole test, so none can take it away and give
 * it back. Here the first run's fixture (`tools/recordings.ts`) is the
 * drive's own, in a process group of its own, which the agent uses as a
 * server it did not start; the drive stops it once the app is up and starts
 * it again when the bar offers Try again. The later runs, each on a store
 * that starts empty, have the agent start and stop the fixture itself, as
 * app.json's `commands.server`. On the host named
 * (`bun tools/drive-player.ts web|ios`):
 *
 * - the fixture down: Play fails, the bar says the recording needs a
 *   connection and offers Try again; the fixture up: Try again plays;
 * - a hymn with no recording (the fixture's 404) says so and offers no Play;
 * - a stanza choice is kept as it is made, and survives a relaunch with
 *   kept storage. On the web, a first run whose browser was killed before
 *   it wrote its store (`onDisk`) is run once more, and says so;
 * - a drag held in two moves shows the drag and sends no seek until it is
 *   let go; a place played across a span the stanza choice leaves out lands
 *   in the next stanza sung; ten seeks land where they were sent (their
 *   delay to the first tick, and the skip's, printed as `measure`);
 * - in dark, the page's Play, the player's toggle and a chosen chip read
 *   their label at 4.5:1 on their fill, from a screenshot's pixels;
 * - with Settings open, the dock is not in the accessibility tree.
 *
 * The fixture listens on this checkout's own port (`checkoutPort`), so
 * drives in two checkouts never share one. The build reads the fixture's
 * origin from `HYMNAL_RECORDINGS`, which this sets; the recordings are
 * digital silence. Exits 1 on any failed check.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';

import { claimAppPort } from '@manna/exact-kit/port';

import { pixelAt } from './pixel.ts';
import { QUIET_ANSWER, QUIET_CHECK, QUIET_PATH, quietOps } from './quiet.ts';
import { LONG_HYMN, MISSING_HYMN, checkoutPort } from './recordings.ts';

const host = process.argv[2] ?? 'web';
const app = join(import.meta.dir, '..');
const FIXTURE_PORT = checkoutPort();
const origin = `http://127.0.0.1:${FIXTURE_PORT}`;
const DRIVE_MS = 15 * 60 * 1000;
/** Chrome keeps a named store per port, so every web run here, each relaunch too, is on one port of the app's this drive holds to its end; claimed before `env`, which then names its turn. */
const port =
  host === 'web'
    ? ['--port', String((await claimAppPort(app, { label: 'drive-player web' })).port)]
    : [];
const env = { ...process.env, HYMNAL_RECORDINGS: origin };

type Child = ReturnType<typeof Bun.spawn>;
const groups = new Set<Child>();
const stop = (child: Child) => {
  if (!groups.delete(child)) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    groups.delete(child);
  }
};
process.on('exit', () => {
  for (const child of groups) stop(child);
});

/** The fixture, in a process group of its own, once it answers. */
const fixture = async () => {
  const child = Bun.spawn(['bun', join(import.meta.dir, 'recordings.ts')], {
    cwd: app,
    env: { ...process.env, PORT: `${FIXTURE_PORT}` },
    stdout: 'ignore',
    stderr: 'inherit',
    detached: true,
  });
  groups.add(child);
  for (let tries = 0; tries < 50; tries++) {
    const up = await fetch(`${origin}/audio/warm-1/sdah/1.mp3`, { method: 'HEAD' })
      .then((answer) => answer.ok)
      .catch(() => false);
    if (up) return child;
    await Bun.sleep(100);
  }
  stop(child);
  throw new Error(`the fixture did not answer at ${origin}`);
};

const isReply = (line: string) =>
  line.startsWith('{') ||
  line.startsWith('[') ||
  line === 'null' ||
  line.startsWith('"') ||
  /^[-\d]|^true$|^false$/u.test(line);

/**
 * One agent run of `ops` at `path`; `onReply(index, reply)` hears each reply
 * as it comes, so a drive can act between two of the run's steps.
 */
const run = async (
  flags: ReadonlyArray<string>,
  path: string,
  ops: ReadonlyArray<string>,
  onReply: (index: number, reply: unknown) => Promise<'stop' | void> | 'stop' | void = () =>
    undefined,
) => {
  const child = Bun.spawn(
    ['bun', 'run', 'exact', 'agent', host, '--json', ...port, '--url', path, ...flags, ...ops],
    { cwd: app, env, stdout: 'pipe', stderr: 'pipe', detached: true },
  );
  groups.add(child);
  const timer = setTimeout(() => stop(child), DRIVE_MS);
  const replies: Array<unknown> = [];
  const decoder = new TextDecoder();
  let rest = '';
  const read = async () => {
    for await (const chunk of child.stdout as ReadableStream<Uint8Array>) {
      const lines = (rest + decoder.decode(chunk, { stream: true })).split('\n');
      rest = lines.pop() ?? '';
      for (const line of lines.filter(isReply)) {
        replies.push(JSON.parse(line));
        if ((await onReply(replies.length - 1, replies.at(-1))) === 'stop') stop(child);
      }
    }
    if (isReply(rest)) replies.push(JSON.parse(rest));
  };
  const [, err, code] = await Promise.all([
    read(),
    new Response(child.stderr as ReadableStream<Uint8Array>).text(),
    child.exited,
  ]);
  clearTimeout(timer);
  groups.delete(child);
  if (code !== 0 || replies.length < ops.length)
    throw new Error(
      `agent ${host} exited ${code} with ${replies.length} of ${ops.length} replies\n${err.slice(-2000)}`,
    );
  return replies.slice(-ops.length);
};

/**
 * A run that plays (`run`'s arguments): `ops` on a store whose Sounds and
 * haptics is off, stopped before its first op unless it reads off. A store
 * it is not yet off on (a new one, or a web store Chrome lost at its
 * deadline) is first turned quiet at Settings by the shared step
 * (`tools/quiet.ts`), up to three times; a kept store already quiet is not
 * touched, since the step turns the switch over.
 */
const quietRun = async (
  flags: ReadonlyArray<string>,
  path: string,
  ops: ReadonlyArray<string>,
  onReply: (index: number, reply: unknown) => Promise<void> | void = () => undefined,
) => {
  const kept = flags.map((flag) => (flag === '--reset-storage' ? '--keep-storage' : flag));
  let fresh = flags.includes('--reset-storage');
  let loudBefore = fresh;
  for (let tries = 0; tries < 3; tries++) {
    if (loudBefore) {
      const turned = await run(fresh ? flags : kept, QUIET_PATH, quietOps);
      fresh = false;
      if (replyTo(quietOps, turned, QUIET_CHECK) !== QUIET_ANSWER)
        throw new Error(`Settings did not turn Sounds and haptics off: ${JSON.stringify(turned)}`);
    }
    let loud = false;
    const replies = await run(kept, path, [QUIET_CHECK, ...ops], async (index, reply) => {
      if (index === 0 && reply !== QUIET_ANSWER) {
        loud = true;
        return 'stop';
      }
      if (index > 0) await onReply(index - 1, reply);
    }).catch((error: unknown) => {
      if (loud) return undefined;
      throw error;
    });
    if (replies !== undefined) return replies.slice(1);
    if (loudBefore)
      console.log(
        `again ${host}: the store lost Sounds and haptics off before Play; turned off once more`,
      );
    loudBefore = true;
  }
  throw new Error('Sounds and haptics did not stay off on the store: no Play was made');
};

let failed = 0;
const check = (name: string, ok: boolean, got: unknown) => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${host} ${name}${ok ? '' : `: ${JSON.stringify(got)}`}`);
};
const store = `player-${host}-${Date.now().toString(36)}`;
const shot = (name: string) => `screenshot .exact/shots/player-${host}-${name}.png`;

const down = [
  'clock data',
  'state player.origin',
  'tap play',
  'clock data',
  'clock +12000 real',
  'clock data',
  'clock settle',
  'state player.phase',
  'state player.bar.said',
  'state player.bar.toggle',
  shot('down'),
  'clock +4000 real',
  'tap bar-toggle',
  'clock data',
  'clock +4000 real',
  'clock data',
  'clock settle',
  'state player.phase',
  'state player.at',
  'state player.bar.toggle',
  shot('retried'),
];
/** The reply to the `nth` (from 0) `op` of `ops`. */
const replyTo = (
  ops: ReadonlyArray<string>,
  replies: ReadonlyArray<unknown>,
  op: string,
  nth = 0,
) => replies[ops.flatMap((each, index) => (each === op ? [index] : []))[nth] ?? -1];

let server: Child | undefined = await fixture();
const downReplies = await quietRun(
  ['--storage', `${store}-down`, '--keep-storage'],
  '/hymns/1',
  down,
  async (_, reply) => {
    if (reply === origin && server !== undefined) {
      stop(server);
      await server.exited;
      server = undefined;
    }
    if (reply === 'retry' && server === undefined) server = await fixture();
  },
);
if (server !== undefined) stop(server);
const seen = replyTo(down, downReplies, 'state player.origin');
const phase = replyTo(down, downReplies, 'state player.phase');
const said = replyTo(down, downReplies, 'state player.bar.said');
const toggle = replyTo(down, downReplies, 'state player.bar.toggle');
const again = replyTo(down, downReplies, 'state player.phase', 1);
const at = replyTo(down, downReplies, 'state player.at');
const offered = replyTo(down, downReplies, 'state player.bar.toggle', 1);
check('the build plays from the fixture', seen === origin, seen);
check(
  'the fixture down: the bar says the recording needs a connection, with Try again',
  phase === 'failed' && said === 'The recording needs a connection.' && toggle === 'retry',
  { phase, said, toggle },
);
check(
  'the fixture up: Try again plays',
  (again === 'playing' || again === 'loading') && typeof at === 'number' && offered === 'pause',
  { again, at, offered },
);

const missingOps = [
  'clock data',
  'tap play',
  'clock data',
  'clock +4000 real',
  'clock data',
  'clock settle',
  'state player.phase',
  'state player.said',
  'state player.toggle',
  'tree',
  shot('missing'),
];
const missing = await quietRun(
  ['--storage', `${store}-missing`, '--reset-storage'],
  `/hymns/${MISSING_HYMN}`,
  missingOps,
);
const missingPhase = replyTo(missingOps, missing, 'state player.phase');
const missingSaid = replyTo(missingOps, missing, 'state player.said');
const missingToggle = replyTo(missingOps, missing, 'state player.toggle');
const tree = replyTo(missingOps, missing, 'tree');
const text = JSON.stringify(tree);
check(
  'a hymn with no recording says so and offers no Play',
  missingPhase === 'failed' &&
    missingSaid === 'This hymn has no recording.' &&
    missingToggle === '' &&
    !text.includes('"play"') &&
    !text.includes('"bar-toggle"') &&
    !text.includes('"retry"'),
  { missingPhase, missingSaid, missingToggle },
);

const CHOICE = `${LONG_HYMN}:1.3`;
const chooseOps = [
  'clock data',
  'tap play',
  'clock data',
  'clock +3000 real',
  'clock data',
  'tap bar-title',
  'clock data',
  'clock settle',
  'tap stanza-2',
  'clock data',
  'tap stanza-4',
  'clock data',
  'clock settle',
  'state playerKept',
  shot('stanzas'),
];

/**
 * Whether the web store's Chrome profile holds `text` on disk once its run
 * has ended. Chrome writes a page's `localStorage` to its profile only as it
 * quits; when it has not quit cleanly within Exact's deadline, Exact kills
 * it and the write is lost (`exact/scripts/agent-web.mjs` `close`), which
 * this tells apart from the app not keeping the choice. True on iOS, whose
 * store is the simulator's.
 */
const onDisk = async (name: string, text: string) => {
  if (host !== 'web') return true;
  const cache =
    process.platform === 'darwin'
      ? join(homedir(), 'Library/Caches')
      : (process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'));
  const needle = Buffer.from(text);
  const glob = new Bun.Glob(`*/agent-web-*/${name}/Default/Local Storage/leveldb/*`);
  for await (const path of glob.scan({ cwd: join(cache, 'exact'), absolute: true }))
    if (Buffer.from(await Bun.file(path).arrayBuffer()).includes(needle)) return true;
  return false;
};

let chose = await quietRun(
  ['--storage', store, '--reset-storage'],
  `/hymns/${LONG_HYMN}`,
  chooseOps,
);
if (
  replyTo(chooseOps, chose, 'state playerKept') === CHOICE &&
  !(await onDisk(store, JSON.stringify(CHOICE)))
) {
  console.log(
    `again ${host}: the browser quit before it wrote its store (Exact killed it at its deadline); the choice once more`,
  );
  chose = await quietRun(['--storage', store, '--reset-storage'], `/hymns/${LONG_HYMN}`, chooseOps);
}
const chosen = replyTo(chooseOps, chose, 'state playerKept');
check('a stanza choice is kept as it is made', chosen === CHOICE, chosen);
const keptOps = [
  'clock data',
  'state playerKept',
  'tap play',
  'clock data',
  'clock +3000 real',
  'clock data',
  'tap bar-title',
  'clock data',
  'clock settle',
  'state player.chips',
  'state player.total',
  shot('relaunched'),
];
const kept = await quietRun(['--storage', store, '--keep-storage'], `/hymns/${LONG_HYMN}`, keptOps);
const keptChoice = replyTo(keptOps, kept, 'state playerKept');
const chips = replyTo(keptOps, kept, 'state player.chips');
const total = replyTo(keptOps, kept, 'state player.total');
check(
  'a stanza choice survives a relaunch with kept storage',
  keptChoice === CHOICE &&
    JSON.stringify((chips as ReadonlyArray<{ chosen: boolean }>).map((chip) => chip.chosen)) ===
      JSON.stringify([true, false, true, false]),
  { keptChoice, chips, total },
);

/** An element of a `tree --ax` reply: its test id and its frame in points. */
interface Ax {
  readonly testId?: string;
  readonly value?: string;
  readonly frame: {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
  };
}
const axOf = (reply: unknown): ReadonlyArray<Ax> =>
  ((reply as { ax?: { elements?: ReadonlyArray<Ax> } }).ax?.elements ?? []) as ReadonlyArray<Ax>;

/** A colour's relative luminance (WCAG 2), its channels 0 to 255. */
const luminance = (rgb: ReadonlyArray<number>) => {
  const [r, g, b] = rgb.map((channel) => {
    const share = channel / 255;
    return share <= 0.03928 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
};
const contrast = (one: ReadonlyArray<number>, other: ReadonlyArray<number>) => {
  const [high, low] = [luminance(one), luminance(other)].toSorted((a, b) => b - a);
  return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
};

/**
 * The contrast of a button's label against its fill, from a screenshot: a
 * grid of pixels over the button's frame gives the fill, the colour most of
 * them are; a finer grid over its middle finds the label, the pixel that
 * stands furthest from the fill.
 */
const labelContrast = async (path: string, all: ReadonlyArray<Ax>, id: string) => {
  const screen = all[0]?.frame;
  const box = all.find((each) => each.testId === id)?.frame;
  if (screen === undefined || box === undefined) return -1;
  const pixels: Array<ReadonlyArray<number>> = [];
  for (let row = 1; row < 8; row++)
    for (let column = 1; column < 16; column++)
      pixels.push(
        await pixelAt(path, {
          x: (box.x + (box.w * column) / 16) / screen.w,
          y: (box.y + (box.h * row) / 8) / screen.h,
        }),
      );
  const counts = new Map<string, number>();
  for (const pixel of pixels) counts.set(pixel.join(), (counts.get(pixel.join()) ?? 0) + 1);
  const fill = ([...counts].toSorted((a, b) => b[1] - a[1])[0]?.[0] ?? '0,0,0')
    .split(',')
    .map(Number);
  for (let row = 0; row < 9; row++)
    for (let column = 0; column < 13; column++)
      pixels.push(
        await pixelAt(path, {
          x: (box.x + box.w * (0.3 + (0.4 * column) / 12)) / screen.w,
          y: (box.y + box.h * (0.3 + (0.4 * row) / 8)) / screen.h,
        }),
      );
  return Math.max(...pixels.map((pixel) => contrast(pixel, fill)));
};

const darkShot = (name: string) => `.exact/shots/player-${host}-${name}.png`;
const POSITIONS = [10, 30, 50, 60, 90, 100, 110, 120, 130, 140];
const seekOps = [
  'prefer prefers-color-scheme dark',
  'clock data',
  'clock settle',
  'tree --ax',
  `screenshot ${darkShot('dark-page')}`,
  'tap play',
  'clock data',
  'clock +3000 real',
  'clock data',
  'clock settle',
  'tree --ax',
  `screenshot ${darkShot('dark-bar')}`,
  'tap bar-title',
  'clock data',
  'clock settle',
  'tap stanza-2',
  'clock data',
  'clock settle',
  'tree --ax',
  `screenshot ${darkShot('dark-player')}`,
  'prefer prefers-color-scheme light',
  'clock settle',
  'tree --ax',
  `screenshot ${darkShot('light-player')}`,
  'state player.seek',
  'tap position down',
  'tap move by 40 0',
  'tap hold 50',
  'state player',
  'tap move by 40 0',
  'tap hold 50',
  'state player',
  'tap up',
  'clock data',
  'state player.seek',
  'type position 71',
  'clock data',
  'clock +5000 real',
  'clock data',
  'state player.place',
  'state player.at',
  'state playerSkipGap',
  'state playerSkipFrom',
  'state playerSkipLanded',
  ...POSITIONS.flatMap((to) => [
    `type position ${to}`,
    'clock data',
    'clock +1500 real',
    'clock data',
    'state player.at',
    'state playerGap',
  ]),
  'back',
  'clock data',
  'clock settle',
  'back',
  'clock settle',
  'tap gear',
  'clock data',
  'clock settle',
  'tree --ax',
  shot('settings-open'),
];
const seekReplies = await quietRun(
  ['--storage', `${store}-seek`, '--reset-storage'],
  `/hymns/${LONG_HYMN}`,
  seekOps,
);

type Viewed = { readonly seek: number; readonly at: number; readonly dragging: boolean };
const during = [0, 1].map(
  (nth) => replyTo(seekOps, seekReplies, 'state player', nth) as Viewed | undefined,
);
const before = replyTo(seekOps, seekReplies, 'state player.seek');
const after = replyTo(seekOps, seekReplies, 'state player.seek', 1);
const held =
  during.every((view) => view?.dragging === true && view.seek === before) &&
  (during[1]?.at ?? 0) > (during[0]?.at ?? 0) &&
  after === (before as number) + 1;
if (host === 'ios' && during.every((view) => view?.dragging === false) && after === before)
  console.log(
    'note ios: the driver’s contact phases (tap down, move, hold, up) did not reach the UISlider (no drag, no seek); a held drag on iOS needs --touch platform. The release rule is held by the model test and by seek.test.contract’s `type position`.',
  );
else
  check(
    'a drag held in two moves shows the drag and sends nothing until it is let go, then one seek',
    held,
    { before, after, during: during.map((view) => view && { ...view, chips: undefined }) },
  );
const place = replyTo(seekOps, seekReplies, 'state player.place') as number;
const sung = replyTo(seekOps, seekReplies, 'state player.at') as number;
const skipGap = {
  ms: replyTo(seekOps, seekReplies, 'state playerSkipGap'),
  from: replyTo(seekOps, seekReplies, 'state playerSkipFrom'),
  landed: replyTo(seekOps, seekReplies, 'state playerSkipLanded'),
};
check(
  'chosen 1, 3 and 4, a place played across stanza 2’s span lands in stanza 3, elapsed going on',
  place >= 124.5 && place <= 130 && sung >= 73 && sung <= 79,
  { place, sung, skipGap },
);
const landings = POSITIONS.map((to, index) => ({
  to,
  at: replyTo(seekOps, seekReplies, 'state player.at', index + 1),
  gap: replyTo(seekOps, seekReplies, 'state playerGap', index),
}));
check(
  'ten seeks each land where they were sent and play on',
  landings.every(({ to, at }) => typeof at === 'number' && at >= to && at <= to + 3),
  landings,
);
console.log(`measure ${host} skip ${JSON.stringify(skipGap)}; seeks ${JSON.stringify(landings)}`);

const pageAx = axOf(replyTo(seekOps, seekReplies, 'tree --ax'));
const barAx = axOf(replyTo(seekOps, seekReplies, 'tree --ax', 1));
const playerAx = axOf(replyTo(seekOps, seekReplies, 'tree --ax', 2));
const lightAx = axOf(replyTo(seekOps, seekReplies, 'tree --ax', 3));
const settingsAx = axOf(replyTo(seekOps, seekReplies, 'tree --ax', 4));
const ratios = {
  play: await labelContrast(darkShot('dark-page'), pageAx, 'play'),
  toggle: await labelContrast(darkShot('dark-player'), playerAx, 'toggle'),
  chip: await labelContrast(darkShot('dark-player'), playerAx, 'stanza-1'),
};
check(
  'in dark, Play, the toggle and a chosen chip read their label at 4.5:1 on their fill',
  Object.values(ratios).every((ratio) => ratio >= 4.5),
  ratios,
);
const tinted = {
  darkBarToggle: await labelContrast(darkShot('dark-bar'), barAx, 'bar-toggle'),
  darkChip: await labelContrast(darkShot('dark-player'), playerAx, 'stanza-2'),
  darkPlace: await labelContrast(darkShot('dark-player'), playerAx, 'stanza-place-1'),
  lightToggle: await labelContrast(darkShot('light-player'), lightAx, 'toggle'),
  lightFilledChip: await labelContrast(darkShot('light-player'), lightAx, 'stanza-1'),
  lightChip: await labelContrast(darkShot('light-player'), lightAx, 'stanza-2'),
  lightPlace: await labelContrast(darkShot('light-player'), lightAx, 'stanza-place-1'),
};
console.log(`measure ${host} label contrast ${JSON.stringify({ ...ratios, ...tinted })}`);
check(
  'in light and dark, the tinted buttons (the bar’s toggle, a chip not chosen, a stanza’s place) read their label at 4.5:1',
  Object.values(tinted).every((ratio) => ratio >= 4.5),
  tinted,
);
check(
  'with Settings open, the dock is not in the accessibility tree',
  settingsAx.some((each) => each.testId === 'settings' || each.testId === 'about-row') &&
    !settingsAx.some((each) => each.testId?.startsWith('bar') === true),
  settingsAx.map((each) => each.testId).filter(Boolean),
);

console.log(`${failed === 0 ? 'ok' : 'FAILED'}: drive-player ${host}, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
