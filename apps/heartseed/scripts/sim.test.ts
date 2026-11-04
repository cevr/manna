/**
 * Heartseed's `sim`, over a stand-in Drive: the adapter holds the values the
 * verify-heartseed skill drives by; a web ask or a port outside 8280-8289 is
 * refused before any step, while 8280 and 8289 reach `boot`; and `install`
 * unasked waits for Today showing its reference.
 */
import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { runSim } from '@manna/sim/command';
import { Drive, type DriveMembers, type Place } from '@manna/sim/drive';
import { Console, Effect, Exit, Option, Path, Schema } from 'effect';

import { app } from './sim-app.ts';

const PROBE = '/nonexistent/loop-probe-x';

/** Heartseed's own folder, so `boot` finds the Hermes compiler its react-native depends on. */
const place = Effect.gen(function* () {
  const path = yield* Path.Path;
  const script = yield* path.fromFileUrl(new URL('./sim.ts', import.meta.url));
  return {
    app: path.dirname(path.dirname(script)),
    state: `${PROBE}/state`,
    script,
    features: `${PROBE}/features`,
    warm: [],
    config: app,
  } satisfies Place;
});

interface Call {
  readonly step: string;
  readonly args: ReadonlyArray<unknown>;
}

/** A Drive whose every step records its name and arguments, and changes nothing. */
const standIn = (calls: Array<Call>): DriveMembers => {
  const step =
    (name: string) =>
    (...args: ReadonlyArray<unknown>) =>
      Effect.sync(() => {
        calls.push({ step: name, args });
        return { platform: 'ios' as const, paths: {}, detail: {} };
      });
  return {
    readSession: () => Effect.die('no command here reads the session'),
    boot: step('boot'),
    install: step('install'),
    open: step('open'),
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
    sees: (...args) => Effect.sync(() => void calls.push({ step: 'sees', args })),
    gesture: step('gesture'),
    pinch: step('pinch'),
    hold: step('hold'),
    relaunch: step('relaunch'),
    clean: step('clean'),
  };
};

/** The one line a refused command prints, as a reader of its output takes it. */
const Refusal = Schema.fromJsonString(
  Schema.Struct({
    ok: Schema.Literal(false),
    error: Schema.Struct({ _tag: Schema.String }),
  }),
);

/** Run `sim <args>` over the stand-in: its exit, the steps it called and the lines it printed. */
const sim = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const calls: Array<Call> = [];
    const printed: Array<string> = [];
    const console: Console.Console = {
      ...globalThis.console,
      log: (...line: ReadonlyArray<unknown>) => void printed.push(line.join(' ')),
      error: () => {},
    };
    const exit = yield* Effect.exit(
      runSim(yield* place, args).pipe(
        Effect.provideService(Console.Console, console),
        Effect.provideService(Drive, standIn(calls)),
      ),
    );
    return { exit, calls, printed };
  }).pipe(Effect.provide(BunServices.layer));

/** `sim <args>` fails with one `BadArguments` line and calls no step. */
const refused = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const { exit, calls, printed } = yield* sim(args);
    expect(Exit.isFailure(exit)).toBe(true);
    expect(printed).toHaveLength(1);
    const line = yield* Schema.decodeUnknownEffect(Refusal)(printed[0]);
    expect(line.error._tag).toBe('BadArguments');
    expect(calls).toEqual([]);
  });

describe("Heartseed's sim", () => {
  it.effect(
    'drives verify-heartseed, an iPhone 17 running app.heartseed, on 8280-8289, iOS alone',
    () =>
      Effect.sync(() =>
        expect(app).toMatchObject({
          simulator: 'verify-heartseed',
          deviceType: 'iPhone 17',
          bundleId: 'app.heartseed',
          urlScheme: 'heartseed',
          driverSession: 'verify-heartseed',
          ports: { min: 8280, max: 8289, default: 8280 },
          readyTarget: 'label=Isaiah 41:10',
          platforms: ['ios'],
          ios: {
            workspace: 'ios/Heartseed.xcworkspace',
            scheme: 'Heartseed',
            app: 'Heartseed.app',
            infoPlist: 'ios/Heartseed/Info.plist',
            logProcess: 'Heartseed',
          },
          openPrompt: 'label="Open in “Heartseed”?"',
          cleanPaths: ['ios/build'],
        }),
      ),
  );

  it.effect('refuses a web ask before any step', () =>
    Effect.forEach(
      [
        ['boot', '--platform', 'web'],
        ['boot', '--platform=web'],
        ['boot', '--platform', 'ios', '--platform', 'web'],
        ['open', '/', '--platform', 'web'],
      ],
      refused,
      { discard: true },
    ),
  );

  it.effect('refuses a port outside 8280-8289 before any step', () =>
    Effect.forEach(
      [
        ['boot', '--port', '8279'],
        ['boot', '--port', '8290'],
      ],
      refused,
      {
        discard: true,
      },
    ),
  );

  it.effect('boots iOS on either end of 8280-8289', () =>
    Effect.forEach(
      [8280, 8289],
      (port) =>
        Effect.gen(function* () {
          const { exit, calls } = yield* sim(['boot', '--port', String(port)]);
          expect(Exit.isSuccess(exit)).toBe(true);
          expect(calls).toHaveLength(1);
          expect(calls[0]).toMatchObject({ step: 'boot', args: [{}, { platform: 'ios', port }] });
        }),
      { discard: true },
    ),
  );

  it.effect('builds with no prebuild asked and waits for Today showing Isaiah 41:10', () =>
    Effect.gen(function* () {
      const { exit, calls } = yield* sim(['install']);
      expect(Exit.isSuccess(exit)).toBe(true);
      expect(calls).toHaveLength(1);
      expect(calls[0]?.step).toBe('install');
      expect(calls[0]?.args[1]).toEqual({
        app: Option.none(),
        prebuild: false,
        expect: 'label=Isaiah 41:10',
        seconds: 180,
      });
    }),
  );
});
