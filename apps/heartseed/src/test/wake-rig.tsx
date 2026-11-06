/* oxlint-disable effect/noAsyncFunction, effect/noThrowStatement, effect/noNewError -- the foreground's rig: its steps are the run rig's promise-based ones, and a step that never lands is thrown to bun's runner. */

/**
 * Today's run as the run rig mounts it (`src/test/run-rig.tsx`), with the
 * host's app state in the test's hands: a launch reads `state` when its
 * foreground subscription starts, and `send` hands it each state iOS would
 * report, one after another, then waits until the session has taken every
 * one of them and done what each asks (the next state is pulled only once
 * the last one's wake has run). A state sent before the subscription starts
 * (the garden's read held back, the pending frame) is no event: the
 * subscription reads the state it finds, as React Native's `currentState`.
 * The garden's read can be held back until `open`.
 */

import { Deferred, Effect, Layer, Option, Queue, Stream } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';

import { Foreground } from '../foreground';
import { launch, type Device, type Faults, type Launch, type LaunchParts } from './run-rig';

/** The states iOS reports. */
export type HostState = 'active' | 'inactive' | 'background';

/** The host of one launch: its state now, and the subscription's queue once it starts, with the states offered to it and the pulls it made. */
interface Host {
  state: HostState;
  live: Option.Option<Queue.Queue<string>>;
  offered: number;
  pulls: number;
}

/** The foreground over `host`: the state at the subscription first, then each state sent, one pull at a time. */
const foregroundOf = (host: Host) =>
  Layer.succeed(
    Foreground,
    Foreground.of({
      states: Stream.fromPull(
        Effect.map(Queue.unbounded<string>(), (queue) => {
          host.live = Option.some(queue);
          let first = true;
          return Effect.suspend(() => {
            host.pulls += 1;
            if (!first) return Effect.map(Queue.take(queue), (state) => [state] as const);
            first = false;
            return Effect.succeed([host.state] as const);
          });
        }),
      ),
    }),
  );

/** The store over the disk, its listing held back until `gate` opens. */
const gatedStore =
  (gate: Deferred.Deferred<void>) => (disk: Layer.Layer<KeyValueStore.KeyValueStore>) =>
    Layer.effect(
      KeyValueStore.KeyValueStore,
      Effect.map(KeyValueStore.KeyValueStore, (store) =>
        KeyValueStore.makeStringOnly({
          get: store.get,
          set: store.set,
          remove: store.remove,
          clear: store.clear,
          size: store.size,
          keys: Effect.andThen(Deferred.await(gate), store.keys),
        }),
      ),
    ).pipe(Layer.provide(disk));

/** How a launch starts: the host's state when the subscription starts, and whether the garden's read waits for `open`. */
export interface WakeStart {
  readonly state?: HostState;
  readonly held?: boolean;
  readonly voice?: LaunchParts['voice'];
}

/** A launch of the root as the run rig's, with the host's state in the test's hands. */
export const wakeLaunch = async (
  device: Device,
  faults: Faults,
  time: { now: number },
  pieces: Parameters<typeof launch>[3],
  start: WakeStart = {},
) => {
  const host: Host = { state: start.state ?? 'active', live: Option.none(), offered: 0, pulls: 0 };
  const gate = Deferred.makeUnsafe<void>();
  if (start.held !== true) Deferred.doneUnsafe(gate, Effect.void);
  const app: Launch = await launch(device, faults, time, pieces, {
    foreground: foregroundOf(host),
    store: gatedStore(gate),
    voice: start.voice,
  });
  /** Whether the subscription has taken every state offered so far and waits for the next. */
  const taken = () => host.pulls === host.offered + 2;
  /** Hands the host each of `states` in turn, once the subscription read its own state, then waits until the session took them all. */
  const send = async (states: readonly HostState[]) => {
    if (Option.isSome(host.live) && !(await app.until(taken)))
      throw new Error('the foreground never read its own state');
    for (const state of states) {
      host.state = state;
      if (Option.isNone(host.live)) continue;
      Queue.offerUnsafe(host.live.value, state);
      host.offered += 1;
    }
    if (Option.isNone(host.live)) return;
    if (!(await app.until(taken)))
      throw new Error(`the foreground took ${host.pulls - 1} of ${host.offered + 1} states`);
  };
  /** Lets the garden's read held back complete, and waits until the subscription read its own state. */
  const open = async () => {
    Deferred.doneUnsafe(gate, Effect.void);
    if (!(await app.until(() => Option.isSome(host.live) && taken())))
      throw new Error('the foreground never started');
  };
  return { ...app, send, open, subscribed: () => Option.isSome(host.live) };
};

export type WakeLaunch = Awaited<ReturnType<typeof wakeLaunch>>;
