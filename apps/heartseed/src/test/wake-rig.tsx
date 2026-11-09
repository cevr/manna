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
 * The garden's read can be held back until `open`, and the voice's source
 * can be a reading voice (`readingVoice`), whose readings the test ends.
 * Every Today frame is also held to Listen's place (`listenFaults`), the
 * faults kept with the run rig's.
 */

import { Deferred, Effect, Layer, MutableRef, Option, Queue, Stream } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';
import { act } from 'react';

import { Foreground } from '../foreground';
import { VoiceSource, VoiceUnavailable, type VoiceEvent } from '../voice';
import { ACTIONS, launch, scrolled, text, type Device, type Faults, type Launch } from './run-rig';

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

/** One call the voice's source took, with the recognizer's listens made before it. */
export interface VoiceCall {
  readonly call: 'speak' | 'stop' | 'pause' | 'resume';
  readonly listens: number;
}

/**
 * A voice source with one eligible voice: each speak the voice service
 * makes is kept (its text and the recognizer's listens before it) and
 * starts a reading the test ends with `end`, unless `refuse` is set, when
 * the speak fails. Each other call is kept the same way.
 */
export const readingVoice = () => {
  const listener = MutableRef.make<Option.Option<(event: VoiceEvent) => void>>(Option.none());
  const utterance = MutableRef.make<Option.Option<number>>(Option.none());
  const listens = MutableRef.make<() => number>(() => 0);
  const spoken: string[] = [];
  const calls: VoiceCall[] = [];
  const state = { refuse: false };
  const keep = (call: VoiceCall['call']) =>
    Effect.sync(() => {
      calls.push({ call, listens: MutableRef.get(listens)() });
    });
  const layer = Layer.succeed(
    VoiceSource,
    VoiceSource.of({
      voices: Effect.succeed([
        {
          id: 'test',
          language: 'en-US',
          name: 'Test',
          quality: 2,
          novelty: false,
          personal: false,
        },
      ]),
      speak: (id, text) =>
        Effect.suspend(() => {
          spoken.push(text);
          calls.push({ call: 'speak', listens: MutableRef.get(listens)() });
          if (state.refuse) return Effect.fail(VoiceUnavailable.make({ reason: 'test: refused' }));
          MutableRef.set(utterance, Option.some(id));
          return Effect.void;
        }),
      pause: keep('pause'),
      resume: keep('resume'),
      stop: Effect.andThen(
        keep('stop'),
        Effect.sync(() => MutableRef.set(utterance, Option.none())),
      ),
      subscribe: (next) =>
        Effect.asVoid(
          Effect.acquireRelease(
            Effect.sync(() => MutableRef.set(listener, Option.some(next))),
            () => Effect.sync(() => MutableRef.set(listener, Option.none())),
          ),
        ),
    }),
  );
  /** Ends the reading under way at its own end: `finish` or `interrupt`. */
  const end = async (kind: 'finish' | 'interrupt') => {
    const id = MutableRef.get(utterance);
    MutableRef.set(utterance, Option.none());
    await act(async () => {
      Option.map(Option.all({ id, send: MutableRef.get(listener) }), ({ id: at, send }) =>
        send({ utterance: at, kind, location: 0, length: 0 }),
      );
    });
  };
  return {
    layer,
    spoken,
    calls,
    state,
    end,
    /** Whether a speak's reading has not ended, by the test or a stop. */
    reading: () => Option.isSome(MutableRef.get(utterance)),
    /** Counts the recognizer's listens from `count`, the launch's own. */
    bind: (count: () => number) => MutableRef.set(listens, count),
  };
};

export type ReadingVoice = ReturnType<typeof readingVoice>;

/** What one Today frame shows wrong of Listen's place: more than one, one beside anything but Say it alone, after Say it in document order, or inside a scroll view. */
export const listenFaults = (host: Element): string[] => {
  const headings = [...host.querySelectorAll('[role="heading"]')].map(text);
  if (!headings.includes('Today')) return [];
  const buttons = [...host.querySelectorAll('[role="button"]')];
  const named = (label: string) =>
    buttons.filter((node) => (node.getAttribute('aria-label') ?? text(node)) === label);
  const listen = named('Listen');
  if (listen.length === 0) return [];
  const out: string[] = [];
  if (listen.length > 1) out.push(`${listen.length} Listen buttons`);
  const actions = ACTIONS.flatMap((label) => named(label).map(() => label));
  if (actions.join('|') !== 'Say it') out.push(`Listen beside ${actions.join('|') || 'nothing'}`);
  const sayIt = Option.fromNullishOr(named('Say it')[0]);
  for (const node of listen) {
    if (scrolled(node)) out.push('Listen in the scroll view');
    const after = Option.exists(
      sayIt,
      (each) => (node.compareDocumentPosition(each) & Node.DOCUMENT_POSITION_FOLLOWING) === 0,
    );
    if (after) out.push('Listen after Say it');
  }
  return out;
};

/** How a launch starts: the host's state when the subscription starts, whether the garden's read waits for `open`, the voice's source (the run rig's silent one when none), and the screen a read launch opens on (the run rig's when none). */
export interface WakeStart {
  readonly opening?: 'home' | 'today';
  readonly state?: HostState;
  readonly held?: boolean;
  readonly voice?: ReadingVoice;
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
    voice: start.voice?.layer,
    opening: start.opening,
  });
  start.voice?.bind(() => app.listens.n);
  const frame = () => {
    for (const fault of listenFaults(app.host))
      app.faults.push(`${fault} (actions ${app.actions().join('|')})`);
  };
  const watch = new MutationObserver(frame);
  watch.observe(app.host, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
  frame();
  const leave = async () => {
    watch.disconnect();
    return app.leave();
  };
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
  return { ...app, leave, send, open, subscribed: () => Option.isSome(host.live) };
};

export type WakeLaunch = Awaited<ReturnType<typeof wakeLaunch>>;
