/**
 * `sim doctor` checks the platform's driver before anything else: with
 * `agent-device` not found on this process's PATH, it fails as `Unhealthy`
 * at `driver`, naming the tool, and runs nothing after it, where it once
 * answered ok and every step of the next journey failed `ToolMissing`.
 */
import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Console, Effect, Exit, FileSystem, Layer, Path, Schema } from 'effect';
import { HttpClient, HttpClientError } from 'effect/http';
import * as PlatformError from 'effect/PlatformError';
import { type ChildProcess, ChildProcessSpawner } from 'effect/process';

import { runSim } from './command.ts';
import { DriveLive, type Place } from './drive.ts';
import { decodeResult } from './fixtures/lines.ts';
import { probeApp } from './fixtures/probe.ts';
import type { Session } from './result.ts';

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.toType(Schema.Unknown)));

const lineOf = (command: ChildProcess.Command) => {
  if (command._tag !== 'StandardCommand') return command._tag;
  return [command.command, ...command.args].join(' ');
};

/** A host on which no tool is found: every spawn fails as the platform's NotFound, and each is recorded. */
const nothingFound = () => {
  const lines: Array<string> = [];
  const layer = Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make((command) =>
      Effect.gen(function* () {
        lines.push(lineOf(command));
        return yield* PlatformError.systemError({
          _tag: 'NotFound',
          module: 'ChildProcess',
          method: 'spawn',
        });
      }),
    ),
  );
  return { layer, lines };
};

const Unreachable = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request) =>
    Effect.fail(
      new HttpClientError.HttpClientError({
        reason: new HttpClientError.TransportError({ request, description: 'refused' }),
      }),
    ),
  ),
);

const UDID = { ios: '9EB6603E-F956-4357-BB74-543644BC3E2C', web: '' };

/** `sim doctor` over a drive of `platform` booted on a host where no tool is found: its exit, the tools it ran, and what it printed. */
const doctorOn = (platform: Session['platform']) => {
  const host = nothingFound();
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const state = yield* fs.makeTempDirectoryScoped();
    const session: Session = {
      platform,
      out: path.join(state, 'out'),
      port: 8270,
      serverPid: 4242,
      udid: UDID[platform],
      bootedAt: '2026-10-21T00:00:00.000Z',
      serverStarted: 'Wed Oct 21 00:00:00 2026',
    };
    yield* fs.writeFileString(path.join(state, 'session.json'), encodeJson(session));
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
      runSim(place, ['doctor', '--state', state]).pipe(
        Effect.provideService(Console.Console, console),
      ),
    );
    return { exit, lines: host.lines, printed: printed.map((line) => decodeResult(line)) };
  }).pipe(Effect.provide(Layer.provideMerge(DriveLive, Layer.mergeAll(host.layer, Unreachable))));
};

describe('sim doctor', () => {
  it.scoped(
    "fails at driver when the platform's driver is not found, naming it, and runs nothing after",
    () =>
      Effect.forEach(
        [
          ['ios', 'agent-device'],
          ['web', 'agent-browser'],
        ] as const,
        ([platform, driver]) =>
          Effect.gen(function* () {
            const { exit, lines, printed } = yield* doctorOn(platform);
            expect(Exit.isFailure(exit)).toBe(true);
            expect(printed).toHaveLength(1);
            expect(printed[0]).toMatchObject({
              ok: false,
              command: 'doctor',
              error: {
                _tag: 'Unhealthy',
                check: 'driver',
                reason: expect.stringContaining(driver),
              },
            });
            expect(lines).toEqual([`${driver} --version`]);
          }),
      ).pipe(Effect.provide(BunServices.layer)),
  );
});
