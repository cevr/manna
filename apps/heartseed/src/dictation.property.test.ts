/* oxlint-disable effect/noTernary, effect/noNullish, effect/noGlobals -- the test drives the service from plain branches and reads the contract's nulls in its views; it names each failing history as JSON text. */

/**
 * The Dictation service against its own model (`test/dictation-model.ts`,
 * written from the hsdictate spec) under Effect's TestClock, over seeded
 * histories of every command and event: starts of the passage, made-up
 * verses with astral letters, a combining mark, a no-break space and no
 * words at all; finish, cancel, peek, waits around the grace, a restart of
 * the service, refused listens; and an adversarial source that sends any
 * event of a past, the current or a future session at any step, results
 * with runs of every shape and times that are NaN, infinite, negative,
 * backward or huge, and failures of every reason. After each step the
 * view (the matcher's included), the source's calls, the endings and the
 * one live subscription must agree with the model, every snapshot the
 * model fed the matcher must be one it accepts, and the invariants hold
 * on the service's own view. A held listen, the changes window and the
 * endings of a slow reader are tested apart.
 */

import { describe, expect, it } from 'bun:test';
import { Context, Deferred, Effect, Exit, Fiber, Layer, Scope, Stream } from 'effect';
import * as TestClock from 'effect/testing/TestClock';
import passage from 'virtual:heartseed-passage';

import {
  CHAIN,
  Dictation,
  DictationSource,
  DictationUnavailable,
  layer,
  type DictationEvent,
  type DictationView,
} from './dictation';
import {
  DictationModel,
  type ModelCall,
  type ModelCue,
  type ModelEvent,
  type ModelRun,
  type ModelView,
} from './test/dictation-model';

const VERSES: readonly string[] = [
  passage.text,
  'Alpha beta, gamma; delta — epsilon: zeta.',
  '\u{1D509}irst café naïve word \u{1F64F} 41:10 «end».',
  'Same same, same again; again.',
  'One.',
  ' — ; … ',
  '',
];

const TOKENS: readonly string[] = [
  'alpha',
  'Beta,',
  'same',
  'again',
  'café',
  '41:10',
  'x',
  '',
  ' ',
  '—',
  ',',
  '\u{1F64F}',
  'a b',
  ' c\td ',
  'e f',
  "it's",
];
const TIMES: readonly number[] = [
  0,
  1,
  75,
  120.5,
  999,
  -0,
  -5,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  1e15,
];
const REASONS: readonly string[] = [
  'unavailable',
  'unavailable',
  'denied',
  'interrupted',
  'error',
  '',
  'other',
];

const random = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

const below = (next: () => number, n: number) => Math.floor(next() * n);

const pickOf = <A>(next: () => number, list: readonly A[]): A =>
  list[below(next, list.length)] ?? list[0] ?? pickOf(next, list);

/** A number for a list of words (FNV-1a over them joined), so a failing comparison prints no verse word. */
const fingerprint = (words: readonly string[]) => {
  let hash = 0x811c9dc5;
  for (const char of words.join('\u0000'))
    hash = Math.imul(hash ^ (char.codePointAt(0) ?? 0), 0x01000193) >>> 0;
  return `${words.length} words #${hash.toString(16)}`;
};

/** A view with its verse named by its index in VERSES and each revealed word by a fingerprint, so a failure prints no verse text. */
const redact = (view: DictationView | ModelView) => ({
  ...view,
  verse: view.verse === null ? null : VERSES.indexOf(view.verse),
  matcher:
    view.matcher === null
      ? null
      : {
          ...view.matcher,
          marks: view.matcher.marks.map((mark) => ({
            ...mark,
            revealed: mark.revealed === null ? null : fingerprint([mark.revealed]),
          })),
        },
});

/** The calls with each listen's hints as a fingerprint. */
const redactCalls = (calls: readonly ModelCall[]) =>
  calls.map((call) =>
    call.type === 'listen' ? { ...call, hints: fingerprint(call.hints) } : call,
  );

/** Runs of every shape: verse words, made-up tokens, punctuation, several words in one run, backward and out-of-range times. */
const runsOf = (next: () => number, verse: string | null): ModelRun[] => {
  const words = verse === null ? [] : verse.split(/\s+/u).filter((w) => w.length > 0);
  let t = below(next, 3) * 100;
  return Array.from({ length: below(next, 5) }, () => {
    const text = words.length > 0 && next() < 0.5 ? pickOf(next, words) : pickOf(next, TOKENS);
    const form = below(next, 6);
    if (form <= 2) {
      const d = 40 + below(next, 200);
      const run = { text, start: t, end: t + d };
      t += d + below(next, 40);
      return run;
    }
    if (form === 3) return { text, start: t + 400, end: t + 100 };
    if (form === 4) return { text, start: t - 300, end: t - 200 };
    return { text, start: pickOf(next, TIMES), end: pickOf(next, TIMES) };
  });
};

type Who = 'past' | 'current' | 'future';

type Step =
  | { readonly t: 'start'; readonly verse: number; readonly cue: ModelCue }
  | { readonly t: 'finish' | 'cancel' | 'refuse' | 'restart' }
  | { readonly t: 'peek'; readonly index: number }
  | { readonly t: 'wait'; readonly ms: number }
  | {
      readonly t: 'event';
      readonly who: Who;
      readonly kind: ModelEvent['kind'];
      readonly final: boolean;
      readonly reason: string;
      readonly seed: number;
    };

const generate = (next: () => number): Step => {
  const r = next();
  if (r < 0.12)
    return {
      t: 'start',
      verse: below(next, VERSES.length),
      cue: pickOf(next, ['none', 'initials', 'full'] as const),
    };
  if (r < 0.18) return { t: 'finish' };
  if (r < 0.22) return { t: 'cancel' };
  if (r < 0.27) return { t: 'peek', index: below(next, 40) - 2 };
  if (r < 0.31) return { t: 'refuse' };
  if (r < 0.38) return { t: 'wait', ms: pickOf(next, [1, 100, 1499, 1500, 3000]) };
  if (r < 0.4) return { t: 'restart' };
  return {
    t: 'event',
    who: pickOf(next, ['current', 'current', 'current', 'past', 'future'] as const),
    kind: pickOf(next, ['start', 'result', 'result', 'result', 'end', 'fail'] as const),
    final: next() < 0.4,
    reason: pickOf(next, REASONS),
    seed: below(next, 1e9),
  };
};

/** A source over plain arrays: its calls, its listeners, and a count of the next listens to refuse. */
const fakeSource = () => {
  const calls: ModelCall[] = [];
  const listeners = new Set<(event: DictationEvent) => void>();
  const refuse = { next: 0 };
  const source = DictationSource.of({
    engines: () => Effect.succeed(CHAIN.map((engine) => ({ engine, status: 'ready' }))),
    listen: (session, engine, locale, hints) =>
      Effect.suspend(() => {
        calls.push({ type: 'listen', session, engine, locale, hints: [...hints] });
        if (refuse.next === 0) return Effect.void;
        refuse.next -= 1;
        return Effect.fail(DictationUnavailable.make({ reason: 'refused' }));
      }),
    finish: Effect.sync(() => void calls.push({ type: 'finish' })),
    cancel: Effect.sync(() => void calls.push({ type: 'cancel' })),
    subscribe: (listener) =>
      Effect.acquireRelease(
        Effect.sync(() => void listeners.add(listener)),
        () => Effect.sync(() => void listeners.delete(listener)),
      ),
  });
  return { calls, listeners, refuse, source };
};

/** One service in a scope of its own, under a TestClock of its own, with a reader of every ending. */
const build = (source: Layer.Layer<DictationSource>) =>
  Effect.gen(function* () {
    const scope = yield* Scope.make();
    const services = yield* Layer.buildWithScope(
      layer.pipe(Layer.provide(source), Layer.provideMerge(TestClock.layer())),
      scope,
    );
    const dictation = Context.get(services, Dictation);
    const endings: DictationView[] = [];
    yield* Effect.forkIn(
      Stream.runForEach(dictation.endings, (view) => Effect.sync(() => void endings.push(view))),
      scope,
    );
    return { scope, services, dictation, endings };
  });

/** Lets the endings reader take what was published. */
const settle = Effect.gen(function* () {
  for (let i = 0; i < 3; i++) yield* Effect.yieldNow;
});

const invariants = (view: DictationView) => {
  if (view.ended !== null) expect(view.status).toBe('idle');
  if (view.status !== 'idle') {
    expect(CHAIN.some((engine) => engine === view.engine)).toBe(true);
    expect(view.verse).not.toBeNull();
    expect(view.matcher).not.toBeNull();
  }
  expect(view.matcher?.finished === true).toBe(view.ended === 'finished');
};

const runHistory = (seed: number) =>
  Effect.gen(function* () {
    const next = random(seed);
    const fake = fakeSource();
    const source = Layer.succeed(DictationSource, fake.source);
    const model = new DictationModel();
    let live = yield* build(source);
    let endingsBefore: DictationView[] = [];
    const trail: string[] = [];
    const steps: Step[] = [{ t: 'start', verse: below(next, VERSES.length), cue: 'none' }];
    for (let i = 0; i < 30; i++) steps.push(generate(next));
    let refusals = 0;
    /** The listens the model asked for since `from` that the fake refuses, answered as the service sees them. */
    const answer = (from: number) => {
      for (let i = from; i < model.calls.length; i++) {
        const call = model.calls[i];
        if (call?.type !== 'listen' || refusals === 0) continue;
        refusals -= 1;
        model.refused(call.session);
      }
    };
    for (const step of steps) {
      trail.push(JSON.stringify(step));
      const before = model.calls.length;
      switch (step.t) {
        case 'start': {
          const verse = VERSES[step.verse] ?? '';
          model.start(verse, step.cue);
          answer(before);
          yield* live.dictation.start(verse, step.cue);
          break;
        }
        case 'finish':
          model.finish();
          yield* live.dictation.finish;
          break;
        case 'cancel':
          model.cancel();
          yield* live.dictation.cancel;
          break;
        case 'peek':
          model.peek(step.index);
          yield* live.dictation.peek(step.index);
          break;
        case 'refuse':
          refusals += 1;
          fake.refuse.next += 1;
          break;
        case 'wait':
          model.elapse(step.ms);
          yield* Effect.provideContext(TestClock.adjust(step.ms), live.services);
          break;
        case 'restart':
          model.restart();
          yield* Scope.close(live.scope, Exit.void);
          expect(fake.listeners.size).toBe(0);
          refusals = 0;
          fake.refuse.next = 0;
          endingsBefore = [...endingsBefore, ...live.endings];
          live = yield* build(source);
          break;
        case 'event': {
          const offset = { past: -1 - (step.seed % 2), current: 0, future: 1 + (step.seed % 3) }[
            step.who
          ];
          const event: DictationEvent = {
            session: Math.max(0, model.session + offset),
            kind: step.kind,
            final: step.final,
            runs: step.kind === 'result' ? runsOf(random(step.seed), model.view.verse) : [],
            reason: step.reason,
          };
          model.event(event);
          answer(before);
          for (const listener of [...fake.listeners]) listener(event);
          break;
        }
      }
      yield* settle;
      const view = yield* live.dictation.view;
      const where = `seed ${seed}: ${trail.join(' ')}`;
      expect(redact(view), where).toEqual(redact(model.view));
      expect(redactCalls(fake.calls), where).toEqual(redactCalls(model.calls));
      expect([...endingsBefore, ...live.endings].map(redact), where).toEqual(
        model.endings.map(redact),
      );
      expect(fake.listeners.size, where).toBe(1);
      expect(model.accepted, where).toBe(true);
      invariants(view);
    }
    model.restart();
    yield* Scope.close(live.scope, Exit.void);
    expect(redactCalls(fake.calls)).toEqual(redactCalls(model.calls));
    expect(fake.listeners.size).toBe(0);
  });

describe('the dictation service against its model', () => {
  it('agrees on 250 seeded histories of 31 steps', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        for (let seed = 1; seed <= 250; seed++) yield* runHistory(seed);
      }),
    ));

  it('waits on no pending listen, and a late refusal leaves a newer recital as it was', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const gate = yield* Deferred.make<void, DictationUnavailable>();
        const calls: string[] = [];
        const source = DictationSource.of({
          engines: () => Effect.succeed([]),
          listen: (session) =>
            Effect.suspend(() => {
              calls.push(`listen ${session}`);
              if (session === 1) return Deferred.await(gate);
              return Effect.void;
            }),
          finish: Effect.sync(() => void calls.push('finish')),
          cancel: Effect.sync(() => void calls.push('cancel')),
          subscribe: () => Effect.void,
        });
        const live = yield* build(Layer.succeed(DictationSource, source));
        const held = yield* Effect.forkChild(live.dictation.start(passage.text));
        yield* settle;
        yield* live.dictation.cancel;
        expect((yield* live.dictation.view).ended).toBe('cancelled');
        yield* live.dictation.start(passage.text);
        const fresh = yield* live.dictation.view;
        yield* Deferred.fail(gate, DictationUnavailable.make({ reason: 'late' }));
        yield* Fiber.join(held);
        expect(redact(yield* live.dictation.view)).toEqual(redact(fresh));
        expect(calls).toEqual(['listen 1', 'cancel', 'listen 2']);
        yield* Scope.close(live.scope, Exit.void);
      }),
    ));

  it('starts changes at the current view and keeps a bounded window of a 10,000-view burst', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const fake = fakeSource();
        const live = yield* build(Layer.succeed(DictationSource, fake.source));
        yield* live.dictation.start(passage.text);
        const head = yield* Stream.runHead(live.dictation.changes);
        expect(head._tag).toBe('Some');
        if (head._tag === 'Some')
          expect(redact(head.value)).toEqual(redact(yield* live.dictation.view));
        const entered = yield* Deferred.make<void>();
        const resume = yield* Deferred.make<void>();
        const seen: DictationView[] = [];
        const consumer = yield* Effect.forkChild(
          Stream.runForEach(
            Stream.takeUntil(live.dictation.changes, (view) => view.ended === 'finished'),
            (view) =>
              Effect.gen(function* () {
                seen.push(view);
                if (seen.length > 1) return;
                yield* Deferred.succeed(entered, undefined);
                yield* Deferred.await(resume);
              }),
          ),
        );
        yield* Deferred.await(entered);
        for (let i = 0; i < 5000; i++) {
          yield* live.dictation.start(passage.text);
          yield* live.dictation.cancel;
        }
        yield* live.dictation.start(passage.text);
        const session = fake.calls.filter((call) => call.type === 'listen').length;
        for (const listener of fake.listeners)
          listener({ session, kind: 'end', final: false, runs: [], reason: '' });
        const latest = yield* live.dictation.view;
        expect(seen).toHaveLength(1);
        yield* Deferred.succeed(resume, undefined);
        yield* Fiber.join(consumer);
        expect(seen.length - 1).toBeLessThanOrEqual(16);
        expect(seen.map(redact).at(-1)).toEqual(redact(latest));
        yield* Scope.close(live.scope, Exit.void);
      }),
    ));

  it('gives a slow reader of endings every one of 101 endings, in order', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const fake = fakeSource();
        const live = yield* build(Layer.succeed(DictationSource, fake.source));
        const entered = yield* Deferred.make<void>();
        const resume = yield* Deferred.make<void>();
        const read: DictationView[] = [];
        const reader = yield* Effect.forkChild(
          Stream.runForEach(Stream.take(live.dictation.endings, 101), (view) =>
            Effect.gen(function* () {
              read.push(view);
              if (read.length > 1) return;
              yield* Deferred.succeed(entered, undefined);
              yield* Deferred.await(resume);
            }),
          ),
        );
        yield* settle;
        for (let i = 0; i < 100; i++) {
          yield* live.dictation.start(passage.text);
          yield* live.dictation.cancel;
          if (i === 0) yield* Deferred.await(entered);
        }
        yield* live.dictation.start(passage.text);
        yield* live.dictation.finish;
        yield* Effect.provideContext(TestClock.adjust(1500), live.services);
        yield* Deferred.succeed(resume, undefined);
        yield* Fiber.join(reader);
        expect(read.map((view) => String(view.ended))).toEqual([
          ...Array.from({ length: 100 }, () => 'cancelled'),
          'finished',
        ]);
        expect(read.every((view) => view.status === 'idle')).toBe(true);
        yield* Scope.close(live.scope, Exit.void);
      }),
    ));
});
