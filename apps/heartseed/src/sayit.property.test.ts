/* oxlint-disable effect/noTernary, effect/noNullish, effect/noGlobals -- the test drives the service from plain branches and reads the contract's nulls in its views; it names each failing history as JSON text. */

/**
 * Say it against its model (`test/sayit-model.ts`, written from the hssayit
 * spec) under Effect's TestClock, over the app's own Dictation and a
 * recorded scripted source: seeded histories of presses, waits, peeks at
 * any index, grades from 0 to 5 and travel to another zone, started seconds
 * before a daylight-saving change or on any day in a zone of any offset, so
 * a recall that takes its zone's offset anywhere but at its press, or with
 * JavaScript's sign, disagrees; over one to five pieces of made-up verses
 * (one word, none, or several; references a trailing space, a prefix or a
 * digit apart), each recital of the piece it names, heard by that piece's
 * own source, which either ends by itself (the scripted replay) or never
 * does (an open recognizer), so a recall under another piece's reference or
 * word count disagrees.
 * After each step the start, the choice, the Dictation view Say it shows,
 * the last view of its `changes`, the ticks, the listens, the finishes and
 * the kept recalls must agree with the model. The passage's own recital,
 * a recital heard all at once inside its listen, a screen held up, an
 * ending read late and a passage with no words are tested apart.
 */

import { describe, expect, it } from 'bun:test';
import { Context, Deferred, Effect, Exit, Fiber, Layer, MutableRef, Scope, Stream } from 'effect';
import * as TestClock from 'effect/testing/TestClock';
import passage from 'virtual:heartseed-passage';

import {
  Dictation,
  DictationSource,
  layer as dictationLayer,
  type DictationEvent,
  type DictationView,
} from './dictation';
import { recite, scriptedSource, type DictationStep, type RecitePlan } from './dictation/script';
import type { MatcherView } from './matcher';
import { sourceWords } from './matcher/words';
import type { Passage } from './passage';
import {
  GRADES,
  GRADE_NAMES,
  Haptics,
  layer,
  recallOf,
  Recalls,
  SayIt,
  ticksOf,
  type Grade,
  type Recall,
  type SayItView,
} from './sayit';
import { SIMULATOR_PLAN } from './sayit/source';
import { SayItModel, type ModelPiece, type ModelStep } from './test/sayit-model';
import { hostOffset, hostZone, restore, travel, ZONES } from './test/zone';

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

const STATUSES = ['pending', 'tentative', 'matched', 'miss', 'peek'] as const;

/** A matcher view of `n` marks of any status. */
const viewOf = (next: () => number, n: number): MatcherView => ({
  marks: Array.from({ length: n }, (_, index) => ({
    index,
    status: pickOf(next, STATUSES),
    time: null,
    revealed: null,
  })),
  extraWordCount: below(next, 4),
  peekCount: below(next, 4),
  suggestedGrade: pickOf(next, [1, 2, 3, null] as const),
  finished: next() < 0.5,
});

/** Made-up words, distinct, so no word can match two places of a verse. */
const POOL = ['alpha,', 'Beta', 'gamma;', 'delta', 'Epsilon:', 'zeta', 'eta.', 'theta', 'iota'];

const verseOf = (next: () => number) => {
  const pool = [...POOL];
  return Array.from({ length: 1 + below(next, pool.length) }, () =>
    pool.splice(below(next, pool.length), 1).join(''),
  ).join(' ');
};

/** A view with each revealed word as its length, so a failure prints no verse word. */
const redact = (view: DictationView) => ({
  ...view,
  verse: view.verse?.length ?? null,
  matcher:
    view.matcher === null
      ? null
      : {
          ...view.matcher,
          marks: view.matcher.marks.map((mark) => ({
            ...mark,
            revealed: mark.revealed?.length ?? null,
          })),
        },
});

/**
 * A source over `inner` that records each call. An open one never ends by
 * itself: it drops every `end` until it is finished, as a recognizer that
 * keeps listening does.
 */
const recorded = (inner: Layer.Layer<DictationSource>, endsByItself: boolean, calls: string[]) =>
  Layer.effect(
    DictationSource,
    Effect.gen(function* () {
      const source = yield* DictationSource;
      const finishing = MutableRef.make(false);
      return DictationSource.of({
        engines: source.engines,
        listen: (session, engine, locale, hints) =>
          Effect.suspend(() => {
            calls.push('listen');
            MutableRef.set(finishing, false);
            return source.listen(session, engine, locale, hints);
          }),
        finish: Effect.suspend(() => {
          calls.push('finish');
          MutableRef.set(finishing, true);
          return source.finish;
        }),
        cancel: Effect.suspend(() => {
          calls.push('cancel');
          return source.cancel;
        }),
        subscribe: (listener) =>
          source.subscribe((event) => {
            if (!endsByItself && event.kind === 'end' && !MutableRef.get(finishing)) return;
            listener(event);
          }),
      });
    }),
  ).pipe(Layer.provide(inner));

/**
 * A source that hears the piece `chosen` names: one scripted replay per
 * piece, each holding only its own listens, so a recital hears the text of
 * the piece chosen when it started, and no other.
 */
const switched = (
  sources: readonly Layer.Layer<DictationSource>[],
  chosen: MutableRef.MutableRef<number>,
) =>
  Layer.effect(
    DictationSource,
    Effect.gen(function* () {
      const built = yield* Effect.forEach(sources, (source) =>
        Effect.map(Layer.build(source), (services) => Context.get(services, DictationSource)),
      );
      const now = () => built[MutableRef.get(chosen)] ?? built[0];
      return DictationSource.of({
        engines: (locale) => Effect.suspend(() => now()?.engines(locale) ?? Effect.succeed([])),
        listen: (session, engine, locale, hints) =>
          Effect.suspend(() => now()?.listen(session, engine, locale, hints) ?? Effect.void),
        finish: Effect.suspend(() => now()?.finish ?? Effect.void),
        cancel: Effect.suspend(() => now()?.cancel ?? Effect.void),
        subscribe: (listener) =>
          Effect.forEach(built, (source) => source.subscribe(listener), { discard: true }),
      });
    }),
  );

interface RigOptions {
  readonly passage: Passage;
  /** The pieces a recital may be of, each heard by its own source when `chosen` names it; the passage alone when absent. */
  readonly pieces?: readonly Passage[];
  readonly chosen?: MutableRef.MutableRef<number>;
  readonly source: Layer.Layer<DictationSource>;
  readonly endsByItself: boolean;
  readonly tick?: Effect.Effect<void>;
  readonly keep?: (recall: Recall) => Effect.Effect<void>;
}

/** Say it over the app's Dictation over a recorded source, in a scope of its own under a TestClock of its own, with a reader of its changes. */
const rig = (options: RigOptions) =>
  Effect.gen(function* () {
    const calls: string[] = [];
    const ticks = { n: 0 };
    const kept: Recall[] = [];
    const haptics = Layer.succeed(
      Haptics,
      Haptics.of({
        tick: Effect.andThen(
          Effect.sync(() => void (ticks.n += 1)),
          options.tick ?? Effect.void,
        ),
      }),
    );
    const recalls = Layer.succeed(
      Recalls,
      Recalls.of({
        keep: (recall) =>
          Effect.andThen(
            Effect.sync(() => void kept.push(recall)),
            options.keep?.(recall) ?? Effect.void,
          ),
      }),
    );
    const scope = yield* Scope.make();
    const services = yield* Layer.buildWithScope(
      layer(options.passage).pipe(
        Layer.provideMerge(
          dictationLayer.pipe(Layer.provide(recorded(options.source, options.endsByItself, calls))),
        ),
        Layer.provide(Layer.mergeAll(haptics, recalls)),
        Layer.provideMerge(TestClock.layer()),
      ),
      scope,
    );
    const sayIt = Context.get(services, SayIt);
    const dictation = Context.get(services, Dictation);
    const latest = MutableRef.make<SayItView | null>(null);
    yield* Effect.forkIn(
      Stream.runForEach(sayIt.changes, (view) => Effect.sync(() => MutableRef.set(latest, view))),
      scope,
    );
    const wait = (ms: number) => Effect.provideContext(TestClock.adjust(ms), services);
    const pieces = options.pieces ?? [options.passage];
    const chosen = options.chosen ?? MutableRef.make(0);
    return { scope, services, sayIt, dictation, calls, ticks, kept, latest, wait, pieces, chosen };
  });

type Rig = Effect.Success<ReturnType<typeof rig>>;

/** Lets every fiber take what was published. */
const settle = Effect.gen(function* () {
  for (let i = 0; i < 12; i++) yield* Effect.yieldNow;
});

/** Points the source at the piece a recital starts on; a recital under way keeps the source it started on. */
const hear = (live: Rig, reference: string) =>
  Effect.gen(function* () {
    if ((yield* live.dictation.view).status !== 'idle') return;
    const index = live.pieces.findIndex((piece) => piece.reference === reference);
    MutableRef.set(live.chosen, Math.max(0, index));
  });

const run = (live: Rig, step: ModelStep) =>
  Effect.gen(function* () {
    if (step.t === 'press') {
      yield* hear(live, live.pieces[0]?.reference ?? '');
      yield* live.sayIt.press;
    }
    if (step.t === 'recite') {
      const piece = live.pieces.find((each) => each.reference === step.piece.reference);
      if (piece === undefined) return yield* Effect.die('a recital of a piece the rig lacks');
      yield* hear(live, piece.reference);
      yield* live.sayIt.recite({ cue: step.cue, keep: step.keep }, piece);
    }
    if (step.t === 'peek') yield* live.sayIt.peek(step.index);
    if (step.t === 'choose') yield* live.sayIt.choose(step.grade as Grade);
    if (step.t === 'wait') yield* live.wait(step.ms);
    if (step.t === 'travel') travel(step.zone);
    yield* settle;
  });

const generate = (next: () => number, words: number, pieces: readonly ModelPiece[]): ModelStep => {
  const r = next();
  if (r < 0.1) return { t: 'press' };
  if (r < 0.2)
    return {
      t: 'recite',
      cue: next() < 0.5 ? 'none' : 'initials',
      keep: next() < 0.5,
      piece: pickOf(next, pieces),
    };
  if (r < 0.62) return { t: 'wait', ms: 1 + below(next, 6) };
  if (r < 0.74) return { t: 'peek', index: below(next, words + 2) - 1 };
  if (r < 0.86) return { t: 'choose', grade: below(next, 6) };
  if (r < 0.92) return { t: 'travel', zone: pickOf(next, ZONES) };
  return { t: 'wait', ms: 1500 };
};

const HOUR = 3_600_000;

/**
 * The instants a history starts at: a few seconds before a daylight-saving
 * change (New York's spring forward and fall back, Lord Howe's half hour,
 * Sydney's), so a recital can be pressed on one side and kept on the other;
 * a winter and a summer day; and the epoch.
 */
const startOf = (next: () => number) =>
  pickOf(next, [
    Date.UTC(2026, 2, 8, 7) - below(next, 4000),
    Date.UTC(2026, 10, 1, 6) - below(next, 4000),
    Date.UTC(2026, 3, 4, 15) - below(next, 4000),
    Date.UTC(2026, 9, 3, 15, 30) - below(next, 4000),
    Date.UTC(2026, 3, 4, 16) - below(next, 4000),
    Date.UTC(2026, 9, 3, 16) - below(next, 4000),
    Date.UTC(2026, 0, 15) + below(next, 24 * HOUR),
    Date.UTC(2026, 6, 15) + below(next, 24 * HOUR),
    0,
  ]);

/** The zone a history starts in: one of New York, Lord Howe and Sydney, whose changes the starts sit at, or any other. */
const zoneOf = (next: () => number) =>
  next() < 0.6
    ? pickOf(next, ['America/New_York', 'Australia/Lord_Howe', 'Australia/Sydney'])
    : pickOf(next, ZONES);

const count = (calls: readonly string[], call: string) => calls.filter((c) => c === call).length;

/** Say it as the model says it must be after a step. */
const agree = (live: Rig, model: SayItModel, where: string) =>
  Effect.gen(function* () {
    const view = yield* live.sayIt.view;
    const current = yield* live.dictation.view;
    expect({ startedAt: view.startedAt, choice: view.choice }, where).toEqual({
      startedAt: model.startedAt,
      choice: model.choice,
    });
    expect(redact(view.dictation), where).toEqual(redact(current));
    expect(MutableRef.get(live.latest), where).toBe(view);
    expect(live.ticks.n, where).toBe(model.ticks);
    expect(live.kept, where).toEqual(model.kept);
    for (const recall of live.kept) {
      const piece = live.pieces.find((each) => each.reference === recall.reference);
      expect(piece === undefined ? -1 : sourceWords(piece.text).length, where).toBe(recall.words);
    }
    expect(model.cuedGood, where).toBe(0);
    expect(count(live.calls, 'listen'), where).toBe(model.listens);
    const finishes = count(live.calls, 'finish');
    expect(finishes >= model.finishes && finishes <= model.finishesAllowed, where).toBe(true);
  });

/** The host's zone as the file found it, put back after each history. */
const host = hostZone();

/**
 * The references a history's pieces take, the passage's first: some differ
 * from another only by a trailing space, a prefix or a last digit, so a
 * recall keyed by a near reference disagrees.
 */
const REFERENCES = ['Made 1:1', 'Made 1:10', 'Made 1:1 ', 'XMade 1:1', 'Made 2:1'];

/** The text of a piece after the first: a verse of made-up words, now and then one word or none at all. */
const textOf = (next: () => number) => {
  const r = next();
  if (r < 0.1) return ' — ; ';
  if (r < 0.25) return pickOf(next, POOL);
  return verseOf(next);
};

/**
 * A history's pieces: the passage (`Made 1:1`, which a press says) and up
 * to four more, each heard by its own scripted source under the history's
 * plan, with the words skipped drawn per piece.
 */
const piecesOf = (next: () => number) => {
  const count = 1 + below(next, REFERENCES.length);
  const pieces = REFERENCES.slice(0, count).map((reference, index): Passage => ({
    reference,
    text: index === 0 ? verseOf(next) : textOf(next),
  }));
  const every = 1 + below(next, 4);
  const pace = 2 + below(next, 4);
  const plans = pieces.map((piece): RecitePlan => ({
    skip: Array.from({ length: sourceWords(piece.text).length }, (_, i) => i).filter(
      () => next() < 0.2,
    ),
    every,
    pace,
  }));
  return { pieces, plans };
};

const modelPiece = (piece: Passage): ModelPiece => ({
  reference: piece.reference,
  words: sourceWords(piece.text).length,
});

const runHistory = (seed: number) =>
  Effect.gen(function* () {
    const next = random(seed);
    const { pieces, plans } = piecesOf(next);
    const words = Math.max(...pieces.map((piece) => sourceWords(piece.text).length));
    const endsByItself = next() < 0.5;
    const start = startOf(next);
    const zone = zoneOf(next);
    const chosen = MutableRef.make(0);
    const [passageOf] = pieces;
    if (passageOf === undefined) return yield* Effect.die('a history with no passage');
    const live = yield* rig({
      passage: passageOf,
      pieces,
      chosen,
      source: switched(
        pieces.map((piece, index) =>
          scriptedSource(recite(piece.text, plans[index] ?? { every: 1, pace: 2 })),
        ),
        chosen,
      ),
      endsByItself,
    });
    yield* Effect.provideContext(TestClock.setTime(start), live.services);
    travel(zone);
    yield* settle;
    const model = new SayItModel(modelPiece(passageOf), endsByItself);
    const choices = pieces.map(modelPiece);
    const trail = [
      `seed ${seed} ${JSON.stringify(plans)} ${pieces.length} pieces endsByItself ${endsByItself} at ${start} in ${zone}`,
    ];
    let now = start;
    let moved = 0;
    for (let k = 0; k < 30; k++) {
      const step = generate(next, words, choices);
      trail.push(JSON.stringify(step));
      const before = yield* live.dictation.view;
      const kept = model.kept.length;
      yield* run(live, step);
      if (step.t === 'wait') now += step.ms;
      model.step(step, before, yield* live.dictation.view, now);
      yield* agree(live, model, trail.join(' '));
      moved += model.kept.slice(kept).filter((recall) => recall.offset !== hostOffset(now)).length;
    }
    yield* Scope.close(live.scope, Exit.void);
    const pieced = new Set(model.kept.map((recall) => recall.reference)).size;
    return { model, moved, pieced };
  }).pipe(Effect.ensuring(Effect.sync(() => restore(host))));

/** A source that hears a whole recital of `text` inside its listen: each word tentative then final, then the end. */
const burst = (text: string) =>
  Layer.sync(DictationSource, () => {
    const send = MutableRef.make<(event: DictationEvent) => void>(() => {});
    return DictationSource.of({
      engines: () => Effect.succeed([]),
      listen: (session) =>
        Effect.sync(() => {
          const event = (kind: DictationEvent['kind'], final: boolean, word: string, at: number) =>
            MutableRef.get(send)({
              session,
              kind,
              final,
              runs: word === '' ? [] : [{ text: word, start: at, end: at + 5 }],
              reason: '',
            });
          event('start', false, '', 0);
          sourceWords(text).forEach((word, i) => {
            event('result', false, word, i * 10);
            event('result', true, word, i * 10);
          });
          event('end', false, '', 0);
        }),
      finish: Effect.void,
      cancel: Effect.void,
      subscribe: (listener) =>
        Effect.acquireRelease(
          Effect.sync(() => MutableRef.set(send, listener)),
          () => Effect.sync(() => MutableRef.set(send, () => {})),
        ),
    });
  });

const timesOf = (steps: readonly DictationStep[]) => [...new Set(steps.map((step) => step.at))];

/** Starts a recital the way `how` says and plays `steps` through to its end, then reads Say it's view. */
const sayThrough = (
  live: Rig,
  steps: readonly DictationStep[],
  how: { readonly cue: 'none' | 'initials'; readonly keep: boolean },
) =>
  Effect.gen(function* () {
    yield* run(live, { t: 'recite', ...how, piece: modelPiece(live.pieces[0] ?? passage) });
    let elapsed = 0;
    for (const at of timesOf(steps)) {
      yield* run(live, { t: 'wait', ms: at - elapsed });
      elapsed = at;
    }
    yield* run(live, { t: 'wait', ms: 10 });
    return yield* live.sayIt.view;
  });

describe('Say it', () => {
  it('ticks once for each word a view lights that the view before it did not, over 4,000 generated pairs', () => {
    const next = random(7);
    for (let k = 0; k < 4000; k++) {
      const before = next() < 0.15 ? null : viewOf(next, below(next, 14));
      const after = next() < 0.1 ? null : viewOf(next, below(next, 14));
      const lit = (view: MatcherView | null, i: number) =>
        view?.marks[i]?.status === 'matched' ? 1 : 0;
      const want = (after?.marks ?? []).reduce(
        (sum, _, i) => sum + (lit(after, i) === 1 && lit(before, i) === 0 ? 1 : 0),
        0,
      );
      expect(ticksOf(before, after)).toBe(want);
    }
  });

  it('recalls a finished recital’s words, misses with or without a peek, peeks and extra words, over 2,000 generated views', () => {
    const next = random(8);
    for (let k = 0; k < 2000; k++) {
      const view = viewOf(next, below(next, 14));
      const grade = pickOf(next, GRADES);
      const suggested = pickOf(next, [1, 2, 3] as const);
      const offset = pickOf(next, [-300, -240, 0, 330, 345, 765, 840, -720] as const);
      const statuses = view.marks.map((mark) => mark.status);
      expect(recallOf('Made 4:4', k, offset, grade, suggested, view)).toEqual({
        reference: 'Made 4:4',
        startedAt: k,
        offset,
        grade,
        suggested,
        words: statuses.length,
        missed:
          statuses.filter((s) => s === 'miss').length + statuses.filter((s) => s === 'peek').length,
        peeked: view.peekCount,
        extra: view.extraWordCount,
      });
    }
    expect(GRADES.map((grade) => GRADE_NAMES[grade])).toEqual(['Again', 'Hard', 'Good', 'Easy']);
  });

  it('agrees with its model on 240 seeded histories of 30 steps, over self-ending and open sources, presses and recitals cued or not, kept or not', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const reached = { cued: 0, unkept: 0, moved: 0, pieced: 0 };
        for (let seed = 1; seed <= 240; seed++) {
          const { model, moved, pieced } = yield* runHistory(seed);
          reached.cued += model.cuedFinished;
          reached.unkept += model.unkeptFinished;
          reached.moved += moved;
          if (pieced > 1) reached.pieced += 1;
        }
        expect(reached.cued).toBeGreaterThanOrEqual(40);
        expect(reached.unkept).toBeGreaterThanOrEqual(40);
        expect(reached.moved).toBeGreaterThanOrEqual(30);
        expect(reached.pieced).toBeGreaterThanOrEqual(20);
      }),
    ));

  it('grades the passage said whole under the first letters as helped and keeps nothing, then keeps the same recital said with no cue as Good', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const steps = recite(passage.text, { every: 5, pace: 1 });
        const live = yield* rig({ passage, source: scriptedSource(steps), endsByItself: true });
        const letters = yield* sayThrough(live, steps, { cue: 'initials', keep: false });
        expect([letters.dictation.ended, letters.dictation.matcher?.suggestedGrade]).toEqual([
          'finished',
          2,
        ]);
        expect([letters.choice, live.kept]).toEqual([2, []]);
        yield* run(live, { t: 'choose', grade: 3 });
        yield* run(live, { t: 'peek', index: 0 });
        expect(live.kept).toEqual([]);
        const alone = yield* sayThrough(live, steps, { cue: 'none', keep: true });
        expect(alone.dictation.matcher?.suggestedGrade).toBe(3);
        expect(
          live.kept.map((recall): readonly unknown[] => [recall.startedAt, recall.grade]),
        ).toEqual([[alone.startedAt, 3]]);
        yield* Scope.close(live.scope, Exit.void);
      }),
    ));

  it('recites the passage by the simulator plan: all lit but the 11th, Hard suggested, and a changed grade and a later peek kept', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const steps = recite(passage.text, SIMULATOR_PLAN);
        const live = yield* rig({ passage, source: scriptedSource(steps), endsByItself: true });
        const n = sourceWords(passage.text).length;
        yield* run(live, { t: 'press' });
        let elapsed = 0;
        for (const at of timesOf(steps)) {
          yield* run(live, { t: 'wait', ms: at - elapsed });
          elapsed = at;
        }
        yield* run(live, { t: 'wait', ms: 10 });
        const view = yield* live.sayIt.view;
        expect(view.dictation.ended).toBe('finished');
        expect(view.choice).toBe(2);
        expect(live.ticks.n).toBe(n - 1);
        const summary = (recall: Recall) => [
          recall.grade,
          recall.suggested,
          recall.words,
          recall.missed,
          recall.peeked,
        ];
        expect(live.kept.map(summary)).toEqual([[2, 2, n, 1, 0]]);
        yield* run(live, { t: 'choose', grade: 3 });
        yield* run(live, { t: 'peek', index: 10 });
        yield* run(live, { t: 'choose', grade: 3 });
        expect((yield* live.sayIt.view).choice).toBe(3);
        expect(live.kept.map(summary)).toEqual([
          [2, 2, n, 1, 0],
          [3, 2, n, 1, 0],
          [3, 2, n, 1, 1],
        ]);
        expect(live.ticks.n).toBe(n - 1);
        yield* Scope.close(live.scope, Exit.void);
      }),
    ));

  it('ticks and keeps each recital heard whole inside its listen, pressed as soon as Say it is built', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const text = POOL.join(' ');
        const live = yield* rig({
          passage: { reference: 'Made 3:3', text },
          source: burst(text),
          endsByItself: true,
        });
        yield* run(live, { t: 'press' });
        expect(live.ticks.n).toBe(POOL.length);
        yield* run(live, { t: 'press' });
        expect(live.ticks.n).toBe(2 * POOL.length);
        expect(live.kept.map((recall) => [recall.grade, recall.words, recall.missed])).toEqual([
          [3, POOL.length, 0],
          [3, POOL.length, 0],
        ]);
        yield* Scope.close(live.scope, Exit.void);
      }),
    ));

  it('keeps each recital while the screen is held up past its end and the next press, then shows and ticks only the recital under way', () =>
    Effect.runPromise(
      Effect.forEach([POOL.length, 3], (words) =>
        Effect.gen(function* () {
          const text = POOL.slice(0, words).join(' ');
          const held = yield* Deferred.make<void>();
          const live = yield* rig({
            passage: { reference: 'Made 5:5', text },
            source: scriptedSource(recite(text, { every: 1, pace: 4 })),
            endsByItself: true,
            tick: Effect.andThen(Effect.yieldNow, Deferred.await(held)),
          });
          const recital = Effect.gen(function* () {
            yield* run(live, { t: 'press' });
            for (let k = 0; k < 12; k++) yield* run(live, { t: 'wait', ms: 4 });
            expect((yield* live.dictation.view).ended).toBe('finished');
          });
          yield* settle;
          yield* recital;
          expect(live.ticks.n).toBe(1);
          yield* recital;
          expect(live.ticks.n).toBe(1);
          expect(live.kept.map((recall) => [recall.startedAt, recall.grade])).toEqual([
            [0, 3],
            [48, 3],
          ]);
          yield* Deferred.succeed(held, undefined);
          yield* settle;
          expect(live.ticks.n, `${words} words`).toBe(1 + words);
          expect((yield* live.sayIt.view).dictation).toBe(yield* live.dictation.view);
          yield* recital;
          expect(live.ticks.n, `${words} words`).toBe(1 + 2 * words);
          expect(live.kept.map((recall) => recall.startedAt)).toEqual([0, 48, 96]);
          yield* Scope.close(live.scope, Exit.void);
        }),
      ),
    ));

  it('never finishes the next recital on a lit last word the screen was held up on', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const text = POOL.slice(0, 1).join(' ');
        const held = yield* Deferred.make<void>();
        const live = yield* rig({
          passage: { reference: 'Made 9:9', text },
          source: scriptedSource(recite(text, { every: 1, pace: 4 })),
          endsByItself: true,
          tick: Effect.andThen(Effect.yieldNow, Deferred.await(held)),
        });
        yield* settle;
        yield* run(live, { t: 'press' });
        for (let k = 0; k < 6; k++) yield* run(live, { t: 'wait', ms: 4 });
        expect((yield* live.dictation.view).ended).toBe('finished');
        expect(live.ticks.n).toBe(1);
        yield* run(live, { t: 'press' });
        expect((yield* live.dictation.view).status).toBe('listening');
        yield* Deferred.succeed(held, undefined);
        yield* settle;
        expect((yield* live.dictation.view).status).toBe('listening');
        expect(count(live.calls, 'finish')).toBe(0);
        for (let k = 0; k < 6; k++) yield* run(live, { t: 'wait', ms: 4 });
        expect(live.ticks.n).toBe(2);
        expect(live.kept.map((recall) => recall.startedAt)).toEqual([0, 24]);
        yield* Scope.close(live.scope, Exit.void);
      }),
    ));

  it('never lands an ending it reads late on the next recital', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const text = POOL.slice(0, 3).join(' ');
        const held = yield* Deferred.make<void>();
        const first = MutableRef.make(true);
        const live = yield* rig({
          passage: { reference: 'Made 6:6', text },
          source: scriptedSource(recite(text, { every: 1, pace: 4 })),
          endsByItself: true,
          keep: () =>
            Effect.suspend(() => {
              if (!MutableRef.get(first)) return Effect.void;
              MutableRef.set(first, false);
              return Deferred.await(held);
            }),
        });
        const recite3 = Effect.gen(function* () {
          yield* run(live, { t: 'press' });
          for (let k = 0; k < 6; k++) yield* run(live, { t: 'wait', ms: 4 });
        });
        yield* recite3;
        yield* recite3;
        expect((yield* live.dictation.view).ended).toBe('finished');
        expect(live.kept.map((recall) => recall.startedAt)).toEqual([0]);
        yield* run(live, { t: 'press' });
        expect((yield* live.sayIt.view).choice).toBe(null);
        expect(live.kept.map((recall) => recall.startedAt)).toEqual([0, 24]);
        yield* Deferred.succeed(held, undefined);
        yield* settle;
        expect((yield* live.dictation.view).status).toBe('listening');
        expect((yield* live.sayIt.view).choice).toBe(null);
        for (let k = 0; k < 6; k++) yield* run(live, { t: 'wait', ms: 4 });
        expect((yield* live.sayIt.view).choice).toBe(3);
        expect(live.kept.map((recall) => recall.startedAt)).toEqual([0, 24, 48]);
        yield* Scope.close(live.scope, Exit.void);
      }),
    ));

  it('finishes handing over a recall when the call that made it is interrupted', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const text = POOL.slice(0, 3).join(' ');
        const held = yield* Deferred.make<void>();
        const handed: number[] = [];
        const live = yield* rig({
          passage: { reference: 'Made 8:8', text },
          source: scriptedSource(recite(text, { every: 1, pace: 4 })),
          endsByItself: true,
          keep: (recall) =>
            Effect.andThen(
              recall.grade === 4 ? Deferred.await(held) : Effect.void,
              Effect.sync(() => void handed.push(recall.grade)),
            ),
        });
        yield* settle;
        yield* run(live, { t: 'press' });
        for (let k = 0; k < 6; k++) yield* run(live, { t: 'wait', ms: 4 });
        expect(handed).toEqual([3]);
        const choosing = yield* Effect.forkChild(live.sayIt.choose(4));
        yield* settle;
        const interrupting = yield* Effect.forkChild(Fiber.interrupt(choosing));
        yield* settle;
        yield* Deferred.succeed(held, undefined);
        yield* Fiber.join(interrupting);
        expect(handed).toEqual([3, 4]);
        yield* Scope.close(live.scope, Exit.void);
      }),
    ));

  it('starts nothing for a passage with no words', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const live = yield* rig({
          passage: { reference: 'Made 7:7', text: ' — ; ' },
          source: scriptedSource([]),
          endsByItself: true,
        });
        yield* settle;
        const before = yield* live.sayIt.view;
        yield* run(live, { t: 'press' });
        expect(yield* live.sayIt.view).toBe(before);
        expect(live.calls).toEqual([]);
        yield* Scope.close(live.scope, Exit.void);
      }),
    ));
});
