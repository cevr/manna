/* oxlint-disable effect/noTernary, effect/noNullish, effect/noGlobals -- the test drives the service from plain branches and reads the contract's nulls in its views; it names each failing history as JSON text. */

/**
 * The Voice service's seek against its model (`test/voice-model.ts`) over
 * seeded histories: reads, seeks in range and out of it (negative, past the
 * last word, fractional, NaN), seeks while paused and while idle, pauses,
 * resumes, stops, choices, a speak that fails, and a source that sends any
 * event of a past, the current or a future utterance. A range is drawn in
 * the coordinates of the text the current utterance speaks: a word of it,
 * its very last unit, one past its end, a range read as if from the verse's
 * start, and malformed ones. The texts put astral letters, marks and
 * mark-only runs before the sought words. After each step the view and the
 * source's calls agree with the model, and within one utterance `lit` never
 * falls.
 */

import { describe, expect, it } from 'bun:test';
import { Context, Effect, Exit, Layer, Scope } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';

import { spansOf, VoiceModel, type ModelCall, type ModelVoice } from '../test/voice-model';
import { layer, Voice, VoiceSource, VoiceUnavailable, type VoiceEvent } from '../voice';

const TEXTS: ReadonlyArray<string> = [
  'alpha beta gamma delta epsilon zeta eta theta iota kappa',
  '\u{1D4D5}ab \u{1F64F}\u{1F64F} cd \u2014 ef\tgh... ij kl\u0301 mn.',
  '... Ab cd... ef \u2014 gh \u2026 ij',
  ' \u2014 ; \u2026 ',
  'x',
  '',
  'a\u00a0b c\u0301d \u{1F64F}e f',
];

const VOICES: ReadonlyArray<ModelVoice> = [
  {
    id: 'test.en-US',
    language: 'en-US',
    name: 'Test',
    quality: 2,
    novelty: false,
    personal: false,
  },
];

const KINDS = [
  'range',
  'range',
  'range',
  'range',
  'range',
  'range',
  'start',
  'finish',
  'interrupt',
] as const;

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

/** A scripted source over plain arrays: its calls, its listeners, and a switch that fails the next speak. */
const scripted = () => {
  const calls: ModelCall[] = [];
  const listeners = new Set<(event: VoiceEvent) => void>();
  const fail = { next: false };
  const source = VoiceSource.of({
    voices: Effect.succeed(VOICES),
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

/** A range in the spoken text's coordinates: a word of the tail, the tail's last unit, one past its end, a word's verse coordinates, or a malformed one. */
const rangeOf = (model: VoiceModel, next: () => number): { location: number; length: number } => {
  const verse = model.view.verse ?? '';
  const spoken = verse.length - model.offset;
  const tail = spansOf(verse)
    .filter((span) => span.start >= model.offset)
    .map((span) => ({ start: span.start - model.offset, end: span.end - model.offset }));
  const word = pickOf(next, tail.length > 0 ? tail : [{ start: 0, end: 1 }]);
  const verseWord = pickOf(next, spansOf(verse).length > 0 ? spansOf(verse) : [word]);
  const forms: ReadonlyArray<{ location: number; length: number }> = [
    { location: word.start, length: word.end - word.start },
    { location: word.start, length: word.end - word.start },
    { location: word.start + 1, length: 1 },
    { location: spoken - 1, length: 1 },
    { location: spoken - 1, length: 2 },
    { location: verseWord.start, length: verseWord.end - verseWord.start },
    { location: 0, length: spoken },
    { location: -1, length: 2 },
    { location: word.start + 0.5, length: 1 },
    { location: word.start, length: 0 },
    { location: word.end, length: 1 },
  ];
  return pickOf(next, forms);
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

const floors = { seeks: 0, paused: 0, back: 0, ignored: 0, rangesAfterSeek: 0 };

/** One history's service, model, source and the steps it has taken. */
interface World {
  readonly next: () => number;
  readonly model: VoiceModel;
  readonly fake: ReturnType<typeof scripted>;
  readonly voice: Voice['Service'];
  readonly trail: string[];
  failNext: boolean;
}

const readStep = (world: World) => {
  const { model } = world;
  const text = pickOf(world.next, TEXTS);
  world.trail.push(`read(${TEXTS.indexOf(text)})`);
  const callsBefore = model.calls.length;
  model.read(text, world.failNext && model.view.enabled && spansOf(text).length > 0);
  if (model.calls.length > callsBefore) world.failNext = false;
  return world.voice.read(text);
};

const seekStep = (world: World) => {
  const { model, next } = world;
  const words = model.view.words;
  const any = () => Math.floor(next() * words);
  const k = pickOf(next, [any(), any(), any(), words - 1, -1, words, 1.5, Number.NaN]);
  world.trail.push(`seek(${k})`);
  const callsBefore = model.calls.length;
  const { status, lit } = model.view;
  model.seek(k, world.failNext);
  if (model.calls.length === callsBefore) floors.ignored += 1;
  else {
    world.failNext = false;
    floors.seeks += 1;
    if (status === 'paused') floors.paused += 1;
    if (k < lit) floors.back += 1;
  }
  return world.voice.seek(k);
};

const eventStep = (world: World) => {
  const { model, next } = world;
  const range = rangeOf(model, next);
  const event: VoiceEvent = {
    utterance: model.utterance + pickOf(next, [0, 0, 0, 0, 0, -1, 1]),
    kind: pickOf(next, KINDS),
    ...range,
  };
  world.trail.push(`event(${JSON.stringify(event)})`);
  if (event.kind === 'range' && model.offset > 0 && event.utterance === model.utterance)
    floors.rangesAfterSeek += 1;
  model.event(event.utterance, event.kind, event.location, event.length);
  for (const listener of [...world.fake.listeners]) listener(event);
  return Effect.void;
};

const chooseStep = (world: World) => {
  const choice = pickOf(world.next, ['off', 'her', 'him'] as const);
  world.trail.push(`choose(${choice})`);
  world.model.choose(choice);
  return world.voice.choose(choice);
};

const failStep = (world: World) => {
  world.trail.push('fail');
  world.failNext = true;
  world.fake.fail.next = true;
  return Effect.void;
};

/** A command with no argument, applied to the model and the service alike. */
const command = (name: 'pause' | 'resume' | 'stop') => (world: World) => {
  world.trail.push(name);
  world.model[name]();
  return world.voice[name];
};

/** Each step's share of a history, by its upper bound on the roll. */
const STEPS: ReadonlyArray<readonly [number, (world: World) => Effect.Effect<void>]> = [
  [0.1, readStep],
  [0.36, seekStep],
  [0.43, command('pause')],
  [0.5, command('resume')],
  [0.53, command('stop')],
  [0.56, chooseStep],
  [0.58, failStep],
  [1, eventStep],
];

const runHistory = (seed: number) =>
  Effect.gen(function* () {
    const next = random(seed);
    const backing = new Map([
      ['heartseed/voice/choice', pickOf(next, ['her', 'him', 'her', 'off'])],
    ]);
    const model = new VoiceModel(new Map(backing), VOICES);
    const fake = scripted();
    const scope = yield* Scope.make();
    const services = yield* Layer.buildWithScope(
      Layer.provide(
        layer,
        Layer.mergeAll(
          Layer.succeed(VoiceSource, fake.source),
          Layer.succeed(KeyValueStore.KeyValueStore, memoryStore(backing)),
        ),
      ),
      scope,
    );
    const world: World = {
      next,
      model,
      fake,
      voice: Context.get(services, Voice),
      trail: [],
      failNext: false,
    };
    for (let i = 0; i < 50; i++) {
      const roll = next();
      const id = model.utterance;
      const lit = model.view.lit;
      const [, take] = STEPS.find(([bound]) => roll < bound) ?? [1, eventStep];
      yield* take(world);
      const where = `seed ${seed}: ${world.trail.slice(-8).join(' ')}`;
      expect(yield* world.voice.view, where).toEqual(model.view);
      expect(fake.calls, where).toEqual(model.calls);
      if (model.utterance === id && model.view.status !== 'idle')
        expect(model.view.lit >= lit, where).toBe(true);
    }
    yield* Scope.close(scope, Exit.void);
  });

describe('the seek against the model', () => {
  it('agrees on 90 seeded histories of 50 steps', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        for (let seed = 1; seed <= 90; seed++) yield* runHistory(seed);
        expect(floors.seeks).toBeGreaterThan(120);
        expect(floors.paused).toBeGreaterThan(8);
        expect(floors.back).toBeGreaterThan(30);
        expect(floors.ignored).toBeGreaterThan(150);
        expect(floors.rangesAfterSeek).toBeGreaterThan(80);
      }),
    ));

  it('lights the words of a sought tail past an astral letter, up to its last unit', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const fake = scripted();
          const services = yield* Layer.build(
            Layer.provide(
              layer,
              Layer.mergeAll(Layer.succeed(VoiceSource, fake.source), KeyValueStore.layerMemory),
            ),
          );
          const voice = Context.get(services, Voice);
          const send = (event: VoiceEvent) => {
            for (const listener of [...fake.listeners]) listener(event);
          };
          const text = '\u{1F64F}a bc de';
          yield* voice.read(text);
          yield* voice.seek(1);
          expect(fake.calls.at(-1)).toEqual({
            type: 'speak',
            utterance: 2,
            text: 'bc de',
            voice: 'test.en-US',
            natural: 'af_heart',
          });
          expect(yield* voice.view).toMatchObject({ lit: 1, current: null, status: 'reading' });
          send({ utterance: 2, kind: 'range', location: 3, length: 2 });
          expect(yield* voice.view).toMatchObject({ lit: 3, current: { first: 2, last: 2 } });
          send({ utterance: 2, kind: 'range', location: 4, length: 2 });
          expect(yield* voice.view).toMatchObject({ lit: 3, current: { first: 2, last: 2 } });
          yield* voice.seek(0);
          send({ utterance: 3, kind: 'range', location: 0, length: 3 });
          expect(yield* voice.view).toMatchObject({ lit: 1, current: { first: 0, last: 0 } });
          yield* voice.stop;
          const calls = fake.calls.length;
          yield* voice.seek(1);
          expect(fake.calls).toHaveLength(calls);
          expect(yield* voice.view).toMatchObject({ status: 'idle', ended: 'stopped' });
        }),
      ),
    ));
});
