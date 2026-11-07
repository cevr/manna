/* oxlint-disable effect/noTernary, effect/noNullish, effect/noGlobals -- the model and the generator are plain branches over plain records, and a failing history is named as JSON text. */

/**
 * The natural voice source against its own model, over seeded histories of
 * one source: speaks of one-, two- and three-chunk texts and of a text no
 * plan takes; stop, pause and resume; a load or a render answered ok, with
 * a failure, or malformed (an id with no frame, a frame list short or long,
 * NaN, a fraction, the audio a frame off); a refused play; the module's
 * events for the held utterance and for any other; and a reload (the scope
 * closed, a new source, utterance ids from 1 again). After every step the
 * module's calls, the events the source's listener heard and each speak's
 * state (pending, succeeded, failed) equal the model's, the source holds
 * one module subscription, and a closed source's listener hears nothing.
 *
 * The texts are made-up words over a lexicon written here, planned with
 * `planOf` (hslexicon's rule); the model computes each word's start sample
 * and a render's fit itself.
 *
 * It catches a source that forwards another utterance's event, keeps a
 * reading past a terminal event, plays or renders after a stop, marks the
 * wrong chunk last, fails a later chunk silently or a first one as success,
 * skips the stop that starts a speak or a build, reads only the first
 * chunk, trusts a render whose audio is not its frames long, or holds a
 * replaced speak until its module call answers. It misses the native
 * module's own timing: the module here answers when the history says.
 */

import { describe, expect, it } from 'bun:test';
import { Context, Deferred, Effect, Exit, Fiber, Layer, Option, Scope } from 'effect';

import { VoiceSource, type VoiceEvent } from '../voice';
import type { Lexicon } from './lexicon';
import { FILES, REVISION } from './manifest';
import { NaturalModule, NaturalUnavailable, type Rendered, type WordStart } from './module';
import { planOf, type Chunk } from './plan';
import { naturalVoiceSource } from './voice';

const SEED = 52_031;
const HISTORIES = 300;
const STEPS = 40;

/** A seeded generator in [0, 1) (mulberry32). */
const random = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
};

/** Six made-up words, each 30 phonemes long, so a clause of three is 93 symbols and two clauses fill a chunk. */
const LEXICON: Lexicon = (() => {
  const symbols = 'abcdefghij';
  const vocab = new Map<string, number>([
    [' ', 16],
    [',', 3],
    ['.', 4],
  ]);
  for (const [index, symbol] of [...symbols].entries()) vocab.set(symbol, 40 + index);
  const words = new Map<string, string>();
  for (const [index, key] of ['bel', 'cor', 'dun', 'fam', 'gil', 'hob'].entries()) {
    words.set(
      key,
      Array.from({ length: 30 }, (_, at) => symbols[(index * 7 + at * 3) % 10]).join(''),
    );
  }
  return { words, vocab };
})();

/** `clauses` clauses of three words each, ending with a comma and the last with a stop. */
const textOf = (clauses: number) =>
  Array.from({ length: clauses }, (_, at) => {
    const keys = [...LEXICON.words.keys()];
    const words = [0, 1, 2].map((offset) => keys[(at + offset) % keys.length]).join(' ');
    return `${words}${at === clauses - 1 ? '.' : ','}`;
  }).join(' ');

/** Texts of one, two and three chunks, and one with a word the lexicon lacks. */
const TEXTS: ReadonlyArray<string> = [textOf(1), textOf(3), textOf(5), 'bel zor.'];

const chunksOf = (text: string): Option.Option<ReadonlyArray<Chunk>> =>
  Option.map(planOf(LEXICON.words, LEXICON.vocab, text), (plan) => plan.chunks);

type Call =
  | { readonly _tag: 'stop' }
  | { readonly _tag: 'pause' }
  | { readonly _tag: 'resume' }
  | { readonly _tag: 'load'; readonly revision: string; readonly files: number }
  | {
      readonly _tag: 'render';
      readonly u: number;
      readonly k: number;
      readonly ids: ReadonlyArray<number>;
    }
  | {
      readonly _tag: 'play';
      readonly u: number;
      readonly k: number;
      readonly starts: ReadonlyArray<WordStart>;
      readonly last: boolean;
    };

type Outcome = 'pending' | 'success' | 'failure';

/** What a render answers with: a result, or a failure. */
type Answer = Rendered | 'failed';

/** The module the source drives: it records each call and holds each load and render until the history answers it. */
const makeModule = () => {
  const state = {
    calls: [] as Array<Call>,
    loads: [] as Array<Deferred.Deferred<number, NaturalUnavailable>>,
    renders: [] as Array<{
      readonly ids: ReadonlyArray<number>;
      readonly done: Deferred.Deferred<Rendered, NaturalUnavailable>;
    }>,
    refuse: false,
    listeners: new Set<(event: VoiceEvent) => void>(),
  };
  const layer = Layer.succeed(
    NaturalModule,
    NaturalModule.of({
      status: () => Effect.die('the voice source never asks status'),
      install: () => Effect.die('the voice source never installs'),
      cancelInstall: Effect.die('the voice source never cancels an install'),
      remove: Effect.die('the voice source never removes'),
      load: (revision, files) =>
        Effect.suspend(() => {
          state.calls.push({ _tag: 'load', revision, files: files.length });
          const done = Deferred.makeUnsafe<number, NaturalUnavailable>();
          state.loads.push(done);
          return Deferred.await(done);
        }),
      render: (u, k, ids) =>
        Effect.suspend(() => {
          state.calls.push({ _tag: 'render', u, k, ids: [...ids] });
          const done = Deferred.makeUnsafe<Rendered, NaturalUnavailable>();
          state.renders.push({ ids: [...ids], done });
          return Deferred.await(done);
        }),
      play: (u, k, starts, last) =>
        Effect.suspend(() => {
          state.calls.push({
            _tag: 'play',
            u,
            k,
            starts: starts.map((each) => ({ ...each })),
            last,
          });
          if (!state.refuse) return Effect.void;
          state.refuse = false;
          return Effect.fail(NaturalUnavailable.make({ reason: 'play refused' }));
        }),
      pause: Effect.sync(() => void state.calls.push({ _tag: 'pause' })),
      resume: Effect.sync(() => void state.calls.push({ _tag: 'resume' })),
      stop: Effect.sync(() => void state.calls.push({ _tag: 'stop' })),
      subscribe: (listener) =>
        Effect.asVoid(
          Effect.acquireRelease(
            Effect.sync(() => state.listeners.add(listener)),
            () => Effect.sync(() => void state.listeners.delete(listener)),
          ),
        ),
      subscribeInstall: () => Effect.void,
    }),
  );
  const emit = (event: VoiceEvent) => {
    for (const listener of [...state.listeners]) listener(event);
  };
  return { state, layer, emit };
};

/** Each word's start: the frames of every id before its first phoneme, 600 samples a frame. */
const startsIn = (chunk: Chunk, frames: ReadonlyArray<number>): ReadonlyArray<WordStart> =>
  chunk.marks.map((mark) => ({
    sample: frames.slice(0, mark.token).reduce((sum, each) => sum + each, 0) * 600,
    location: mark.location,
    length: mark.length,
  }));

const fits = (chunk: Chunk, answer: Rendered) =>
  answer.frames.length === chunk.ids.length &&
  answer.frames.every((each) => Number.isInteger(each) && each >= 1) &&
  answer.samples === answer.frames.reduce((sum, each) => sum + each, 0) * 600;

/** What the source must do, written from V1-V9. */
class Model {
  calls: Array<Call> = [{ _tag: 'stop' }];
  events: Array<VoiceEvent> = [];
  outcomes = new Map<number, Outcome>();
  refuse = false;
  /** The utterance each held load and render was asked for, in the order the module holds them. */
  loads: Array<number> = [];
  renders: Array<{ readonly u: number; readonly k: number }> = [];
  held:
    | { readonly u: number; readonly chunks: ReadonlyArray<Chunk>; waiting: 'load' | number }
    | undefined;
  tally = { midFailures: 0, firstFailures: 0, replaced: 0, malformed: 0, lastPlayed: 0 };

  private answer(u: number, outcome: 'success' | 'failure') {
    if (this.outcomes.get(u) === 'pending') this.outcomes.set(u, outcome);
  }

  /** Lets go of the held reading: its speak, if still waiting, succeeds. */
  private letGo() {
    if (this.held !== undefined) this.answer(this.held.u, 'success');
    this.held = undefined;
  }

  speak(u: number, text: string) {
    this.calls.push({ _tag: 'stop' });
    if (this.held !== undefined && this.outcomes.get(this.held.u) === 'pending')
      this.tally.replaced++;
    this.letGo();
    this.outcomes.set(u, 'pending');
    const chunks = chunksOf(text);
    if (Option.isNone(chunks)) {
      this.answer(u, 'failure');
      return;
    }
    this.held = { u, chunks: chunks.value, waiting: 'load' };
    this.calls.push({ _tag: 'load', revision: REVISION, files: FILES.length });
    this.loads.push(u);
  }

  stop() {
    this.calls.push({ _tag: 'stop' });
    this.letGo();
  }

  forward(tag: 'pause' | 'resume') {
    this.calls.push({ _tag: tag });
  }

  private render(k: number) {
    if (this.held === undefined) return;
    this.held.waiting = k;
    this.calls.push({
      _tag: 'render',
      u: this.held.u,
      k,
      ids: [...(this.held.chunks[k]?.ids ?? [])],
    });
    this.renders.push({ u: this.held.u, k });
  }

  loaded(ok: boolean) {
    const u = this.loads.shift();
    if (this.held === undefined || this.held.u !== u || this.held.waiting !== 'load') return;
    if (ok) return this.render(0);
    this.held = undefined;
    this.answer(u, 'failure');
  }

  private failed(u: number, k: number) {
    this.held = undefined;
    if (k === 0) {
      this.tally.firstFailures++;
      this.answer(u, 'failure');
      return;
    }
    this.tally.midFailures++;
    this.calls.push({ _tag: 'stop' });
    this.events.push({ utterance: u, kind: 'interrupt', location: 0, length: 0 });
  }

  rendered(answer: Answer) {
    const asked = this.renders.shift();
    const held = this.held;
    if (asked === undefined || held === undefined) return;
    if (held.u !== asked.u || held.waiting !== asked.k) return;
    const chunk = held.chunks[asked.k];
    if (chunk === undefined) return;
    if (answer === 'failed' || !fits(chunk, answer)) return this.failed(asked.u, asked.k);
    const last = asked.k === held.chunks.length - 1;
    this.calls.push({
      _tag: 'play',
      u: asked.u,
      k: asked.k,
      starts: startsIn(chunk, answer.frames),
      last,
    });
    if (this.refuse) {
      this.refuse = false;
      return this.failed(asked.u, asked.k);
    }
    if (asked.k === 0) this.answer(asked.u, 'success');
    if (last) {
      if (held.chunks.length > 1) this.tally.lastPlayed++;
      held.waiting = -1;
      return;
    }
    this.render(asked.k + 1);
  }

  native(event: VoiceEvent) {
    if (this.held?.u !== event.utterance) return;
    this.events.push(event);
    if (event.kind === 'finish' || event.kind === 'cancel' || event.kind === 'interrupt')
      this.letGo();
  }
}

type Action =
  | 'speak'
  | 'stop'
  | 'pause'
  | 'resume'
  | 'load-ok'
  | 'load-fail'
  | 'render-ok'
  | 'render-fail'
  | 'render-bad'
  | 'refuse-play'
  | 'event-held'
  | 'event-other'
  | 'reload';

const WEIGHTS: ReadonlyArray<readonly [Action, number]> = [
  ['speak', 2],
  ['stop', 0.5],
  ['pause', 0.3],
  ['resume', 0.3],
  ['load-ok', 2.5],
  ['load-fail', 0.3],
  ['render-ok', 6],
  ['render-fail', 0.5],
  ['render-bad', 1.2],
  ['refuse-play', 0.3],
  ['event-held', 2],
  ['event-other', 0.5],
  ['reload', 0.15],
];

const KINDS: ReadonlyArray<VoiceEvent['kind']> = [
  'start',
  'range',
  'range',
  'range',
  'finish',
  'cancel',
  'interrupt',
];

const settle = Effect.gen(function* () {
  for (let turn = 0; turn < 48; turn++) yield* Effect.yieldNow;
});

const outcomeOf = (fiber: Fiber.Fiber<unknown, unknown>): Outcome => {
  const exit = fiber.pollUnsafe();
  if (exit === undefined) return 'pending';
  return Exit.isSuccess(exit) ? 'success' : 'failure';
};

/** A render's answer for `ids`, ok or malformed in one of six ways. */
const answerFor = (
  ids: ReadonlyArray<number>,
  next: () => number,
  malformed: boolean,
): Rendered => {
  const frames = ids.map(() => 1 + Math.floor(next() * 25));
  let samples = frames.reduce((sum, each) => sum + each, 0) * 600;
  if (malformed) {
    const how = Math.floor(next() * 6);
    if (how === 0) frames[Math.floor(next() * frames.length)] = 0;
    if (how === 1) frames.pop();
    if (how === 2) frames.push(4);
    if (how === 3) frames[0] = Number.NaN;
    if (how === 4) frames[frames.length - 1] = 2.5;
    if (how === 5) samples += 600;
  }
  return { frames, samples, millis: 30 };
};

const totals = {
  midFailures: 0,
  firstFailures: 0,
  replaced: 0,
  malformed: 0,
  lastPlayed: 0,
  reloads: 0,
  finished: 0,
};

const TOTAL_WEIGHT = WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0);

/** One seeded history: the module, the source it builds, the model, and a handler per action. */
const makeHistory = (seed: number) => {
  const next = random(seed);
  const module = makeModule();
  const trail: Array<string> = [];
  const closed: Array<{ readonly heard: Array<VoiceEvent>; readonly length: number }> = [];
  let model = new Model();
  let scope = Scope.makeUnsafe();
  let heard: Array<VoiceEvent> = [];
  let fibers = new Map<number, Fiber.Fiber<void, unknown>>();
  let utterance = 0;
  let source: Option.Option<VoiceSource['Service']> = Option.none();

  const pick = (): Action => {
    let roll = next() * TOTAL_WEIGHT;
    for (const [action, weight] of WEIGHTS) {
      roll -= weight;
      if (roll < 0) return action;
    }
    return 'render-ok';
  };

  const live = () => Option.getOrThrow(source);

  const build = Effect.gen(function* () {
    const context = yield* Layer.buildWithScope(
      Layer.provide(naturalVoiceSource(LEXICON), module.layer),
      scope,
    );
    const built = Context.get(context, VoiceSource);
    const mine: Array<VoiceEvent> = [];
    heard = mine;
    yield* built
      .subscribe((event) => mine.push({ ...event }))
      .pipe(Effect.provideService(Scope.Scope, scope));
    source = Option.some(built);
    yield* settle;
  });

  const tallyUp = () => {
    for (const [key, value] of Object.entries(model.tally)) {
      totals[key as keyof Model['tally']] += value;
    }
  };

  const speak = Effect.gen(function* () {
    utterance += 1;
    const text = TEXTS[Math.floor(next() * TEXTS.length)] ?? '';
    const chunks = Option.getOrElse(
      Option.map(chunksOf(text), (each) => each.length),
      () => 0,
    );
    trail.push(`#${utterance}/${chunks}`);
    model.speak(utterance, text);
    fibers.set(utterance, yield* Effect.forkChild(live().speak(utterance, text, 'ignored')));
  });

  const load = (ok: boolean) =>
    Effect.gen(function* () {
      const done = module.state.loads.shift();
      if (done === undefined) return;
      model.loaded(ok);
      if (ok) yield* Deferred.succeed(done, 90);
      else yield* Deferred.fail(done, NaturalUnavailable.make({ reason: 'missing' }));
    });

  const render = (how: 'ok' | 'fail' | 'bad') =>
    Effect.gen(function* () {
      const asked = module.state.renders.shift();
      if (asked === undefined) return;
      if (how === 'fail') {
        model.rendered('failed');
        yield* Deferred.fail(asked.done, NaturalUnavailable.make({ reason: 'render failed' }));
        return;
      }
      if (how === 'bad') totals.malformed++;
      const answer = answerFor(asked.ids, next, how === 'bad');
      model.rendered(answer);
      yield* Deferred.succeed(asked.done, answer);
    });

  const event = (held: boolean) =>
    Effect.sync(() => {
      const current = model.held?.u ?? utterance;
      const kind = KINDS[Math.floor(next() * KINDS.length)] ?? 'range';
      const ranged = kind === 'range';
      const sent: VoiceEvent = {
        utterance: held ? current : current + 1 + Math.floor(next() * 3),
        kind,
        location: ranged ? Math.floor(next() * 120) : 0,
        length: ranged ? 1 + Math.floor(next() * 9) : 0,
      };
      if (kind === 'finish' && model.held?.u === sent.utterance) totals.finished++;
      model.native(sent);
      module.emit(sent);
    });

  const close = Effect.gen(function* () {
    for (const fiber of fibers.values()) yield* Fiber.interrupt(fiber);
    yield* Scope.close(scope, Exit.void);
    expect(module.state.listeners.size, `seed ${seed} (a subscription outlived its scope)`).toBe(0);
    tallyUp();
  });

  const reload = Effect.gen(function* () {
    totals.reloads++;
    yield* close;
    closed.push({ heard, length: heard.length });
    module.state.calls = [];
    module.state.loads = [];
    module.state.renders = [];
    module.state.refuse = false;
    model = new Model();
    fibers = new Map();
    utterance = 0;
    scope = Scope.makeUnsafe();
    yield* build;
  });

  const actions: Record<Action, () => Effect.Effect<unknown>> = {
    speak: () => speak,
    stop: () => Effect.sync(() => model.stop()).pipe(Effect.andThen(Effect.forkChild(live().stop))),
    pause: () =>
      Effect.sync(() => model.forward('pause')).pipe(
        Effect.andThen(Effect.forkChild(live().pause)),
      ),
    resume: () =>
      Effect.sync(() => model.forward('resume')).pipe(
        Effect.andThen(Effect.forkChild(live().resume)),
      ),
    'load-ok': () => load(true),
    'load-fail': () => load(false),
    'render-ok': () => render('ok'),
    'render-fail': () => render('fail'),
    'render-bad': () => render('bad'),
    'refuse-play': () =>
      Effect.sync(() => {
        model.refuse = true;
        module.state.refuse = true;
      }),
    'event-held': () => event(true),
    'event-other': () => event(false),
    reload: () => reload,
  };

  const check = () => {
    const where = `seed ${seed}: ${trail.join(' ')}`;
    expect(module.state.calls, `${where} (calls)`).toEqual(model.calls);
    expect(heard, `${where} (events)`).toEqual(model.events);
    for (const [id, fiber] of fibers) {
      expect(outcomeOf(fiber), `${where} (speak ${id})`).toBe(model.outcomes.get(id) ?? 'pending');
    }
    expect(module.state.listeners.size, `${where} (module subscriptions)`).toBe(1);
    for (const old of closed) {
      expect(old.heard.length, `${where} (a closed source heard)`).toBe(old.length);
    }
  };

  const step = Effect.gen(function* () {
    const action = pick();
    trail.push(action);
    yield* actions[action]();
    yield* settle;
    check();
  });

  return { build, check, step, close };
};

const history = (seed: number) =>
  Effect.gen(function* () {
    const run = makeHistory(seed);
    yield* run.build;
    run.check();
    for (let step = 0; step < STEPS; step++) yield* run.step;
    yield* run.close;
  });

describe('the natural voice source', () => {
  it('plans the test texts in one, two and three chunks, and refuses the last', () => {
    expect(
      TEXTS.map((text) =>
        Option.getOrElse(
          Option.map(chunksOf(text), (each) => each.length),
          () => 0,
        ),
      ),
    ).toEqual([1, 2, 3, 0]);
  });

  it('offers no voices of its own', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const source = yield* VoiceSource;
        expect(yield* source.voices).toEqual([]);
      }).pipe(Effect.provide(Layer.provide(naturalVoiceSource(LEXICON), makeModule().layer))),
    ));

  it(`equals its model over ${HISTORIES} seeded histories of ${STEPS} steps`, () =>
    Effect.runPromise(
      Effect.gen(function* () {
        for (let index = 0; index < HISTORIES; index++) yield* history(SEED + index);
        expect(totals.lastPlayed).toBeGreaterThanOrEqual(20);
        expect(totals.finished).toBeGreaterThanOrEqual(20);
        expect(totals.midFailures).toBeGreaterThanOrEqual(10);
        expect(totals.firstFailures).toBeGreaterThanOrEqual(30);
        expect(totals.replaced).toBeGreaterThanOrEqual(30);
        expect(totals.malformed).toBeGreaterThanOrEqual(40);
        expect(totals.reloads).toBeGreaterThanOrEqual(15);
      }),
    ));
});
