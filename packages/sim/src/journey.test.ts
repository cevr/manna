/**
 * `sim journey <feature>` over a stand-in `Drive`: the journey file decodes
 * or is refused naming its path and field, a run prints one JSON line per
 * step and a summary (each line also kept in `results.jsonl`), and the
 * first failed step stops the run, names itself, and still stops the video.
 */
import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Console, Effect, Exit, FileSystem, Option, Path, Schema } from 'effect';

import { runSim } from './command.ts';
import { Drive, type DriveMembers, type Outcome, type Place } from './drive.ts';
import { TargetMissing } from './errors.ts';
import { decodeJourneyLine } from './fixtures/lines.ts';
import { probeApp } from './fixtures/probe.ts';

interface Call {
  readonly op: string;
  readonly args: ReadonlyArray<unknown>;
}

const done: Outcome = { platform: 'ios', paths: {}, detail: {} };

/**
 * A booted iOS drive whose session writes to `out`. `missing` names the
 * targets that never show; every other step succeeds.
 */
const standIn = (calls: Array<Call>, out: string, missing: ReadonlyArray<string>): DriveMembers => {
  const step =
    (op: string) =>
    (...args: ReadonlyArray<unknown>) =>
      Effect.sync(() => {
        calls.push({ op, args: args.slice(1) });
        return done;
      });
  const receipt =
    (op: 'snapshot' | 'shot', extension: string) => (_place: Place, name: Option.Option<string>) =>
      Effect.sync((): Outcome => {
        calls.push({ op, args: [name] });
        const file = `${out}/${op}s/${Option.getOrElse(name, () => op)}.${extension}`;
        return { ...done, paths: { [op]: file } };
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
        port: 8270,
        serverPid: 1,
        udid: 'STAND-IN',
        bootedAt: '2026-10-30T00:00:00.000Z',
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
    shot: receipt('shot', 'png'),
    snapshot: receipt('snapshot', 'txt'),
    record: step('record'),
    log: step('log'),
    doctor: step('doctor'),
    down: step('down'),
    clean: step('clean'),
    gesture: step('gesture'),
    pinch: step('pinch'),
    hold: step('hold'),
    relaunch: step('relaunch'),
    sees: (_place, target, seconds) =>
      Effect.suspend(() => {
        calls.push({ op: 'sees', args: [target, seconds] });
        return seen(target);
      }),
  };
};

const journey = {
  feature: 'chords',
  platform: 'ios',
  steps: [
    {
      name: 'open-100',
      action: 'open',
      link: 'probe://hymns/100',
      expect: [{ shows: 'label=Stanza 1' }],
    },
    { name: 'hold-key', action: 'hold', target: 'id=key-button', receipt: 'snapshot' },
    { name: 'pan-dial', action: 'gesture', from: '120,640', dx: -52, dy: 0, receipt: 'none' },
    { name: 'panel-gone', action: 'back', expect: [{ hides: 'id=key-panel' }], receipt: 'shot' },
  ],
};

const toJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

/** Write `text` as `features/chords.journey.json` and run `sim <args>` over the stand-in. */
const runJourney = (text: string, args: ReadonlyArray<string>, missing: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped();
    const out = path.join(root, 'out');
    const features = path.join(root, 'features');
    yield* fs.makeDirectory(out);
    yield* fs.makeDirectory(features);
    yield* fs.writeFileString(path.join(features, 'chords.journey.json'), text);
    const app = path.join(root, 'app');
    const place: Place = {
      app,
      state: path.join(root, 'state'),
      script: path.join(app, 'scripts', 'sim.ts'),
      features,
      warm: ['/nonexistent/loop-probe-x'],
      config: probeApp,
    };
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
        Effect.provideService(Drive, standIn(calls, out, missing)),
      ),
    );
    const results = path.join(out, 'results.jsonl');
    const kept = yield* fs.readFileString(results).pipe(Effect.orElseSucceed(() => ''));
    return {
      exit,
      calls,
      file: path.join(features, 'chords.journey.json'),
      lines: printed.map((line) => decodeJourneyLine(line)),
      kept: kept
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => decodeJourneyLine(line)),
    };
  });

const ops = (calls: ReadonlyArray<Call>) => calls.map((call) => call.op);

describe('sim journey', () => {
  it.scoped('decodes a journey file, with receipt both and no expects by default', () =>
    Effect.gen(function* () {
      const run = yield* runJourney(
        toJson(journey),
        ['journey', 'chords', '--skip-video'],
        ['id=key-panel'],
      );
      expect(Exit.isSuccess(run.exit)).toBe(true);
      expect(run.lines).toHaveLength(5);
      expect(run.lines[4]).toMatchObject({ ok: true, steps: 4 });
      expect(ops(run.calls).slice(0, 5)).toEqual(['open', 'snapshot', 'shot', 'hold', 'snapshot']);
      expect(run.lines[0]).toMatchObject({
        step: 1,
        paths: { snapshot: expect.any(String), shot: expect.any(String) },
      });
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.scoped('refuses a bad journey file, naming its path and the field', () =>
    Effect.gen(function* () {
      const bad = {
        ...journey,
        steps: [{ name: 'pan', action: 'gesture', from: '1,2', dx: '-52', dy: 0 }],
      };
      const run = yield* runJourney(toJson(bad), ['journey', 'chords'], []);
      expect(Exit.isFailure(run.exit)).toBe(true);
      expect(run.calls).toEqual([]);
      expect(run.lines).toHaveLength(1);
      expect(run.lines[0]).toMatchObject({
        ok: false,
        error: { _tag: 'BadJourney', file: run.file, issue: expect.stringContaining('dx') },
      });
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.scoped('refuses an unknown step key and duplicate step names', () =>
    Effect.gen(function* () {
      const extra = { ...journey, steps: [{ name: 'a', action: 'back', wait: 3 }] };
      const twice = { ...journey, steps: [journey.steps[1], journey.steps[1]] };
      for (const body of [extra, twice]) {
        const run = yield* runJourney(toJson(body), ['journey', 'chords'], []);
        expect(Exit.isFailure(run.exit)).toBe(true);
        expect(run.calls).toEqual([]);
        expect(run.lines[0]).toMatchObject({
          ok: false,
          error: { _tag: 'BadJourney', file: run.file },
        });
      }
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.scoped('runs each step with its expects and receipts, one line per step and a summary', () =>
    Effect.gen(function* () {
      const run = yield* runJourney(toJson(journey), ['journey', 'chords'], ['id=key-panel']);
      expect(Exit.isSuccess(run.exit)).toBe(true);
      expect(ops(run.calls)).toEqual([
        'record',
        'open',
        'snapshot',
        'shot',
        'hold',
        'snapshot',
        'gesture',
        'back',
        'sees',
        'shot',
        'record',
      ]);
      expect(run.calls[0]?.args).toEqual(['start', Option.some('chords')]);
      expect(run.calls[1]?.args[1]).toEqual(Option.some('label=Stanza 1'));
      expect(run.calls[4]?.args).toEqual(['id=key-button', 900, 10]);
      expect(run.calls[6]?.args).toEqual([{ from: { x: 120, y: 640 }, dx: -52, dy: 0, ms: 900 }]);
      expect(run.calls[8]?.args).toEqual(['id=key-panel', 2]);
      expect(run.lines).toMatchObject([
        { ok: true, step: 1, name: 'open-100', action: 'open' },
        { ok: true, step: 2, name: 'hold-key', action: 'hold' },
        { ok: true, step: 3, name: 'pan-dial', action: 'gesture', paths: {} },
        { ok: true, step: 4, name: 'panel-gone', action: 'back' },
        { ok: true, command: 'journey', feature: 'chords', steps: 4 },
      ]);
      expect(run.lines[4]).not.toHaveProperty('step');
      expect(run.lines[0]).toMatchObject({
        paths: {
          snapshot: expect.stringMatching(/snapshots\/chords-01-open-100\.txt$/),
          shot: expect.stringMatching(/shots\/chords-01-open-100\.png$/),
        },
      });
      expect(run.kept).toEqual(run.lines);
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.scoped('a pinch step pinches on its target or point at its scale', () =>
    Effect.gen(function* () {
      const pinching = {
        feature: 'chords',
        platform: 'ios',
        steps: [
          { name: 'in', action: 'pinch', at: 'id=list', scale: 0.6, receipt: 'none' },
          { name: 'out', action: 'pinch', at: '200,400', scale: 1.6, receipt: 'none' },
        ],
      };
      const run = yield* runJourney(toJson(pinching), ['journey', 'chords'], []);
      expect(Exit.isSuccess(run.exit)).toBe(true);
      const pinches = run.calls.filter((call) => call.op === 'pinch');
      expect(pinches.map((call) => call.args)).toEqual([
        ['id=list', 0.6],
        [{ x: 200, y: 400 }, 1.6],
      ]);
      const bad = yield* runJourney(
        toJson({ ...pinching, steps: [{ name: 'in', action: 'pinch', at: 'id=list', scale: 5 }] }),
        ['journey', 'chords'],
        [],
      );
      expect(Exit.isFailure(bad.exit)).toBe(true);
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.scoped(
    "passes an open's first shows to the open, even after a hides, and checks it once",
    () =>
      Effect.gen(function* () {
        const opening = {
          ...journey,
          steps: [
            {
              name: 'open-100',
              action: 'open',
              link: 'probe://hymns/100',
              expect: [{ hides: 'id=spinner' }, { shows: 'label=Stanza 1' }],
              receipt: 'none',
            },
          ],
        };
        const run = yield* runJourney(
          toJson(opening),
          ['journey', 'chords', '--skip-video'],
          ['id=spinner'],
        );
        expect(Exit.isSuccess(run.exit)).toBe(true);
        expect(ops(run.calls)).toEqual(['open', 'sees']);
        expect(run.calls[0]?.args.slice(0, 3)).toEqual([
          'probe://hymns/100',
          Option.some('label=Stanza 1'),
          30,
        ]);
        expect(run.calls[1]?.args).toEqual(['id=spinner', 2]);
      }).pipe(Effect.provide(BunServices.layer)),
  );

  it.scoped(
    'stops at the first failed expect, names it, keeps its receipts and stops the video',
    () =>
      Effect.gen(function* () {
        const run = yield* runJourney(toJson(journey), ['journey', 'chords'], ['label=Stanza 1']);
        expect(Exit.isFailure(run.exit)).toBe(true);
        expect(ops(run.calls)).toEqual(['record', 'open', 'open', 'snapshot', 'shot', 'record']);
        expect(run.calls[5]?.args).toEqual(['stop', Option.none()]);
        expect(run.lines).toHaveLength(2);
        expect(run.lines[0]).toMatchObject({
          ok: false,
          step: 1,
          name: 'open-100',
          error: { _tag: 'TargetMissing', target: 'label=Stanza 1' },
        });
        expect(run.lines[1]).toMatchObject({
          ok: false,
          steps: 1,
          failedStep: 1,
          failedName: 'open-100',
        });
      }).pipe(Effect.provide(BunServices.layer)),
  );

  it.scoped('fails a hides expect whose target still shows, naming the target', () =>
    Effect.gen(function* () {
      const run = yield* runJourney(toJson(journey), ['journey', 'chords', '--skip-video'], []);
      expect(Exit.isFailure(run.exit)).toBe(true);
      expect(ops(run.calls).at(-3)).toBe('back');
      expect(ops(run.calls)).not.toContain('record');
      expect(run.lines[3]).toMatchObject({
        error: { _tag: 'TargetShown', target: 'id=key-panel' },
      });
      expect(run.lines[4]).toMatchObject({ failedStep: 4, failedName: 'panel-gone' });
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.scoped('runs nothing for a journey file that is missing or names another feature', () =>
    Effect.gen(function* () {
      for (const [body, feature] of [
        [journey, 'absent'],
        [{ ...journey, feature: 'other' }, 'chords'],
      ] as const) {
        const run = yield* runJourney(toJson(body), ['journey', feature], []);
        expect(Exit.isFailure(run.exit)).toBe(true);
        expect(run.calls).toEqual([]);
        expect(run.lines).toHaveLength(1);
        expect(run.lines[0]).toMatchObject({ ok: false, error: { _tag: 'BadJourney' } });
      }
    }).pipe(Effect.provide(BunServices.layer)),
  );
});
