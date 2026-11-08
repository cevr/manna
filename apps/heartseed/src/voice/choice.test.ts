/* oxlint-disable effect/noGlobals -- a failing case and each log line's annotations are named as JSON text. */

/**
 * The voice's launch read over both keys' texts: the choice key's text when
 * it is exactly `off`, `her` or `him`; else the old switch, Off only for its
 * text `false`, and Her for a missing key, any other text or a failed read
 * of either. A launch and a close write, remove and clear nothing. The
 * cases are every pair of a list of exact texts and near misses, each key
 * also failing its read, and generated pairs of random texts beside them.
 */

import { describe, expect, it } from 'bun:test';
import { Context, Effect, Exit, Layer, Logger, References, Scope } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';

import {
  CHOICE_KEY,
  CHOICES,
  ENABLED_KEY,
  layer,
  nextChoice,
  Voice,
  VoiceSource,
  type Choice,
} from '../voice';

const quiet = VoiceSource.of({
  voices: Effect.succeed([]),
  speak: () => Effect.void,
  pause: Effect.void,
  resume: Effect.void,
  stop: Effect.void,
  subscribe: () => Effect.void,
});

/** A key's seeded state: missing, a text, or a read that fails. */
type Seed =
  | { readonly kind: 'missing' }
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'fails' };

const MISSING: Seed = { kind: 'missing' };

const FAILS: Seed = { kind: 'fails' };

const text = (value: string): Seed => ({ kind: 'text', text: value });

const CHOICE_TEXTS = [
  'off',
  'her',
  'him',
  'Off',
  'HER',
  'Him',
  ' off',
  'her ',
  '\thim',
  'him\n',
  '"her"',
  "'off'",
  'true',
  'false',
  'on',
  '0',
  '1',
  'null',
  '{}',
  '[]',
  'off,her',
  'hér',
  'he r',
  'herr',
  'hi',
  '',
  'undefined',
  'her\u0000',
  'ｈｅｒ',
  'him\u200b',
];

const OLD_TEXTS = [
  'true',
  'false',
  'False',
  'FALSE',
  ' false',
  'false ',
  '"false"',
  '0',
  'off',
  'no',
  '',
  'null',
  'fals',
  'false\n',
];

/** The spec's read rule, written out by hand. */
const expected = (choiceSeed: Seed, oldSeed: Seed): Choice => {
  if (choiceSeed.kind === 'text') {
    if (choiceSeed.text === 'off') return 'off';
    if (choiceSeed.text === 'her') return 'her';
    if (choiceSeed.text === 'him') return 'him';
  }
  if (oldSeed.kind === 'text' && oldSeed.text === 'false') return 'off';
  return 'her';
};

const random = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

const ALPHABET = ['o', 'f', 'h', 'e', 'r', 'i', 'm', 'a', 'l', 's', 't', 'u', ' ', '"', 'O', 'H'];

const generated = (next: () => number) =>
  Array.from(
    { length: Math.floor(next() * 6) },
    () => ALPHABET[Math.floor(next() * ALPHABET.length)] ?? '',
  ).join('');

/** A store over a map that fails the reads of the keys in `failing` and logs every write, remove and clear. */
const seededStore = (choiceSeed: Seed, oldSeed: Seed) => {
  const backing = new Map<string, string>();
  const failing = new Set<string>();
  const seedKey = (key: string, seed: Seed) => {
    if (seed.kind === 'text') backing.set(key, seed.text);
    if (seed.kind === 'fails') failing.add(key);
  };
  seedKey(CHOICE_KEY, choiceSeed);
  seedKey(ENABLED_KEY, oldSeed);
  const changes: string[] = [];
  const store = KeyValueStore.makeStringOnly({
    get: (key) => {
      if (failing.has(key))
        return Effect.fail(
          new KeyValueStore.KeyValueStoreError({ message: 'read', method: 'get', key }),
        );
      return Effect.sync(() => backing.get(key));
    },
    set: (key) => Effect.sync(() => void changes.push(`set ${key}`)),
    remove: (key) => Effect.sync(() => void changes.push(`remove ${key}`)),
    clear: Effect.sync(() => void changes.push('clear')),
    size: Effect.sync(() => backing.size),
    keys: Effect.sync(() => Array.from(backing.keys())),
  });
  return { store, changes };
};

/** One launch and close over the seeded keys: the view it opened on, the store's changes and each log line, its message and annotations as text. */
const launch = (choiceSeed: Seed, oldSeed: Seed) =>
  Effect.gen(function* () {
    const kv = seededStore(choiceSeed, oldSeed);
    const logs: string[] = [];
    const kept = Logger.layer([
      Logger.make((options) =>
        logs.push(
          `${[options.message].flat().map(String).join(' ')} ${JSON.stringify(options.fiber.getRef(References.CurrentLogAnnotations))}`,
        ),
      ),
    ]);
    const scope = yield* Scope.make();
    const services = yield* Layer.buildWithScope(
      Layer.provide(
        layer,
        Layer.mergeAll(
          Layer.succeed(VoiceSource, quiet),
          Layer.succeed(KeyValueStore.KeyValueStore, kv.store),
        ),
      ).pipe(Layer.provide(kept)),
      scope,
    );
    const view = yield* Context.get(services, Voice).view;
    yield* Scope.close(scope, Exit.void);
    return { view, changes: kv.changes, logs };
  });

/** The keys whose failed read the launch must log: the choice key's, and the old key's when the choice key held no choice. */
const failedReads = (choiceSeed: Seed, oldSeed: Seed) => {
  const keys: string[] = [];
  if (choiceSeed.kind === 'fails') keys.push(CHOICE_KEY);
  const choiceHeld =
    choiceSeed.kind === 'text' && CHOICES.some((choice) => choice === choiceSeed.text);
  if (!choiceHeld && oldSeed.kind === 'fails') keys.push(ENABLED_KEY);
  return keys;
};

describe('the choice a launch reads', () => {
  it('follows the read rule over every pair of texts, failed reads and 400 generated pairs', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const choiceSeeds = [MISSING, FAILS, ...CHOICE_TEXTS.map(text)];
        const oldSeeds = [MISSING, FAILS, ...OLD_TEXTS.map(text)];
        const pairs: Array<readonly [Seed, Seed]> = choiceSeeds.flatMap((c) =>
          oldSeeds.map((o) => [c, o] as const),
        );
        const next = random(0x5bea4e);
        for (let i = 0; i < 400; i++) pairs.push([text(generated(next)), text(generated(next))]);
        const seen = new Set<Choice>();
        for (const [choiceSeed, oldSeed] of pairs) {
          const where = JSON.stringify([choiceSeed, oldSeed]);
          const { view, changes, logs } = yield* launch(choiceSeed, oldSeed);
          const choice = expected(choiceSeed, oldSeed);
          seen.add(choice);
          expect(view.choice, where).toBe(choice);
          expect(view.enabled, where).toBe(choice !== 'off');
          expect(view.status, where).toBe('idle');
          expect(changes, where).toEqual([]);
          const failed = failedReads(choiceSeed, oldSeed);
          expect(logs, where).toHaveLength(failed.length);
          for (const [index, key] of failed.entries())
            expect(logs[index], where).toStartWith(
              `voice.store.failed {"method":"get","key":"${key}"`,
            );
        }
        expect(pairs).toHaveLength(32 * 16 + 400);
        expect([...seen].toSorted()).toEqual(['her', 'him', 'off']);
      }),
    ));

  it('keeps the old Off when the choice key holds junk or fails, and starts on Her with neither', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        expect((yield* launch(text('Her'), text('false'))).view.choice).toBe('off');
        expect((yield* launch(FAILS, text('false'))).view.choice).toBe('off');
        expect((yield* launch(MISSING, FAILS)).view.choice).toBe('her');
        expect((yield* launch(MISSING, MISSING)).view.choice).toBe('her');
        expect((yield* launch(text('him'), text('false'))).view.choice).toBe('him');
      }),
    ));

  it('cycles Off, Her, Him and back to Off', () => {
    expect(CHOICES).toEqual(['off', 'her', 'him']);
    expect(CHOICES.map(nextChoice)).toEqual(['her', 'him', 'off']);
    expect(CHOICE_KEY).toBe('heartseed/voice/choice');
    expect(ENABLED_KEY).toBe('heartseed/voice/enabled');
  });
});
