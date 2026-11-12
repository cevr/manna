/**
 * `bun scripts/readout.ts <read|press|colours> --state <dir> …`: what a
 * verifier reads on the verify-hymnal simulator as numbers, never as words.
 *
 * - `read [--id <testID>]… [--label <name>]…`: one JSON line of
 *   `readout/frames.ts`'s readout of a raw snapshot: the shown nodes of each
 *   testID (a trailing `*` reads every id it begins), each named node of the
 *   app's chrome, the silent switches, the page's hymn number, the bar's
 *   play button and `Position`.
 * - `press <id=…|label=…> [--settle 700] [--load 12] [--id …] [--label …]`:
 *   a paced press. It waits (at most 10 minutes) for the 1-minute load to be
 *   at most `--load`, presses the shown node by its ref (a Switch, else a
 *   Button, else the first), waits `--settle` ms, then prints the press and
 *   the readout.
 * - `colours --port <port> [--id <testID>]…`: through Argent's
 *   `debugger-evaluate` on the app's dev server, each asked testID's own
 *   background and text colours, and how many texts inside it draw each
 *   colour. It reads styles alone, never a text's children.
 *
 * Run from `apps/hymnal` while a `sim boot` session drives `verify-hymnal`;
 * `--state` is that session's state folder, whose `home` agent-device runs
 * in. It reads, and `press` presses; it never plays a hymn by itself, so a
 * press of Play follows the silent rule like any other.
 */
import { loadavg } from 'node:os';

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Console, Duration, Effect, Option, Schema } from 'effect';
import { Command, Flag } from 'effect/cli';

import { nodesOf } from '@manna/sim/screen';
import { succeed } from '@manna/sim/tools';
import { app } from './sim-app.ts';
import { calm, type Ask, pressTarget, readout, SCREEN_WIDTH } from './readout/frames.ts';

const DRIVER_LIMIT = Duration.seconds(60);
const UDID_LIMIT = Duration.seconds(30);

const state = Flag.String('state').pipe(
  Flag.withDescription("the drive's state folder (`sim --state`); agent-device runs in its home"),
);
const ids = Flag.String('id').pipe(Flag.atLeast(0), Flag.withDescription('a testID to read'));
const labels = Flag.String('label').pipe(
  Flag.atLeast(0),
  Flag.withDescription("a name of the app's chrome to read (never a hymn's words)"),
);

const device = (home: string, args: ReadonlyArray<string>) =>
  succeed('agent-device', [...args, '--session', app.driverSession], DRIVER_LIMIT, {
    env: { HOME: `${home}/home` },
  });

const snapshot = (home: string) =>
  Effect.flatMap(device(home, ['snapshot', '--json', '--raw']), nodesOf);

const encode = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

const ask = (asked: { ids: ReadonlyArray<string>; labels: ReadonlyArray<string> }): Ask => ({
  ids: asked.ids,
  labels: asked.labels,
  width: SCREEN_WIDTH,
});

const read = Command.make('read', { state, ids, labels }, (flags) =>
  Effect.gen(function* () {
    const nodes = yield* snapshot(flags.state);
    yield* Console.log(encode(readout(nodes, ask(flags))));
  }),
);

/** No shown node answers the press's target, or no simulator the name: nothing was done. */
class NotFound extends Schema.TaggedError<NotFound>()('NotFound', { target: Schema.String }) {}

const press = Command.make(
  'press',
  {
    state,
    ids,
    labels,
    target: Flag.String('target').pipe(Flag.withDescription('`id=<testID>` or `label=<name>`')),
    settle: Flag.Int('settle').pipe(Flag.withDefault(700)),
    load: Flag.Finite('load').pipe(Flag.withDefault(12)),
  },
  (flags) =>
    Effect.gen(function* () {
      const load = yield* calm(
        Effect.sync(() => loadavg()[0] ?? 0),
        flags.load,
        Duration.seconds(10),
        Duration.minutes(10),
      );
      const before = yield* snapshot(flags.state);
      const node = pressTarget(before, flags.target, SCREEN_WIDTH);
      if (Option.isNone(node)) return yield* NotFound.make({ target: flags.target });
      yield* device(flags.state, ['press', `@${node.value.ref ?? ''}`]);
      yield* Effect.sleep(Duration.millis(flags.settle));
      const after = yield* snapshot(flags.state);
      yield* Console.log(
        encode({
          pressed: flags.target,
          load,
          settle: flags.settle,
          ...readout(after, ask(flags)),
        }),
      );
    }),
);

/**
 * The expression `colours` evaluates in the app: for each asked testID, the
 * first fiber with it, its own style's background and colour, and the count
 * of each colour its text fibers draw. Styles only: no child is read.
 */
const colourExpression = (asked: ReadonlyArray<string>) => `(() => {
  const hook = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (!hook) return { error: 'no hook' };
  const ids = ${encode(asked)};
  const flat = (s) => typeof s === 'function' ? flat(s({ pressed: false })) : Array.isArray(s) ? Object.assign({}, ...s.map(flat)) : s && typeof s === 'object' ? s : {};
  const key = (c) => c === undefined ? 'none' : typeof c === 'object' ? JSON.stringify(c) : String(c);
  const out = {};
  const inks = (f, counts) => { for (; f; f = f.sibling) { if (typeof f.type === 'string' && /Text/.test(f.type)) { const c = key(flat(f.memoizedProps && f.memoizedProps.style).color); counts[c] = (counts[c] || 0) + 1; } inks(f.child, counts); } return counts; };
  const walk = (f) => { for (; f; f = f.sibling) { const p = f.memoizedProps; if (p && ids.includes(p.testID) && !out[p.testID]) { const s = flat(p.style); out[p.testID] = { background: key(s.backgroundColor), color: key(s.color), width: s.width ?? null, height: s.height ?? null, inks: inks(f.child, {}) }; } walk(f.child); } };
  for (const id of hook.renderers.keys()) for (const root of hook.getFiberRoots(id)) walk(root.current);
  return out;
})()`;

const Devices = Schema.Struct({
  devices: Schema.Record(
    Schema.String,
    Schema.Array(Schema.Struct({ name: Schema.String, udid: Schema.String })),
  ),
});
const decodeDevices = Schema.decodeUnknownEffect(Schema.fromJsonString(Devices));

const colours = Command.make(
  'colours',
  {
    ids,
    port: Flag.Int('port').pipe(Flag.withDescription("the app's dev server port (8270-8279)")),
  },
  (flags) =>
    Effect.gen(function* () {
      const listed = yield* decodeDevices(
        yield* succeed('xcrun', ['simctl', 'list', 'devices', '-j'], UDID_LIMIT),
      );
      const found = Option.fromUndefinedOr(
        Object.values(listed.devices)
          .flat()
          .find((device) => device.name === app.simulator),
      );
      if (Option.isNone(found)) return yield* NotFound.make({ target: app.simulator });
      const id = found.value.udid;
      const answer = yield* succeed(
        'argent',
        [
          'run',
          'debugger-evaluate',
          '--port',
          String(flags.port),
          '--device_id',
          id,
          '--expression',
          colourExpression(flags.ids),
          '--json',
        ],
        DRIVER_LIMIT,
        { env: { DO_NOT_TRACK: '1' } },
      );
      yield* Console.log(answer.trim());
    }),
);

Command.run(Command.make('readout').pipe(Command.withSubcommands([read, press, colours])), {
  version: '1.0.0',
}).pipe(Effect.provide(BunServices.layer), (program) => BunRuntime.runMain(program));
