/**
 * `runSim` over a stand-in `Drive`: a warm checkout is refused before any
 * step runs, `boot` on iOS hands the dev server a Hermes compiler (the one
 * `HERMESC_PATH` names, else the one react-native depends on), and `open`
 * retries once, terminating the app, when its target is missing on iOS,
 * unless `--no-relaunch` asks it not to.
 * The journey's verbs read their arguments here: `gesture pan`,
 * `gesture edge-pan` and `gesture pinch`, `hold` with its press and settle, `relaunch`, and
 * `down --clean`, which cleans whether or not a drive was booted.
 */
import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Console, Effect, Exit, FileSystem, Option, Path, Schema } from 'effect';

import { runSim } from './command.ts';
import { Drive, type DriveMembers, type Outcome, type Place } from './drive.ts';
import { NoSession, TargetMissing, ToolFailed } from './errors.ts';
import { decodeResult } from './fixtures/lines.ts';
import { probeApp } from './fixtures/probe.ts';

interface Call {
  readonly op: string;
  readonly args: ReadonlyArray<unknown>;
}

const done = (platform: Outcome['platform']): Outcome => ({ platform, paths: {}, detail: {} });

/** How the stand-in's `open` answers each call in turn; past the end, it succeeds. */
type OpenAnswer = 'ok' | 'missing-ios' | 'missing-web' | 'tool-failed';

/** How the stand-in's `down` answers: it stops a drive, or finds none booted. */
type DownAnswer = 'ok' | 'no-session';

const standIn = (
  calls: Array<Call>,
  opens: ReadonlyArray<OpenAnswer>,
  downs: DownAnswer,
): DriveMembers => {
  const step =
    (op: string) =>
    (...args: ReadonlyArray<unknown>) =>
      Effect.sync(() => {
        calls.push({ op, args });
        return done('ios');
      });
  let opened = 0;
  return {
    readSession: () =>
      Effect.fail(NoSession.make({ file: '/nonexistent/loop-probe-x/session.json' })),
    boot: step('boot'),
    install: step('install'),
    open: (...args) => {
      calls.push({ op: 'open', args });
      const answer = opens[opened] ?? 'ok';
      opened += 1;
      if (answer === 'missing-ios' || answer === 'missing-web') {
        const platform = ({ 'missing-ios': 'ios', 'missing-web': 'web' } as const)[answer];
        return Effect.fail(TargetMissing.make({ target: 'Hymns', platform, driver: 'timed out' }));
      }
      if (answer === 'tool-failed') {
        return Effect.fail(
          ToolFailed.make({ tool: 'xcrun', args: [], exitCode: 1, output: 'no device' }),
        );
      }
      return Effect.succeed(done('ios'));
    },
    tap: step('tap'),
    fill: step('fill'),
    back: step('back'),
    scroll: step('scroll'),
    shot: step('shot'),
    snapshot: step('snapshot'),
    record: step('record'),
    log: step('log'),
    doctor: step('doctor'),
    down: (...args) => {
      calls.push({ op: 'down', args });
      if (downs === 'no-session')
        return Effect.fail(NoSession.make({ file: '/nonexistent/loop-probe-x/session.json' }));
      return Effect.succeed(done('ios'));
    },
    clean: step('clean'),
    gesture: step('gesture'),
    pinch: step('pinch'),
    hold: step('hold'),
    relaunch: step('relaunch'),
    sees: (...args) => Effect.sync(() => void calls.push({ op: 'sees', args })),
  };
};

/** Run `sim <args>` at `place` over the stand-in: what it printed, its exit and the steps it called. */
const sim = (
  place: Place,
  args: ReadonlyArray<string>,
  opens: ReadonlyArray<OpenAnswer> = [],
  downs: DownAnswer = 'ok',
) =>
  Effect.gen(function* () {
    const calls: Array<Call> = [];
    const printed: Array<string> = [];
    const console: Console.Console = {
      ...globalThis.console,
      log: (...line: ReadonlyArray<unknown>) => void printed.push(line.join(' ')),
      error: () => {},
    };
    const exit = yield* Effect.exit(
      runSim(place, args).pipe(
        Effect.provideService(Console.Console, console),
        Effect.provideService(Drive, standIn(calls, opens, downs)),
      ),
    );
    return { exit, calls, printed: printed.map((line) => decodeResult(line)) };
  });

/**
 * A cold checkout: an app folder of its own whose react-native depends on a
 * `hermes-compiler` with its macOS binary, as a One app's does, with the
 * warm list naming only a path that is no checkout.
 */
const coldPlace = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const app = yield* fs.makeTempDirectoryScoped();
  const native = path.join(app, 'node_modules', 'react-native');
  const compiler = path.join(native, 'node_modules', 'hermes-compiler');
  yield* fs.makeDirectory(path.join(compiler, 'hermesc', 'osx-bin'), { recursive: true });
  yield* fs.writeFileString(path.join(native, 'package.json'), '{"name":"react-native"}');
  yield* fs.writeFileString(path.join(compiler, 'package.json'), '{"name":"hermes-compiler"}');
  yield* fs.writeFileString(path.join(compiler, 'hermesc', 'osx-bin', 'hermesc'), '');
  return {
    app,
    state: '/nonexistent/loop-probe-x/state',
    script: path.join(app, 'scripts', 'sim.ts'),
    features: '/nonexistent/loop-probe-x/features',
    warm: ['/nonexistent/loop-probe-x'],
    config: probeApp,
  } satisfies Place;
});

/* oxlint-disable effect/noGlobals -- `hermesCompiler` reads HERMESC_PATH from the process environment on each call, so the test sets it there. */
const setHermesc = (value: Option.Option<string>) =>
  Option.match(value, {
    onNone: () => void Reflect.deleteProperty(process.env, 'HERMESC_PATH'),
    onSome: (given) => void (process.env['HERMESC_PATH'] = given),
  });

/** Run `body` with HERMESC_PATH set to `value` (unset on none), then put it back. */
const withHermesc = <A, E, R>(value: Option.Option<string>, body: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const before = Option.fromNullishOr(process.env['HERMESC_PATH']);
      setHermesc(value);
      return before;
    }),
    () => body,
    (before) => Effect.sync(() => setHermesc(before)),
  );
/* oxlint-enable effect/noGlobals */

const bootedHermesc = (calls: ReadonlyArray<Call>) => {
  const options = calls.find((call) => call.op === 'boot')?.args[1] as {
    readonly hermesc: Option.Option<string>;
  };
  return options.hermesc;
};

const OPEN_ANSWERS: ReadonlyArray<OpenAnswer> = ['ok', 'missing-ios', 'missing-web', 'tool-failed'];

/** What `sim open` is asked of relaunching: nothing, `--relaunch` or `--no-relaunch`. */
type OpenAsk = 'absent' | 'relaunch' | 'no-relaunch';
const OPEN_ASKS: ReadonlyArray<OpenAsk> = ['absent', 'relaunch', 'no-relaunch'];
const OPEN_FLAG: Record<OpenAsk, ReadonlyArray<string>> = {
  absent: [],
  relaunch: ['--relaunch'],
  'no-relaunch': ['--no-relaunch'],
};

/** Every sequence of `length` answers. */
const answerSequences = (length: number): ReadonlyArray<ReadonlyArray<OpenAnswer>> =>
  Array.from({ length }).reduce<ReadonlyArray<ReadonlyArray<OpenAnswer>>>(
    (heads) => heads.flatMap((head) => OPEN_ANSWERS.map((answer) => [...head, answer])),
    [[]],
  );

/** Whether an open's options ask it to terminate the app first. */
const isTerminate = Schema.is(Schema.Struct({ terminate: Schema.Literal(true) }));

/** What one `sim open` did: its opens, which terminated the app, its exit and its lines. */
interface OpenModel {
  readonly case: string;
  readonly opens: number;
  readonly terminated: ReadonlyArray<boolean>;
  readonly ok: boolean;
  readonly retried: boolean;
  readonly tag: string;
  readonly lines: number;
}

/** The tag a failed open's line carries for each answer. */
const ANSWER_TAG: Record<OpenAnswer, string> = {
  ok: '',
  'missing-ios': 'TargetMissing',
  'missing-web': 'TargetMissing',
  'tool-failed': 'ToolFailed',
};

const openCase = (ask: OpenAsk, answers: ReadonlyArray<OpenAnswer>) =>
  `${ask} [${answers.join(',')}]`;

/**
 * The reference: one open; a second, terminating the app, exactly when the
 * first answered missing on iOS and the ask is not `--no-relaunch`. It
 * succeeds when its last open did, `retried` when that was the second.
 */
const openModel = (ask: OpenAsk, answers: ReadonlyArray<OpenAnswer>): OpenModel => {
  const opens = 1 + Number((answers[0] ?? 'ok') === 'missing-ios' && ask !== 'no-relaunch');
  const last = answers[opens - 1] ?? 'ok';
  return {
    case: openCase(ask, answers),
    opens,
    terminated: Array.from({ length: opens }, (_, at) => at > 0),
    ok: last === 'ok',
    retried: opens === 2 && last === 'ok',
    tag: ANSWER_TAG[last],
    lines: 1,
  };
};

describe('sim commands over the Drive service', () => {
  it.scoped('a warm checkout is refused with one WarmCheckout line and no step', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const app = path.join(root, 'apps', 'probe');
      yield* fs.makeDirectory(app, { recursive: true });
      const place: Place = {
        app,
        state: path.join(root, 'state'),
        script: path.join(app, 'scripts', 'sim.ts'),
        features: path.join(root, 'features'),
        warm: [root],
        config: probeApp,
      };
      const { exit, calls, printed } = yield* sim(place, ['doctor']);
      expect(Exit.isFailure(exit)).toBe(true);
      expect(calls).toEqual([]);
      expect(printed).toHaveLength(1);
      const [line] = printed;
      expect(line?.ok).toBe(false);
      if (line?.ok === false) {
        expect(line.error._tag).toBe('WarmCheckout');
        expect(line.message).toMatch(/warm/i);
        expect(line.message).toMatch(/worktree/i);
      }
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.scoped('a cold checkout runs the step it is asked for', () =>
    Effect.gen(function* () {
      const place = yield* coldPlace;
      const { exit, calls } = yield* sim(place, ['doctor']);
      expect(Exit.isSuccess(exit)).toBe(true);
      expect(calls.map((call) => call.op)).toEqual(['doctor']);
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.scoped('an iOS boot keeps an absolute HERMESC_PATH that names a file', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dir = yield* fs.makeTempDirectoryScoped();
      const given = path.join(dir, 'hermesc');
      yield* fs.writeFileString(given, '');
      const place = yield* coldPlace;
      const { calls } = yield* withHermesc(
        Option.some(given),
        sim(place, ['boot', '--platform', 'ios']),
      );
      expect(bootedHermesc(calls)).toEqual(Option.some(given));
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.scoped("an iOS boot without a usable HERMESC_PATH takes react-native's compiler", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const place = yield* coldPlace;
      for (const value of [
        Option.none(),
        Option.some('relative/hermesc'),
        Option.some('/nonexistent/loop-probe-x/hermesc'),
      ]) {
        const { calls } = yield* withHermesc(value, sim(place, ['boot', '--platform', 'ios']));
        const hermesc = bootedHermesc(calls);
        expect(Option.isSome(hermesc)).toBe(true);
        if (Option.isSome(hermesc)) {
          expect(hermesc.value).toStartWith(yield* fs.realPath(place.app));
          expect(hermesc.value.endsWith('hermesc/osx-bin/hermesc')).toBe(true);
          expect(yield* fs.exists(hermesc.value)).toBe(true);
        }
      }
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.scoped('a web boot takes no Hermes compiler', () =>
    Effect.gen(function* () {
      const place = yield* coldPlace;
      const { calls } = yield* sim(place, ['boot', '--platform', 'web']);
      expect(bootedHermesc(calls)).toEqual(Option.none());
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.scoped(
    'sim open relaunches once on a missing iOS target unless --no-relaunch, over every ask and answer sequence',
    () =>
      Effect.gen(function* () {
        const place = yield* coldPlace;
        const seen: Array<OpenModel> = [];
        const want: Array<OpenModel> = [];
        for (const ask of OPEN_ASKS) {
          for (const answers of [0, 1, 2, 3].flatMap(answerSequences)) {
            const { exit, calls, printed } = yield* sim(
              place,
              ['open', 'probe://hymns/1', '--expect', 'id=counts', ...OPEN_FLAG[ask]],
              answers,
            );
            const opens = calls.filter((call) => call.op === 'open');
            seen.push({
              case: openCase(ask, answers),
              opens: opens.length,
              terminated: opens.map((call) => isTerminate(call.args[4])),
              ok: Exit.isSuccess(exit),
              retried: printed.some((line) => line.ok && line.detail['retried'] === true),
              tag: printed
                .flatMap((line) => {
                  if (line.ok) return [];
                  return [line.error._tag];
                })
                .join(','),
              lines: printed.length,
            });
            want.push(openModel(ask, answers));
          }
        }
        expect(seen).toHaveLength(255);
        expect(seen).toEqual(want);
      }).pipe(Effect.provide(BunServices.layer)),
  );

  /** The arguments each step was called with, past the place. */
  const driven = (calls: ReadonlyArray<Call>) =>
    calls.map((call) => ({ op: call.op, args: call.args.slice(1) }));

  it.scoped('gesture pan starts at a point or a target, 900 ms unless --ms says', () =>
    Effect.gen(function* () {
      const place = yield* coldPlace;
      const cases = [
        [
          ['10,20', '-52', '0', '--ms', '1500'],
          { from: { x: 10, y: 20 }, dx: -52, dy: 0, ms: 1500 },
        ],
        [['10,20', '-52', '0'], { from: { x: 10, y: 20 }, dx: -52, dy: 0, ms: 900 }],
        [['id=key-button', '0', '120'], { from: 'id=key-button', dx: 0, dy: 120, ms: 900 }],
      ] as const;
      for (const [args, pan] of cases) {
        const { exit, calls, printed } = yield* sim(place, ['gesture', 'pan', ...args]);
        expect(Exit.isSuccess(exit)).toBe(true);
        expect(driven(calls)).toEqual([{ op: 'gesture', args: [pan] }]);
        expect(printed[0]?.ok === true && printed[0].command).toBe('gesture');
      }
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.scoped('gesture pinch pinches on a point or a target at the scale it is given', () =>
    Effect.gen(function* () {
      const place = yield* coldPlace;
      const cases: ReadonlyArray<readonly [ReadonlyArray<string>, Array<unknown>]> = [
        [
          ['id=list', '0.6'],
          ['id=list', 0.6],
        ],
        [
          ['label=Topics, all at once', '1.6'],
          ['label=Topics, all at once', 1.6],
        ],
        [
          ['200,400', '0.97'],
          [{ x: 200, y: 400 }, 0.97],
        ],
        [
          ['id=list', '4'],
          ['id=list', 4],
        ],
      ];
      for (const [args, pinch] of cases) {
        const { exit, calls, printed } = yield* sim(place, ['gesture', 'pinch', ...args]);
        expect(Exit.isSuccess(exit)).toBe(true);
        expect(driven(calls)).toEqual([{ op: 'pinch', args: pinch }]);
        expect(printed[0]?.ok === true && printed[0].command).toBe('gesture');
      }
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.scoped('gesture edge-pan pans right from the left edge, its defaults overridable', () =>
    Effect.gen(function* () {
      const place = yield* coldPlace;
      const plain = yield* sim(place, ['gesture', 'edge-pan']);
      expect(driven(plain.calls)).toEqual([
        { op: 'gesture', args: [{ from: { x: 3, y: 437 }, dx: 200, dy: 0, ms: 300 }] },
      ]);
      const given = yield* sim(place, [
        'gesture',
        'edge-pan',
        '--y',
        '500',
        '--dx',
        '150',
        '--ms',
        '400',
      ]);
      expect(driven(given.calls)).toEqual([
        { op: 'gesture', args: [{ from: { x: 3, y: 500 }, dx: 150, dy: 0, ms: 400 }] },
      ]);
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.scoped('hold presses 900 ms and settles 10 s unless told otherwise', () =>
    Effect.gen(function* () {
      const place = yield* coldPlace;
      const cases = [
        [['id=key-button'], ['id=key-button', 900, 10]],
        [
          ['label=Key', '--ms', '1200', '--settle', '4'],
          ['label=Key', 1200, 4],
        ],
        [
          ['id=key-button', '--settle', '0'],
          ['id=key-button', 900, 0],
        ],
      ] as const;
      for (const [args, held] of cases) {
        const { exit, calls } = yield* sim(place, ['hold', ...args]);
        expect(Exit.isSuccess(exit)).toBe(true);
        expect(driven(calls)).toEqual([{ op: 'hold', args: [...held] }]);
      }
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.scoped('a bad gesture or hold is refused as BadArguments before any step', () =>
    Effect.gen(function* () {
      const place = yield* coldPlace;
      for (const args of [
        ['gesture', 'pan', '10,20', '-52'],
        ['gesture', 'pan', '10,20', '-52', '0', '--ms', '0'],
        ['gesture', 'pan', '10,20', '-52', '0', '--ms', '-5'],
        ['gesture', 'pan', '10,20', 'left', '0'],
        ['gesture', 'pan', '10,20', '1.5', '0'],
        ['gesture', 'pan', '-5,20', '10', '0'],
        ['gesture', 'edge-pan', '--ms', '0'],
        ['gesture', 'swipe', '10,20', '1', '0'],
        ['gesture', 'pinch', 'id=list'],
        ['gesture', 'pinch', 'id=list', '0'],
        ['gesture', 'pinch', 'id=list', '4.5'],
        ['gesture', 'pinch', 'id=list', 'in'],
        ['gesture', 'pinch', '-5,20', '0.6'],
        ['hold'],
        ['hold', 'id=x', '--ms', '0'],
        ['hold', 'id=x', '--settle', '-1'],
      ]) {
        const { exit, calls, printed } = yield* sim(place, args);
        expect(Exit.isFailure(exit)).toBe(true);
        expect(calls).toEqual([]);
        expect(printed).toHaveLength(1);
        expect(printed[0]?.ok === false && printed[0].error._tag).toBe('BadArguments');
      }
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.scoped('relaunch relaunches, and down --clean stops the drive before it cleans', () =>
    Effect.gen(function* () {
      const place = yield* coldPlace;
      const relaunched = yield* sim(place, ['relaunch']);
      expect(driven(relaunched.calls).map((call) => call.op)).toEqual(['relaunch']);
      const cleaned = yield* sim(place, ['down', '--clean']);
      expect(Exit.isSuccess(cleaned.exit)).toBe(true);
      expect(cleaned.calls.map((call) => call.op)).toEqual(['down', 'clean']);
      expect(cleaned.printed[0]?.ok === true && cleaned.printed[0].command).toBe('down');
      expect(cleaned.printed[0]?.ok === true && cleaned.printed[0].detail['stopped']).toBe(true);
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.scoped('down --clean with nothing booted still cleans; a plain down fails NoSession', () =>
    Effect.gen(function* () {
      const place = yield* coldPlace;
      const cleaned = yield* sim(place, ['down', '--clean'], [], 'no-session');
      expect(Exit.isSuccess(cleaned.exit)).toBe(true);
      expect(cleaned.calls.map((call) => call.op)).toEqual(['down', 'clean']);
      expect(cleaned.printed[0]?.ok === true && cleaned.printed[0].detail['stopped']).toBe(false);
      const plain = yield* sim(place, ['down'], [], 'no-session');
      expect(Exit.isFailure(plain.exit)).toBe(true);
      expect(plain.calls.map((call) => call.op)).toEqual(['down']);
      expect(plain.printed[0]?.ok === false && plain.printed[0].error._tag).toBe('NoSession');
    }).pipe(Effect.provide(BunServices.layer)),
  );
});
