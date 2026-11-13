/**
 * `sim.ts` without a device: its commands run over a stand-in spawner that
 * answers each tool as the test scripts it, and a dev server that never
 * answers. Each prints one result the result schema reads back; a failure
 * prints its tagged error and fails the command; `serve` kills the server
 * it started when its scope closes; and an app's script, `launch`ed as a
 * process of its own (the probe's, `fixtures/sim.ts`), exits non-zero.
 */
import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import {
  Console,
  Deferred,
  Effect,
  Exit,
  Fiber,
  FileSystem,
  Layer,
  Option,
  Path,
  Schema,
  Sink,
  Stream,
} from 'effect';
import { HttpClient, HttpClientError, HttpClientResponse } from 'effect/http';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

import { runSim } from './command.ts';
import { DriveLive, type Place } from './drive.ts';
import { fast } from './fixtures/fast-clock.ts';
import { decodeResult } from './fixtures/lines.ts';
import { probeApp } from './fixtures/probe.ts';
import { chooser, hymnPage, SHEET, snapshotOf, VERSES } from './fixtures/screens.ts';
import type { Session } from './result.ts';
import type { Node } from './screen.ts';

/** How the stand-in answers one run: its exit code and stdout, or a run that never ends. */
type Answer =
  | { readonly _tag: 'Exits'; readonly exitCode: number; readonly stdout: string }
  | { readonly _tag: 'Hangs' };

interface Spawned {
  readonly line: string;
  killed: boolean;
}

/** A spawner that answers each run by `script(line)` and records every run and kill. */
const standIn = (
  script: (line: string) => Answer,
  started: Option.Option<Deferred.Deferred<void>> = Option.none(),
) => {
  const runs: Array<Spawned> = [];
  const layer = Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make((command) =>
      Effect.gen(function* () {
        const line = lineOf(command);
        const run: Spawned = { line, killed: false };
        runs.push(run);
        if (Option.isSome(started)) yield* Deferred.completeWith(started.value, Effect.void);
        let answer = ok(`${STARTED}\n`);
        if (!isSelfRead(line)) answer = script(line);
        const { exitCode, stdout } = outputOf(answer);
        return ChildProcessSpawner.makeHandle({
          pid: ChildProcessSpawner.ProcessId(4242),
          exitCode,
          isRunning: Effect.succeed(answer._tag === 'Hangs'),
          kill: () => Effect.sync(() => void (run.killed = true)),
          stdin: Sink.drain,
          stdout,
          stderr: Stream.empty,
          all: stdout,
          getInputFd: () => Sink.drain,
          getOutputFd: () => Stream.empty,
          unref: Effect.succeed(Effect.void),
        });
      }),
    ),
  );
  return { layer, runs };
};

/** A run's exit code and stdout as its answer gives them. */
const outputOf = (answer: Answer) => {
  if (answer._tag === 'Hangs') return { exitCode: Effect.never, stdout: Stream.never };
  return {
    exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(answer.exitCode)),
    stdout: Stream.encodeText(Stream.make(answer.stdout)),
  };
};

const lineOf = (command: ChildProcess.Command) => {
  if (command._tag !== 'StandardCommand') return command._tag;
  return [command.command, ...command.args].join(' ');
};

const ok = (stdout = ''): Answer => ({ _tag: 'Exits', exitCode: 0, stdout });
const failed = (stdout = ''): Answer => ({ _tag: 'Exits', exitCode: 1, stdout });
const hangs: Answer = { _tag: 'Hangs' };

/** A dev server that answers every request 503: never ready. */
const ServerDown = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request) =>
    Effect.fail(
      new HttpClientError.HttpClientError({
        reason: new HttpClientError.TransportError({ request, description: 'refused' }),
      }),
    ),
  ),
);

const UDID = '9EB6603E-F956-4357-BB74-543644BC3E2C';

/** The start time `ps` reads for the stand-in server (and the command itself), and the one its session records. */
const STARTED = 'Wed Oct 21 00:00:00 2026';
const START_READ = 'ps -o lstart= -p 4242';
/** The command's own identity read (`Os.self`): a start-time read of any pid but the server's. */
const isSelfRead = (line: string) => line.startsWith('ps -o lstart= -p ') && line !== START_READ;

const session = (platform: Session['platform'], out: string): Session => ({
  platform,
  out,
  port: 8270,
  serverPid: 4242,
  udid: { ios: UDID, web: '' }[platform],
  bootedAt: '2026-10-21T00:00:00.000Z',
  serverStarted: STARTED,
});

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.toType(Schema.Unknown)));

/** A dev server that answers every request 200. */
const ServerUp = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request) =>
    Effect.succeed(HttpClientResponse.fromWeb(request, new Response('', { status: 200 }))),
  ),
);

/**
 * Run `sim <args>` over the stand-in, in a state folder of its own (with
 * `drive` as its session when given, and the dev server's log `serverLog`
 * and error output `serverErrors` in its output folder; `{state}` in an
 * argument names the folder), against `server`, its sleeps on the fast clock
 * (`fixtures/fast-clock.ts`): the lines it printed and its exit.
 */
const sim = (
  args: ReadonlyArray<string>,
  answers: ReturnType<typeof standIn>,
  drive: Option.Option<Session['platform']> = Option.none(),
  server: Layer.Layer<HttpClient.HttpClient> = ServerDown,
  serverLog = '',
  serverErrors = '',
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const state = yield* fs.makeTempDirectoryScoped();
    const out = path.join(state, 'out');
    if (Option.isSome(drive)) {
      yield* fs.writeFileString(
        path.join(state, 'session.json'),
        encodeJson(session(drive.value, out)),
      );
      yield* fs.makeDirectory(out, { recursive: true });
      yield* fs.writeFileString(path.join(out, 'server.log'), serverLog);
      yield* fs.writeFileString(path.join(out, 'server.err.log'), serverErrors);
    }
    const place: Place = {
      app: '/app',
      state,
      script: '/app/scripts/sim.ts',
      features: path.join(state, 'features'),
      warm: [],
      config: probeApp,
    };
    const printed: Array<string> = [];
    const console: Console.Console = {
      ...globalThis.console,
      log: (...line: ReadonlyArray<unknown>) => void printed.push(line.join(' ')),
      error: () => {},
    };
    const exit = yield* Effect.exit(
      runSim(place, [...args.map((arg) => arg.replace('{state}', state)), '--state', state]).pipe(
        Effect.provideService(Console.Console, console),
        fast,
      ),
    );
    return { exit, printed: printed.map((line) => decodeResult(line)) };
  }).pipe(Effect.provide(Layer.provideMerge(DriveLive, Layer.mergeAll(answers.layer, server))));

const Host = BunServices.layer;

/** One's refusal of a native module the installed build holds in another shape. */
const REFUSED = 'native module natural.Natural changed; rebuild the app';

/** A record of the app's log (`log show --style ndjson`) by process `pid`. */
const record = (pid: number, message: string) =>
  encodeJson({ processID: pid, eventMessage: message, category: 'javascript' });

/** A stand-in for a healthy drive: its server is its own and listening, the simulator booted, and the app's log since boot `records`, closed by `log show`'s count. */
const healthy = (records: ReadonlyArray<string>) =>
  standIn((line) => {
    if (line === START_READ) return ok(`${STARTED}\n`);
    if (line.startsWith('lsof')) return ok('4242\n');
    if (line.startsWith('xcrun simctl list devices'))
      return ok(
        encodeJson({ devices: { ios: [{ name: 'probe-sim', udid: UDID, state: 'Booted' }] } }),
      );
    if (line.includes(' log show --style ndjson '))
      return ok(['[', ...records, `{"count":${records.length},"finished":1}`].join('\n'));
    if (line === 'sysctl -n vm.loadavg') return ok('{ 1.00 1.00 1.00 }\n');
    if (line === 'sysctl -n hw.ncpu') return ok('12\n');
    return ok();
  });

describe('sim commands', () => {
  it.scoped('a tap on the web prints one success and clicks the label', () =>
    Effect.gen(function* () {
      const answers = standIn(() => ok());
      const { exit, printed } = yield* sim(
        ['tap', 'label=Play hymn 100'],
        answers,
        Option.some('web'),
      );
      expect(Exit.isSuccess(exit)).toBe(true);
      expect(printed).toHaveLength(1);
      expect(printed[0]).toMatchObject({ ok: true, command: 'tap', platform: 'web' });
      expect(answers.runs.map((run) => run.line)).toContain(
        'agent-browser --session probe-session click [aria-label="Play hymn 100"]',
      );
    }).pipe(Effect.provide(Host)),
  );

  it.scoped('a tap on a simulator that is not booted fails as SimulatorDown', () =>
    Effect.gen(function* () {
      const devices = encodeJson({
        devices: { ios: [{ name: 'probe-sim', udid: UDID, state: 'Shutdown' }] },
      });
      const answers = standIn((line) => {
        if (line.startsWith('xcrun simctl list devices')) return ok(devices);
        return ok();
      });
      const { exit, printed } = yield* sim(['tap', 'label=Hymns'], answers, Option.some('ios'));
      expect(Exit.isFailure(exit)).toBe(true);
      expect(printed).toHaveLength(1);
      expect(printed[0]).toMatchObject({
        ok: false,
        command: 'tap',
        error: { _tag: 'SimulatorDown', name: 'probe-sim', state: 'Shutdown' },
      });
      expect(answers.runs.some((run) => run.line.startsWith('agent-device'))).toBe(false);
    }).pipe(Effect.provide(Host)),
  );

  it.scoped('a tap on a target the page lacks fails as TargetMissing and clicks nothing', () =>
    Effect.gen(function* () {
      const answers = standIn((line) => {
        if (line.includes(' wait ')) return failed('timed out waiting for selector');
        return ok();
      });
      const { exit, printed } = yield* sim(['tap', 'label=Chords'], answers, Option.some('web'));
      expect(Exit.isFailure(exit)).toBe(true);
      expect(printed[0]).toMatchObject({
        ok: false,
        error: { _tag: 'TargetMissing', target: 'label=Chords', platform: 'web' },
      });
      expect(answers.runs.some((run) => run.line.includes(' click '))).toBe(false);
    }).pipe(Effect.provide(Host)),
  );

  it.scoped('a flag the command lacks prints BadArguments alone and runs nothing', () =>
    Effect.gen(function* () {
      const answers = standIn(() => ok());
      const { exit, printed } = yield* sim(
        ['tap', 'label=Hymns', '--bogus'],
        answers,
        Option.some('web'),
      );
      expect(Exit.isFailure(exit)).toBe(true);
      expect(printed).toHaveLength(1);
      expect(printed[0]).toMatchObject({
        ok: false,
        command: 'sim tap',
        error: { _tag: 'BadArguments', problems: [expect.stringContaining('--bogus')] },
      });
      expect(answers.runs).toHaveLength(0);
    }).pipe(Effect.provide(Host)),
  );

  it.scoped('a doctor whose server process is gone fails as Unhealthy at server-pid', () =>
    Effect.gen(function* () {
      const answers = standIn((line) => {
        if (line === START_READ) return failed();
        return ok();
      });
      const { exit, printed } = yield* sim(['doctor'], answers, Option.some('web'));
      expect(Exit.isFailure(exit)).toBe(true);
      expect(printed[0]).toMatchObject({
        ok: false,
        error: { _tag: 'Unhealthy', check: 'server-pid' },
      });
      expect(answers.runs.map((run) => run.line)).toEqual(['agent-browser --version', START_READ]);
    }).pipe(Effect.provide(Host)),
  );

  it.scoped('a doctor whose port another process holds fails as Unhealthy at port-owner', () =>
    Effect.gen(function* () {
      const answers = standIn((line) => {
        if (line.startsWith('lsof')) return ok('999\n');
        if (line === START_READ) return ok(`${STARTED}\n`);
        if (line.startsWith('ps')) return ok('1\n');
        return ok();
      });
      const { exit, printed } = yield* sim(['doctor'], answers, Option.some('web'));
      expect(Exit.isFailure(exit)).toBe(true);
      expect(printed[0]).toMatchObject({
        ok: false,
        error: { _tag: 'Unhealthy', check: 'port-owner', reason: expect.stringContaining('999') },
      });
    }).pipe(Effect.provide(Host)),
  );

  it.scoped('a doctor on iOS reads the app’s log since boot and passes a clean one', () =>
    Effect.gen(function* () {
      const answers = healthy([record(500, '[natural] install done')]);
      const { exit, printed } = yield* sim(['doctor'], answers, Option.some('ios'), ServerUp);
      expect(printed[0]).toMatchObject({ ok: true, command: 'doctor' });
      expect(Exit.isSuccess(exit)).toBe(true);
      expect(
        answers.runs.filter((run) =>
          /^xcrun simctl spawn \S+ log show --style ndjson --last \d+s --predicate process == "ProbeProcess"$/u.test(
            run.line,
          ),
        ),
      ).toHaveLength(1);
    }).pipe(Effect.provide(Host)),
  );

  it.scoped('a doctor on iOS fails at native-source when the latest process refused one', () =>
    Effect.gen(function* () {
      const answers = healthy([
        record(500, 'Running "main"'),
        record(
          500,
          `'Listen failed', { [Error: ${REFUSED}] }\n    at anonymous (index.bundle:1:2)`,
        ),
      ]);
      const { exit, printed } = yield* sim(['doctor'], answers, Option.some('ios'), ServerUp);
      expect(Exit.isFailure(exit)).toBe(true);
      expect(printed[0]).toMatchObject({
        ok: false,
        error: {
          _tag: 'Unhealthy',
          check: 'native-source',
          reason: expect.stringMatching(/refused 1 .*natural\.Natural changed.*sim install/u),
        },
      });
    }).pipe(Effect.provide(Host)),
  );

  it.scoped('a doctor on iOS passes a refusal of an earlier process alone', () =>
    Effect.gen(function* () {
      const answers = healthy([record(500, `Error: ${REFUSED}`), record(501, 'Running "main"')]);
      const { exit, printed } = yield* sim(['doctor'], answers, Option.some('ios'), ServerUp);
      expect(printed[0]).toMatchObject({ ok: true, command: 'doctor' });
      expect(Exit.isSuccess(exit)).toBe(true);
    }).pipe(Effect.provide(Host)),
  );

  it.scoped('a doctor reports a failing server log before it reads the app’s log', () =>
    Effect.gen(function* () {
      const answers = healthy([record(500, `Error: ${REFUSED}`)]);
      const { printed } = yield* sim(
        ['doctor'],
        answers,
        Option.some('ios'),
        ServerUp,
        'GET /index.bundle 500\n',
      );
      expect(printed[0]).toMatchObject({
        ok: false,
        error: { _tag: 'Unhealthy', check: 'server-log' },
      });
      expect(answers.runs.some((run) => run.line.includes(' log show '))).toBe(false);
    }).pipe(Effect.provide(Host)),
  );

  it.scoped(
    'a doctor fails at server-log when the server’s error output holds a failed render',
    () =>
      Effect.gen(function* () {
        const answers = healthy([record(500, 'Running "main"')]);
        const { exit, printed } = yield* sim(
          ['doctor'],
          answers,
          Option.some('web'),
          ServerUp,
          ' ⓵  [ssg] / → app/(hymnal)/index.tsx\n',
          "(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`\nError rendering / on server\n Unexpected token 'typeof'\n",
        );
        expect(Exit.isFailure(exit)).toBe(true);
        expect(printed[0]).toMatchObject({
          ok: false,
          error: {
            _tag: 'Unhealthy',
            check: 'server-log',
            reason: expect.stringMatching(
              /server\.err\.log reports 1 failures, first: Error rendering/u,
            ),
          },
        });
      }).pipe(Effect.provide(Host)),
  );

  it.scoped('a doctor on the web runs no xcrun', () =>
    Effect.gen(function* () {
      const answers = healthy([record(500, `Error: ${REFUSED}`)]);
      const { exit, printed } = yield* sim(['doctor'], answers, Option.some('web'), ServerUp);
      expect(printed[0]).toMatchObject({ ok: true, command: 'doctor', platform: 'web' });
      expect(Exit.isSuccess(exit)).toBe(true);
      expect(answers.runs.some((run) => run.line.startsWith('xcrun'))).toBe(false);
    }).pipe(Effect.provide(Host)),
  );

  it.scoped("a snapshot on the web keeps the page's accessibility tree", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const answers = standIn((line) => {
        if (line.endsWith(' snapshot'))
          return ok('- heading "Hymns"\n- link "100, Great Is Thy Faithfulness"\n');
        return ok();
      });
      const { exit, printed } = yield* sim(['snapshot', 'list'], answers, Option.some('web'));
      expect(Exit.isSuccess(exit)).toBe(true);
      expect(printed[0]).toMatchObject({ ok: true, command: 'snapshot', detail: { lines: 2 } });
      const file = `${printed[0]?.ok && printed[0].paths['snapshot']}`;
      expect(file).toEndWith('/out/snapshots/list.txt');
      expect(yield* fs.readFileString(file)).toContain('Great Is Thy Faithfulness');
    }).pipe(Effect.provide(Host)),
  );

  it.scoped("an iOS link answers the system's Open prompt once, as a reader taps it", () =>
    Effect.gen(function* () {
      const devices = encodeJson({
        devices: { ios: [{ name: 'probe-sim', udid: UDID, state: 'Booted' }] },
      });
      let prompts = 0;
      const answers = standIn((line) => {
        if (line.startsWith('xcrun simctl list devices')) return ok(devices);
        if (line.includes('Open in “Probe”?')) {
          prompts += 1;
          if (prompts > 1) return failed();
        }
        return ok();
      });
      const { exit, printed } = yield* sim(['open', 'hymns/100'], answers, Option.some('ios'));
      expect(Exit.isSuccess(exit)).toBe(true);
      expect(printed[0]).toMatchObject({
        ok: true,
        detail: { url: 'probe://hymns/100', prompts: 1 },
      });
      expect(answers.runs.filter((run) => run.line.includes('press label="Open"'))).toHaveLength(1);
    }).pipe(Effect.provide(Host)),
  );

  it.scoped(
    'an iOS open retried after a missing target hands the link over once the app is ready',
    () =>
      Effect.gen(function* () {
        const devices = encodeJson({
          devices: { ios: [{ name: 'probe-sim', udid: UDID, state: 'Booted' }] },
        });
        let waits = 0;
        const answers = standIn((line) => {
          if (line.startsWith('xcrun simctl list devices')) return ok(devices);
          if (line.includes('Open in “Probe”?')) return failed();
          if (line.startsWith('agent-device wait id="hymn-scroll"')) {
            waits += 1;
            if (waits === 1) return failed('wait timed out for selector: id="hymn-scroll"');
          }
          return ok();
        });
        const { exit, printed } = yield* sim(
          ['open', 'hymns/100', '--expect', 'id=hymn-scroll'],
          answers,
          Option.some('ios'),
        );
        expect(Exit.isSuccess(exit)).toBe(true);
        expect(printed[0]).toMatchObject({ ok: true, detail: { retried: true } });
        const steps = answers.runs
          .map((run) => run.line)
          .filter((line) => /simctl (?:terminate|openurl)|^agent-device (?:open|wait) /.test(line))
          .filter((line) => !line.includes('Open in'))
          .map((line) => line.replace(/ --.*$/, '').replace(UDID, '<udid>'));
        expect(steps).toEqual([
          'agent-device open app.probe.drive',
          'xcrun simctl openurl <udid> probe://hymns/100',
          'agent-device wait id="hymn-scroll" 30000',
          'xcrun simctl terminate <udid> app.probe.drive',
          'agent-device open app.probe.drive',
          'agent-device wait label="Probe Ready" 30000',
          'xcrun simctl openurl <udid> probe://hymns/100',
          'agent-device wait id="hymn-scroll" 30000',
        ]);
      }).pipe(Effect.provide(Host)),
  );

  it.scoped('a scroll before any open starts the app session, then scrolls', () =>
    Effect.gen(function* () {
      const devices = encodeJson({
        devices: { ios: [{ name: 'probe-sim', udid: UDID, state: 'Booted' }] },
      });
      let opened = false;
      const answers = standIn((line) => {
        if (line.startsWith('xcrun simctl list devices')) return ok(devices);
        if (line.startsWith('agent-device open')) opened = true;
        if (line.startsWith('agent-device snapshot') && !opened)
          return failed('SESSION_NOT_FOUND: no session named probe-session');
        if (line.startsWith('agent-device snapshot')) return ok(snapshotOf([]));
        return ok();
      });
      const { exit, printed } = yield* sim(
        ['scroll', 'screen', 'down'],
        answers,
        Option.some('ios'),
      );
      expect(Exit.isSuccess(exit)).toBe(true);
      expect(printed[0]).toMatchObject({ ok: true, command: 'scroll' });
      expect(
        answers.runs.filter((run) => run.line.startsWith('agent-device')).map((run) => run.line),
      ).toEqual([
        'agent-device snapshot --json --raw --session probe-session',
        `agent-device open app.probe.drive --platform ios --udid ${UDID} --session probe-session`,
        'agent-device snapshot --json --raw --session probe-session',
        'agent-device scroll down --settle --session probe-session',
      ]);
    }).pipe(Effect.provide(Host)),
  );

  /** A booted simulator whose snapshots answer, in turn, each of `screens` (the last again once they run out). */
  const screensIn = (screens: ReadonlyArray<ReadonlyArray<Node>>) => {
    let shown = 0;
    return standIn((line) => {
      if (line.startsWith('xcrun simctl list devices'))
        return ok(
          encodeJson({ devices: { ios: [{ name: 'probe-sim', udid: UDID, state: 'Booted' }] } }),
        );
      if (!line.startsWith('agent-device snapshot')) return ok();
      const screen = screens[Math.min(shown, screens.length - 1)] ?? [];
      shown += 1;
      return ok(snapshotOf(screen));
    });
  };

  const driven = (answers: ReturnType<typeof standIn>) =>
    answers.runs
      .filter((run) => run.line.startsWith('agent-device'))
      .map((run) => run.line.replace(' --session probe-session', ''));

  it.scopedLive(
    'a scroll of the screen pans inside its scroll view, not from the fixed footer, and says the content moved',
    () =>
      Effect.gen(function* () {
        const answers = screensIn([chooser(0), chooser(317)]);
        const { exit, printed } = yield* sim(
          ['scroll', 'screen', 'down'],
          answers,
          Option.some('ios'),
        );
        expect(Exit.isSuccess(exit)).toBe(true);
        expect(printed[0]).toMatchObject({
          ok: true,
          detail: { target: 'screen', direction: 'down', moved: true, pan: '201,598 by 0,-317' },
        });
        expect(driven(answers)).toEqual([
          'agent-device snapshot --json --raw',
          'agent-device gesture pan 201 598 0 -317 600',
          'agent-device snapshot --json --raw',
          'agent-device snapshot --json --raw',
        ]);
      }).pipe(Effect.provide(Host)),
  );

  it.scopedLive(
    "a scroll waits for the pan's fling to bring the content to rest, and judges the screen at rest",
    () =>
      Effect.gen(function* () {
        const flung = screensIn([chooser(0), chooser(200), chooser(317), chooser(317)]);
        const screen = yield* sim(['scroll', 'screen', 'down'], flung, Option.some('ios'));
        expect(Exit.isSuccess(screen.exit)).toBe(true);
        expect(driven(flung).filter((line) => line.includes('snapshot'))).toHaveLength(4);
        const toward = screensIn([chooser(0), chooser(2000), chooser(2400), chooser(2400)]);
        const row = yield* sim(
          ['scroll', 'label=Psalms 119:30', 'down'],
          toward,
          Option.some('ios'),
        );
        expect(Exit.isSuccess(row.exit)).toBe(true);
        expect(row.printed[0]).toMatchObject({ ok: true, detail: { passes: 1 } });
        expect(driven(toward).filter((line) => line.includes('gesture pan'))).toHaveLength(1);
      }).pipe(Effect.provide(Host)),
  );

  it.scopedLive(
    'a scroll whose pan leaves the content where it was, while the view hides more, fails ScrollStuck; at the end it is no fault',
    () =>
      Effect.gen(function* () {
        const stuck = yield* sim(
          ['scroll', 'screen', 'down'],
          screensIn([chooser(0), chooser(0)]),
          Option.some('ios'),
        );
        expect(Exit.isFailure(stuck.exit)).toBe(true);
        expect(stuck.printed[0]).toMatchObject({
          ok: false,
          error: { _tag: 'ScrollStuck', target: 'screen', direction: 'down' },
        });
        const top = yield* sim(
          ['scroll', 'screen', 'up'],
          screensIn([chooser(400), chooser(0), chooser(0)]),
          Option.some('ios'),
        );
        expect(Exit.isSuccess(top.exit)).toBe(true);
        const again = yield* sim(
          ['scroll', 'screen', 'up'],
          screensIn([chooser(0), chooser(0)]),
          Option.some('ios'),
        );
        expect(Exit.isSuccess(again.exit)).toBe(true);
        expect(again.printed[0]).toMatchObject({ ok: true, detail: { moved: false } });
      }).pipe(Effect.provide(Host)),
  );

  it.scopedLive(
    'a scroll over a sheet whose content fits pans the sheet and finds it at its end; one to a target past it fails TargetMissing, never ScrollStuck',
    () =>
      Effect.gen(function* () {
        const fits = hymnPage(116, Option.some(495), SHEET.height);
        const screen = yield* sim(
          ['scroll', 'screen', 'down'],
          screensIn([fits, fits]),
          Option.some('ios'),
        );
        expect(Exit.isSuccess(screen.exit)).toBe(true);
        expect(screen.printed[0]).toMatchObject({
          ok: true,
          detail: { moved: false, pan: '201,792 by 0,-223' },
        });
        const target = yield* sim(
          ['scroll', 'label=Nowhere', 'down'],
          screensIn([fits]),
          Option.some('ios'),
        );
        expect(Exit.isFailure(target.exit)).toBe(true);
        expect(target.printed[0]).toMatchObject({ ok: false, error: { _tag: 'TargetMissing' } });
      }).pipe(Effect.provide(Host)),
  );

  it.scopedLive(
    'a scroll to a target pans until its row shows, then stops; one past the content fails TargetMissing',
    () =>
      Effect.gen(function* () {
        const answers = screensIn([chooser(0), chooser(1300), chooser(1300), chooser(2400)]);
        const { exit, printed } = yield* sim(
          ['scroll', 'label=Psalms 119:30', 'down'],
          answers,
          Option.some('ios'),
        );
        expect(Exit.isSuccess(exit)).toBe(true);
        expect(printed[0]).toMatchObject({ ok: true, detail: { passes: 2 } });
        expect(driven(answers).filter((line) => line.includes('gesture pan'))).toHaveLength(2);
        const end = 8 + 176 * 88 - VERSES.height;
        const past = yield* sim(
          ['scroll', 'label=Psalms 120:1', 'down'],
          screensIn([chooser(end - 300), chooser(end)]),
          Option.some('ios'),
        );
        expect(Exit.isFailure(past.exit)).toBe(true);
        expect(past.printed[0]).toMatchObject({ ok: false, error: { _tag: 'TargetMissing' } });
      }).pipe(Effect.provide(Host)),
  );

  it.scoped('a target with a role clicks only elements of that role', () =>
    Effect.gen(function* () {
      const answers = standIn(() => ok());
      const { exit } = yield* sim(
        ['tap', 'role=link label=100, Great Is Thy Faithfulness'],
        answers,
        Option.some('web'),
      );
      expect(Exit.isSuccess(exit)).toBe(true);
      const click = answers.runs.find((run) => run.line.includes(' click '));
      expect(click?.line).toEndWith(
        'click [role="link"][aria-label="100, Great Is Thy Faithfulness"], a[aria-label="100, Great Is Thy Faithfulness"]',
      );
    }).pipe(Effect.provide(Host)),
  );

  it.scoped('install parses without --prebuild, and refuses the web', () =>
    Effect.gen(function* () {
      const answers = standIn(() => ok());
      const { printed } = yield* sim(['install'], answers, Option.some('web'));
      expect(printed[0]).toMatchObject({
        ok: false,
        command: 'install',
        error: { _tag: 'NotOnPlatform', platform: 'web' },
      });
    }).pipe(Effect.provide(Host)),
  );

  it.scoped('a command with no booted drive fails as NoSession', () =>
    Effect.gen(function* () {
      const answers = standIn(() => ok());
      const { exit, printed } = yield* sim(['shot'], answers);
      expect(Exit.isFailure(exit)).toBe(true);
      expect(printed[0]).toMatchObject({ ok: false, error: { _tag: 'NoSession' } });
      expect(answers.runs).toHaveLength(0);
    }).pipe(Effect.provide(Host)),
  );

  it.live('a boot whose dev server never answers fails as ReadinessTimedOut and stops it', () =>
    Effect.scoped(
      Effect.gen(function* () {
        let stopped = false;
        const answers = standIn((line) => {
          if (line.startsWith('/bin/sh')) return ok(`4242 ${STARTED}\n`);
          if (line === 'kill -s TERM 4242') stopped = true;
          if (line === START_READ && stopped) return failed();
          if (line === START_READ) return ok(`${STARTED}\n`);
          return ok();
        });
        const { exit, printed } = yield* sim(
          ['boot', '--platform', 'web', '--timeout', '1'],
          answers,
        );
        expect(Exit.isFailure(exit)).toBe(true);
        expect(printed[0]).toMatchObject({
          ok: false,
          command: 'boot',
          error: { _tag: 'ReadinessTimedOut', seconds: 1 },
        });
        expect(answers.runs.map((run) => run.line)).toContain('kill -s TERM 4242');
      }),
    ).pipe(Effect.provide(Host)),
  );

  it.scoped('serve kills the dev server it started when its scope closes', () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const answers = standIn(() => hangs, Option.some(started));
      const fiber = yield* Effect.forkChild(
        sim(['serve', '--port', '8270', '--out', '{state}/out'], answers),
      );
      yield* Deferred.await(started);
      expect(answers.runs[0]?.line).toStartWith('/bin/sh -c');
      expect(answers.runs[0]?.killed).toBe(false);
      yield* Fiber.interrupt(fiber);
      expect(answers.runs[0]?.killed).toBe(true);
    }).pipe(Effect.provide(Host)),
  );
});

describe('an app sim script on launch', () => {
  it.scoped('exits non-zero and prints the tagged error as JSON', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const state = yield* fs.makeTempDirectoryScoped();
      const script = path.join(import.meta.dirname, 'fixtures', 'sim.ts');
      const handle = yield* spawner.spawn(
        ChildProcess.make('bun', [script, 'tap', 'x', '--state', state], {
          forceKillAfter: '5 seconds',
        }),
      );
      const [stdout, exitCode] = yield* Effect.all(
        [Stream.mkString(Stream.decodeText(handle.stdout)), handle.exitCode],
        { concurrency: 2 },
      );
      expect(stdout.trim().split('\n')).toHaveLength(1);
      expect(exitCode).not.toBe(0);
      expect(decodeResult(stdout.trim())).toMatchObject({
        ok: false,
        command: 'tap',
        error: { _tag: 'NoSession' },
      });
    }).pipe(Effect.provide(Host)),
  );
});
