/* oxlint-disable effect/noGlobals, effect/noTernary, effect/noNullish -- the test drives the service from plain branches over the device's synchronous store, whose absent keys are null, and names each failing history as JSON text. */

/**
 * The reader's appearance (`src/appearance.ts`): the read rule over the
 * three words, their near misses and 400 generated texts; the scheme over
 * every appearance and every name a system may give; and the service
 * against a reference model over the app's store on the device's stand-in
 * (`src/test/one.tsx`), over seeded histories of launches (any stored text,
 * a missing key, a read that fails), chooses of any word, a refused write,
 * bursts of chooses in one turn and while every write is held, the held
 * writes let go in any order, and relaunches. After each command the view,
 * its latest change, the disk and the log agree with the model, and a
 * launch writes nothing.
 */

import { describe, expect, it } from 'bun:test';
import {
  Context,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Layer,
  Logger,
  References,
  Scope,
  Stream,
} from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';

import {
  Appearance,
  APPEARANCE_KEY,
  APPEARANCES,
  appearanceOf,
  layer,
  schemeOf,
  type Choice,
} from './appearance';
import { store } from './store';
import { clockOf, START } from './test/clock';
import { below, random } from './test/garden-model';
import { device } from './test/one';

const WORDS: readonly string[] = APPEARANCES;

/** The 30 near misses of the three words: case, spaces, a newline, quotes, a cut, a plural, a dotless i, JSON and doubled. */
const NEAR = WORDS.flatMap((word) => [
  word.toUpperCase(),
  word[0]?.toUpperCase() + word.slice(1),
  ` ${word}`,
  `${word} `,
  `${word}\n`,
  `"${word}"`,
  word.slice(1),
  `${word}s`,
  JSON.stringify({ value: word }),
  `${word}${word}`,
]);

const ALPHABET = [...'systemlightdarkSLD \t\n"{}:0é', '🌱', '\u0000'];

/** `count` generated texts of up to 8 characters from the words' letters and a few others. */
const generated = (next: () => number, count: number) =>
  Array.from({ length: count }, () =>
    Array.from({ length: below(next, 9) }, () => ALPHABET[below(next, ALPHABET.length)]).join(''),
  );

/** Every text class a store may hold under the key: the words, a few names, the near misses and generated texts. */
const TEXTS = [
  ...WORDS,
  '',
  'auto',
  'sepia',
  'unspecified',
  'null',
  ...NEAR,
  ...generated(random(0xa99ea2), 400),
];

/** The rule as the spec states it. */
const ruled = (text: string | undefined): Choice =>
  APPEARANCES.find((word) => word === text) ?? 'system';

describe('the appearance a stored text names', () => {
  it('reads exactly system, light or dark as itself, and 30 near misses, 400 generated texts and a missing key as System', () => {
    expect(NEAR.length).toBe(30);
    const wrong = TEXTS.filter((text) => appearanceOf(text) !== ruled(text));
    const misses = NEAR.filter((text) => appearanceOf(text) !== 'system');
    expect({
      wrong,
      misses,
      missing: appearanceOf(undefined),
      words: WORDS.map(appearanceOf),
    }).toEqual({ wrong: [], misses: [], missing: 'system', words: ['system', 'light', 'dark'] });
  });
});

describe('the scheme an appearance shows', () => {
  it('is Light’s and Dark’s own, and System’s dark only when the system names dark', () => {
    const systems = ['light', 'dark', null, undefined, 'unspecified', 'no-preference', 'Dark', ''];
    expect(
      APPEARANCES.flatMap((choice) =>
        systems.map((system) => `${choice}/${String(system)}=${schemeOf(choice, system)}`),
      ),
    ).toEqual(
      APPEARANCES.flatMap((choice) =>
        systems.map((system) => {
          const want = choice === 'system' ? (system === 'dark' ? 'dark' : 'light') : choice;
          return `${choice}/${String(system)}=${want}`;
        }),
      ),
    );
  });
});

type Command =
  | {
      readonly _tag: 'Launch';
      readonly stored: { readonly text: string } | 'missing' | 'kept';
      readonly fails: boolean;
    }
  | { readonly _tag: 'Choose'; readonly choice: Choice; readonly refused: boolean }
  | { readonly _tag: 'Burst'; readonly choices: readonly Choice[]; readonly held: boolean };

/** The model: the view, the key's text on the disk, and the store failures logged since the last launch. */
interface Model {
  view: Choice;
  disk: string | undefined;
  logs: string[];
}

const pickChoice = (next: () => number): Choice => APPEARANCES[below(next, 3)] ?? 'system';

const commandOf = (next: () => number): Command => {
  const roll = below(next, 10);
  if (roll < 2)
    return {
      _tag: 'Launch',
      stored:
        [
          { text: WORDS[below(next, WORDS.length)] ?? '' },
          { text: TEXTS[below(next, TEXTS.length)] ?? '' },
          'missing' as const,
          'kept' as const,
        ][below(next, 4)] ?? 'kept',
      fails: next() < 0.25,
    };
  if (roll < 6) return { _tag: 'Choose', choice: pickChoice(next), refused: next() < 0.3 };
  return {
    _tag: 'Burst',
    choices: Array.from({ length: 2 + below(next, 3) }, () => pickChoice(next)),
    held: next() < 0.5,
  };
};

/** Each command kind and stored text class the histories reached. */
const reached = new Set<string>();

const classOf = (stored: Extract<Command, { _tag: 'Launch' }>['stored']) => {
  if (stored === 'missing') return 'a missing key';
  if (stored === 'kept') return 'the disk kept';
  if (WORDS.includes(stored.text)) return 'a word';
  return 'another text';
};

/** The writes a held store keeps waiting, each let go by the test. */
const gate = { holding: false, pending: [] as Deferred.Deferred<void>[] };

/** The app's store on the device, whose writes wait on the test while `gate.holding`. */
const heldStore = Layer.effect(
  KeyValueStore.KeyValueStore,
  Effect.map(KeyValueStore.KeyValueStore, (real) =>
    KeyValueStore.KeyValueStore.of({
      ...real,
      set: (key, value) =>
        Effect.suspend(() => {
          if (!gate.holding) return real.set(key, value);
          return Effect.flatMap(Deferred.make<void>(), (done) => {
            gate.pending.push(done);
            return Deferred.await(done).pipe(Effect.andThen(real.set(key, value)));
          });
        }),
    }),
  ),
).pipe(Layer.provide(store));

/** The appearance's log lines since the last launch, each its message, method and key. */
const logs: string[] = [];

const kept = Logger.layer([
  Logger.make((options) => {
    const message = [options.message].flat().map(String).join(' ');
    if (!message.startsWith('appearance.')) return;
    const notes = options.fiber.getRef(References.CurrentLogAnnotations);
    logs.push(`${message} ${String(notes['method'])} ${String(notes['key'])}`);
  }),
]);

/** One history of `steps` commands from a launch, each checked against the model; the first disagreement, named. */
const runHistory = (seed: number, steps: number) =>
  Effect.gen(function* () {
    const next = random(seed * 2654435761);
    const model: Model = { view: 'system', disk: undefined, logs: [] };
    const built = (scope: Scope.Closeable) =>
      Effect.map(Layer.buildWithScope(Layer.provide(layer, heldStore), scope), (services) =>
        Context.get(services, Appearance),
      );
    let scope = yield* Scope.make();
    device.launch([]);
    logs.length = 0;
    let service = yield* built(scope);
    const start: Command = { _tag: 'Launch', stored: 'missing', fails: false };
    const history: Command[] = [start];

    const launch = (command: Extract<Command, { _tag: 'Launch' }>) =>
      Effect.gen(function* () {
        reached.add(command.fails ? 'a failed read' : `a launch over ${classOf(command.stored)}`);
        yield* Scope.close(scope, Exit.void);
        if (command.stored === 'missing') model.disk = undefined;
        else if (command.stored !== 'kept') model.disk = command.stored.text;
        device.launch(model.disk === undefined ? [] : [[APPEARANCE_KEY, model.disk]]);
        if (command.fails) device.fail('get', 1);
        logs.length = 0;
        model.logs = command.fails ? [`appearance.store.failed get ${APPEARANCE_KEY}`] : [];
        model.view = command.fails ? 'system' : ruled(model.disk);
        scope = yield* Scope.make();
        service = yield* built(scope);
      });

    const burst = (command: Extract<Command, { _tag: 'Burst' }>) =>
      Effect.gen(function* () {
        reached.add(command.held ? 'a burst of held writes' : 'a burst in one turn');
        gate.holding = command.held;
        const fibers: Fiber.Fiber<void>[] = [];
        for (const choice of command.choices)
          fibers.push(yield* Effect.forkChild(service.choose(choice), { startImmediately: true }));
        let released = 0;
        while (command.held && released < command.choices.length) {
          if (gate.pending.length === 0) {
            yield* Effect.yieldNow;
            continue;
          }
          const [done] = gate.pending.splice(below(next, gate.pending.length), 1);
          if (done !== undefined) yield* Deferred.succeed(done, undefined);
          released += 1;
        }
        for (const fiber of fibers) yield* Fiber.join(fiber);
        gate.holding = false;
        model.view = command.choices.at(-1) ?? model.view;
        model.disk = model.view;
      });

    const apply = (command: Command) =>
      Effect.gen(function* () {
        if (command._tag === 'Launch') return yield* launch(command);
        if (command._tag === 'Burst') return yield* burst(command);
        reached.add(command.refused ? 'a refused write' : 'a choose');
        if (command.refused) device.fail('set', 1);
        yield* service.choose(command.choice);
        model.view = command.choice;
        if (command.refused) model.logs.push(`appearance.store.failed set ${APPEARANCE_KEY}`);
        else model.disk = command.choice;
      });

    const check = (command: Command) =>
      Effect.gen(function* () {
        const got = {
          view: yield* service.view,
          latest: yield* Stream.runHead(service.changes).pipe(
            Effect.map((head) => (head._tag === 'Some' ? head.value : 'none')),
          ),
          disk: device.disk.get(APPEARANCE_KEY) ?? undefined,
          logs: [...logs],
          sets: command._tag === 'Launch' ? device.calls.set : 0,
        };
        const want = {
          view: model.view,
          latest: model.view,
          disk: model.disk,
          logs: model.logs,
          sets: 0,
        };
        if (JSON.stringify(got) === JSON.stringify(want)) return undefined;
        return `seed ${seed}: ${JSON.stringify(history)} → ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`;
      });

    const first = yield* check(start);
    if (first !== undefined) return first;
    for (let step = 0; step < steps; step++) {
      const command = commandOf(next);
      history.push(command);
      yield* apply(command);
      const fault = yield* check(command);
      if (fault !== undefined) {
        yield* Scope.close(scope, Exit.void);
        return fault;
      }
    }
    yield* Scope.close(scope, Exit.void);
    return undefined;
  });

describe('the Appearance service against its model', () => {
  it('agrees on 150 seeded histories of 12 commands over the device’s store, each command kind and stored text class reached', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const faults: string[] = [];
        for (let seed = 1; seed <= 150; seed++) {
          const fault = yield* runHistory(seed, 12);
          if (fault !== undefined && faults.length < 3) faults.push(fault);
        }
        expect({ faults, reached: [...reached].toSorted() }).toEqual({
          faults: [],
          reached: [
            'a burst in one turn',
            'a burst of held writes',
            'a choose',
            'a failed read',
            'a launch over a missing key',
            'a launch over a word',
            'a launch over another text',
            'a launch over the disk kept',
            'a refused write',
          ],
        });
      }).pipe(Effect.provide(Layer.merge(kept, clockOf({ now: START })))),
    ));
});
