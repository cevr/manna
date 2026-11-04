/* oxlint-disable effect/noNullish -- the test reads the contract's nulls in the matcher's marks. */

/**
 * The scripted word source: `recite` writes a recital as a recognizer
 * reports it (a growing tentative tail, finalized every `every` words and
 * at the last), and `scriptedSource` plays it through the Dictation
 * service on Effect's TestClock: each result at its time, the rest at
 * once on a finish, nothing more after a cancel or a newer listen. Only
 * made-up verses are used.
 */

import { describe, expect, it } from 'bun:test';
import { Context, Effect, Exit, Layer, Scope } from 'effect';
import * as TestClock from 'effect/testing/TestClock';

import { Dictation, DictationSource, layer, type DictationEvent } from '../dictation';
import { sourceWords } from '../matcher/words';
import { recite, scriptedSource, type DictationStep } from './script';

const VERSE = 'Alpha beta, gamma; delta — epsilon zeta: eta.';

describe('recite', () => {
  it('writes a growing tail after each word, finalized every `every` words and at the last', () => {
    expect(recite('one two three', { skip: [1], every: 5, pace: 100 })).toEqual([
      { at: 50, final: false, runs: [{ text: 'one', start: 0, end: 50 }] },
      {
        at: 150,
        final: false,
        runs: [
          { text: 'one', start: 0, end: 50 },
          { text: 'three', start: 100, end: 150 },
        ],
      },
      {
        at: 150,
        final: true,
        runs: [
          { text: 'one', start: 0, end: 50 },
          { text: 'three', start: 100, end: 150 },
        ],
      },
    ]);
    expect(
      recite('one two', { every: 1, pace: 10 }).map((step) => [
        step.at,
        step.final,
        step.runs.length,
      ]),
    ).toEqual([
      [5, false, 1],
      [5, true, 1],
      [15, false, 1],
      [15, true, 1],
    ]);
    expect(recite(' — ; ')).toEqual([]);
  });

  it('defaults to every 5 words at 150 ms each, and its finals cover every spoken word once, in order', () => {
    const verse = Array.from({ length: 23 }, (_, i) => `w${i},`).join(' ');
    const steps = recite(verse);
    const finals = steps.filter((step) => step.final);
    expect(finals.map((step) => step.runs.length)).toEqual([5, 5, 5, 5, 3]);
    expect(finals.flatMap((step) => step.runs.map((run) => run.text))).toEqual([
      ...sourceWords(verse),
    ]);
    expect(steps.filter((step) => !step.final)).toHaveLength(23);
    expect(steps.at(-1)?.runs.at(-1)).toEqual({
      text: 'w22,',
      start: 22 * 150,
      end: 22 * 150 + 75,
    });
    for (let seed = 1; seed <= 200; seed++) {
      const words = 1 + (seed % 17);
      const every = 1 + (seed % 6);
      const skip = [seed % words, (seed * 7) % words];
      const v = Array.from({ length: words }, (_, i) => `v${i}`).join(' ');
      const spoken = sourceWords(v).filter((_, i) => !skip.includes(i));
      const got = recite(v, { skip, every, pace: 40 });
      const done = got.filter((step) => step.final);
      expect({ seed, finals: done.map((step) => step.runs.length) }).toEqual({
        seed,
        finals: Array.from({ length: Math.ceil(spoken.length / every) }, (_, i) =>
          Math.min(every, spoken.length - i * every),
        ),
      });
      expect(done.flatMap((step) => step.runs.map((run) => run.text))).toEqual(spoken);
      for (const step of got) expect(step.runs.at(-1)?.end).toBe(step.at);
    }
  });
});

/** The service over `scriptedSource(steps)` under a TestClock, with every event the source sent recorded. */
const play = (steps: readonly DictationStep[]) =>
  Effect.gen(function* () {
    const scope = yield* Scope.make();
    const events: DictationEvent[] = [];
    const tap = Layer.effect(
      DictationSource,
      Effect.gen(function* () {
        const inner = yield* DictationSource;
        return DictationSource.of({
          ...inner,
          subscribe: (listener) =>
            inner.subscribe((event) => {
              events.push(event);
              listener(event);
            }),
        });
      }),
    ).pipe(Layer.provide(scriptedSource(steps)));
    const services = yield* Layer.buildWithScope(
      layer.pipe(Layer.provide(tap), Layer.provideMerge(TestClock.layer())),
      scope,
    );
    const dictation = Context.get(services, Dictation);
    const wait = (ms: number) => Effect.provideContext(TestClock.adjust(ms), services);
    return { scope, dictation, events, wait };
  });

const statuses = (marks: ReadonlyArray<{ readonly status: string }> | undefined) =>
  (marks ?? []).map((mark) => mark.status);

describe('the scripted source through the service', () => {
  it('plays each result at its time and ends: spoken words matched at the script’s time, skipped words missed', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const steps = recite(VERSE, { skip: [2, 5], every: 2, pace: 100 });
        const live = yield* play(steps);
        yield* live.dictation.start(VERSE);
        expect(live.events.map((event) => event.kind)).toEqual(['start']);
        yield* live.wait(49);
        expect(live.events).toHaveLength(1);
        yield* live.wait(1);
        expect(live.events.map((event) => [event.kind, event.final])).toEqual([
          ['start', false],
          ['result', false],
        ]);
        expect(statuses((yield* live.dictation.view).matcher?.marks)[0]).toBe('tentative');
        yield* live.wait(10_000);
        const view = yield* live.dictation.view;
        expect(view.ended).toBe('finished');
        expect(live.events.at(-1)?.kind).toBe('end');
        expect(live.events.filter((event) => event.kind === 'result')).toHaveLength(steps.length);
        expect(statuses(view.matcher?.marks)).toEqual([
          'matched',
          'matched',
          'miss',
          'matched',
          'matched',
          'miss',
          'matched',
        ]);
        const times = (view.matcher?.marks ?? []).flatMap((mark) => {
          if (mark.time === null) return [];
          return [mark.time];
        });
        expect(times).toEqual([0, 1, 2, 3, 4].map((n) => ({ start: n * 100, end: n * 100 + 50 })));
        expect(view.matcher?.suggestedGrade).toBe(1);
        yield* Scope.close(live.scope, Exit.void);
      }),
    ));

  it('sends the rest at once and ends on a finish, and nothing more after a cancel', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const steps = recite(VERSE, { every: 3, pace: 100 });
        const finished = yield* play(steps);
        yield* finished.dictation.start(VERSE);
        yield* finished.wait(250);
        yield* finished.dictation.finish;
        const flushed = yield* finished.dictation.view;
        expect(flushed.ended).toBe('finished');
        expect(statuses(flushed.matcher?.marks).every((status) => status === 'matched')).toBe(true);
        expect(finished.events.filter((event) => event.kind === 'result')).toHaveLength(
          steps.length,
        );
        expect(finished.events.filter((event) => event.kind === 'end')).toHaveLength(1);
        yield* finished.wait(10_000);
        expect(finished.events.filter((event) => event.kind === 'end')).toHaveLength(1);
        yield* Scope.close(finished.scope, Exit.void);

        const cancelled = yield* play(steps);
        yield* cancelled.dictation.start(VERSE);
        yield* cancelled.wait(250);
        yield* cancelled.dictation.cancel;
        const sent = cancelled.events.length;
        yield* cancelled.wait(10_000);
        expect(cancelled.events).toHaveLength(sent);
        const view = yield* cancelled.dictation.view;
        expect(view.ended).toBe('cancelled');
        expect(view.matcher?.finished).toBe(false);
        yield* Scope.close(cancelled.scope, Exit.void);
      }),
    ));

  it('stops the replay it holds at a newer listen: the old session sends nothing more', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const steps = recite(VERSE, { every: 3, pace: 100 });
        const live = yield* play(steps);
        yield* live.dictation.start(VERSE);
        yield* live.wait(250);
        yield* live.dictation.start(VERSE);
        yield* live.wait(10_000);
        expect(live.events.filter((event) => event.session === 1 && event.kind === 'end')).toEqual(
          [],
        );
        expect(live.events.filter((event) => event.session === 1)).toHaveLength(5);
        expect(
          live.events.filter((event) => event.session === 2 && event.kind === 'result'),
        ).toHaveLength(steps.length);
        expect((yield* live.dictation.view).ended).toBe('finished');
        expect(yield* live.dictation.engines).toEqual([
          { engine: 'analyzer', status: 'ready' },
          { engine: 'dictation', status: 'ready' },
          { engine: 'recognizer', status: 'ready' },
        ]);
        yield* Scope.close(live.scope, Exit.void);
      }),
    ));
});
