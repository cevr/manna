/* oxlint-disable effect/noTernary, effect/noNullish, effect/noGlobals -- the test drives the service from plain branches and reads the contract's nulls in its views; it names each failing history and voice list as JSON text. */

/**
 * The Voice service against its own model (`test/voice-model.ts`, written
 * from the hsvoice spec) over seeded step histories: reads of verses with
 * astral letters, a combining mark, a no-break space and a wordless verse;
 * pause, resume, stop, a choose of Off, Her or Him, a restart over the same
 * store (both keys seeded, the old one never written), a speak that fails;
 * and an adversarial source that sends any event
 * of a past, the current or a future utterance at any step, ranges of every
 * form. After each step the view, the source's calls (each speak naming the
 * best system voice and the natural voice of the choice), the stored choice
 * and the one live subscription must agree with the model, and the
 * invariants hold on the service's own view. A held `speak` is tested
 * apart: a later command never waits on it, and its late failure ends only
 * its own reading.
 */

import { describe, expect, it } from 'bun:test';
import {
  Context,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Layer,
  Option,
  Queue,
  Scope,
  Stream,
} from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';

import { sourceWords } from './matcher/words';
import {
  agreesWithMatcher,
  KEY,
  OLD_KEY,
  pickVoice,
  spansOf,
  VoiceModel,
  type ModelCall,
  type ModelChoice,
  type ModelVoice,
} from './test/voice-model';
import {
  bestVoice,
  CHOICE_KEY,
  ENABLED_KEY,
  layer,
  Voice,
  VoiceSource,
  VoiceUnavailable,
  type VoiceEvent,
  type VoiceView,
} from './voice';

const ISAIAH =
  'Fear thou not; for I am with thee: be not dismayed; for I am thy God: I will strengthen thee; yea, I will help thee; yea, I will uphold thee with the right hand of my righteousness.';

const VERSES: ReadonlyArray<string> = [
  ISAIAH,
  '\u{1D4D5}ear not \u{1F64F}\u{1F64F} café — thee\tend.',
  ' — ; … ',
  'Jesus wept.',
  '',
];

const VOICES: ReadonlyArray<ModelVoice> = [
  {
    id: 'com.apple.voice.compact.en-US.Samantha',
    language: 'en-US',
    name: 'Samantha',
    quality: 1,
    novelty: false,
    personal: false,
  },
  {
    id: 'com.apple.voice.enhanced.en-AU.Karen',
    language: 'en-AU',
    name: 'Karen',
    quality: 2,
    novelty: false,
    personal: false,
  },
  {
    id: 'com.apple.voice.premium.en-US.Zoe',
    language: 'en-US',
    name: 'Zoe',
    quality: 3,
    novelty: true,
    personal: false,
  },
];

const random = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

const pickOf = <A>(next: () => number, list: ReadonlyArray<A>): A => {
  const index = Math.floor(next() * list.length);
  return list[index] ?? list[0] ?? pickOf(next, list);
};

type Step =
  | { readonly t: 'read'; readonly verse: string }
  | { readonly t: 'pause' | 'resume' | 'stop' | 'restart' | 'fail' }
  | { readonly t: 'choose'; readonly choice: ModelChoice }
  | {
      readonly t: 'event';
      readonly id: 'past' | 'current' | 'future';
      readonly kind: VoiceEvent['kind'];
      readonly form: number;
      readonly k: number;
    };

const FORMS = 12;

/** A concrete event from a step and the model's state: the range is a word, the next, a backward one, two words, inside a word, with a trailing space, out of bounds, negative, fractional, empty, the whole verse or a gap. */
const eventOf = (model: VoiceModel, step: Extract<Step, { t: 'event' }>): VoiceEvent => {
  const offset = { past: -1, current: 0, future: 1 }[step.id];
  const utterance = model.utterance + offset;
  const verse = model.view.verse ?? ISAIAH;
  const spans = spansOf(verse);
  const n = Math.max(1, spans.length);
  const at = (i: number) => spans[((i % n) + n) % n] ?? { start: 0, end: 1 };
  const range = (location: number, length: number): VoiceEvent => ({
    utterance,
    kind: step.kind,
    location,
    length,
  });
  const word = at(step.k);
  const forms: ReadonlyArray<() => VoiceEvent> = [
    () => range(word.start, word.end - word.start),
    () => range(at(model.view.lit).start, at(model.view.lit).end - at(model.view.lit).start),
    () => range(at(model.view.lit - 2).start, 1),
    () => range(word.start, at(step.k + 1).end - word.start),
    () => range(word.start + 1, 1),
    () => range(word.start, word.end - word.start + 1),
    () => range(verse.length - 1, 3),
    () => range(-2, 4),
    () => range(word.start + 0.25, 2),
    () => range(word.start, 0),
    () => range(0, verse.length),
    () => range(word.end, 1),
  ];
  return (forms[step.form] ?? (() => range(0, 1)))();
};

const generate = (next: () => number): Step => {
  const r = next();
  if (r < 0.15) return { t: 'read', verse: pickOf(next, VERSES) };
  if (r < 0.2) return { t: 'choose', choice: pickOf(next, ['off', 'her', 'him'] as const) };
  if (r < 0.42) {
    return {
      t: pickOf(next, [
        'pause',
        'resume',
        'stop',
        'restart',
        'fail',
        'pause',
        'resume',
        'stop',
      ] as const),
    };
  }
  return {
    t: 'event',
    id: pickOf(next, ['current', 'current', 'current', 'current', 'past', 'future'] as const),
    kind: pickOf(next, [
      'range',
      'range',
      'range',
      'range',
      'range',
      'start',
      'finish',
      'cancel',
      'interrupt',
    ] as const),
    form: Math.floor(next() * FORMS),
    k: Math.floor(next() * 50) - 5,
  };
};

/** A scripted source over plain arrays: its calls, its listeners, and a switch that fails the next speak. */
const scripted = (voices: ReadonlyArray<ModelVoice>) => {
  const calls: ModelCall[] = [];
  const listeners = new Set<(event: VoiceEvent) => void>();
  const fail = { next: false };
  const source = VoiceSource.of({
    voices: Effect.succeed(voices),
    speak: (utterance, text, speaking) =>
      Effect.suspend(() => {
        calls.push({
          type: 'speak',
          utterance,
          text,
          voice: speaking.system,
          natural: speaking.natural,
        });
        if (!fail.next) return Effect.void;
        fail.next = false;
        return Effect.fail(VoiceUnavailable.make({ reason: 'scripted' }));
      }),
    pause: Effect.sync(() => void calls.push({ type: 'pause' })),
    resume: Effect.sync(() => void calls.push({ type: 'resume' })),
    stop: Effect.sync(() => void calls.push({ type: 'stop' })),
    subscribe: (listener) =>
      Effect.acquireRelease(
        Effect.sync(() => void listeners.add(listener)),
        () => Effect.sync(() => void listeners.delete(listener)),
      ),
  });
  return { calls, listeners, fail, source };
};

const memoryStore = (backing: Map<string, string>) =>
  KeyValueStore.makeStringOnly({
    get: (key) => Effect.sync(() => backing.get(key)),
    set: (key, value) => Effect.sync(() => void backing.set(key, value)),
    remove: (key) => Effect.sync(() => void backing.delete(key)),
    clear: Effect.sync(() => backing.clear()),
    size: Effect.sync(() => backing.size),
    keys: Effect.sync(() => Array.from(backing.keys())),
  });

/** One service built in a scope of its own, so a step can close it and build the next. */
const start = (deps: Layer.Layer<VoiceSource | KeyValueStore.KeyValueStore>) =>
  Effect.gen(function* () {
    const scope = yield* Scope.make();
    const services = yield* Layer.buildWithScope(Layer.provide(layer, deps), scope);
    return { scope, voice: Context.get(services, Voice) };
  });

const invariants = (before: VoiceView, after: VoiceView, step: Step) => {
  expect(after.lit >= 0 && after.lit <= after.words).toBe(true);
  if (after.current)
    expect(after.current.first <= after.current.last && after.current.last + 1 === after.lit).toBe(
      true,
    );
  if (after.status !== 'idle')
    expect(after.enabled && after.verse !== null && after.words > 0).toBe(true);
  if (!after.enabled) expect(after.status).toBe('idle');
  if (after.ended === 'finished') expect(after.lit).toBe(after.words);
  if (step.t === 'event' && before.status !== 'idle') expect(after.lit >= before.lit).toBe(true);
};

const runHistory = (seed: number) =>
  Effect.gen(function* () {
    const next = random(seed);
    const voices = next() < 0.5 ? VOICES : VOICES.slice(0, Math.floor(next() * 3));
    const stored = pickOf(next, [undefined, 'off', 'her', 'him', 'Her', 'true', ' off']);
    const old = pickOf(next, [undefined, 'true', 'false', 'nonsense', '"false"']);
    const backing = new Map<string, string>();
    if (stored !== undefined) backing.set(KEY, stored);
    if (old !== undefined) backing.set(OLD_KEY, old);
    const model = new VoiceModel(new Map(backing), voices);
    const fake = scripted(voices);
    const deps = Layer.mergeAll(
      Layer.succeed(VoiceSource, fake.source),
      Layer.succeed(KeyValueStore.KeyValueStore, memoryStore(backing)),
    );
    let live = yield* start(deps);
    let failNext = false;
    let before = yield* live.voice.view;
    expect(before).toEqual(model.view);
    const trail: string[] = [];
    for (let i = 0; i < 40; i++) {
      const step = generate(next);
      trail.push(JSON.stringify(step));
      const callsBefore = fake.calls.length;
      switch (step.t) {
        case 'read':
          model.read(step.verse, failNext && model.view.enabled && spansOf(step.verse).length > 0);
          if (model.calls.length > callsBefore) failNext = false;
          yield* live.voice.read(step.verse);
          break;
        case 'pause':
          model.pause();
          yield* live.voice.pause;
          break;
        case 'resume':
          model.resume();
          yield* live.voice.resume;
          break;
        case 'stop':
          model.stop();
          yield* live.voice.stop;
          break;
        case 'choose':
          model.choose(step.choice);
          yield* live.voice.choose(step.choice);
          break;
        case 'restart':
          model.restart();
          yield* Scope.close(live.scope, Exit.void);
          live = yield* start(deps);
          break;
        case 'fail':
          failNext = true;
          fake.fail.next = true;
          break;
        case 'event': {
          const event = eventOf(model, step);
          model.event(event.utterance, event.kind, event.location, event.length);
          for (const listener of [...fake.listeners]) listener(event);
          expect(fake.calls.length, 'an event calls nothing').toBe(callsBefore);
          break;
        }
      }
      const after = yield* live.voice.view;
      const where = `seed ${seed}: ${trail.join(' ')}`;
      expect(after, where).toEqual(model.view);
      expect(fake.calls, where).toEqual(model.calls);
      expect(backing.get(CHOICE_KEY), where).toBe(model.store.get(KEY));
      expect(backing.get(ENABLED_KEY), where).toBe(old);
      expect(fake.listeners.size, where).toBe(1);
      invariants(before, after, step);
      before = after;
    }
    yield* Scope.close(live.scope, Exit.void);
    expect(fake.listeners.size).toBe(0);
  });

describe('the voice against its model', () => {
  it('counts the words as the matcher does, by UTF-16 spans', () => {
    for (const verse of VERSES) expect(agreesWithMatcher(verse)).toBe(true);
    expect(spansOf(ISAIAH)).toHaveLength(sourceWords(ISAIAH).length);
    expect(spansOf(VERSES[1] ?? '')[0]).toEqual({ start: 0, end: 5 });
  });

  it('agrees on 300 seeded histories of 40 steps', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        for (let seed = 1; seed <= 300; seed++) yield* runHistory(seed);
      }),
    ));

  it('picks the best eligible English voice over 2,000 generated lists', () => {
    const languages = ['en-US', 'en-GB', 'en', 'en-us', 'EN-US', 'en_US', 'eng', 'fr-FR', ''];
    for (let seed = 1; seed <= 2000; seed++) {
      const next = random(seed * 31);
      const voices = Array.from({ length: Math.floor(next() * 6) }, (_, i) => ({
        id: `${pickOf(next, ['a', 'b', 'Z'])}.${Math.floor(next() * 3)}.${i % 2}`,
        language: pickOf(next, languages),
        name: `v${i}`,
        quality: 1 + Math.floor(next() * 3),
        novelty: next() < 0.25,
        personal: next() < 0.2,
      }));
      expect(Option.getOrUndefined(bestVoice(voices)), JSON.stringify(voices)).toEqual(
        pickVoice(voices),
      );
    }
  });

  it('waits on no pending speak, and a late failure ends only its own reading', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const held = yield* Queue.unbounded<{
            readonly utterance: number;
            readonly done: Deferred.Deferred<boolean>;
          }>();
          const calls: string[] = [];
          const source = VoiceSource.of({
            voices: Effect.succeed([]),
            speak: (utterance) =>
              Effect.gen(function* () {
                const done = yield* Deferred.make<boolean>();
                yield* Queue.offer(held, { utterance, done });
                if (!(yield* Deferred.await(done)))
                  return yield* VoiceUnavailable.make({ reason: 'held' });
              }),
            pause: Effect.sync(() => void calls.push('pause')),
            resume: Effect.sync(() => void calls.push('resume')),
            stop: Effect.sync(() => void calls.push('stop')),
            subscribe: () => Effect.void,
          });
          const services = yield* Layer.build(
            Layer.provide(
              layer,
              Layer.mergeAll(Layer.succeed(VoiceSource, source), KeyValueStore.layerMemory),
            ),
          );
          const voice = Context.get(services, Voice);
          const first = yield* Effect.forkChild(voice.read(ISAIAH));
          const one = yield* Queue.take(held);
          const second = yield* Effect.forkChild(voice.read('Jesus wept.'));
          const two = yield* Queue.take(held);
          yield* voice.pause;
          expect(yield* voice.view).toMatchObject({ status: 'paused', verse: 'Jesus wept.' });
          yield* Deferred.succeed(one.done, false);
          yield* Fiber.join(first);
          expect(yield* voice.view).toMatchObject({
            status: 'paused',
            verse: 'Jesus wept.',
            ended: null,
          });
          yield* voice.stop;
          expect(yield* voice.view).toMatchObject({ status: 'idle', ended: 'stopped' });
          yield* Deferred.succeed(two.done, false);
          yield* Fiber.join(second);
          expect(yield* voice.view).toMatchObject({ status: 'idle', ended: 'stopped' });
          expect([one.utterance, two.utterance]).toEqual([1, 2]);
          expect(calls).toEqual(['pause', 'stop']);
        }),
      ),
    ));

  it('lights a range a source sends inside its own speak call, by UTF-16 spans', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const verse = '\u{1D509}ear cafe\u0301';
          const listeners = new Set<(event: VoiceEvent) => void>();
          const spoken: string[] = [];
          const source = VoiceSource.of({
            voices: Effect.succeed([]),
            speak: (utterance, text) =>
              Effect.sync(() => {
                spoken.push(text);
                for (const listener of listeners)
                  listener({ utterance, kind: 'range', location: 6, length: 5 });
              }),
            pause: Effect.void,
            resume: Effect.void,
            stop: Effect.void,
            subscribe: (listener) =>
              Effect.acquireRelease(
                Effect.sync(() => void listeners.add(listener)),
                () => Effect.sync(() => void listeners.delete(listener)),
              ),
          });
          const services = yield* Layer.build(
            Layer.provide(
              layer,
              Layer.mergeAll(Layer.succeed(VoiceSource, source), KeyValueStore.layerMemory),
            ),
          );
          const voice = Context.get(services, Voice);
          yield* voice.read(verse);
          const view = yield* voice.view;
          expect(spoken).toEqual([verse]);
          expect(view).toMatchObject({
            status: 'reading',
            words: 2,
            lit: 2,
            current: { first: 1, last: 1 },
          });
          expect(Option.getOrUndefined(yield* Stream.runHead(voice.changes))).toEqual(view);
        }),
      ),
    ));

  it('closing a paused service twice stops it once and lets go of its listener', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const fake = scripted([]);
        const live = yield* start(
          Layer.mergeAll(Layer.succeed(VoiceSource, fake.source), KeyValueStore.layerMemory),
        );
        yield* live.voice.read('one two');
        yield* live.voice.pause;
        yield* Scope.close(live.scope, Exit.void);
        yield* Scope.close(live.scope, Exit.void);
        expect(fake.calls.map((c) => c.type)).toEqual(['speak', 'pause', 'stop']);
        expect(fake.listeners.size).toBe(0);
      }),
    ));

  it('starts its changes at the current view, and closing a reading service stops it once', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const fake = scripted(VOICES);
        const backing = new Map<string, string>();
        const deps = Layer.mergeAll(
          Layer.succeed(VoiceSource, fake.source),
          Layer.succeed(KeyValueStore.KeyValueStore, memoryStore(backing)),
        );
        const live = yield* start(deps);
        yield* live.voice.read(ISAIAH);
        const head = yield* Stream.runHead(live.voice.changes);
        expect(Option.getOrUndefined(head)).toEqual(yield* live.voice.view);
        yield* Scope.close(live.scope, Exit.void);
        expect(fake.calls.map((c) => c.type)).toEqual(['speak', 'stop']);
        expect(fake.listeners.size).toBe(0);
        expect(backing.size).toBe(0);
      }),
    ));
});
