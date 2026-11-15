import { Effect, Schema } from 'effect';
import * as Arbitrary from 'effect/Arbitrary';
import { describe, expect, it } from 'effect-bun-test';

import { makeDrive } from './drive.ts';

/** The machine a drive is handed, and a row of its process table. */
type Processes = NonNullable<Parameters<typeof makeDrive>[0]['processes']>;
type ProcessRow = ReturnType<Processes['list']>[number];

/** How long the stand-in's runs may take before the drive stops one: a stand-in run never overruns. */
const TIMEOUT_MS = 60_000;
const PROBE = '/nonexistent/loop-probe-x';

/** One agent run the stand-in answers: how it ends, and what it leaves in the process table. */
const Leg = Schema.Struct({
  ops: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 4 })),
  end: Schema.Literals(['ok', 'exit 1', 'short']),
  /** The poll at which the run's touch runner shows under it, if it starts one (0: never). */
  runnerAt: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 3 })),
  /** Whether that runner still runs at the drive's end. */
  runnerLives: Schema.Boolean,
  /** Whether the runner is two levels down (under lockf, under bun) or a child of the run. */
  deep: Schema.Boolean,
  /** The checks made on the run's replies: each passes or fails. */
  checks: Schema.Array(Schema.Boolean).check(Schema.isMaxLength(3)),
});
type Leg = typeof Leg.Type;

const Case = Arbitrary.all({
  host: Arbitrary.schema(Schema.Literals(['ios', 'web'])),
  legs: Arbitrary.array(Arbitrary.schema(Leg), { maxLength: 5 }),
  /** Touch runners that are not the drive's: another drive's, orphaned under launchd, and an unrelated one. */
  foreign: Arbitrary.schema(Schema.Boolean),
});

/** The run the stand-in is answering, and how many polls it has seen. */
interface Running {
  readonly leg: Leg;
  readonly pid: number;
  polls: number;
  readonly end: () => void;
}

/** What the stand-in saw: every signal and every command started. */
interface Seen {
  readonly signals: Array<readonly [number, string]>;
  readonly spawned: Array<number>;
}

/** A stand-in machine for `legs`: each run's pid, its replies, and a touch runner that shows at a later poll. */
const standIn = (legs: ReadonlyArray<Leg>, foreign: boolean, seen: Seen): Processes => {
  const rows: Array<ProcessRow> = [{ pid: 1, ppid: 0, command: 'launchd' }];
  if (foreign)
    rows.push(
      {
        pid: 900,
        ppid: 1,
        command: `xcodebuild test-without-building -xctestrun /tmp/exact-touches-A.xctestrun`,
      },
      { pid: 901, ppid: 1, command: 'bun run exact agent ios --json' },
      { pid: 902, ppid: 901, command: 'xcodebuild … exact-touches-B.xctestrun' },
    );
  let next = 0;
  let current: Running | undefined;
  /**
   * One poll of the run: its touch runner shows under it at poll `runnerAt`; at poll 4 it ends, its children are
   * left to launchd, and a runner that does not live on is gone.
   */
  const step = (run: Running) => {
    run.polls += 1;
    const { leg, pid } = run;
    if (leg.runnerAt > 0 && run.polls === leg.runnerAt) {
      rows.push({
        pid: pid + 2,
        ppid: leg.deep ? pid + 1 : pid,
        command: 'xcodebuild … exact-touches-SIM.xctestrun',
      });
      if (leg.deep)
        rows.push({ pid: pid + 1, ppid: pid, command: 'lockf -k /tmp/manna-exact-build.lock bun' });
    }
    if (run.polls < 4) return;
    current = undefined;
    for (const row of rows)
      if (row.ppid === pid || row.ppid === pid + 1) Object.assign(row, { ppid: 1 });
    const at = rows.findIndex((r) => r.pid === pid + 2);
    if (!leg.runnerLives && at !== -1) rows.splice(at, 1);
    run.end();
  };
  return {
    spawn: (argv) => {
      const leg = legs[next] ?? legs[0];
      const pid = 100 * (next + 2);
      next += 1;
      seen.spawned.push(pid);
      rows.push({ pid, ppid: 50, command: argv.join(' ') });
      let resolveEnd = () => {};
      const replies = Array.from({ length: leg?.ops ?? 0 }, (_, i) => JSON.stringify({ reply: i }));
      const ended = new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
        resolveEnd = () =>
          resolve({
            code: Number(leg?.end === 'exit 1'),
            stdout: ['built', ...(leg?.end === 'short' ? replies.slice(1) : replies)].join('\n'),
            stderr: '',
          });
      });
      if (leg) current = { leg, pid, polls: 0, end: resolveEnd };
      else resolveEnd();
      return { pid, ended };
    },
    list: () => rows.map((row) => ({ ...row })),
    signal: (pid, signal) => {
      seen.signals.push([pid, signal]);
    },
    sleep: (ms) => {
      if (ms >= TIMEOUT_MS) return new Promise(() => {});
      if (current) step(current);
      return Promise.resolve();
    },
  };
};

/** The model: the lines a drive over `legs` prints, its exit code, and the pids it must stop. */
const expected = (host: string, legs: ReadonlyArray<Leg>) => {
  const lines = legs.flatMap((leg) => [
    ...(leg.end === 'ok' ? [] : ['FAIL step']),
    ...leg.checks.map((ok) => (ok ? 'PASS' : 'FAIL')),
  ]);
  const stopped = legs.flatMap((leg, i) =>
    host === 'ios' && leg.runnerAt > 0 && leg.runnerLives ? [100 * (i + 2) + 2] : [],
  );
  return { lines, code: Number(lines.some((line) => line.startsWith('FAIL'))), stopped };
};

describe('drive', () => {
  it.effect(
    'reports every check after a failed one or a failed step, exits non-zero exactly when one failed, and stops only the touch runners its own runs started',
    () =>
      Effect.gen(function* () {
        const result = yield* Arbitrary.checkEffect(
          Case,
          ({ host, legs, foreign }) =>
            Effect.promise(async () => {
              const seen: Seen = { signals: [], spawned: [] };
              const printed: Array<string> = [];
              const drive = makeDrive({
                name: 'drive-probe',
                host,
                appDir: PROBE,
                processes: standIn(legs, foreign, seen),
                print: (line) => printed.push(line),
                timeoutMs: TIMEOUT_MS,
              });
              for (const leg of legs) {
                const replies = await drive.run(
                  ['--storage', 'probe'],
                  Array.from({ length: leg.ops }, () => 'clock data'),
                );
                if (replies.length !== leg.ops) return false;
                leg.checks.forEach((ok, i) => drive.check(`check ${i}`, ok, replies));
              }
              const code = drive.finish();
              const want = expected(host, legs);
              const lines = printed
                .slice(0, -1)
                .map((line) =>
                  line.startsWith(`FAIL ${host} step`) ? 'FAIL step' : line.split(' ')[0],
                );
              const ownGroups = new Set(seen.spawned.map((pid) => -pid));
              return (
                Bun.deepEquals(lines, want.lines) &&
                code === want.code &&
                printed.at(-1)?.startsWith(code === 0 ? 'ok:' : 'FAILED:') === true &&
                Bun.deepEquals(
                  seen.signals
                    .filter(([pid]) => !ownGroups.has(pid))
                    .map(([pid]) => pid)
                    .sort(),
                  want.stopped.sort(),
                ) &&
                seen.signals.every(([pid]) => pid > 1 || ownGroups.has(pid))
              );
            }),
          { runs: 200 },
        );
        expect(Arbitrary.formatCheckFailure(result)).toBeUndefined();
      }),
  );

  it.effect(
    "a launch resets the run's storage and a relaunch keeps it, through the app's own agent",
    () =>
      Effect.promise(async () => {
        const argvs: Array<ReadonlyArray<string>> = [];
        const drive = makeDrive({
          name: 'drive-probe',
          host: 'web',
          appDir: PROBE,
          print: () => {},
          processes: {
            spawn: (argv, cwd) => {
              argvs.push([cwd, ...argv]);
              return {
                pid: 4242,
                ended: Promise.resolve({ code: 0, stdout: '1\n"two"', stderr: '' }),
              };
            },
            list: () => [],
            signal: () => {},
            sleep: () => new Promise(() => {}),
          },
        });
        expect(await drive.launch('s', ['state a', 'state b'])).toEqual([1, 'two']);
        await drive.relaunch('s', ['state a']);
        expect(argvs).toEqual([
          [
            PROBE,
            'bun',
            'run',
            'exact',
            'agent',
            'web',
            '--json',
            '--storage',
            's',
            '--reset-storage',
            'state a',
            'state b',
          ],
          [
            PROBE,
            'bun',
            'run',
            'exact',
            'agent',
            'web',
            '--json',
            '--storage',
            's',
            '--keep-storage',
            'state a',
          ],
        ]);
        expect(drive.finish()).toBe(0);
      }),
  );
});
