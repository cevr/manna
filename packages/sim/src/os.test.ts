/**
 * The stop rule (`os.ts` `stop`) over a scripted `Os` and the test clock:
 * each signal follows a start-time read that found the recorded process, at
 * the same instant, with no other host call between (no tool, no wait, no
 * identity read of its own); the rule reaches the host only through `Os`,
 * never by a tool of its own such as `kill -0`; and a pid that is not an
 * integer of 2 or more, or that another process holds, is never signalled.
 */
import { describe, expect, it } from 'effect-bun-test';
import { Clock, Effect, Exit, Fiber, Option } from 'effect';
import { type ChildProcess, ChildProcessSpawner } from 'effect/process';
import * as TestClock from 'effect/testing/TestClock';

import { type Identity, Os, stop } from './os.ts';

const PID = 4_000_123;
const START = 'Tue Nov 3 21:00:00 2026';
const FOREIGN = 'Tue Nov 3 21:00:07 2026';

/** How the process holding the pid answers the signals: it ends on SIGTERM, on SIGKILL only, gives its pid to another on SIGTERM, or outlives both. */
type Behaviour = 'obeys' | 'stubborn' | 'replaced' | 'immortal';

/** One host call the rule made, at the test clock's time. */
type Call =
  | {
      readonly _tag: 'started';
      readonly at: number;
      readonly pid: number;
      readonly now: Option.Option<string>;
    }
  | {
      readonly _tag: 'signal';
      readonly at: number;
      readonly pid: number;
      readonly signal: 'SIGTERM' | 'SIGKILL';
    }
  | { readonly _tag: 'tool'; readonly at: number; readonly line: string };

/** What a read of `pid` finds: the holder of the scripted pid, none for any other, or the recorded start for every pid (`any`). */
const readOf = (behaviour: Behaviour | 'any', pid: number, holder: Option.Option<string>) => {
  if (behaviour === 'any') return Option.some(START);
  if (pid === PID) return holder;
  return Option.none<string>();
};

const lineOf = (command: ChildProcess.Command) => {
  if (command._tag !== 'StandardCommand') return command._tag;
  return [command.command, ...command.args].map(String).join(' ');
};

/** A host of one pid whose holder follows `behaviour`, or (`any`) one where every pid reads back as the recorded start. */
const scripted = (behaviour: Behaviour | 'any', holder: Option.Option<string>) => {
  const calls: Array<Call> = [];
  let now = holder;
  const os: (typeof Os)['Service'] = {
    spawn: () => Effect.die('the stop rule starts nothing'),
    self: Effect.die('the stop rule reads no identity of its own'),
    started: (pid) =>
      Effect.map(Clock.currentTimeMillis, (at) => {
        const answer = readOf(behaviour, pid, now);
        calls.push({ _tag: 'started', at, pid, now: answer });
        return answer;
      }),
    signal: (pid, signal) =>
      Effect.map(Clock.currentTimeMillis, (at) => {
        calls.push({ _tag: 'signal', at, pid, signal });
        if (pid !== PID || Option.isNone(now)) return false;
        if (behaviour === 'replaced' && signal === 'SIGTERM') now = Option.some(FOREIGN);
        if (behaviour === 'obeys' && signal === 'SIGTERM') now = Option.none();
        if (behaviour === 'stubborn' && signal === 'SIGKILL') now = Option.none();
        return true;
      }),
  };
  const spawner = ChildProcessSpawner.make((command) =>
    Effect.flatMap(Clock.currentTimeMillis, (at) => {
      const line = lineOf(command);
      calls.push({ _tag: 'tool', at, line });
      return Effect.die(`the stop rule ran a tool: ${line}`);
    }),
  );
  return { calls, os, spawner };
};

/** Run the stop rule on `owned` over the scripted host, the test clock moved past every wait. */
const run = (owned: Identity, host: ReturnType<typeof scripted>) =>
  Effect.gen(function* () {
    const fiber = yield* Effect.forkChild(
      stop(owned).pipe(
        Effect.provideService(Os, host.os),
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, host.spawner),
      ),
    );
    yield* TestClock.adjust('30 seconds');
    return yield* Fiber.await(fiber);
  });

/** Each signal whose host call just before is not a read, at the same instant, that found the recorded process. */
const unread = (calls: ReadonlyArray<Call>) =>
  calls.flatMap((call, at) => {
    if (call._tag !== 'signal') return [];
    const before = calls[at - 1];
    const read =
      before?._tag === 'started' &&
      before.pid === call.pid &&
      before.at === call.at &&
      Option.contains(before.now, START);
    if (read) return [];
    return [{ call, before }];
  });

const signals = (calls: ReadonlyArray<Call>) =>
  calls.flatMap((call) => {
    if (call._tag !== 'signal') return [];
    return [call.signal];
  });

const tools = (calls: ReadonlyArray<Call>) => calls.filter((call) => call._tag === 'tool');

const owned: Identity = { pid: PID, started: START };

describe('the stop rule', () => {
  it.effect('a process that ends on SIGTERM gets one SIGTERM, right after its read', () =>
    Effect.gen(function* () {
      const host = scripted('obeys', Option.some(START));
      expect(yield* run(owned, host)).toEqual(Exit.succeed(true));
      expect(signals(host.calls)).toEqual(['SIGTERM']);
      expect(unread(host.calls)).toEqual([]);
      expect(tools(host.calls)).toEqual([]);
    }),
  );

  it.effect(
    'a process that outlives SIGTERM gets SIGKILL past the wait, after a read of its own at that instant',
    () =>
      Effect.gen(function* () {
        const host = scripted('stubborn', Option.some(START));
        expect(yield* run(owned, host)).toEqual(Exit.succeed(true));
        expect(signals(host.calls)).toEqual(['SIGTERM', 'SIGKILL']);
        expect(unread(host.calls)).toEqual([]);
        expect(tools(host.calls)).toEqual([]);
      }),
  );

  it.effect('a pid another process takes after SIGTERM gets no SIGKILL', () =>
    Effect.gen(function* () {
      const host = scripted('replaced', Option.some(START));
      expect(yield* run(owned, host)).toEqual(Exit.succeed(true));
      expect(signals(host.calls)).toEqual(['SIGTERM']);
      expect(unread(host.calls)).toEqual([]);
      expect(tools(host.calls)).toEqual([]);
    }),
  );

  it.effect('a process that outlives SIGKILL fails the stop, after one of each signal', () =>
    Effect.gen(function* () {
      const host = scripted('immortal', Option.some(START));
      const exit = yield* run(owned, host);
      expect(Exit.isFailure(exit)).toBe(true);
      expect(signals(host.calls)).toEqual(['SIGTERM', 'SIGKILL']);
      expect(unread(host.calls)).toEqual([]);
      expect(tools(host.calls)).toEqual([]);
    }),
  );

  it.effect('a pid gone, or held by another process, gets no signal', () =>
    Effect.gen(function* () {
      for (const holder of [Option.none<string>(), Option.some(FOREIGN)]) {
        const host = scripted('obeys', holder);
        expect(yield* run(owned, host)).toEqual(Exit.succeed(false));
        expect(signals(host.calls)).toEqual([]);
        expect(tools(host.calls)).toEqual([]);
      }
    }),
  );

  it.effect(
    'a pid that is not an integer of 2 or more gets no signal, whatever its read says',
    () =>
      Effect.gen(function* () {
        for (const pid of [-1, 0, 1, -4242, 2.5, Number.NaN]) {
          const host = scripted('any', Option.some(START));
          expect(yield* run({ pid, started: START }, host)).toEqual(Exit.succeed(false));
          expect(signals(host.calls)).toEqual([]);
        }
      }),
  );
});
