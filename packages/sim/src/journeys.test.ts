/**
 * `sim journeys <file>.md` over a stand-in `Drive`: the feature file's
 * lists are read in written order (`src/fixtures/journeys/probe.md`), each
 * starts where it says, every journey plays whether the one before it
 * passed or not, a failed one is named with its first failed step and the
 * journey that ran before it, and no step takes a shot or a video, whatever
 * its receipt says. `sim journey --no-shots` keeps each snapshot alone.
 */
import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Console, Effect, Exit, Fiber, FileSystem, Option, Path, Schema } from 'effect';
import * as TestClock from 'effect/testing/TestClock';

import type { App } from './app.ts';
import { runSim } from './command.ts';
import { Drive, type DriveMembers, type Outcome, type Place } from './drive.ts';
import { BadJourney, TargetMissing } from './errors.ts';
import { probeApp } from './fixtures/probe.ts';
import { readJourneyLists } from './journeys.ts';

interface Call {
  readonly op: string;
  readonly args: ReadonlyArray<unknown>;
}

const done: Outcome = { platform: 'ios', paths: {}, detail: {} };

const stored: App = { ...probeApp, store: { file: 'Library/probe-kv.sqlite', table: 'probe_kv' } };

/** A booted iOS drive writing to `out`, on which `missing` never shows and every other step succeeds. */
const standIn = (calls: Array<Call>, out: string, missing: ReadonlyArray<string>): DriveMembers => {
  const step =
    (op: string) =>
    (...args: ReadonlyArray<unknown>) =>
      Effect.sync(() => {
        calls.push({ op, args: args.slice(1) });
        return done;
      });
  const seen = (target: string) =>
    Effect.when(
      Effect.fail(TargetMissing.make({ target, platform: 'ios', driver: 'stand-in' })),
      Effect.sync(() => missing.includes(target)),
    ).pipe(Effect.asVoid);
  return {
    readSession: () =>
      Effect.succeed({
        platform: 'ios',
        out,
        port: 9104,
        serverPid: 1,
        udid: 'STAND-IN',
        bootedAt: '2026-11-13T00:00:00.000Z',
      }),
    boot: step('boot'),
    install: step('install'),
    open: (_place, link, expect, seconds, options) =>
      Effect.suspend(() => {
        calls.push({ op: 'open', args: [link, expect, seconds, options] });
        return Option.match(expect, { onNone: () => Effect.void, onSome: seen }).pipe(
          Effect.as(done),
        );
      }),
    tap: step('tap'),
    fill: step('fill'),
    back: step('back'),
    scroll: step('scroll'),
    shot: step('shot'),
    snapshot: step('snapshot'),
    read: step('read'),
    record: step('record'),
    log: step('log'),
    doctor: step('doctor'),
    down: step('down'),
    clean: step('clean'),
    gesture: step('gesture'),
    pinch: step('pinch'),
    hold: step('hold'),
    relaunch: step('relaunch'),
    freshInstall: step('freshInstall'),
    setStore: step('setStore'),
    sees: (_place, target, seconds) =>
      Effect.suspend(() => {
        calls.push({ op: 'sees', args: [target, seconds] });
        return seen(target);
      }),
  };
};

const decodeLine = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown));

/**
 * Run `sim <args>` over the stand-in with the fixture folder as the
 * features, the test clock moved on a minute at a time until it ends.
 */
const runOver = (args: ReadonlyArray<string>, missing: ReadonlyArray<string>, config = stored) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped();
    const out = path.join(root, 'out');
    yield* fs.makeDirectory(out);
    const features = yield* path.fromFileUrl(new URL('./fixtures/journeys', import.meta.url));
    const app = path.join(root, 'app');
    const place: Place = {
      app,
      state: path.join(root, 'state'),
      script: path.join(app, 'scripts', 'sim.ts'),
      features,
      warm: ['/nonexistent/loop-probe-x'],
      config,
    };
    const calls: Array<Call> = [];
    const printed: Array<string> = [];
    const console: Console.Console = {
      ...globalThis.console,
      log: (...line: ReadonlyArray<unknown>) => void printed.push(line.join(' ')),
      error: () => {},
    };
    const fiber = yield* Effect.forkChild(
      Effect.exit(
        runSim(place, args).pipe(
          Effect.provideService(Console.Console, console),
          Effect.provideService(Drive, standIn(calls, out, missing)),
        ),
      ),
    );
    yield* Effect.forkChild(
      Effect.forever(TestClock.adjust('1 minute').pipe(Effect.andThen(Effect.yieldNow))),
    );
    const exit = yield* Fiber.join(fiber);
    const kept = yield* fs
      .readFileString(path.join(out, 'results.jsonl'))
      .pipe(Effect.orElseSucceed(() => ''));
    return {
      exit,
      calls,
      lines: printed.map((line) => decodeLine(line)),
      kept: kept
        .split('\n')
        .filter(Boolean)
        .map((line) => decodeLine(line)),
    };
  });

const ops = (calls: ReadonlyArray<Call>) => calls.map((call) => call.op);

describe('sim journeys', () => {
  it.effect('reads the lists of a feature file in their written order, and nothing else', () =>
    Effect.gen(function* () {
      const text = [
        'Prose that names `sim journey zeta` is no list.',
        '**Journeys in order:** from a fresh install: `alpha`, `beta`, then `gamma`.',
        '- **Journeys in order:** from a relaunch, the store set to `chords=false`, `home.tab="Sections"`: `gamma`, `1 min`, `alpha`.',
      ].join('\n');
      const runs = yield* readJourneyLists('probe.md', text);
      expect(runs).toEqual([
        {
          line: 2,
          start: 'fresh install',
          store: [],
          items: ['alpha', 'beta', 'gamma'].map((feature) => ({ kind: 'journey', feature })),
        },
        {
          line: 3,
          start: 'relaunch',
          store: [
            ['chords', 'false'],
            ['home.tab', '"Sections"'],
          ],
          items: [
            { kind: 'journey', feature: 'gamma' },
            { kind: 'wait', minutes: 1 },
            { kind: 'journey', feature: 'alpha' },
          ],
        },
      ]);
    }),
  );

  it.effect('refuses a list it cannot read, naming its line', () =>
    Effect.gen(function* () {
      for (const [line, issue] of [
        ['**Journeys in order:** `alpha`', "no ':'"],
        ['**Journeys in order:** from a reinstall: `alpha`', 'its start'],
        ['**Journeys in order:** from a relaunch: `alpha` or `beta`', 'backticked words only'],
        ['**Journeys in order:** from a relaunch: `Alpha`', 'no journey name'],
        ['**Journeys in order:** from a relaunch: `2 min`', 'names no journey'],
        ['**Journeys in order:** from a relaunch, the store set to `chords`: `alpha`', 'key=value'],
        ['Only prose.', 'no **Journeys in order:** line'],
      ] as const) {
        const refused = yield* Effect.flip(readJourneyLists('probe.md', `# Probe\n${line}`));
        expect(refused).toBeInstanceOf(BadJourney);
        expect(refused.issue).toContain(issue);
      }
    }),
  );

  it.scoped(
    'plays each list from its start in order, every journey, naming the failed step and the journey before it, with no shot or video',
    () =>
      Effect.gen(function* () {
        const run = yield* runOver(['journeys', 'probe.md'], ['label=Practice anyway']);
        expect(Exit.isFailure(run.exit)).toBe(true);
        const starts = run.calls.filter((call) =>
          ['freshInstall', 'setStore', 'relaunch'].includes(call.op),
        );
        expect(starts).toEqual([
          { op: 'freshInstall', args: [180] },
          { op: 'relaunch', args: [] },
          {
            op: 'setStore',
            args: [
              [
                ['chords', 'false'],
                ['home.tab', '"Sections"'],
              ],
            ],
          },
          { op: 'relaunch', args: [] },
          { op: 'relaunch', args: [] },
        ]);
        expect(ops(run.calls)).not.toContain('shot');
        expect(ops(run.calls)).not.toContain('record');
        const summary = run.lines.at(-1);
        expect(summary).toMatchObject({
          ok: false,
          command: 'journeys',
          journeys: [
            { feature: 'alpha', ok: true, line: 8, after: 'from a fresh install', steps: 2 },
            {
              feature: 'beta',
              ok: false,
              line: 8,
              after: 'alpha',
              steps: 2,
              failedStep: 2,
              failedName: 'beta-card',
              error: { _tag: 'TargetMissing', target: 'label=Practice anyway' },
            },
            { feature: 'gamma', ok: true, line: 8, after: 'beta', steps: 1 },
            { feature: 'gamma', ok: true, line: 12, after: 'from a relaunch', steps: 1 },
            { feature: 'alpha', ok: true, line: 12, after: 'gamma', steps: 2 },
          ],
        });
        expect(run.kept.at(-1)).toEqual(summary);
        expect(run.kept).toHaveLength(run.lines.length);
      }).pipe(Effect.provide(BunServices.layer)),
  );

  it.scoped(
    'a run ends ok when every journey passes, and an app with no store is refused a list that sets it',
    () =>
      Effect.gen(function* () {
        const passed = yield* runOver(['journeys', 'probe.md'], []);
        expect(Exit.isSuccess(passed.exit)).toBe(true);
        expect(passed.lines.at(-1)).toMatchObject({ ok: true, command: 'journeys' });
        const refused = yield* runOver(['journeys', 'probe.md'], [], probeApp);
        expect(Exit.isFailure(refused.exit)).toBe(true);
        expect(refused.calls).toEqual([]);
        expect(refused.lines).toMatchObject([
          { ok: false, command: 'journeys', error: { _tag: 'BadJourney' } },
        ]);
      }).pipe(Effect.provide(BunServices.layer)),
  );

  it.scoped('sim journey --no-shots keeps each snapshot alone and takes no video', () =>
    Effect.gen(function* () {
      const run = yield* runOver(['journey', 'alpha', '--no-shots'], []);
      expect(Exit.isSuccess(run.exit)).toBe(true);
      expect(ops(run.calls)).toEqual(['open', 'snapshot', 'tap']);
      const loud = yield* runOver(['journey', 'alpha'], []);
      expect(ops(loud.calls)).toEqual([
        'record',
        'open',
        'snapshot',
        'shot',
        'tap',
        'shot',
        'record',
      ]);
    }).pipe(Effect.provide(BunServices.layer)),
  );
});
