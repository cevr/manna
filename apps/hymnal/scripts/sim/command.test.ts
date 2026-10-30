/**
 * `runSim` over a stand-in `Drive`: a warm checkout is refused before any
 * step runs, `boot` on iOS hands the dev server a Hermes compiler (the one
 * `HERMESC_PATH` names, else the one react-native depends on), and `open`
 * retries once, terminating the app, when its target is missing on iOS.
 */
import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Console, Effect, Exit, FileSystem, Option, Path, Schema } from 'effect';

import { runSim } from './command.ts';
import { Drive, type DriveMembers, type Outcome, type Place } from './drive.ts';
import { TargetMissing, ToolFailed } from './errors.ts';
import { Result } from './result.ts';

interface Call {
  readonly op: string;
  readonly args: ReadonlyArray<unknown>;
}

const decodeResult = Schema.decodeUnknownSync(Schema.fromJsonString(Result));

const done = (platform: Outcome['platform']): Outcome => ({ platform, paths: {}, detail: {} });

/** How the stand-in's `open` answers each call in turn; past the end, it succeeds. */
type OpenAnswer = 'ok' | 'missing-ios' | 'missing-web' | 'tool-failed';

const standIn = (calls: Array<Call>, opens: ReadonlyArray<OpenAnswer>): DriveMembers => {
  const step =
    (op: string) =>
    (...args: ReadonlyArray<unknown>) =>
      Effect.sync(() => {
        calls.push({ op, args });
        return done('ios');
      });
  let opened = 0;
  return {
    readSession: () => Effect.die('the commands under test read no session'),
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
    down: step('down'),
  };
};

/** Run `sim <args>` at `place` over the stand-in: what it printed, its exit and the steps it called. */
const sim = (place: Place, args: ReadonlyArray<string>, opens: ReadonlyArray<OpenAnswer> = []) =>
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
        Effect.provideService(Drive, standIn(calls, opens)),
      ),
    );
    return { exit, calls, printed: printed.map((line) => decodeResult(line)) };
  });

/** A cold checkout: this worktree's app, with the warm list naming only a path that is no checkout. */
const coldPlace = Effect.gen(function* () {
  const path = yield* Path.Path;
  const app = path.resolve(import.meta.dir, '..', '..');
  return {
    app,
    state: '/nonexistent/loop-probe-x/state',
    script: path.join(app, 'scripts', 'sim.ts'),
    features: '/nonexistent/loop-probe-x/features',
    warm: ['/nonexistent/loop-probe-x'],
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

describe('sim commands over the Drive service', () => {
  it.scoped('a warm checkout is refused with one WarmCheckout line and no step', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const app = path.join(root, 'apps', 'hymnal');
      yield* fs.makeDirectory(app, { recursive: true });
      const place: Place = {
        app,
        state: path.join(root, 'state'),
        script: path.join(app, 'scripts', 'sim.ts'),
        features: path.join(root, 'features'),
        warm: [root],
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

  it.scoped('an open that finds its target opens once and says it was not retried', () =>
    Effect.gen(function* () {
      const place = yield* coldPlace;
      const { exit, calls, printed } = yield* sim(place, ['open', 'hymnal://hymns/1']);
      expect(Exit.isSuccess(exit)).toBe(true);
      expect(calls.filter((call) => call.op === 'open')).toHaveLength(1);
      expect(printed[0]?.ok === true && printed[0].detail['retried']).toBe(false);
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.scoped('a target missing on iOS is opened again once, terminating the app', () =>
    Effect.gen(function* () {
      const place = yield* coldPlace;
      const { exit, calls, printed } = yield* sim(
        place,
        ['open', 'hymnal://hymns/1'],
        ['missing-ios'],
      );
      expect(Exit.isSuccess(exit)).toBe(true);
      const opens = calls.filter((call) => call.op === 'open');
      expect(opens).toHaveLength(2);
      expect(opens[1]?.args[4]).toEqual({ terminate: true });
      expect(printed[0]?.ok === true && printed[0].detail['retried']).toBe(true);
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.scoped('a target still missing after the retry fails the open', () =>
    Effect.gen(function* () {
      const place = yield* coldPlace;
      const { exit, calls } = yield* sim(
        place,
        ['open', 'hymnal://hymns/1'],
        ['missing-ios', 'missing-ios'],
      );
      expect(Exit.isFailure(exit)).toBe(true);
      expect(calls.filter((call) => call.op === 'open')).toHaveLength(2);
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.scoped('a missing target on the web, or a failed tool, is not retried', () =>
    Effect.gen(function* () {
      const place = yield* coldPlace;
      for (const answer of ['missing-web', 'tool-failed'] as const) {
        const { exit, calls } = yield* sim(place, ['open', '/hymns/1'], [answer]);
        expect(Exit.isFailure(exit)).toBe(true);
        expect(calls.filter((call) => call.op === 'open')).toHaveLength(1);
      }
    }).pipe(Effect.provide(BunServices.layer)),
  );
});
