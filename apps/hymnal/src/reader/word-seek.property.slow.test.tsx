/**
 * The held seek's acceptance: the real hymn page over the real player and
 * its held transaction (`~/test/word-seek`), driven through the web's
 * pointer handlers, the phones' gesture callbacks and the accessible
 * controls, against a reference written here. The reference keeps its own
 * owner, anchor and choice: it counts the 48 and 24 point thresholds a
 * translation has crossed itself, and checks the page's last scroll against
 * the generated rectangles, never the product's mapping or centring helper.
 * Musical places (the anchor a hold takes, a choice's onset) come from
 * hymseek's proved seam: the hold's published target and the fixture's
 * targets. After each command it compares the drawn choice, the scroll, the
 * held lock, the cues and the seeks; it prints only seeds and counts.
 */

import { expect, it } from 'effect-bun-test';
import { Console, Effect, Option, Predicate } from 'effect';
import { TestClock } from 'effect/testing';
import { act } from 'react';

import type { SeekTarget } from '~/follow/seek-targets';
import { RISE } from '~/player/bar';
import { Command, Player } from '~/player/player';
import { longPress } from '~/test/gesture';
import { inAct, mountSeekReader, type Rect } from '~/test/reader-word-seek';
import { openWordSeek } from '~/test/word-seek';

import { SeekArea as NativeArea } from './WordSeek.native';
import { seekHeld } from './word-seek';

type App = Effect.Success<ReturnType<typeof openWordSeek>>;
type Page = Effect.Success<ReturnType<typeof mountSeekReader>>;
type Surface = 'web' | 'native' | 'steps';

const SEEDS = 128;
const COMMANDS = 128;
const LINE_PT = 48;
const WORD_PT = 24;
const STILL_PT = 10;
const STRIP_PT = 20;

/** A small seeded generator, so each seed's history replays. */
const random = (seed: number) => {
  let state = (seed * 2_654_435_761 + 1) >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  const int = (n: number) => Math.floor(next() * n);
  const pick = <A,>(all: ReadonlyArray<A>): A => all[int(all.length)] as A;
  return { next, int, pick };
};

type Random = ReturnType<typeof random>;

/** How many whole `step`s a translation has crossed, by counting thresholds, signed; NaN when it is not finite. */
const crossed = (by: number, step: number) => {
  if (!Number.isFinite(by)) return Number.NaN;
  let count = 0;
  const size = Math.abs(by);
  while ((count + 1) * step <= size && count < 1_000) count += 1;
  if (by < 0) return -count;
  return count;
};

const within = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** A translation biased to the thresholds' neighbours, with large and general values. */
const offset = (rng: Random, step: number) => {
  const kind = rng.int(10);
  if (kind < 5) return (rng.int(11) - 5) * step + rng.pick([-1, -0.5, -0.001, 0, 0.001, 0.5, 1]);
  if (kind < 6) return rng.pick([1e9, -1e9, 5_000, -5_000]);
  if (kind < 7) return rng.pick([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]);
  return (rng.next() - 0.5) * 800;
};

/** Rectangles for the fixture's four sung lines: short, wrapped and taller than any viewport. */
const rectsOf = (rng: Random): ReadonlyArray<Rect> => {
  let top = rng.pick([0, 12, 120]);
  return Array.from({ length: 4 }, () => {
    const height = rng.pick([20, 30, 48, 96, 240, 1400, 2000]);
    const rect = { top, height };
    top += height + rng.pick([0, 8, 24]);
    return rect;
  });
};

interface Choice {
  readonly line: number;
  /** The word's place on its line; none on a line-only line. */
  readonly word: Option.Option<number>;
}

type Owner =
  | { readonly _tag: 'Idle' }
  /** A still pointer waiting: where it landed (`x`, `y`) and where it is now (`at`). */
  | {
      readonly _tag: 'Candidate';
      readonly id: number;
      readonly x: number;
      readonly y: number;
      readonly at: { readonly x: number; readonly y: number };
    }
  | {
      readonly _tag: 'Held';
      readonly id: number;
      readonly x: number;
      readonly y: number;
      readonly line: number;
      readonly column: number;
      readonly choice: Choice;
    }
  /** The hold was taken away while the pointer stayed down. */
  | { readonly _tag: 'Orphan'; readonly id: number };

/** A pointer that took a hold is still down, whether or not the hold is still its own. */
const pointerDown = Predicate.or(Predicate.isTagged('Held'), Predicate.isTagged('Orphan'));

const sameList = <A,>(a: ReadonlyArray<A>, b: ReadonlyArray<A>) =>
  a.length === b.length && a.every((value, k) => value === b[k]);

const counts = new Map<string, number>();
const count = (name: string) => counts.set(name, (counts.get(name) ?? 0) + 1);

/** The reference: what the page must show and do, kept apart from the product. */
const reference = (
  app: App,
  page: Page,
  surface: Surface,
  viewport: number,
  rects: ReadonlyArray<Rect>,
) => {
  const lines = app.targets.lines;
  const wordsOn = (k: number) => {
    const line = lines[k];
    if (line?._tag === 'WordTimed') return line.words.length;
    return 0;
  };
  const state = {
    owner: { _tag: 'Idle' } as Owner,
    shown: true,
    viewport,
    seeks: [] as Array<number>,
    /** The page's scrolls before the hold took: the held ones follow. */
    heldFrom: 0,
    cues: [] as Array<string>,
  };
  const msOf = (choice: Choice) =>
    Option.match(Option.fromUndefinedOr(lines[choice.line]), {
      onNone: () => Number.NaN,
      onSome: (line) => {
        if (line._tag === 'LineOnly' || Option.isNone(choice.word)) return line.start;
        return Option.match(Option.fromUndefinedOr(line.words[choice.word.value]), {
          onNone: () => Number.NaN,
          onSome: (word) => word.ms,
        });
      },
    });
  const eligible = () =>
    state.shown &&
    state.viewport > RISE &&
    Player.$is('Playing')(app.registry.get(app.player.state)) &&
    app.registry.get(app.player.hold.state)._tag === 'Free' &&
    Option.isNone(app.registry.get(app.player.countIn));
  const anchor = (): Option.Option<{ readonly line: number; readonly column: number }> => {
    const hold = app.registry.get(app.player.hold.state);
    if (hold._tag === 'Free') return Option.none();
    if (hold._tag === 'Landing') return Option.none();
    const target: SeekTarget = hold.target;
    const line = lines.findIndex((one) => one.line === target.line);
    if (target._tag === 'Line') return Option.some({ line, column: 0 });
    const timed = lines[line];
    if (timed?._tag !== 'WordTimed') return Option.some({ line, column: 0 });
    return Option.some({ line, column: timed.words.findIndex((w) => w.word === target.word) });
  };
  const choose = (line: number, column: number): Choice => {
    const words = wordsOn(line);
    if (words === 0) return { line, word: Option.none() };
    return { line, word: Option.some(within(column, 0, words - 1)) };
  };
  const same = (a: Choice, b: Choice) =>
    a.line === b.line && Option.getOrElse(a.word, () => -1) === Option.getOrElse(b.word, () => -1);
  const choiceNow = () => {
    const owner = state.owner;
    if (owner._tag !== 'Held') return Option.none<Choice>();
    return Option.some(owner.choice);
  };
  return {
    state,
    eligible,
    choiceNow,
    /** The hold took, if the seam published one: its anchor is the sounding target. */
    take: (id: number, x: number, y: number) => {
      const found = anchor();
      if (Option.isNone(found)) {
        state.owner = { _tag: 'Idle' };
        count('refused');
        return;
      }
      const { line, column } = found.value;
      state.owner = { _tag: 'Held', id, x, y, line, column, choice: choose(line, column) };
      state.cues.push('seek-grab');
      state.heldFrom = page.scrolls.length;
      count(`held-${surface}`);
      if (wordsOn(line) === 0) count('anchor-line-only');
    },
    drag: (dx: number, dy: number) => {
      const owner = state.owner;
      if (owner._tag !== 'Held') return;
      const lineBy = crossed(dy, LINE_PT);
      const wordBy = crossed(dx, WORD_PT);
      if (Number.isNaN(lineBy) || Number.isNaN(wordBy)) {
        count('non-finite');
        return;
      }
      const last = lines.length - 1;
      const line = within(owner.line - lineBy, 0, last);
      if (line !== owner.line - lineBy) count('line-clamp');
      const next = choose(line, owner.column + wordBy);
      if (
        wordsOn(line) > 0 &&
        (owner.column + wordBy < 0 || owner.column + wordBy >= wordsOn(line))
      )
        count('word-clamp');
      if (Option.isNone(next.word)) count('line-only');
      if (same(next, owner.choice)) return;
      if (
        next.line !== owner.choice.line &&
        Option.isSome(next.word) &&
        Option.isSome(owner.choice.word) &&
        next.word.value !== owner.choice.word.value
      )
        count('diagonal');
      state.owner = { ...owner, choice: next };
      state.cues.push('seek-tick');
      count('tick');
    },
    /** An accessible step: a line keeps the word's column, clamped; a word step stays on its line. */
    step: (lineBy: number, wordBy: number) => {
      const owner = state.owner;
      if (owner._tag !== 'Held') return;
      const current = owner.choice;
      const line = current.line + lineBy;
      if (line < 0 || line >= lines.length) return count('step-edge');
      const column = Option.getOrElse(current.word, () => 0) + wordBy;
      if (wordBy !== 0 && (Option.isNone(current.word) || column < 0 || column >= wordsOn(line)))
        return count('step-edge');
      const next = choose(line, column);
      state.owner = { ...owner, choice: next };
      state.cues.push('seek-tick');
      count('tick');
    },
    release: () => {
      const owner = state.owner;
      if (owner._tag === 'Held') {
        state.seeks.push(msOf(owner.choice));
        state.cues.push('seek-release');
        count('release');
      }
      state.owner = { _tag: 'Idle' };
    },
    cancel: () => {
      if (state.owner._tag === 'Held') count('cancel');
      state.owner = { _tag: 'Idle' };
    },
    /** Something outside took the hold away: a pointer still down is left with nothing to end. */
    revoke: (keepsPointer: boolean) => {
      const owner = state.owner;
      if (owner._tag !== 'Held') return;
      count('revoke');
      state.owner = { _tag: 'Idle' };
      if (keepsPointer) state.owner = { _tag: 'Orphan', id: owner.id };
    },
    /** What the page must show now. */
    expected: () => {
      const choice = choiceNow();
      return {
        lines: Option.match(choice, { onNone: () => [], onSome: (it) => [it.line] }),
        words: Option.match(choice, {
          onNone: () => [],
          onSome: (it) => Option.match(it.word, { onNone: () => [], onSome: (w) => [w] }),
        }),
        held: Option.isSome(choice),
        seeks: [...state.seeks],
        cues: [...state.cues],
      };
    },
    /** How far the chosen block's middle sits from the lyric viewport's, after the last scroll. */
    offMiddle: (chosen: Choice) => {
      const rect = rects[chosen.line] ?? { top: 0, height: 0 };
      const y = page.scrolls.at(-1)?.y ?? Number.NaN;
      const inside = state.viewport - RISE;
      return Math.abs(page.padTop() + rect.top + rect.height / 2 - y - inside / 2);
    },
  };
};

/** Where the page differs from the reference, as numbers and booleans only. */
const differences = (model: ReturnType<typeof reference>, page: Page, app: App) => {
  const want = model.expected();
  const chosen = page.chosenLines();
  const words = Option.match(model.choiceNow(), {
    onNone: () => chosen.flatMap((k) => page.underlined(k)),
    onSome: (it) => page.underlined(it.line),
  });
  const seeks = app.commands.filter(({ kind }) => kind === 'seek').map(({ ms }) => ms);
  const centred = Option.match(model.choiceNow(), {
    onNone: () => true,
    onSome: (it) => model.offMiddle(it) <= 2,
  });
  const still =
    !want.held || page.scrolls.slice(model.state.heldFrom).every(({ animated }) => !animated);
  const checks = [
    ['lines', sameList(chosen, want.lines), `${want.lines.join(',')}/${chosen.join(',')}`],
    ['words', sameList(words, want.words), `${want.words.join(',')}/${words.join(',')}`],
    ['held', app.registry.get(seekHeld) === want.held, `${want.held}`],
    ['seeks', sameList(seeks, want.seeks), `${want.seeks.join(',')}/${seeks.join(',')}`],
    ['cues', sameList(page.cues, want.cues), `${want.cues.length}/${page.cues.length}`],
    ['centred', centred, ''],
    ['still', still, ''],
  ] as const;
  return checks.filter(([, ok]) => !ok).map(([name, , detail]) => `${name}=${detail}`);
};

/** One generated history on one surface, compared after every command. */
const history = (seed: number, surface: Surface) =>
  Effect.gen(function* () {
    const rng = random(seed);
    const app = yield* openWordSeek(false);
    const rects = rectsOf(rng);
    const viewport = rng.pick([800, 640, 1200]);
    const page = yield* mountSeekReader(
      app,
      {
        web: { viewport, rects },
        steps: { viewport, rects },
        native: { viewport, rects, area: NativeArea },
      }[surface],
    );
    yield* inAct(app.play);
    const model = reference(app, page, surface, viewport, rects);
    const settle = inAct(TestClock.adjust(0));
    let press = Option.none<ReturnType<typeof longPress>>();
    let pressAt = { x: 0, y: 0 };
    let promised = false;
    const webDown = (step: number) => {
      const init = rng.pick([
        { x: 100, y: 200 },
        { x: 100, y: 200 },
        { x: 300, y: 400 },
        { x: rng.pick([0, 19, 19.9]), y: 200 },
        { x: STRIP_PT, y: 200 },
        { x: 100, y: 200, button: 2 },
        { x: 100, y: 200, primary: false },
      ]);
      const { x, y } = init;
      const button = init.button ?? 0;
      const primary = init.primary ?? true;
      page.pointer('pointerdown', init);
      if (x < STRIP_PT) count('strip');
      if (button !== 0 || !primary) count('other-button');
      if (button === 0 && primary && x >= STRIP_PT && model.eligible())
        model.state.owner = { _tag: 'Candidate', id: 1, x, y, at: { x, y } };
      return `down ${step}`;
    };
    const webStill = (step: number, owner: { readonly x: number; readonly y: number }) => {
      const drift = rng.pick([0, 3, 7, 9.9, 10, 10.1, 15]);
      const angle = rng.pick([0, 0.6, 1.57, 3.14]);
      const x = owner.x + drift * Math.cos(angle);
      const y = owner.y + drift * Math.sin(angle);
      page.pointer('pointermove', { x, y });
      const current = model.state.owner;
      if ((x - owner.x) ** 2 + (y - owner.y) ** 2 > STILL_PT ** 2) {
        model.state.owner = { _tag: 'Idle' };
        count('drift');
      } else if (current._tag === 'Candidate') model.state.owner = { ...current, at: { x, y } };
      return `still ${step}`;
    };
    const webMove = (step: number) => {
      const owner = model.state.owner;
      let base = { x: 100, y: 200 };
      if (owner._tag === 'Held') base = owner;
      const dx = offset(rng, WORD_PT);
      const dy = offset(rng, LINE_PT);
      page.pointer('pointermove', { x: base.x + dx, y: base.y + dy }, 'area');
      model.drag(base.x + dx - base.x, base.y + dy - base.y);
      return `move ${step}`;
    };
    const webOthers = (step: number) => {
      page.pointer('pointermove', { id: 2, x: 50, y: 50 }, 'area');
      page.pointer('pointerup', { id: 2, x: 50, y: 50 }, 'area');
      page.pointer('pointerup', { id: 1, button: 2 }, 'area');
      count('other-pointer');
      return `other ${step}`;
    };
    const webUp = (step: number) => {
      page.pointer('pointerup', {}, 'area');
      if (model.state.owner._tag === 'Candidate') model.state.owner = { _tag: 'Idle' };
      else model.release();
      return `up ${step}`;
    };
    const webEnd = (step: number) => {
      const end = rng.pick(['pointercancel', 'lostpointercapture', 'Escape'] as const);
      if (end === 'Escape') page.key('Escape');
      else page.pointer(end, {}, 'area');
      model.cancel();
      return `${end} ${step}`;
    };
    const web = (step: number) => {
      const owner = model.state.owner;
      const kind = rng.int(20);
      if (owner._tag === 'Idle' && kind < 8) return webDown(step);
      if (owner._tag === 'Candidate' && kind < 10) return webStill(step, owner);
      if (owner._tag === 'Candidate' && kind < 15) {
        promised = model.eligible();
        page.elapse();
        return `elapse ${step}`;
      }
      if (pointerDown(owner) && kind < 12) return webMove(step);
      if (kind < 13) return webOthers(step);
      if (kind < 15) return webUp(step);
      if (kind < 16) return webEnd(step);
      return common(step);
    };
    const native = (step: number) => {
      const kind = rng.int(20);
      if (Option.isNone(press) && kind < 9) {
        const drift = rng.pick([
          [0, 0],
          [3, -4],
          [6, 8],
          [7, 7],
          [8, 8],
          [10, 0],
          [0, -11],
          [20, 3],
        ] as const);
        const [dx, dy] = drift;
        const can = model.eligible();
        const still =
          dx * dx + dy * dy <= STILL_PT ** 2 &&
          Math.abs(dx) <= STILL_PT &&
          Math.abs(dy) <= STILL_PT;
        if (!still) count('drift');
        act(() => {
          press = Option.some(longPress('reader-word-seek-hold', { x: 100, y: 200, dx, dy }));
        });
        pressAt = { x: dx, y: dy };
        promised = still && can;
        if (still && can) model.take(1, dx, dy);
        else model.state.owner = { _tag: 'Orphan', id: 1 };
        return `press ${step}`;
      }
      if (Option.isSome(press) && kind < 14) {
        const mx = offset(rng, WORD_PT);
        const my = offset(rng, LINE_PT);
        act(() => press.pipe(Option.map((it) => it.move(mx, my))));
        model.drag(mx - pressAt.x, my - pressAt.y);
        return `move ${step}`;
      }
      if (Option.isSome(press) && kind < 17) {
        const end = { cancel: model.cancel, lift: model.release };
        const how = rng.pick(['cancel', 'lift', 'lift'] as const);
        act(() => press.pipe(Option.map((it) => it[how]())));
        press = Option.none();
        end[how]();
        return `end ${step}`;
      }
      return common(step);
    };
    const steps = (step: number) => {
      const kind = rng.int(20);
      const owner = model.state.owner;
      if (owner._tag === 'Idle' && kind < 6) {
        const can = model.eligible();
        page.press('hymn-word-seek');
        promised = can;
        if (can) model.take(0, 0, 0);
        return `open ${step}`;
      }
      if (owner._tag === 'Held' && kind < 14) {
        const [id, lineBy, wordBy] = rng.pick([
          ['reader-seek-next-line', 1, 0],
          ['reader-seek-prev-line', -1, 0],
          ['reader-seek-next-word', 0, 1],
          ['reader-seek-prev-word', 0, -1],
        ] as const);
        page.press(id);
        model.step(lineBy, wordBy);
        return `${id} ${step}`;
      }
      if (owner._tag === 'Held' && kind < 17) {
        const how = rng.pick(['reader-seek-release', 'reader-seek-cancel', 'Escape'] as const);
        if (how === 'Escape') page.key('Escape');
        else page.press(how);
        if (how === 'reader-seek-release') model.release();
        else model.cancel();
        return `${how} ${step}`;
      }
      return common(step);
    };
    const common = (step: number): string => {
      const kind = rng.int(8);
      const keepsPointer = surface !== 'steps';
      if (kind < 4) return `tick ${step}`;
      if (kind < 5) {
        model.revoke(keepsPointer);
        app.send(Command.Pause());
        count('pause');
        return `pause ${step}`;
      }
      if (kind < 6) {
        model.revoke(keepsPointer);
        app.send(Command.Resume());
        return `resume ${step}`;
      }
      if (kind < 7) {
        model.revoke(keepsPointer);
        model.state.shown = !model.state.shown;
        page.show(model.state.shown);
        count('shown');
        return `shown ${step}`;
      }
      const height = rng.pick([0, 640, 800, 1200]);
      if (height !== model.state.viewport) {
        model.revoke(keepsPointer);
        count('layout');
      }
      model.state.viewport = height;
      page.lay(height);
      return `layout ${step}`;
    };
    const mismatches: Array<string> = [];
    for (let step = 0; step < COMMANDS; step++) {
      promised = false;
      const command = { web, native, steps }[surface](step);
      const candidate = model.state.owner;
      yield* settle;
      if (command.startsWith('elapse') && candidate._tag === 'Candidate')
        model.take(candidate.id, candidate.at.x, candidate.at.y);
      if (command.startsWith('tick')) yield* inAct(TestClock.adjust(250));
      if (command.startsWith('elapse') && model.state.owner._tag === 'Candidate')
        model.state.owner = { _tag: 'Idle' };
      if (promised && model.state.owner._tag !== 'Held') {
        mismatches.push(`seed=${seed} ${surface} ${command} an offered hold did not take`);
        break;
      }
      const wrong = differences(model, page, app);
      if (wrong.length > 0) {
        mismatches.push(`seed=${seed} ${surface} ${command} ${wrong.join(' ')}`);
        break;
      }
    }
    return mismatches;
  }).pipe(Effect.scoped);

const surfaces: ReadonlyArray<Surface> = ['web', 'native', 'steps'];

for (let seed = 0; seed < SEEDS; seed++)
  it.effect(`held seek reference history seed ${seed} x${COMMANDS}`, () =>
    Effect.gen(function* () {
      const surface = surfaces[seed % surfaces.length] ?? 'web';
      const mismatches = yield* history(seed, surface);
      expect(mismatches).toEqual([]);
    }),
  );

it.effect('the generated histories reached every case they are for', () => {
  const floors = [
    'held-web',
    'held-native',
    'held-steps',
    'tick',
    'diagonal',
    'line-clamp',
    'word-clamp',
    'line-only',
    'non-finite',
    'release',
    'cancel',
    'revoke',
    'drift',
    'strip',
    'other-button',
    'other-pointer',
    'step-edge',
    'pause',
    'shown',
    'layout',
  ];
  const seen = floors.map((name) => [name, counts.get(name) ?? 0] as const);
  return Effect.gen(function* () {
    yield* Console.log(seen.map(([name, n]) => `${name}=${n}`).join(' '));
    expect(seen.filter(([, n]) => n < 8)).toEqual([]);
  });
});
