import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import {
  Arbitrary,
  Duration,
  Effect,
  Exit,
  FileSystem,
  Option,
  Schedule,
  Schema,
  Stream,
} from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { collect } from '../../src/tools/process.ts';

const FIXTURE = `${import.meta.dir}/../../src/tools/fixtures/chrome-launcher.ts`;

/** A step's report, as the fixture writes it. */
const Step = Schema.fromJsonString(
  Schema.Struct({
    pid: Schema.Finite,
    command: Schema.String,
    result: Schema.String,
    chromes: Schema.Array(Schema.String),
    profile: Schema.Boolean,
  }),
);
type Step = typeof Step.Type;

/** A step in the middle of a sequence. */
const Middle = Schema.Literals(['open:gpu', 'open:soft', 'close', 'killChrome']);
type Middle = typeof Middle.Type;

/** How a sequence ends: the fixture exits, or the test kills it. */
const End = Schema.Literals(['exit', 'sigkill']);

/** The reference model: the flags the first open fixed, whether its Chrome runs, how many views are open. */
interface Model {
  readonly flags: Option.Option<'open:gpu' | 'open:soft'>;
  readonly chrome: 'none' | 'running' | 'dead';
  readonly views: number;
}

const START: Model = { flags: Option.none(), chrome: 'none', views: 0 };

/** A step of the model: the model after it, and the result the launcher must report. */
interface Transition {
  readonly next: Model;
  readonly result: string;
}

/** What `command` does to `model`, and the result the launcher must report for it. */
const stepOf = (model: Model, command: Middle): Transition => {
  if (command === 'close')
    return { next: { ...model, views: Math.max(0, model.views - 1) }, result: 'ok' };
  if (command === 'killChrome') {
    if (model.chrome === 'running') return { next: { ...model, chrome: 'dead' }, result: 'ok' };
    return { next: model, result: 'ok' };
  }
  if (Option.exists(model.flags, (flags) => flags !== command))
    return { next: model, result: 'BrowserFailed' };
  return {
    next: { flags: Option.some(command), chrome: 'running', views: model.views + 1 },
    result: 'ok',
  };
};

/** Whether a Chrome launched for `flags` on this platform runs its GPU. */
const gpuOf = (flags: Option.Option<string>) =>
  process.platform === 'darwin' && Option.contains(flags, 'open:gpu');

/** The checks every report must pass against the model after its step. */
const holds = (step: Step, model: Model, result: string, root: string) => {
  expect([step.command, step.result]).toEqual([step.command, result]);
  expect(step.chromes).toHaveLength(Number(model.chrome === 'running'));
  expect(step.profile).toBe(Option.isSome(model.flags));
  for (const chrome of step.chromes) {
    const flags = chrome.split(' ');
    expect(flags.filter((flag) => flag.startsWith('--user-data-dir='))).toEqual([
      `--user-data-dir=${root}/${step.pid}`,
    ]);
    expect(flags).toEqual(
      expect.arrayContaining([
        '--mute-audio',
        '--disable-audio-output',
        '--disable-component-update',
      ]),
    );
    expect(flags.includes('--disable-gpu')).toBe(!gpuOf(model.flags));
  }
};

/** Every process still running with a profile under `folder`. */
const holding = (folder: string) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const ps = yield* collect(
      spawner,
      ChildProcess.make('ps', ['-axo', 'args='], { forceKillAfter: '5 seconds' }),
    );
    return ps.stdout.split('\n').filter((line) => line.includes(`--user-data-dir=${folder}`));
  });

/** Within 10 s, no process holds a profile under `folder`. */
const noneHold = (folder: string) =>
  Effect.filterOrFail(holding(folder), (left) => left.length === 0).pipe(
    Effect.retry({ schedule: Schedule.spaced(Duration.millis(100)), times: 100 }),
    Effect.asVoid,
  );

/** The fixture run over `steps` on `root`: each step's report as it comes, the process killed once it holds. */
const runFixture = (root: string, steps: ReadonlyArray<string>) =>
  Effect.scoped(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const handle = yield* spawner.spawn(
        ChildProcess.make(process.execPath, [FIXTURE], {
          env: { FILM_CHROME_PROFILES: root, FILM_LAUNCHER_STEPS: steps.join(',') },
          extendEnv: true,
          forceKillAfter: '5 seconds',
        }),
      );
      const lines = yield* handle.stdout.pipe(
        Stream.decodeText,
        Stream.splitLines,
        Stream.filter((line) => line.startsWith('{')),
        Stream.takeUntil((line) => line.includes('"command":"hold"')),
        Stream.runCollect,
      );
      const reports = yield* Effect.forEach(lines, (line) => Schema.decodeEffect(Step)(line));
      if (steps.at(-1) === 'hold') yield* handle.kill({ killSignal: 'SIGKILL' });
      const code = yield* Effect.exit(handle.exitCode);
      return { reports, code };
    }),
  );

/** Six generated sequences, and one that opens again in the profile of a Chrome it killed. */
const SEQUENCES: ReadonlyArray<readonly [ReadonlyArray<Middle>, typeof End.Type]> = [
  ...Effect.runSync(
    Arbitrary.sampleEffect(
      Arbitrary.all([
        Arbitrary.array(Arbitrary.schema(Middle), { minLength: 1, maxLength: 7 }),
        Arbitrary.schema(End),
      ]),
      { count: 6, seed: 17 },
    ),
  ),
  [['open:gpu', 'killChrome', 'open:gpu', 'close', 'open:gpu'], 'sigkill'],
];

describe('the Chrome launcher, against its model', () => {
  for (const [middle, end] of SEQUENCES)
    it.live.layer(BunServices.layer)(
      `${middle.join(' ')} then ${end}`,
      () =>
        Effect.scoped(
          Effect.gen(function* () {
            const fs = yield* FileSystem.FileSystem;
            const root = yield* fs.makeTempDirectoryScoped();
            const steps = [...middle, { exit: 'exit', sigkill: 'hold' }[end]];
            const run = yield* runFixture(root, steps);
            expect(run.reports.map((r) => r.command)).toEqual(steps);
            let model = START;
            for (const [i, command] of middle.entries()) {
              const { next, result } = stepOf(model, command);
              model = next;
              const report = run.reports[i];
              if (report) holds(report, model, result, root);
            }
            const pid = run.reports[0]?.pid ?? 0;
            yield* noneHold(`${root}/${pid}`);
            if (end === 'exit') {
              expect(Exit.isSuccess(run.code)).toBe(true);
              expect(yield* fs.exists(`${root}/${pid}`)).toBe(false);
              return;
            }
            expect(yield* fs.exists(`${root}/${pid}`)).toBe(Option.isSome(model.flags));
            const next = yield* runFixture(root, ['open:soft', 'exit']);
            const first = next.reports[0];
            expect(first?.result).toBe('ok');
            expect(yield* fs.readDirectory(root)).toEqual([]);
            yield* noneHold(root);
          }),
        ),
      60_000,
    );
});
