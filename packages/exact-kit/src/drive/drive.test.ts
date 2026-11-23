import { Effect, Schema } from 'effect';
import * as Arbitrary from 'effect/Arbitrary';
import { describe, expect, it } from 'effect-bun-test';

import { makeDrive } from './drive.ts';

/** The machine a drive is handed. */
type Processes = NonNullable<Parameters<typeof makeDrive>[0]['processes']>;

/** How long the stand-in's runs may take before the drive stops one: a stand-in run never overruns. */
const TIMEOUT_MS = 60_000;
const PROBE = '/nonexistent/loop-probe-x';

/** One agent run the stand-in answers: how it ends, and the checks made on its replies. */
const Leg = Schema.Struct({
  ops: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 4 })),
  end: Schema.Literals(['ok', 'exit 1', 'short']),
  /** The checks made on the run's replies: each passes or fails. */
  checks: Schema.Array(Schema.Boolean).check(Schema.isMaxLength(3)),
});
type Leg = typeof Leg.Type;

const Case = Arbitrary.all({
  host: Arbitrary.schema(Schema.Literals(['ios', 'web'])),
  legs: Arbitrary.array(Arbitrary.schema(Leg), { maxLength: 5 }),
});

/** What the stand-in saw: every signal and every command started. */
interface Seen {
  readonly signals: Array<readonly [number, string]>;
  readonly spawned: Array<number>;
}

/** A stand-in machine for `legs`: each run's pid and its replies; a run ends at once and never overruns. */
const standIn = (legs: ReadonlyArray<Leg>, seen: Seen): Processes => {
  let next = 0;
  return {
    spawn: () => {
      const leg = legs[next];
      const pid = 100 * (next + 2);
      next += 1;
      seen.spawned.push(pid);
      const replies = Array.from({ length: leg?.ops ?? 0 }, (_, i) => JSON.stringify({ reply: i }));
      return {
        pid,
        ended: Promise.resolve({
          code: Number(leg?.end === 'exit 1'),
          stdout: ['built', ...(leg?.end === 'short' ? replies.slice(1) : replies)].join('\n'),
          stderr: '',
        }),
      };
    },
    signal: (pid, signal) => {
      seen.signals.push([pid, signal]);
    },
    sleep: (ms) => (ms >= TIMEOUT_MS ? new Promise(() => {}) : Promise.resolve()),
    claim: async () => 8770,
  };
};

/** The model: the lines a drive over `legs` prints and its exit code. */
const expected = (legs: ReadonlyArray<Leg>) => {
  const lines = legs.flatMap((leg) => [
    ...(leg.end === 'ok' ? [] : ['FAIL step']),
    ...leg.checks.map((ok) => (ok ? 'PASS' : 'FAIL')),
  ]);
  return { lines, code: Number(lines.some((line) => line.startsWith('FAIL'))) };
};

describe('drive', () => {
  it.effect(
    'reports every check after a failed one or a failed step, exits non-zero exactly when one failed, and signals nothing at its finish, a kept touch runner included',
    () =>
      Effect.gen(function* () {
        const result = yield* Arbitrary.checkEffect(
          Case,
          ({ host, legs }) =>
            Effect.promise(async () => {
              const seen: Seen = { signals: [], spawned: [] };
              const printed: Array<string> = [];
              const drive = makeDrive({
                name: 'drive-probe',
                host,
                appDir: PROBE,
                processes: standIn(legs, seen),
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
              const want = expected(legs);
              const lines = printed
                .slice(0, -1)
                .map((line) =>
                  line.startsWith(`FAIL ${host} step`) ? 'FAIL step' : line.split(' ')[0],
                );
              return (
                Bun.deepEquals(lines, want.lines) &&
                code === want.code &&
                printed.at(-1)?.startsWith(code === 0 ? 'ok:' : 'FAILED:') === true &&
                seen.spawned.length === legs.length &&
                seen.signals.length === 0
              );
            }),
          { runs: 200, seed: 1 },
        );
        expect(Arbitrary.formatCheckFailure(result)).toBeUndefined();
      }),
  );

  it.effect(
    "a launch resets the run's storage and a relaunch keeps it, through the app's own agent, both on the one port the drive claimed once",
    () =>
      Effect.promise(async () => {
        const argvs: Array<ReadonlyArray<string>> = [];
        const claims: Array<readonly [string, string]> = [];
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
            signal: () => {},
            sleep: () => new Promise(() => {}),
            claim: async (appDir, label) => {
              claims.push([appDir, label]);
              return 8772 + claims.length;
            },
          },
        });
        expect(await drive.launch('s', ['state a', 'state b'])).toEqual([1, 'two']);
        await drive.relaunch('s', ['state a']);
        expect(claims).toEqual([[PROBE, 'drive-probe web']]);
        expect(argvs).toEqual([
          [
            PROBE,
            'bun',
            'run',
            'exact',
            'agent',
            'web',
            '--json',
            '--port',
            '8773',
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
            '--port',
            '8773',
            '--storage',
            's',
            '--keep-storage',
            'state a',
          ],
        ]);
        expect(drive.finish()).toBe(0);
      }),
  );

  it.effect('claims no port on iOS, nor on the web when the run names its own', () =>
    Effect.promise(async () => {
      const argvs: Array<ReadonlyArray<string>> = [];
      let claims = 0;
      const machine: Processes = {
        spawn: (argv) => {
          argvs.push(argv);
          return { pid: 4242, ended: Promise.resolve({ code: 0, stdout: '1', stderr: '' }) };
        },
        signal: () => {},
        sleep: () => new Promise(() => {}),
        claim: async () => {
          claims += 1;
          return 8770;
        },
      };
      const ios = makeDrive({ name: 'p', host: 'ios', appDir: PROBE, processes: machine });
      await ios.launch('s', ['state a']);
      const web = makeDrive({ name: 'p', host: 'web', appDir: PROBE, processes: machine });
      await web.run(['--port=8771'], ['state a']);
      expect(claims).toBe(0);
      expect(argvs.map((argv) => argv.filter((a) => a.startsWith('--port')))).toEqual([
        [],
        ['--port=8771'],
      ]);
    }),
  );
});
