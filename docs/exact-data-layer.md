# The Exact data layer: way 1, Effect's runtime runs through `@manna/exact-kit/effect`

Both ports keep their logic in Effect 4.1.2: services, layers, streams, schedules and `KeyValueStore` run inside Exact's data module (`app.ts`), on Hermes natively and in the page on the web, when each call runs through `runCall` or `runCallSync` from `@manna/exact-kit/effect`. The pure modules need nothing; anything that reads the clock or draws a random number needs the runner.

## The evidence

The lab app `packages/exact-kit/lab/heartseed-exact` (bundle id `app.manna.exactlab`, on `verify-heartseed-exact`) has a button per probe row. Each runs one program in one mode and shows what happened. The expected outcomes are one file, `packages/exact-kit/lab/heartseed-exact/probe-table.json`. Bun asserts it (`packages/exact-kit/src/effect/probe.test.ts`, every row under `withDataHost`), and the lab's contract test, written from the same file, asserts it on the web (`bun run exact test web --port 8774`) and on iOS (`bun run exact test ios`): green on both at the pin `0fa708e34ef4`.

| Row                                               | Effect's defaults | Through the runner |
| ------------------------------------------------- | ----------------- | ------------------ |
| import `effect`, `effect/persistence`, the runner | ran               | ran                |
| `Option`, `Match`, `Schema` decode, `Order`       | ran               | ran                |
| `Effect.runSync` of a pure effect                 | ran               | ran                |
| `Effect.sleep`                                    | ran               | ran                |
| `Clock.currentTimeMillis`                         | refused clock     | ran                |
| `Random.next`                                     | refused random    | ran                |
| fork and join a fiber                             | ran               | ran                |
| a `Layer` with a service                          | ran               | ran                |
| a `Stream` over a `PubSub`                        | ran               | ran                |
| a `Semaphore`                                     | ran               | ran                |
| `KeyValueStore.layerMemory`                       | ran               | ran                |
| `Effect.acquireRelease` in a scope                | ran               | ran                |
| `Effect.log`                                      | refused clock     | ran                |
| `Effect.withSpan` (and so `Effect.fn`'s spans)    | refused clock     | ran                |
| `Effect.retry` with a jittered `Schedule`         | refused clock     | ran                |

"refused clock" is the data module's refusal of `Date.now()` or `performance.now()` (Bun's Effect reaches the clock through `Date.now()`, Hermes's through `performance.now()`), "refused random" of `Math.random()`. Effect's defaults fail exactly where Effect reads its `Clock` or `Random`. Its scheduler, fibers, scopes, streams and layers run as they are. Every log line, span, schedule and `Effect.fn` reads the clock, so without the runner almost every service fails.

Bundle and start, on the iOS simulator (iPhone 17, iOS 27.0, a debug build): the lab's data module is 368 KB of Hermes bytecode (`app.hbc`) with Effect in it. On the web its `app.js` is 228 KB, 77 KB gzipped. A cold launch boots the baked first tree and reports `timeToInteractive` 197.5 ms, with the module's activation ready 180 ms after `didFinishLaunching` (`EXACT_OBSERVE_LOG=1`; one launch, on a loaded Mac).

## The rule

1. **Every call that runs an effect goes through the runner.** A source gets the call's time and seed from `exactTime()` (`time.epochAtZero + performanceNow()` and `time.seed`, after `with` for a resource) and answers `runCall(program, { now, seed })` (a Promise) or `runCallSync(program, { now, seed })` (a value, for a source that answers now). Never `Effect.runPromise`, `runSync` or `runFork` in a module `app.ts` reaches: they use Effect's live clock and random, which the data module refuses.
2. **The call's clock reads the call's time and moves only by sleeps.** Inside a call, `Clock.currentTimeMillis` starts at `now` and moves to each sleep's deadline when that sleep wakes, never by itself: work between sleeps takes no time on the call's clock. `Random` is `Random.withSeed(seed)`.
3. **A sleep is a real wait inside the answer.** `runCall` waits out each sleep with the answer's own `setTimeout`, which Exact allows and fires on the app's clock (`clock +N` and `clock settle` under the driver). `runCallSync` jumps to each deadline at once and dies if the call waits on anything outside itself (a fetch). Ties wake in the order the sleeps began, as Effect's `TestClock` does.
4. **Nothing outlives the call.** When the call's own fiber ends, the runner interrupts every fiber of the call still asleep (a `forkDetach`ed one included) and runs their finalizers before it answers. A fiber waiting on something else (a `Deferred` no one completes) is dropped with the call and never runs again. A module reload drops the timers with the runtime, so no fiber of an earlier call runs after it.
5. **Calls share nothing through the runtime.** Each call has its own clock, seed and scheduler; a later call may carry an earlier time. State that must outlive a call lives in Exact's `store` or `storage` (a `KeyValueStore` layer over `storage`, built per call), or in Contract state.
6. **Effect's own timers stay inside the runner's scheduler.** The runner drives fibers on a scheduler of its own and steps by `await`: Exact carries an answer across an `await` (its bundle lowers `async` functions to keep the answer current) but not across a bare `.then` reaction, where an answer's `setTimeout` is refused (`setTimeout() is unavailable here: a timer belongs to the answer that arms it`). Code an answer runs after a promise `await`s it; it does not arm timers in `.then`.

The guard: `packages/exact-kit/src/effect/runner.test.ts` holds the runner to `TestClock` over generated programs (sleeps, clock reads, draws, forks, joins, races, timeouts, stream takes), each step under `withDataHost`, and to its invariants across generated sequences of calls (overlapping, earlier than the last, a reload). The lab is the device check; `ex-pin` runs it after each move of the pin.

## A worked example

```ts
import { runCall } from '@manna/exact-kit/effect';
import { Clock, Effect } from 'effect';

import type { Answer, Result, Sources } from './app.contract.d.ts';

const lookUp = Effect.fn('verse.lookUp')(function* (reference: string) {
  const at = yield* Clock.currentTimeMillis;
  return { reference, at };
});

const sources: Sources = {
  verse: ([reference, now, seed]): Promise<Result<'verse'>> =>
    runCall(lookUp(reference).pipe(Effect.delay('50 millis')), { now, seed }),
};
export const answer: Answer = (source, args, store, storage, native) =>
  sources[source](args, store, storage, native);
```

```contract
shape Time
  epochAtZero: number
  seed: number

shape Verse
  reference: string
  at: number

component Reader
  resource time = exactTime() as shape Time
  resource verse = verse("John 3:16") with time.epochAtZero, time.seed as shape Verse
```

The resource reads the clock 50 ms after the launch's time: `at` is `time.epochAtZero + 50`, on every host and under the driver alike. A mutation sent from an action passes `time.epochAtZero + performanceNow()` instead, as the lab's `probe` does.

A package `app.ts` imports through its `exports` needs declarations for Exact's type check (`exact:docs/contract-for-agents.md`, "A TypeScript package for the data module"): `@manna/exact-kit/effect` points `types` at `src/effect/exact.d.ts`.

## What each current service becomes

A current service is a long-lived object: a layer built once at start, fibers forked for the app's life, a `changes` stream (a `PubSub`) the view subscribes to through an atom. In Exact the view is Contract and the data module answers calls, so each service keeps its Effect code and loses its lifetime:

| Service                                                | Becomes                                                                                                                                                                                                                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Heartseed `Voice` (`apps/heartseed/src/voice.ts`)      | The choice and its `KeyValueStore` read and write as per-call programs over a `storage` layer; playing is Exact's speech or the natural voice's native module, its state in Contract. `changes` becomes a resource refreshed by the mutation that changed it. |
| Heartseed `Dictation` (`dictation.ts`)                 | The recognizer is a native module; its partial results arrive as stream events or mutations. The window and the views (`PubSub.sliding`) become a pure step over those events, run per event through `runCallSync`.                                           |
| Heartseed `SayIt` (`sayit.ts`)                         | The matcher and the recall rules carry over as they are; the held view becomes Contract state, each heard result a call that returns the next view. `Recalls` writes go through the `storage` layer.                                                          |
| Heartseed garden (`garden.ts`)                         | The data spine: its decoding, FSRS and the read retries (`Schedule.exponential`) carry over through the runner; the `KeyValueStore` is a layer over Exact's `storage`; `changes` becomes resources the garden's mutations refresh.                            |
| Heartseed session (`session/service.ts`)               | The plan, the cue ladder and grading carry over as per-call programs; the running session is Contract state passed into each call; the minutes store goes through `storage`.                                                                                  |
| The hymnal player (`apps/hymnal/src/player/player.ts`) | The reducer carries over; playback, the lock screen and the connection are Exact's media and device facts, their events calls into the reducer; the forked listeners (`Stream.runForEach(device.connection)`) become Contract `task`s or stream resources.    |
| The hymnal settings (`settings.ts`)                    | A `persist` state in Contract where it is a plain value; anything with rules is a per-call program over the `storage` layer.                                                                                                                                  |

Cost for wave 2, against the plan's 40-60 hours (Heartseed) and 20-30 (the hymnal) had the runtime not run: a `KeyValueStore` layer over Exact's `storage`, once, in `@manna/exact-kit` (3-5 hours); each Heartseed service reshaped from a lifetime to per-call programs, its `changes` stream to refreshed resources (about 2-3 hours a service, 15-20 in all); the player's listeners to Contract tasks (6-10). About 25-35 hours over the port, most of it inside units already planned (`ex-hs-garden`, `ex-hs-session`, `ex-hy-player`), where way 2 would have added 60-90.

## Limits

- Bun's `withDataHost` follows Effect's defaults only through the synchronous start of a call: Effect's own scheduler runs later steps outside it. It cannot see the `.then` refusal of rule 6 either. The lab on the web and iOS is the check for both.
- Work between sleeps takes no time on the call's clock; a call that needs elapsed wall time takes a second `exactTime()` reading from Contract.
- A call waiting on a fetch and a sleep at once: when the fetch's step arrives first, the runner arms the sleep's timer again for the whole time left on the call's clock, which the fetch did not move, so that sleep waits longer in real time than it asked.
