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
 * targets. Whether a hold may be offered it decides itself, the count-in
 * from its own model of the history's commands and the score's bar: the
 * player's published count must agree with it, and the page's entry, the
 * phones' recognizer and the web's armed candidate must follow it. After
 * each command it compares those, the drawn choice, the scroll, the held
 * lock, the cues and the seeks; every hold it offered must take. It prints
 * only seeds and counts.
 */

import { expect, it } from 'effect-bun-test';
import { Clock, Console, Deferred, Effect, Option, Predicate } from 'effect';
import { TestClock } from 'effect/testing';
import { act } from 'react';
import { View } from 'react-native';

import { book } from '~/follow/book';
import type { SeekTarget } from '~/follow/seek-targets';
import { RISE } from '~/player/bar';
import { Command, type PlaybackError, Player, type Status } from '~/player/player';
import { gestureOf, longPress } from '~/test/gesture';
import {
  fixtureRects,
  inAct,
  mountSeekReader,
  type Rect,
  type WordsDrawn,
} from '~/test/reader-word-seek';
import { openWordSeek, seekTimeline } from '~/test/word-seek';

import { SIZES } from './reading';
import { SeekArea as NativeArea, SeekScroll as NativeScroll } from './WordSeek.native';
import { type SeekAreaProps, seekHeld } from './word-seek';

type App = Effect.Success<ReturnType<typeof openWordSeek>>;
type Page = Effect.Success<ReturnType<typeof mountSeekReader>>;
type Surface = 'web' | 'native' | 'steps';

const SEEDS = 128;
const COMMANDS = 128;
const LINE_PT = 48;
const WORD_PT = 24;
const STILL_PT = 10;
const STRIP_PT = 20;
/** The space the open controls keep between themselves and the bar (spec B9: the panel lies outside the viewport). */
const PANEL_GAP = 8;
/** How long a chord's press keeps a phone's hold from taking: the hold's 350 ms and 250 ms of grace. */
const CHORD_MS = 600;
/** Long enough for a start's count-in and the player's own act after a command to end, so a hold may take again. */
const SETTLE_MS = 3_000;
/**
 * One bar of the fixture's first tempo, counted in quarters of its 4/4 at
 * the dial's 100 (a rate of 1): how long a counted start holds the first
 * sung line, read from the score, never from the player's count.
 */
const BAR_MS = (seekTimeline.tempo.numerator * seekTimeline.tempo.microsPerQuarter) / 1000;

/**
 * The count-in as the history's own commands lead to it: a start with the
 * intro on counts one bar from its command; a pause during the count keeps
 * it and the next resume counts the whole bar again; a seek, or a start with
 * the intro off, leaves it. A resume that plays from the start again
 * (`startsAgain`) is a start.
 */
const countInModel = () => {
  let from = Number.NaN;
  let until = Number.NaN;
  let kept = false;
  const counting = (now: number) => from <= now && now < until;
  const count = (now: number) => {
    from = now;
    until = now + BAR_MS;
  };
  const leave = () => {
    from = Number.NaN;
    until = Number.NaN;
  };
  return {
    counting,
    /** A count-in this history began has run its whole bar. */
    over: (now: number) => until <= now,
    start: (now: number, intro: boolean) => {
      kept = false;
      leave();
      if (intro) count(now);
    },
    pause: (now: number) => {
      if (counting(now)) kept = true;
      leave();
    },
    resume: (now: number) => {
      if (!kept) return;
      kept = false;
      count(now);
    },
    seek: () => {
      kept = false;
      leave();
    },
  };
};

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

/**
 * Whether a Resume from `state` plays the hymn from its start again, as the
 * player publishes it: from the end, or stopped before any place was proved.
 */
const startsAgain = (state: Player) =>
  Player.$is('Ended')(state) ||
  (Player.$is('Stopped')(state) && Option.getOrElse(state.at, () => 0) <= 0);

/** A command that tries to begin a hold: a pointer down, a finger's press, the entry pressed. */
const tries = (command: string) => /^(down|press|open) /.test(command);

const counts = new Map<string, number>();
const count = (name: string) => counts.set(name, (counts.get(name) ?? 0) + 1);

/** The reference: what the page must show and do, kept apart from the product. */
const reference = (
  app: App,
  page: Page,
  surface: Surface,
  viewport: number,
  rects: ReadonlyArray<Rect>,
  /** Whether the history's own count-in model counts now. */
  counting: () => boolean,
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
    /** The points the open controls take at the viewport's foot, with their gap; none while closed. */
    room: 0,
    /** Each hold taken or ended starts a new one: a measure asked in an older one is stale. */
    epoch: 0,
  };
  /** The hold is over: the controls close, and a new epoch begins. */
  const over = () => {
    state.room = 0;
    state.epoch += 1;
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
    !counting();
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
      state.epoch += 1;
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
        over();
      }
      state.owner = { _tag: 'Idle' };
    },
    cancel: () => {
      if (state.owner._tag === 'Held') {
        count('cancel');
        over();
      }
      state.owner = { _tag: 'Idle' };
    },
    /** Something outside took the hold away: a pointer still down is left with nothing to end. */
    revoke: (keepsPointer: boolean) => {
      const owner = state.owner;
      if (owner._tag !== 'Held') return;
      count('revoke');
      over();
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
      const inside = state.viewport - RISE - state.room;
      return Math.abs(page.padTop() + rect.top + rect.height / 2 - y - inside / 2);
    },
  };
};

/** Where the page differs from the reference, as numbers and booleans only. */
const differences = (
  model: ReturnType<typeof reference>,
  page: Page,
  app: App,
  /** The player's seeks that a history's own Seek or move to the end asked for, by their place. */
  outside: ReadonlySet<number>,
  /** A measure the current hold asked has not answered yet, so its scroll is still to come. */
  waiting: boolean,
  surface: Surface,
  /** Whether the history's count-in model counts now. */
  counting: boolean,
) => {
  const want = model.expected();
  const chosen = page.chosenLines();
  const words = Option.match(model.choiceNow(), {
    onNone: () => chosen.flatMap((k) => page.underlined(k)),
    onSome: (it) => page.underlined(it.line),
  });
  const seeks = app.commands
    .filter(({ kind }, k) => kind === 'seek' && !outside.has(k))
    .map(({ ms }) => ms);
  const centred = Option.match(model.choiceNow(), {
    onNone: () => true,
    onSome: (it) => waiting || model.offMiddle(it) <= 2,
  });
  const still =
    !want.held || page.scrolls.slice(model.state.heldFrom).every(({ animated }) => !animated);
  const offered = model.eligible();
  const owner = model.state.owner._tag;
  const recognizer =
    surface !== 'native' ||
    owner === 'Held' ||
    (gestureOf('reader-word-seek-hold').enabled !== false) === offered;
  const armed = surface !== 'web' || page.waiting().length > 0 === (owner === 'Candidate');
  const checks = [
    ['count-in', Option.isSome(app.registry.get(app.player.countIn)) === counting, `${counting}`],
    ['entry', page.enabled('hymn-word-seek') === offered, `${offered}`],
    ['recognizer', recognizer, `${offered}`],
    ['armed', armed, owner],
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
    const words = wordsDrawn[Math.floor(seed / 3) % wordsDrawn.length] ?? 'plain';
    const later = Math.floor(seed / 9) % 2 === 1;
    let reduced = rng.next() < 0.5;
    const drawn = { viewport, rects, words, later, reduced };
    const page = yield* mountSeekReader(
      app,
      {
        web: drawn,
        steps: drawn,
        native: { ...drawn, area: NativeArea, scroll: NativeScroll },
      }[surface],
    );
    yield* inAct(app.play);
    const counted = countInModel();
    /** The history's clock, read before each command and again before its checks. */
    let now = yield* Clock.currentTimeMillis;
    /** The intro switch as the history last set it. */
    let intro = false;
    const model = reference(app, page, surface, viewport, rects, () => counted.counting(now));
    const settle = inAct(TestClock.adjust(0));
    const outside = new Set<number>();
    /** When a chord was last pressed, by the page's touch clock. */
    let chordAt = Number.NEGATIVE_INFINITY;
    const chordRecent = () => page.now() - chordAt <= CHORD_MS;
    /** A release's seek waits for the history's own `land` on these seeds. */
    const landLate = Math.floor(seed / 18) % 2 === 1;
    let landing = Option.none<Deferred.Deferred<Status, PlaybackError>>();
    /** Each measure asked, with the hold's epoch at its asking. */
    const askedIn: Array<number> = [];
    /** Measures from an older hold or follow that scrolled the page when they answered. */
    const staleScrolls: Array<number> = [];
    /** The step asked the player for a place itself, so its seeks are not a release's. */
    let outsideStep = false;
    const holdTag = () => app.registry.get(app.player.hold.state)._tag;
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
    /** A finger lands on the words, drifts or stays, and waits for the hold's time. */
    const nativePress = (step: number) => {
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
      const chorded = chordRecent();
      const can = model.eligible() && !chorded;
      const still =
        dx * dx + dy * dy <= STILL_PT ** 2 && Math.abs(dx) <= STILL_PT && Math.abs(dy) <= STILL_PT;
      if (!still) count('drift');
      if (chorded) count('chord-refused');
      act(() => {
        press = Option.some(longPress('reader-word-seek-hold', { x: 100, y: 200, dx, dy }));
      });
      pressAt = { x: dx, y: dy };
      promised = still && can;
      if (still && can) model.take(1, dx, dy);
      else model.state.owner = { _tag: 'Orphan', id: 1 };
      return `press ${step}`;
    };
    /** The finger down moves. */
    const nativeMove = (step: number) => {
      const mx = offset(rng, WORD_PT);
      const my = offset(rng, LINE_PT);
      act(() => press.pipe(Option.map((it) => it.move(mx, my))));
      model.drag(mx - pressAt.x, my - pressAt.y);
      return `move ${step}`;
    };
    /** The finger down lifts, or the platform cancels it. */
    const nativeEnd = (step: number) => {
      const end = { cancel: model.cancel, lift: model.release };
      const how = rng.pick(['cancel', 'lift', 'lift'] as const);
      act(() => press.pipe(Option.map((it) => it[how]())));
      press = Option.none();
      end[how]();
      return `end ${step}`;
    };
    const native = (step: number) => {
      const kind = rng.int(20);
      const nearCount = counted.counting(now) || counted.over(now);
      if (Option.isNone(press) && (kind < 9 || (counted.over(now) && kind < 17)))
        return nativePress(step);
      const refusedFinger =
        Option.isSome(press) && model.state.owner._tag === 'Orphan' && nearCount;
      if (Option.isSome(press) && kind < 14 && !(refusedFinger && kind < 8))
        return nativeMove(step);
      if (Option.isSome(press) && (kind < 17 || refusedFinger)) return nativeEnd(step);
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
      if (owner._tag === 'Held' && kind < 3) return panel(step);
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
    /** Some of the measures waiting answer, in an order of the history's choosing. */
    const answerSome = (step: number) => {
      const pending = page.pending();
      const some = pending.filter(() => rng.next() < 0.6);
      const order = ((some.length > 0 && some) || pending)
        .map((k) => [rng.next(), k] as const)
        .toSorted(([a], [b]) => a - b)
        .map(([, k]) => k);
      for (const k of order) {
        const stale = askedIn[k] !== model.state.epoch;
        const before = page.scrolls.length;
        page.answer(k);
        if (stale) count('stale-answer');
        if (stale && page.scrolls.length > before) staleScrolls.push(k);
      }
      count('answer');
      return `answer ${step}`;
    };
    /** A reading setting changes as its control sets it: a new value redraws the words and ends a hold. */
    const setting = (step: number, keepsPointer: boolean) => {
      const which = rng.pick(['size', 'font', 'spacing', 'chords'] as const);
      const changed = {
        size: () => {
          const value = rng.int(SIZES.length);
          count(`size-${value}`);
          const was = app.registry.get(page.reading.size);
          page.set(page.reading.size, value);
          return value !== was;
        },
        font: () => {
          const value = rng.pick(['system', 'serif'] as const);
          count(`font-${value}`);
          const was = app.registry.get(page.reading.font);
          page.set(page.reading.font, value);
          return value !== was;
        },
        spacing: () => {
          const value = rng.pick(['compact', 'normal', 'roomy'] as const);
          count(`spacing-${value}`);
          const was = app.registry.get(page.reading.spacing);
          page.set(page.reading.spacing, value);
          return value !== was;
        },
        chords: () => {
          if (words === 'plain') return false;
          const value = !app.registry.get(page.chords);
          count(`chords-${value}`);
          page.set(page.chords, value);
          return true;
        },
      }[which]();
      if (changed) model.revoke(keepsPointer);
      return `setting ${step}`;
    };
    /** The open controls are laid out at another height. */
    const panel = (step: number) => {
      const height = rng.pick([120, 200, 260]);
      page.panel(height);
      model.state.room = height + PANEL_GAP;
      count('panel');
      return `panel ${step}`;
    };
    /** A release's seek, held at its boundary, lands. */
    const land = (step: number) => {
      const ms = app.commands.findLast(({ kind }) => kind === 'seek')?.ms ?? 0;
      Option.map(landing, (it) =>
        Deferred.doneUnsafe(
          it,
          Effect.succeed({ state: 'playing' as const, positionMs: ms, durationMs: 21_000 }),
        ),
      );
      app.boundaries.delete('seek');
      landing = Option.none();
      count('land');
      return `land ${step}`;
    };
    /** The player is asked for something of its own, with no hold: a place, the end, a start again, a pause while it loads. */
    const playerCommand = (step: number) => {
      outsideStep = true;
      const how = rng.pick(['first', 'end', 'restart', 'count-in', 'count-in', 'stop'] as const);
      const timed = Option.getOrThrow(book.of(1));
      const start = () => app.send(Command.Start({ track: { number: 1, title: 'Fixture' } }));
      ({
        first: () => {
          app.send(Command.Seek({ seconds: (timed.lines[0]?.start ?? 0) / 1000 }));
          counted.seek();
        },
        end: () => {
          app.send(Command.Seek({ seconds: 20.9 }));
          counted.seek();
        },
        restart: () => {
          intro = false;
          app.registry.set(app.intro, intro);
          start();
          counted.start(now, intro);
        },
        'count-in': () => {
          intro = true;
          app.registry.set(app.intro, intro);
          start();
          counted.start(now, intro);
        },
        stop: () => {
          start();
          app.send(Command.Pause());
          counted.start(now, intro);
          counted.pause(now);
        },
      })[how]();
      count(`player-${how}`);
      return `player ${step} ${how}`;
    };
    /** How long the next `wait` lets pass. */
    let waitMs = 0;
    /** Time passes while the count-in counts: to a beat, past its middle, or to and past its end. */
    const wait = (step: number) => {
      waitMs = rng.pick([BAR_MS / 4, BAR_MS / 2, BAR_MS, BAR_MS + 250]);
      count('wait');
      return `wait ${step}`;
    };
    /** A press on a chord: never a hold, and on a phone none for its time after. */
    const chordPress = (step: number) => {
      if (surface === 'native') {
        page.pressChord();
        chordAt = page.now();
      } else {
        page.pointer('pointerdown', {}, 'chord');
        page.elapse();
        page.pointer('pointerup', {}, 'chord');
      }
      count('chord');
      return `chord ${step}`;
    };
    const common = (step: number): string => {
      const kind = rng.int(16);
      const keepsPointer = surface !== 'steps';
      const owner = model.state.owner;
      if (kind < 8 && Option.isSome(landing) && holdTag() === 'Landing' && rng.next() < 0.3)
        return land(step);
      if (counted.counting(now) && rng.next() < 0.7) return wait(step);
      if (kind < 4) return `tick ${step}`;
      if (kind < 8) return ordinary(kind, step, keepsPointer);
      if (kind < 10 && later && page.pending().length > 0) return answerSome(step);
      if (kind < 11) return setting(step, keepsPointer);
      if (kind < 13 && surface === 'steps' && owner._tag === 'Held') return panel(step);
      return outer(kind, step);
    };
    /** What reaches the page from outside it: the player's own commands, a chord, the system's Reduce Motion. */
    const outer = (kind: number, step: number): string => {
      const idle = model.state.owner._tag === 'Idle';
      /** No hold: none was taken, or a finger still down was refused one. */
      const unheld = idle || model.state.owner._tag === 'Orphan';
      if (kind < 14 && unheld && holdTag() === 'Free' && rng.next() < 0.4)
        return playerCommand(step);
      if (kind < 15 && words === 'boxed' && page.hasChord() && idle) return chordPress(step);
      reduced = !reduced;
      page.motion(reduced);
      count('motion');
      return `motion ${step}`;
    };
    const ordinary = (kind: number, step: number, keepsPointer: boolean): string => {
      if (kind < 5) {
        model.revoke(keepsPointer);
        app.send(Command.Pause());
        counted.pause(now);
        count('pause');
        return `pause ${step}`;
      }
      if (kind < 6) {
        model.revoke(keepsPointer);
        const again = startsAgain(app.registry.get(app.player.state));
        app.send(Command.Resume());
        if (again) counted.start(now, intro);
        else counted.resume(now);
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
    const ahead = (command: string, candidate: Owner) =>
      Effect.gen(function* () {
        count(`state-${app.registry.get(app.player.state)._tag}`);
        if (command.startsWith('elapse') && candidate._tag === 'Candidate')
          model.take(candidate.id, candidate.at.x, candidate.at.y);
        if (command.startsWith('tick')) {
          page.advance(250);
          yield* inAct(TestClock.adjust(250));
        }
        if (command.startsWith('wait')) {
          page.advance(waitMs);
          yield* inAct(TestClock.adjust(waitMs));
        }
        if (command.startsWith('player') && !command.endsWith('count-in'))
          yield* inAct(TestClock.adjust(SETTLE_MS));
        if (holdTag() === 'Landing') count('landing');
        if (command.startsWith('elapse') && model.state.owner._tag === 'Candidate')
          model.state.owner = { _tag: 'Idle' };
      });
    /** Which count-in cases the step reached, from how it stood `before` the command. */
    const countInCovered = (
      before: { readonly counting: boolean; readonly owner: Owner['_tag'] },
      command: string,
    ) => {
      if (counted.counting(now)) count('state-counting');
      if (before.counting && counted.over(now)) count(`count-in-ran-out-${surface}`);
      if (before.counting && tries(command)) count(`count-in-refused-${surface}`);
      if (before.owner !== 'Held' && model.state.owner._tag === 'Held' && counted.over(now))
        count(`held-after-count-in-${surface}`);
    };
    /** What the step did wrong that `differences` does not compare. */
    const offences = () => {
      const refused = promised && model.state.owner._tag !== 'Held';
      const found = [
        [refused, 'an offered hold did not take'],
        [staleScrolls.length > 0, `stale=${staleScrolls.join(',')}`],
      ] as const;
      return found.filter(([wrong]) => wrong).map(([, said]) => said);
    };
    const mismatches: Array<string> = [];
    for (let step = 0; step < COMMANDS; step++) {
      promised = false;
      outsideStep = false;
      if (landLate && model.state.owner._tag === 'Held' && Option.isNone(landing)) {
        const held = yield* Deferred.make<Status, PlaybackError>();
        app.boundaries.set('seek', held);
        landing = Option.some(held);
      }
      const seeksBefore = app.commands.length;
      now = yield* Clock.currentTimeMillis;
      const before = { counting: counted.counting(now), owner: model.state.owner._tag };
      const command = { web, native, steps }[surface](step);
      const candidate = model.state.owner;
      yield* settle;
      yield* ahead(command, candidate);
      now = yield* Clock.currentTimeMillis;
      countInCovered(before, command);
      if (outsideStep)
        app.commands.slice(seeksBefore).forEach((_, k) => outside.add(seeksBefore + k));
      while (askedIn.length < page.asked()) askedIn.push(model.state.epoch);
      const current = page.pending().filter((k) => askedIn[k] === model.state.epoch);
      const wrong = [
        ...offences(),
        ...differences(
          model,
          page,
          app,
          outside,
          current.length > 0,
          surface,
          counted.counting(now),
        ),
      ];
      if (wrong.length > 0) {
        mismatches.push(`seed=${seed} ${surface} ${command} ${wrong.join(' ')}`);
        break;
      }
    }
    return mismatches;
  }).pipe(Effect.scoped);

it.effect(
  'an older measure answering late never scrolls over a newer choice or a finished hold',
  () =>
    Effect.gen(function* () {
      const app = yield* openWordSeek(false);
      const page = yield* mountSeekReader(app, { viewport: 800, later: true });
      yield* inAct(app.play);
      page.press('hymn-word-seek');
      yield* inAct(app.untilHold('Held'));
      page.press('reader-seek-next-line');
      const asked = page.asked();
      Array.from({ length: asked }, (_, k) => asked - 1 - k).forEach(page.answer);
      const line = fixtureRects[1] ?? { top: 0, height: 0 };
      const y = page.scrolls.at(-1)?.y ?? Number.NaN;
      const off = Math.abs(page.padTop() + line.top + line.height / 2 - y - (800 - RISE) / 2);
      page.press('reader-seek-next-line');
      page.press('reader-seek-cancel');
      yield* inAct(app.untilHold('Free'));
      const before = page.scrolls.length;
      Array.from({ length: page.asked() - asked }, (_, k) => asked + k).forEach(page.answer);
      expect([asked >= 2, off <= 2, page.scrolls.length - before]).toEqual([true, true, 0]);
    }).pipe(Effect.scoped),
);

/**
 * A seek through the player to the first line of the follow's own timing
 * (the bundled timing of the page's hymn number): the follow asks its
 * ordinary measure to lead to it.
 */
const seekToFirst = (app: App) =>
  inAct(
    Effect.gen(function* () {
      const timed = Option.getOrThrow(book.of(1));
      const first = (timed.lines[0]?.start ?? 0) / 1000;
      app.send(Command.Seek({ seconds: first }));
      yield* app.untilPlayer((state) => Player.$is('Playing')(state) && state.at >= first);
    }),
  );

it.effect('an ordinary follow measure asked before a hold never scrolls over its preview', () =>
  Effect.gen(function* () {
    const app = yield* openWordSeek(false);
    const page = yield* mountSeekReader(app, { viewport: 800, later: true });
    yield* inAct(app.play);
    yield* seekToFirst(app);
    const ordinary = page.asked();
    page.press('hymn-word-seek');
    yield* inAct(app.untilHold('Held'));
    Array.from({ length: page.asked() - ordinary }, (_, k) => ordinary + k).forEach(page.answer);
    const before = page.scrolls.length;
    Array.from({ length: ordinary }, (_, k) => k).forEach(page.answer);
    expect([ordinary > 0, page.scrolls.length - before]).toEqual([true, 0]);
  }).pipe(Effect.scoped),
);

it.effect('a measure asked before the page goes never scrolls it', () =>
  Effect.gen(function* () {
    const app = yield* openWordSeek(false);
    const page = yield* mountSeekReader(app, { viewport: 800, later: true });
    yield* inAct(app.play);
    yield* seekToFirst(app);
    const ordinary = page.asked();
    page.press('hymn-word-seek');
    yield* inAct(app.untilHold('Held'));
    page.press('reader-seek-next-line');
    const asked = page.asked();
    page.unmount();
    const before = page.scrolls.length;
    Array.from({ length: asked }, (_, k) => k).forEach(page.answer);
    expect([ordinary > 0, asked > ordinary, page.scrolls.length - before]).toEqual([true, true, 0]);
  }).pipe(Effect.scoped),
);

it.effect(
  'the open controls take their room from the middle, and the choice is centred in what is left',
  () =>
    Effect.gen(function* () {
      const app = yield* openWordSeek(false);
      const page = yield* mountSeekReader(app, { viewport: 800 });
      yield* inAct(app.play);
      page.press('hymn-word-seek');
      yield* inAct(app.untilHold('Held'));
      const offs = [200, 120, 260].map((height) => {
        page.panel(height);
        const rect = fixtureRects[0] ?? { top: 0, height: 0 };
        const y = page.scrolls.at(-1)?.y ?? Number.NaN;
        const inside = 800 - RISE - (height + PANEL_GAP);
        return Math.abs(page.padTop() + rect.top + rect.height / 2 - y - inside / 2);
      });
      const held = app.registry.get(app.player.hold.state)._tag;
      expect([held, offs.every((off) => off <= 2)]).toEqual(['Held', true]);
    }).pipe(Effect.scoped),
);

const wordsDrawn: ReadonlyArray<WordsDrawn> = ['plain', 'syllables', 'boxed'];

it.effect(
  'the chosen word is underlined whole, every syllable, however the page draws its words',
  () =>
    Effect.gen(function* () {
      const seen = [];
      for (const words of wordsDrawn) {
        const app = yield* openWordSeek(false);
        const page = yield* mountSeekReader(app, { viewport: 800, words });
        yield* inAct(app.play);
        page.press('hymn-word-seek');
        yield* inAct(app.untilHold('Held'));
        const first = [page.chosenLines(), page.underlined(0)];
        page.press('reader-seek-prev-word');
        const second = [page.chosenLines(), page.underlined(0)];
        page.press('reader-seek-cancel');
        yield* inAct(Effect.andThen(TestClock.adjust(250), app.untilHold('Free')));
        seen.push([words, first, second, page.underlined(0), page.hasChord()]);
      }
      expect(seen).toEqual([
        ['plain', [[0], [1]], [[0], [0]], [], false],
        ['syllables', [[0], [1]], [[0], [0]], [], false],
        ['boxed', [[0], [1]], [[0], [0]], [], true],
      ]);
    }).pipe(Effect.scoped),
);

it.effect(
  'a press on a chord never takes a hold, on the web or a phone, until its time has passed',
  () =>
    Effect.gen(function* () {
      const app = yield* openWordSeek(false);
      const web = yield* mountSeekReader(app, { viewport: 800, words: 'boxed' });
      yield* inAct(app.play);
      web.pointer('pointerdown', {}, 'chord');
      const waited = web.waiting().length;
      web.elapse();
      const onWeb = app.registry.get(app.player.hold.state)._tag;
      web.pointer('pointerup', {}, 'chord');
      web.unmount();
      const phone = yield* mountSeekReader(app, {
        viewport: 800,
        words: 'boxed',
        area: NativeArea,
      });
      phone.pressChord();
      let soon = Option.none<ReturnType<typeof longPress>>();
      act(() => {
        soon = Option.some(longPress('reader-word-seek-hold', { x: 100, y: 200 }));
      });
      const onPhone = app.registry.get(app.player.hold.state)._tag;
      act(() => Option.map(soon, (it) => it.lift()));
      phone.advance(1_000);
      let later = Option.none<ReturnType<typeof longPress>>();
      act(() => {
        later = Option.some(longPress('reader-word-seek-hold', { x: 100, y: 200 }));
      });
      const afterwards = app.registry.get(app.player.hold.state)._tag;
      act(() => Option.map(later, (it) => it.cancel()));
      expect([waited, onWeb, onPhone, afterwards]).toEqual([0, 'Free', 'Free', 'Held']);
    }).pipe(Effect.scoped),
);

it.effect(
  "a hold's end leads back to the line sung now, at once under Reduce Motion, set before or during the hold",
  () =>
    Effect.gen(function* () {
      const seen = [];
      for (const [atMount, during] of [
        [false, false],
        [true, true],
        [false, true],
        [true, false],
      ] as const) {
        const app = yield* openWordSeek(false);
        const page = yield* mountSeekReader(app, { viewport: 800, reduced: atMount });
        yield* inAct(app.play);
        yield* seekToFirst(app);
        page.press('hymn-word-seek');
        yield* inAct(app.untilHold('Held'));
        if (during !== atMount) page.motion(during);
        const before = page.scrolls.length;
        page.press('reader-seek-cancel');
        yield* inAct(Effect.andThen(TestClock.adjust(250), app.untilHold('Free')));
        const after = page.scrolls.slice(before);
        seen.push([during, after.length > 0, after.some(({ animated }) => animated)]);
        page.unmount();
      }
      expect(seen).toEqual([
        [false, true, true],
        [true, true, false],
        [true, true, false],
        [false, true, true],
      ]);
    }).pipe(Effect.scoped),
);

/** The page's seek as its area receives it, so a trace can call it as two adapters at once would. */
const given = { seek: Option.none<SeekAreaProps['seek']>() };
const GivenArea = ({ seek, style, children }: SeekAreaProps) => {
  given.seek = Option.some(seek);
  return <View style={style}>{children}</View>;
};

it.effect('the first finish of a hold is its only one, however many adapters end it', () =>
  Effect.gen(function* () {
    const app = yield* openWordSeek(false);
    const page = yield* mountSeekReader(app, { viewport: 800, area: GivenArea });
    yield* inAct(app.play);
    page.press('hymn-word-seek');
    yield* inAct(app.untilHold('Held'));
    page.press('reader-seek-next-line');
    const seek = Option.getOrThrow(given.seek);
    const landed = yield* Deferred.make<Status, PlaybackError>();
    app.boundaries.set('seek', landed);
    act(() => seek.release());
    yield* inAct(app.untilHold('Landing'));
    act(() => {
      seek.release();
      seek.cancel();
    });
    yield* Deferred.succeed(landed, { state: 'paused', positionMs: 6200, durationMs: 21_000 });
    yield* inAct(Effect.andThen(TestClock.adjust(250), app.untilHold('Free')));
    const ends = page.cues.filter((cue) => cue === 'seek-release').length;
    const seeks = app.commands.filter(({ kind }) => kind === 'seek').map(({ ms }) => ms);
    expect([ends, seeks]).toEqual([1, [6200]]);
  }).pipe(Effect.scoped),
);

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
    'answer',
    'stale-answer',
    'panel',
    'land',
    'landing',
    'chord',
    'chord-refused',
    'motion',
    'state-Loading',
    'state-Ended',
    'state-Stopped',
    'state-Paused',
    'chords-true',
    'chords-false',
    ...SIZES.map((_, k) => `size-${k}`),
    'font-system',
    'font-serif',
    'spacing-compact',
    'spacing-normal',
    'spacing-roomy',
    ...['first', 'end', 'restart', 'count-in', 'stop'].map((how) => `player-${how}`),
    'state-counting',
    'wait',
    ...surfaces.flatMap((on) => [
      `count-in-refused-${on}`,
      `count-in-ran-out-${on}`,
      `held-after-count-in-${on}`,
    ]),
  ];
  const seen = floors.map((name) => [name, counts.get(name) ?? 0] as const);
  return Effect.gen(function* () {
    yield* Console.log(seen.map(([name, n]) => `${name}=${n}`).join(' '));
    expect(seen.filter(([, n]) => n < 8)).toEqual([]);
  });
});
