/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noAsyncFunction, effect/noNullish, effect/noTernary, effect/noAs, effect/noUnknownParameters, effect/noNewPromise, eslint/no-await-in-loop, node/no-process-env -- a host script that drives the built app through `bun run exact agent` (the kit's drive, one process group per run), reads the colours its layout replies and screenshots show and prints what it found; its shots folder is named by SHOTS. */

/**
 * Settings' live colour checks (spec B2, B3), which a `.test.contract`
 * cannot hold at Exact's pin: an authored test reads text, state and the
 * tree, never a colour. Here the agent's `layout` names the colour each
 * text is drawn in, and a screenshot's pixel just in from the trailing
 * edge of the screen, or of the sheet's own frame (`groundPoints`), the
 * ground painted there, on the host named
 * (`bun tools/drive-settings.ts web|ios`):
 *
 * - at launch, light and dark, the list's ground, a section's header, a
 *   hymn's row, and a hymn's page (its ground, title and topic) are the
 *   brand's roles;
 * - Dark chosen with the system light draws the list under the sheet dark
 *   at once; a relaunch on the kept store paints its first frame dark and
 *   the sheet shows Dark chosen; System then follows the system.
 *
 * - at the largest text, with chords on, each Chord style and Chord
 *   placement row is reached by scrolling and taken; the platform says
 *   Advanced and As the file plays checked (`tree --ax`: the web's
 *   `checked`, iOS's `selected`) and every other chord row not; Done takes
 *   a tap over 44 × 44 and its box does not meet the title's text, light
 *   and dark; a relaunch on the kept store keeps both choices.
 *
 * A section's header is the brand's muted role on both hosts. The
 * brand's colours are the current hymnal's theme (`app.forma` is held to
 * it by `src/look/brand.test.ts`). The list, a hymn and the sheet are kept
 * in SHOTS, light and dark. Exits 1 on any failed check.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';

import { bunProcesses, makeDrive } from '@manna/exact-kit/drive';
import { theme } from '@manna/hymnal-app/theme';

import { appFile, brandOf } from '../src/look/design.testing.ts';
import { boxOf, groundPoints, SCREEN, type Box } from '../src/look/ground-point.ts';
import { pixelAt } from './pixel.ts';
import { checkoutPort } from './recordings.ts';

const host = process.argv[2] ?? 'web';
const app = join(import.meta.dir, '..');
const shots = process.env.SHOTS ?? join(app, '.exact/shots/settings');
const shotFile = (name: string) => join(shots, `${name}-${host}.png`);
const shot = (name: string) => `screenshot ${shotFile(name)}`;
/** The agent's server is the recordings' fixture on this checkout's own port (`--backend`), as the find drive has it, so another checkout's run on 4797 never refuses this one. */
const backend = `http://127.0.0.1:${checkoutPort()}`;
/**
 * The machine as the kit's drive sees it, but that it signals only a run's
 * own process group when the run overruns (a negative pid), never a single
 * pid: the touch runner a run leaves on the shared simulator is the
 * orchestrator's to stop, not this drive's.
 */
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
  list: () => [],
  signal: (pid: number, signal: 'SIGTERM') => {
    if (pid < -1) process.kill(pid, signal);
  },
  sleep: (ms: number) =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, ms).unref();
    }),
};
const drive = makeDrive({ name: 'drive-settings', host, appDir: app, processes });

type Scheme = 'light' | 'dark';
type Role = keyof (typeof theme)['light'];

/** A section header's role on every host: the muted one, as UIKit's plain list draws it and the list names it (`src/list/headers.test.ts`). */
const HEADER: Role = 'muted';

/** A colour as its red, green and blue, 0 to 255, from `rgb(…)`, `rgba(…)` or `#rrggbb`; `[]` when it is none of them. */
const channels = (colour: string): ReadonlyArray<number> => {
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/iu.exec(colour);
  if (hex) return hex.slice(1, 4).map((pair) => Number.parseInt(pair, 16));
  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/u.exec(colour);
  if (rgb) return rgb.slice(1, 4).map((part) => Math.round(Number(part)));
  return [];
};

type Style = Record<string, { value?: string } | undefined>;

/** A layout reply's node style, or none. */
const styleOf = (reply: unknown): Style =>
  (reply as { node?: { style?: Style } } | undefined)?.node?.style ?? {};

/** The scheme a layout reply's node is drawn in. */
const schemeOf = (reply: unknown) => styleOf(reply).color_scheme?.value ?? '';

const brand = brandOf(appFile('app.forma'));

/** A role a native host names (`CanvasText`), as the brand sets it in `scheme`; the name itself where the brand does not. */
const named = (name: string, scheme: string) => {
  const pair = brand.colours.get(brand.names.get(name) ?? name);
  if (!pair) return name;
  return scheme === 'dark' ? pair.dark : pair.light;
};

/**
 * The colour a layout reply names for `property` (`text_color`): the web's
 * computed `rgb(…)`, or a native host's `light-dark(…)` or role read in the
 * node's scheme; "" where it names none.
 */
const colourOf = (reply: unknown, property: string): string => {
  const value = styleOf(reply)[property]?.value ?? '';
  const pair = /^light-dark\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)$/u.exec(value);
  if (!pair) return named(value, schemeOf(reply));
  return (schemeOf(reply) === 'dark' ? pair[2] : pair[1]) ?? '';
};

/** Whether `colour` is the brand's `role` in `scheme`, to the channel. */
const isRole = (colour: string, scheme: Scheme, role: Role) => {
  const got = channels(colour);
  const want = channels(theme[scheme][role]);
  return got.length === 3 && got.every((value, at) => Math.abs(value - (want[at] ?? -9)) <= 1);
};

const expectDrawn = (name: string, reply: unknown, scheme: Scheme, role: Role) => {
  const colour = colourOf(reply, 'text_color');
  drive.check(
    `${name} is drawn in the brand's ${scheme} ${role}`,
    isRole(colour, scheme, role),
    colour,
  );
};

/** The box a layout reply's node fills, as shares of the screen; none when the reply names no frame. */
const boxOfReply = (reply: unknown): Box | undefined => {
  const shown = reply as
    | { viewport?: { w: number; h: number }; node?: { space?: { viewport?: Box } } }
    | undefined;
  const [frame, screen] = [shown?.node?.space?.viewport, shown?.viewport];
  if (frame === undefined || screen === undefined || screen.w === 0 || screen.h === 0)
    return undefined;
  return boxOf(frame, screen.w, screen.h);
};

/**
 * Checks the colour painted at one of the ground points of `box` (the
 * whole screen, or the sheet's own frame) in the shot `name` is the
 * brand's `role`.
 */
const expectPainted = async (
  check: string,
  name: string,
  scheme: Scheme,
  role: Role,
  box: Box | undefined = SCREEN,
) => {
  const colours = await Promise.all(
    (box === undefined ? [] : groundPoints(box)).map(async (at) => {
      const painted = await pixelAt(shotFile(name), at).catch(() => []);
      return painted.length === 3 ? `rgb(${painted.join(', ')})` : '';
    }),
  );
  drive.check(
    `${check} is painted the brand's ${scheme} ${role}`,
    colours.some((colour) => isRole(colour, scheme, role)),
    box === SCREEN ? colours : { colours, box: box ?? 'no frame in the layout reply' },
  );
};

const looks = (scheme: Scheme) => [
  `prefer prefers-color-scheme ${scheme}`,
  'clock settle',
  'layout section-adoration-and-praise',
  'layout hymn-1',
  shot(`list-${scheme}`),
];

const launched = await drive.run(
  ['--backend', backend, '--storage', 'settings', '--reset-storage'],
  [
    'clock data',
    ...looks('light'),
    ...looks('dark'),
    'tap hymn-1',
    'clock settle',
    'clock data',
    'layout hymn-topic',
    'layout hymn-title',
    shot('hymn-dark'),
    'prefer prefers-color-scheme light',
    'clock settle',
    'layout hymn-topic',
    'layout hymn-title',
    shot('hymn-light'),
    'back',
    'clock settle',
    'tap gear',
    'clock settle',
    'clock data',
    'layout settings',
    shot('sheet-light'),
    'tap appearance-dark',
    'clock settle',
    'clock data',
    'layout hymn-list',
    shot('sheet-dark'),
    'tap settings-done',
    'clock settle',
    shot('dark-at-once'),
  ],
);

for (const [scheme, base] of [
  ['light', 1],
  ['dark', 6],
] as const) {
  await expectPainted(`at launch the list's ground`, `list-${scheme}`, scheme, 'ground');
  expectDrawn(`a section's header`, launched[base + 2], scheme, HEADER);
  expectDrawn(`a hymn's row`, launched[base + 3], scheme, 'ink');
}
expectDrawn(`a hymn's topic`, launched[14], 'dark', 'muted');
expectDrawn(`a hymn's title`, launched[15], 'dark', 'ink');
expectDrawn(`a hymn's topic`, launched[19], 'light', 'muted');
expectDrawn(`a hymn's title`, launched[20], 'light', 'ink');
await expectPainted(`a hymn's page ground`, 'hymn-dark', 'dark', 'ground');
await expectPainted(`a hymn's page ground`, 'hymn-light', 'light', 'ground');
const sheet = boxOfReply(launched[27]);
await expectPainted(`the sheet's ground`, 'sheet-light', 'light', 'ground', sheet);
const under = launched[32];
drive.check(
  `Dark at once: the list under the sheet is drawn dark (the web's ground, a native host's scheme)`,
  isRole(colourOf(under, 'background_color'), 'dark', 'ground') || schemeOf(under) === 'dark',
  [colourOf(under, 'background_color'), schemeOf(under)],
);
await expectPainted(`Dark at once: the sheet`, 'sheet-dark', 'dark', 'ground', sheet);
await expectPainted(`Dark at once: the list`, 'dark-at-once', 'dark', 'ground');

const again = await drive.run(
  ['--backend', backend, '--storage', 'settings', '--keep-storage'],
  [
    'prefer prefers-color-scheme light',
    shot('first-frame'),
    'clock data',
    shot('kept'),
    'tap gear',
    'clock settle',
    'clock data',
    'state settingsLooks',
    'tap appearance-system',
    'clock settle',
    'clock data',
    'tap settings-done',
    'clock settle',
    'prefer prefers-color-scheme dark',
    'clock settle',
    shot('system-dark'),
    'prefer prefers-color-scheme light',
    'clock settle',
    shot('system-light'),
  ],
);

await expectPainted(`kept: the first frame`, 'first-frame', 'dark', 'ground');
await expectPainted(`kept: the list`, 'kept', 'dark', 'ground');
const rows = again[7] as ReadonlyArray<{ value?: string; chosen?: boolean }> | undefined;
drive.check(
  'kept: the sheet shows Dark chosen',
  rows?.find((row) => row.chosen === true)?.value === 'dark',
  rows,
);
await expectPainted(`System follows a dark system`, 'system-dark', 'dark', 'ground');
await expectPainted(`System follows a light system`, 'system-light', 'light', 'ground');

/** iOS's body size at the largest accessibility size, in points: the root font size verify's largest pass takes on the web. */
const LARGEST = 53;
/** The platform's least tap target, in points (iOS's 44 × 44). */
const TARGET = 44;
/** The chord groups' rows, tapped in this order, so the run ends on Advanced and As the file plays. */
const CHORD_ROWS = [
  'chord-style-simple',
  'chord-style-advanced',
  'chord-placement-beat',
  'chord-placement-simpler',
  'chord-placement-file',
] as const;
const CHOSEN = ['chord-style-advanced', 'chord-placement-file'];

interface AxElement {
  readonly testId?: string;
  readonly states?: { readonly checked?: boolean; readonly selected?: boolean };
}

/** The accessibility elements a `tree --ax` reply holds. */
const elementsOf = (reply: unknown): ReadonlyArray<AxElement> =>
  (reply as { ax?: { elements?: ReadonlyArray<AxElement> } } | undefined)?.ax?.elements ?? [];

/** Each chord row's checked state as the platform says it (the web's `checked`, iOS's `selected`), by its id. */
const checkedOf = (reply: unknown) =>
  Object.fromEntries(
    CHORD_ROWS.map((id) => {
      const element = elementsOf(reply).find((each) => each.testId === id);
      return [id, element?.states?.checked === true || element?.states?.selected === true];
    }),
  );

const expectChosen = (when: string, reply: unknown) => {
  const checked = checkedOf(reply);
  drive.check(
    `${when}: Advanced and As the file plays are said checked, every other chord row not`,
    CHORD_ROWS.every((id) => checked[id] === CHOSEN.includes(id)),
    checked,
  );
};

/** A run's ops, each read back by the index `step` answers. */
const script = () => {
  const ops: string[] = [];
  const step = (...each: ReadonlyArray<string>) => {
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

/** The box a `layout` reply gives its node, in the page's pixels. */
const frameOf = (reply: unknown): Frame | undefined => {
  const seen = (
    reply as
      | { node?: { space?: { viewport?: Frame & { width?: number; height?: number } } } }
      | undefined
  )?.node?.space?.viewport;
  if (seen === undefined) return undefined;
  return { x: seen.x, y: seen.y, w: seen.w ?? seen.width ?? 0, h: seen.h ?? seen.height ?? 0 };
};

/** Whether `a` and `b` share no area. */
const unshared = (a: Frame, b: Frame) =>
  a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;

const choose = script();
choose.step('clock data', `prefer root-font-size ${LARGEST}`, 'clock settle');
choose.step('tap gear', 'clock settle', 'clock data');
choose.step('tap chords-toggle', 'clock settle', 'clock data');
const taps = CHORD_ROWS.map((id) => {
  const at = choose.step(`tap ${id}`);
  choose.step('clock settle', 'clock data');
  return at;
});
const axAt = choose.step('tree --ax');
const styleAt = choose.step('state settingsChordStyle');
const placementAt = choose.step('state settingsPlacement');
const doneAt = (scheme: Scheme) => {
  choose.step(`prefer prefers-color-scheme ${scheme}`, 'clock settle');
  const at = choose.step('layout settings-done');
  choose.step('layout settings-title');
  choose.step(shot(`chords-largest-${scheme}`));
  return at;
};
const doneFrames = [['light', doneAt('light')] as const, ['dark', doneAt('dark')] as const];

/** Whether the web store `name` holds `text` on disk: Chrome killed at Exact's deadline loses what it had not written (as `drive-player.ts` reads it). */
const onDisk = async (name: string, text: string) => {
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

const chordsStore = `settings-chords-${host}`;
const chordsRun = () =>
  drive.run(['--backend', backend, '--storage', chordsStore, '--reset-storage'], choose.ops);
let chosen = await chordsRun();
if (host === 'web' && chosen[placementAt] === 'file' && !(await onDisk(chordsStore, 'file'))) {
  console.log(
    `again ${host}: the browser quit before it wrote its store (Exact killed it at its deadline); the choices once more`,
  );
  chosen = await chordsRun();
}

CHORD_ROWS.forEach((id, k) => {
  const tapped = chosen[taps[k] ?? -1];
  drive.check(
    `at the largest text, with both chord groups showing, ${id} is reached by scrolling and taken`,
    tapped !== undefined,
    tapped,
  );
});
expectChosen('chosen at the largest text', chosen[axAt]);
drive.check(
  'the choices are kept as tapped',
  chosen[styleAt] === 'advanced' && chosen[placementAt] === 'file',
  [chosen[styleAt], chosen[placementAt]],
);
for (const [scheme, at] of doneFrames) {
  const [done, title] = [frameOf(chosen[at]), frameOf(chosen[at + 1])];
  drive.check(
    `at the largest text, ${scheme}, with both chord groups showing, Done takes a tap over ${TARGET} × ${TARGET}`,
    done !== undefined && done.w >= TARGET && done.h >= TARGET,
    done,
  );
  drive.check(
    `at the largest text, ${scheme}, Done's box does not meet the title's text`,
    done !== undefined && title !== undefined && unshared(done, title),
    { done, title },
  );
}

const kept = script();
kept.step('clock data', 'tap gear', 'clock settle', 'clock data');
const keptStyle = kept.step('state settingsChordStyle');
const keptPlacement = kept.step('state settingsPlacement');
const keptAx = kept.step('tree --ax');
const relaunched = await drive.run(
  ['--backend', backend, '--storage', chordsStore, '--keep-storage'],
  kept.ops,
);
drive.check(
  'a relaunch keeps Advanced and As the file plays',
  relaunched[keptStyle] === 'advanced' && relaunched[keptPlacement] === 'file',
  [relaunched[keptStyle], relaunched[keptPlacement]],
);
expectChosen('after a relaunch', relaunched[keptAx]);

process.exit(drive.finish());
