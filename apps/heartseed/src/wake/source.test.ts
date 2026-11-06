/* oxlint-disable effect/noNullish -- the host's AppState is React Native's own object (react-native-web's here), whose listeners and state the case stands in for and puts back when it ends, as iOS would drive them; the web's addEventListener hands back undefined, and a missing descriptor is undefined. */

/**
 * The foreground's subscription (R8d) over React Native's `AppState`: each
 * running launch of the app's layer holds one `change` listener, read with
 * the state at its subscription, and none once its scope closes, whatever
 * states came between; each return among generated states, the launch's
 * own state first, wakes the session once, by `returnsModel`. Where the
 * web's `addEventListener` hands back nothing, the close still ends cleanly.
 */

import { describe, expect, it } from 'bun:test';
import { Effect, Exit, Layer, Option, Scope } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';
import { AppState } from 'react-native';

import { appLayer } from '../app';
import { microphoneSource } from '../dictation/source';
import { wakeLayer } from '../foreground';
import { foregroundSource } from '../foreground/source';
import { Chime } from '../garden';
import { Haptics } from '../sayit';
import { Session } from '../session/service';
import { below, pickOf, random } from '../test/garden-model';
import { returnsModel } from '../test/wake-model';
import { voiceSource } from '../voice/source';

const STATES = ['active', 'inactive', 'background'] as const;

/** The host as a case drives it: its state, the listeners it holds, and whether `addEventListener` hands back a handle. */
const host = {
  state: 'active' as string,
  listeners: new Set<(state: string) => void>(),
  handles: true,
};

/** `work` with AppState's listeners and state stood in for, the originals put back after. */
const withHost = <E>(work: Effect.Effect<void, E>) =>
  Effect.runPromise(
    Effect.acquireUseRelease(
      Effect.sync(() => {
        const add: unknown = Reflect.get(AppState, 'addEventListener');
        const current = Object.getOwnPropertyDescriptor(AppState, 'currentState');
        Reflect.set(
          AppState,
          'addEventListener',
          (type: string, listener: (state: string) => void) => {
            if (type !== 'change') return { remove: () => {} };
            host.listeners.add(listener);
            if (!host.handles) return undefined;
            return { remove: () => void host.listeners.delete(listener) };
          },
        );
        Object.defineProperty(AppState, 'currentState', {
          configurable: true,
          get: () => host.state,
        });
        return { add, current };
      }),
      () => work,
      ({ add, current }) =>
        Effect.sync(() => {
          Reflect.set(AppState, 'addEventListener', add);
          if (current === undefined) Reflect.deleteProperty(AppState, 'currentState');
          else Object.defineProperty(AppState, 'currentState', current);
          host.listeners.clear();
        }),
    ),
  );

/** Sends `state` to every listener, as iOS does at a change. */
const send = (state: string) =>
  Effect.sync(() => {
    host.state = state;
    for (const listener of [...host.listeners]) listener(state);
  });

/** Lets every fiber the sends woke run to its end. */
const settle = Effect.gen(function* () {
  for (let turn = 0; turn < 20; turn++) yield* Effect.yieldNow;
});

/** The foreground over the host, waking a session that counts its wakes. */
const counted = (wakes: { count: number }) =>
  wakeLayer.pipe(
    Layer.provide(foregroundSource),
    Layer.provide(
      Layer.mock(Session)({
        wake: Effect.sync(() => {
          wakes.count += 1;
        }),
      }),
    ),
  );

describe('the foreground subscription', () => {
  it('holds one listener per running launch, wakes once per return the model finds, and none once closed', () =>
    withHost(
      Effect.gen(function* () {
        let returns = 0;
        for (let seed = 1; seed <= 60; seed++) {
          const next = random(seed);
          host.handles = true;
          host.state = pickOf(next, STATES);
          const launchState = host.state;
          const wakes = { count: 0 };
          const scope = yield* Scope.make();
          yield* Layer.buildWithScope(counted(wakes), scope);
          const where = `seed ${seed} launched ${launchState}`;
          expect(host.listeners.size, where).toBe(1);
          const events = Array.from({ length: below(next, 12) }, () => pickOf(next, STATES));
          for (const state of events) yield* send(state);
          yield* settle;
          const want = returnsModel(launchState, events).filter(Boolean).length;
          returns += want;
          expect(wakes.count, `${where}: ${events.join(',')}`).toBe(want);
          yield* Scope.close(scope, Exit.void);
          expect(host.listeners.size, `${where} (closed)`).toBe(0);
          yield* send('background');
          yield* send('active');
          yield* settle;
          expect(wakes.count, `${where} (no wake once closed)`).toBe(want);
        }
        expect(returns).toBeGreaterThan(30);
      }),
    ));

  it('reads the state at the subscription: a launch in the background wakes at its first active', () =>
    withHost(
      Effect.gen(function* () {
        host.handles = true;
        host.state = 'background';
        const wakes = { count: 0 };
        const scope = yield* Scope.make();
        yield* Layer.buildWithScope(counted(wakes), scope);
        yield* send('active');
        yield* settle;
        expect(wakes.count).toBe(1);
        yield* Scope.close(scope, Exit.void);
      }),
    ));

  it('closes cleanly where addEventListener hands back nothing, as on the web', () =>
    withHost(
      Effect.gen(function* () {
        host.handles = false;
        const scope = yield* Scope.make();
        yield* Layer.buildWithScope(counted({ count: 0 }), scope);
        const exit = yield* Effect.exit(Scope.close(scope, Exit.void));
        expect(Exit.isSuccess(exit)).toBe(true);
      }),
    ));

  it('is built by the app layer by default: one listener per running launch, none after each closes', () =>
    withHost(
      Effect.gen(function* () {
        host.handles = true;
        for (let launch = 0; launch < 3; launch++) {
          host.state = pickOf(random(launch + 1), STATES);
          const scope = yield* Scope.make();
          const services = yield* Layer.buildWithScope(
            appLayer({
              source: microphoneSource,
              haptics: Layer.succeed(Haptics, Haptics.of({ tick: Effect.void })),
              store: KeyValueStore.layerMemory,
              chime: Layer.succeed(Chime, Chime.of({ grow: () => Effect.void })),
              voice: voiceSource,
            }),
            scope,
          );
          expect(host.listeners.size, `launch ${launch}`).toBe(1);
          yield* send('background');
          yield* send('active');
          yield* settle;
          const view = yield* Effect.provideContext(
            Effect.flatMap(Session, (session) => session.view),
            services,
          );
          expect(Option.isNone(view.plan), `launch ${launch} (no plan before Today shows)`).toBe(
            true,
          );
          yield* Scope.close(scope, Exit.void);
          expect(host.listeners.size, `launch ${launch} (closed)`).toBe(0);
        }
      }),
    ));
});
