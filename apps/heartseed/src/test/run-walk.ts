/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noTernary, effect/noAsyncFunction, effect/noTryCatch, effect/noThrowStatement, effect/noNewError, eslint/no-await-in-loop -- the run's model walk: it fails a step the model disagrees with by throwing to bun's runner, and it drives launches of the root in happy-dom through the run rig's promise-based steps, one after another, over a disk, faults, a clock and a zone kept in plain values the steps change (the generator's choices as plain branches), the zone in `process.env.TZ`, put back in a `finally` even when a step throws. */

/**
 * Today's run against its model on generated devices, through the run rig
 * (`src/test/run-rig.tsx`), which gives each launch its pieces through
 * `appLayer` and holds every Today frame to the footer rule.
 *
 * A device holds 1 to 8 pieces of made-up words in 1 to 3 groups (one-word
 * pieces, pieces of 60 to 90 words, references a trailing space or a digit
 * apart, the passage first or absent), a disk of their plants (every
 * grade, offsets or none, a plant no piece names) or an empty one (the
 * first minute), and its stored minutes. It is launched 2 or 3 times, in
 * zones that change, minutes to a month apart, some launches unread. A read
 * launch (and the first minute's Continue) lands on home, whose first show
 * makes the plan: with an item shown, home shows the model's counts line
 * and `Start`, which the walk takes to Today; with none, home shows the
 * done state's counts line and no `Start`, and the launch ends there, as it
 * does when the field is taken in the done state. On Today each launch runs
 * commands chosen by the screen the model expects: at Say
 * it a heard recital (a word skipped or not), an unheard one, a refused
 * write, a cancelled one, a recital then a Minutes trip with its item still
 * held, a Minutes trip, the field and back, a wait; at Next, Next, Again, a
 * peek, a Minutes trip, the field and a wait; at the done state a wait, a
 * Minutes trip and the field. A Minutes trip is the reader's: `Your field`,
 * home's Settings sheet, `<n> min` there, `Done`, then `Start` when home
 * offers it, else the launch ends on home's done state. An unread launch
 * offers no Minutes and no Settings, which the walk checks in place of a
 * trip. The making while a recital listens or finishes, which no reader can
 * reach, is `src/session/cells.property.test.ts`'s.
 *
 * The oracle is `src/test/run-model.ts` over `src/test/session-model.ts`'s
 * plan, made at home's first show and at each trip's `<n> min` tap: after every
 * step the reference shown, the action, the counts line, each word of the
 * verse as its cue draws it, shown and named (the new piece whole, a
 * review's first letters or empty slots by the ladder, a held recital's own
 * words while its result shows, never a stale mark on an item newly
 * shown), the result and alert (none while nothing is held), the heading,
 * the end of a run (`The field is tended` once every item of a run that is
 * not empty is done and none is held: no counts line, the line of what
 * grew and each grown verse's name by `tendedModel`, tallied `end:none`,
 * `end:one` or `end:many`), the done state's scroll text read exactly (the
 * counts line, or the end's line, alone), and the disk (the start's keys unchanged, plus each
 * kept recall's key under the piece said, and the minutes key after a
 * tap). Each recall a recital keeps holds the piece said, its reference and
 * word count, and a recital heard whole the matcher's suggestion under that
 * piece's own cue (Good under nothing, Hard under letters or the full text).
 */

import { describe, expect, it } from 'bun:test';
import { MutableRef } from 'effect';
import passage from 'virtual:heartseed-passage';

import { sourceWords } from '../matcher/words';
import type { Recall } from '../sayit';
import type { TextPiece } from '../session';
import { below, keyOf, pickOf, PREFIX, random, referenceCue } from './garden-model';
import {
  actionModel,
  grewLine,
  madeModel,
  nextModel,
  NO_RUN,
  shownModel,
  startedModel,
  tendedModel,
  type RunModel,
} from './run-model';
import {
  deviceOf,
  launch,
  PASSAGE,
  seenText,
  text,
  type Device,
  type Faults,
  type Launch,
} from './run-rig';
import { cardLineModel } from './home-model';
import { passageTextIn } from './passage-text';
import { END, homeLines, rootFaults } from './root-rule';
import { closeSettings, modalOf, openSettings, tapInSheet, watchSheet } from './settings-rig';
import { countsModel, DAY, HOUR, MINUTE, planModel } from './session-model';
import { hostZone, offsetIn, restore, travel, ZONES } from './zone';
import { MINUTES_KEY } from '../session/service';

/** Which commands a walk leans toward: the run through whole plans, the hold, the edges (the first minute, unread launches, the done state), the recital's endings (cancelled, and a Minutes trip after one that kept nothing), or the cells (a Minutes trip aimed at each ending and placing of the held item after its recital, `CELLS`). */
export type Steer = 'run' | 'hold' | 'edges' | 'end' | 'cells';

/** Whether a steer leans to the hold: more pieces in more groups, long pieces, now and then a crowded device. */
const crowds = (steer: Steer) => steer === 'hold';

/** Whether a steer's plants are all due, 20 to 60 days back: the hold's, and the cells'. */
const allDue = (steer: Steer) => steer === 'hold' || steer === 'cells';

const T0 = Date.UTC(2026, 4, 4, 13);

const VOCABULARY = [
  'amber',
  'brook',
  'cedar',
  'dawn',
  'ember',
  'fern',
  'grove',
  'heron',
  'isle',
  'juniper',
  'kestrel',
  'linden',
  'marsh',
  'nettle',
  'orchard',
  'pebble',
] as const;

const MINUTES = [2, 5, 10, 20] as const;

/** A piece's text of `words` made-up words. */
const textOf = (next: () => number, words: number) =>
  Array.from({ length: words }, () => pickOf(next, VOCABULARY)).join(' ');

/** A piece of `words` words under `reference` in `group`. */
const pieceOf = (next: () => number, reference: string, group: string, words: number) => {
  const text = textOf(next, words);
  return { reference, text, words: sourceWords(text).length, group };
};

/** A word count: one word 6%, 60-90 words 12% (30% leaning to the hold), else 2-29. */
const wordsOf = (next: () => number, steer: Steer) => {
  const roll = next();
  if (roll < 0.06) return 1;
  if (roll < (crowds(steer) ? 0.36 : 0.18)) return 60 + below(next, 31);
  return 2 + below(next, 28);
};

/**
 * A crowded device, leaning to the hold: four pieces of 80-90 words in one
 * group and one of 60-80 words in another, so once the first is said, the
 * other group's piece is shown while long pieces of the first group, more
 * overdue, and a new piece fill a 2-minute plan that leaves it out.
 */
const crowdedOf = (next: () => number): TextPiece[] => [
  ...Array.from({ length: 4 }, (_, at) =>
    pieceOf(next, `Alder ${1 + at}:${1 + below(next, 9)}`, 'G0', 80 + below(next, 11)),
  ),
  pieceOf(next, `Birch 1:${1 + below(next, 9)}`, 'G1', 60 + below(next, 21)),
];

/**
 * A device leaning to the cells: 4-6 short pieces in two groups, most in
 * the first and one at least in the second, so the plan's mix shows a piece of the other group second
 * while an earlier due piece of the first group waits behind it; once the
 * first is said, a plan made with the second held shows that earlier piece
 * first (the held item moved), and a plan made at the first keeps it first.
 */
const interleavedOf = (next: () => number): TextPiece[] =>
  Array.from({ length: 4 + below(next, 3) }, (_, at) =>
    pieceOf(
      next,
      `Alder ${1 + at}:${1 + below(next, 9)}`,
      at === 1 || next() < 0.25 ? 'G1' : 'G0',
      2 + below(next, 11),
    ),
  );

/** 1-8 pieces in 1-3 groups with unique references, some a trailing space or a digit apart, the passage first in some devices; now and then a crowded device, leaning to the hold. */
const piecesOf = (next: () => number, steer: Steer): TextPiece[] => {
  if (steer === 'cells') return interleavedOf(next);
  if (crowds(steer) && next() < 0.4) return crowdedOf(next);
  const count =
    steer === 'edges'
      ? 1 + below(next, 8)
      : crowds(steer)
        ? 5 + below(next, 4)
        : 3 + below(next, 6);
  const groups = crowds(steer) ? 2 + below(next, 2) : 1 + below(next, 3);
  const pieces: TextPiece[] = [];
  if (next() < 0.4) pieces.push(PASSAGE);
  while (pieces.length < count) {
    const at = pieces.length;
    const group = `G${below(next, groups)}`;
    const trap = next();
    const last = pieces[pieces.length - 1];
    const reference =
      last !== undefined && trap < 0.15
        ? `${last.reference} `
        : last !== undefined && trap < 0.3
          ? `${last.reference.trim()}0`
          : `Alder ${1 + at}:${1 + below(next, 9)}`;
    if (pieces.some((each) => each.reference === reference)) continue;
    pieces.push(pieceOf(next, reference, group, wordsOf(next, steer)));
  }
  return pieces;
};

/** A recall of `reference` at `startedAt`, as the garden writes it. */
const recordOf = (
  next: () => number,
  reference: string,
  words: number,
  startedAt: number,
): readonly [string, string] => {
  const offset = next() < 0.9 ? offsetIn(pickOf(next, ZONES), startedAt) : undefined;
  const recall = {
    reference,
    startedAt,
    offset,
    grade: pickOf(next, [1, 2, 3, 4] as const),
    suggested: pickOf(next, [1, 2, 3] as const),
    words,
    missed: 0,
    peeked: 0,
    extra: 0,
  };
  return [keyOf(recall), JSON.stringify(recall)];
};

/** The disk's recalls by reference. */
const plantsOf = (device: Device) => {
  const plants = new Map<string, Recall[]>();
  for (const [key, value] of device.disk) {
    if (!key.startsWith(PREFIX)) continue;
    const recall = JSON.parse(value) as Recall;
    plants.set(recall.reference, [...(plants.get(recall.reference) ?? []), recall]);
  }
  return plants;
};

/**
 * The cue a piece with `recalls` is said under next, by the garden model's
 * ladder over ts-fsrs's cards (`referenceCue`): the full text before it is
 * planted, first letters at a seed, else nothing (full corn at a stability
 * of 21 days, which a card graded Again can keep, included).
 */
const cueModel = (recalls: readonly Recall[]) => referenceCue(recalls);

/** How the verse shows: the full text, first letters, nothing, or a recital's own words (its result shown). */
type Drawn = 'full' | 'initials' | 'none' | 'recital';

const LETTER = /[\p{L}\p{N}]/u;

/** A word's first letter or number as written; its first character when it has none. */
const letterOf = (word: string) => {
  const at = word.search(LETTER);
  const from = at < 0 ? 0 : at;
  return word.slice(from, from + 1);
};

/**
 * The verse of `piece` as the model expects it drawn under `drawn`, in
 * codes that print no word: `W` the full text whole, `R` a recital's own
 * words, else one code per word, `I` under first letters (its first letter
 * shown and named, the rest unseen) and `H` under nothing (an empty slot,
 * nothing shown or named).
 */
const verseModel = (piece: TextPiece, drawn: Drawn) => {
  if (drawn === 'full') return 'W';
  if (drawn === 'recital') return 'R';
  return (drawn === 'initials' ? 'I' : 'H').repeat(piece.words);
};

/**
 * One drawn word, coded against the word it stands for: `M` a miss's mark,
 * `P` a peeked word, `H` an empty slot hidden from the screen reader, `I`
 * its first letter alone, shown and named, `F` the word whole, named by
 * its text (a lit word's fade keeps it unseen in happy-dom), `X` anything
 * else (no node, a stray name or text).
 */
const wordCode = (node: Element | null, word: string, index: number) => {
  if (node === null) return 'X';
  const label = node.getAttribute('aria-label');
  if (node.getAttribute('role') === 'button')
    return label === `Missed word ${index + 1}` ? 'M' : 'X';
  if (label === `${word}, peeked`) return 'P';
  if (node.getAttribute('aria-hidden') === 'true')
    return label === null && seenText(node) === '' ? 'H' : 'X';
  if (label !== null) return label === letterOf(word) && seenText(node) === label ? 'I' : 'X';
  return text(node) === word ? 'F' : 'X';
};

/** The verse of `piece` as Today draws it, in `verseModel`'s codes: words all whole, marks or peeks read `R`, a recital's own. */
const verseSeen = (host: Element, piece: TextPiece) => {
  const whole = passageTextIn(host);
  if (whole !== null) return whole === piece.text ? 'W' : 'X';
  const codes = sourceWords(piece.text).map((word, index) =>
    wordCode(host.querySelector(`[data-testid="word-${index}"]`), word, index),
  );
  if (codes.length > 0 && codes.every((code) => code === 'F' || code === 'M' || code === 'P'))
    return 'R';
  return codes.join('');
};

/** How a recital ends: heard and kept, unheard, heard with its write refused, or cancelled while it listens. */
type How = 'heard' | 'unheard' | 'refused' | 'cancelled';

/** Whether the plan a Minutes trip makes shows another item first than the held one (`moved`, the done state included) or the held one (`kept`). */
type Placed = 'moved' | 'kept';

/** One cell of a Minutes trip after a recital, its item still held: how the recital ended, and where the new plan puts the held item. */
interface Cell {
  readonly key: string;
  readonly how: How;
  readonly placed: Placed;
}

const cellKey = (how: How, placed: Placed) => `cell:after:${how}:${placed}`;

/**
 * Every cell of (ending × placed) a walk reaches after a recital, each a
 * floor of the cells' part. A recall just kept is not due at its own
 * instant, so a plan made right after a heard recital never shows its item
 * first again. The cells of a making while a recital listens or finishes
 * are `src/session/cells.property.test.ts`'s.
 */
export const CELLS: readonly Cell[] = (['heard', 'unheard', 'refused', 'cancelled'] as const)
  .flatMap((how) =>
    (['moved', 'kept'] as const).map((placed) => ({ key: cellKey(how, placed), how, placed })),
  )
  .filter((cell) => !(cell.how === 'heard' && cell.placed === 'kept'));

/**
 * How often each command is chosen at Say it, by steer: a recital heard
 * (now and then refused), unheard, refused, cancelled (now and then
 * followed by a Minutes trip), a recital of any ending followed by a
 * Minutes trip with its item still held (`during`), a Minutes trip, the
 * field, else a wait; and how often a Minutes trip comes first, right after
 * a recital that kept nothing.
 */
const AT_SAY_IT: Record<
  Steer,
  {
    readonly heard: number;
    readonly unheard: number;
    readonly refused: number;
    readonly cancelled: number;
    readonly during: number;
    readonly minutes: number;
    readonly field: number;
    readonly after: number;
  }
> = {
  run: {
    heard: 0.6,
    unheard: 0.1,
    refused: 0.05,
    cancelled: 0.04,
    during: 0.1,
    minutes: 0.05,
    field: 0.05,
    after: 0.25,
  },
  hold: {
    heard: 0.25,
    unheard: 0.1,
    refused: 0.05,
    cancelled: 0.02,
    during: 0.2,
    minutes: 0.1,
    field: 0.1,
    after: 0.35,
  },
  edges: {
    heard: 0.4,
    unheard: 0.1,
    refused: 0.05,
    cancelled: 0.05,
    during: 0.08,
    minutes: 0.05,
    field: 0.05,
    after: 0.35,
  },
  end: {
    heard: 0.2,
    unheard: 0.15,
    refused: 0.12,
    cancelled: 0.18,
    during: 0.25,
    minutes: 0.03,
    field: 0.03,
    after: 0.6,
  },
  cells: {
    heard: 0.3,
    unheard: 0.15,
    refused: 0.1,
    cancelled: 0.1,
    during: 0.15,
    minutes: 0.05,
    field: 0.05,
    after: 0.3,
  },
};

/** A walk's tally of the cases it reached. */
export type Coverage = Record<string, number>;

const bump = (coverage: Coverage, key: string) => {
  coverage[key] = (coverage[key] ?? 0) + 1;
};

/** The floors of an end settled, by how many verses grew: none, one, several. */
const END_FLOORS = ['end:none', 'end:one', 'end:many'] as const;

/** What the screen shows of the run after a step, and what the model expects. */
interface Seen {
  readonly headings: readonly string[];
  readonly grew: readonly string[];
  readonly grown: readonly string[];
  readonly references: readonly string[];
  readonly actions: readonly string[];
  readonly counts: readonly string[];
  readonly verse: string;
  readonly grades: number;
  readonly alerts: number;
  readonly doneText: boolean;
}

/** The Today card's lines home shows, as `homeLines` reads them. */
const homeCounts = (app: Launch) => homeLines(app.host);

class Walk {
  readonly faults: Faults = { unread: false, refuse: false };
  readonly time = { now: T0 };
  run: RunModel = NO_RUN;
  unread = false;
  minutes = 5;
  zone: string = 'UTC';
  /** The last recital's end shown while its item is held: its grades, its alert, or none. */
  result: 'grades' | 'alert' | null = null;
  /** How the held item's last recital ended when it kept no recall (unheard, refused or cancelled), until a making or Next lets the hold go. */
  ending: Exclude<How, 'heard'> | null = null;
  /** How the held item's last recital ended, any ending, until a making or Next lets the hold go. */
  heldEnd: How | null = null;
  app: Launch | null = null;
  /** Whether the launch under way ended on home's done state. */
  ended = false;
  /** The end's want last computed, with the run and the disk's size it was computed over. */
  endWant: {
    readonly run: RunModel;
    readonly size: number;
    readonly tended: ReturnType<typeof tendedModel>;
  } | null = null;
  readonly expected = new Map<string, string | null>();

  constructor(
    readonly next: () => number,
    readonly device: Device,
    readonly pieces: readonly TextPiece[],
    readonly coverage: Coverage,
    readonly log: string[],
  ) {
    for (const [key, value] of device.disk) this.expected.set(key, value);
  }

  get screen() {
    if (this.app === null) throw new Error('no launch');
    return this.app;
  }

  recallsNow = (reference: string) => plantsOf(this.device).get(reference)?.length ?? 0;

  pieceOf(reference: string) {
    const piece = this.pieces.find((each) => each.reference === reference);
    if (piece === undefined) throw new Error('an item of no piece');
    return piece;
  }

  planNow() {
    return planModel({
      plants: plantsOf(this.device),
      pieces: this.pieces,
      at: this.time.now,
      offset: offsetIn(this.zone, this.time.now),
      minutes: this.minutes,
    }).items;
  }

  /** The end's want while the run model is done: the run's grown verses by `tendedModel` over its items' baselines and the disk's recalls, computed once per run and disk, so a poll reads it again for free; null off the end. */
  tendedNow() {
    if (this.unread || this.run.plan === null || shownModel(this.run, this.recallsNow) !== null)
      return null;
    const size = this.device.disk.size;
    const cached = this.endWant;
    if (cached !== null && cached.run === this.run && cached.size === size) return cached.tended;
    const tended = tendedModel(this.run, [], [...plantsOf(this.device).values()].flat());
    this.endWant = { run: this.run, size, tended };
    return tended;
  }

  /** What the model expects the screen to show at rest. */
  expect(): Seen {
    if (this.unread) return this.expectUnread();
    const shown = shownModel(this.run, this.recallsNow);
    const action = actionModel(this.run, this.recallsNow);
    const held = this.run.hold !== null;
    const tended = this.tendedNow();
    return {
      headings: [tended === null ? 'Today' : END],
      grew: tended === null ? [] : [grewLine(tended.length)],
      grown: tended === null ? [] : tended.map((each) => `${each.reference}, ${each.stage}`),
      references: shown === null ? [] : [shown.reference.trim()],
      actions: action === null ? [] : [action],
      counts:
        this.run.plan === null || tended !== null
          ? []
          : [countsModel(this.run.plan, this.recallsNow)],
      verse: shown === null ? '' : verseModel(this.pieceOf(shown.reference), this.drawnNow(shown)),
      grades: held && this.result === 'grades' ? 1 : 0,
      alerts: held && this.result === 'alert' ? 1 : 0,
      doneText: true,
    };
  }

  /** What the model expects of an unread launch (R10): the first piece whole but while its last recital's result shows, Say it, no counts line. */
  expectUnread(): Seen {
    const first = this.pieces[0];
    return {
      headings: ['Today'],
      grew: [],
      grown: [],
      references: first === undefined ? [] : [first.reference.trim()],
      actions: first === undefined ? [] : ['Say it'],
      counts: [],
      verse:
        first === undefined ? '' : verseModel(first, this.result === 'grades' ? 'recital' : 'full'),
      grades: this.result === 'grades' ? 1 : 0,
      alerts: this.result === 'alert' ? 1 : 0,
      doneText: true,
    };
  }

  /** How the model draws the shown item's verse in a read launch: a held recital's own words while its result shows, else the item's cue now (`cueModel`: the full text for the new piece, the ladder's for a review). */
  drawnNow(shown: { readonly reference: string }): Drawn {
    if (this.run.hold !== null && this.result === 'grades') return 'recital';
    return cueModel(plantsOf(this.device).get(shown.reference) ?? []);
  }

  seen(): Seen {
    const app = this.screen;
    const item = this.unread ? this.pieces[0] : shownModel(this.run, this.recallsNow);
    const shown = item?.reference.trim();
    const piece = this.pieces.find((each) => each.reference === item?.reference);
    const counts = app.counts();
    const grew = app.grew();
    return {
      headings: app.headings(),
      grew,
      grown: app.grown(),
      references: app.references(),
      actions: app.actions(),
      counts,
      verse: piece === undefined ? '' : verseSeen(app.host, piece),
      grades: app.grades().length,
      alerts: app.alerts(),
      doneText: shown !== undefined || app.scrollText() === [...counts, ...grew].join(' '),
    };
  }

  /** The disk as the model expects it: the start's keys unchanged, each kept recall's key, and the minutes after a tap. */
  diskFaults() {
    const out: string[] = [];
    for (const [key, value] of this.expected) {
      if (!this.device.disk.has(key))
        out.push(`missing ${key.startsWith(PREFIX) ? 'recall' : key}`);
      else if (value !== null && this.device.disk.get(key) !== value)
        out.push(`changed ${key.startsWith(PREFIX) ? 'recall' : key}`);
    }
    for (const key of this.device.disk.keys())
      if (!this.expected.has(key))
        out.push(`unexpected ${key.startsWith(PREFIX) ? 'recall' : key}`);
    return out;
  }

  /** Waits for the screen the model expects, then holds it to the model and the disk. */
  async settle(step: string) {
    this.log.push(step);
    await this.screen.until(() => {
      const want = this.expect();
      const app = this.screen;
      const cheap =
        JSON.stringify([app.references(), app.actions(), app.counts()]) ===
        JSON.stringify([want.references, want.actions, want.counts]);
      return cheap && JSON.stringify(this.seen()) === JSON.stringify(want);
    });
    const seen = this.seen();
    const expected = this.expect();
    if (JSON.stringify(seen) !== JSON.stringify(expected))
      throw new Error(
        `after ${this.log.join(' > ')}: saw ${JSON.stringify(seen)}, expected ${JSON.stringify(expected)}`,
      );
    const disk = this.diskFaults();
    if (disk.length > 0) throw new Error(`after ${this.log.join(' > ')}: disk ${disk.join(', ')}`);
    if (this.screen.faults.length > 0)
      throw new Error(`after ${this.log.join(' > ')}: frames ${this.screen.faults.join('; ')}`);
    const tended = this.tendedNow();
    if (tended !== null) bump(this.coverage, END_FLOORS[Math.min(tended.length, 2)] ?? 'end:many');
    const shown = this.unread ? null : shownModel(this.run, this.recallsNow);
    if (shown === null) return;
    const drawn = this.drawnNow(shown);
    if (drawn !== 'recital')
      bump(this.coverage, `cue:${shown.fresh ? 'fresh' : 'review'}:${drawn}`);
  }

  /** A recall the reader's press keeps under `piece`, by its key and its word count. */
  expectRecall(piece: TextPiece, startedAt: number) {
    const key = keyOf({ reference: piece.reference, startedAt });
    this.expected.set(key, null);
    return key;
  }

  async launchNow() {
    travel(this.zone);
    this.faults.unread = this.unread;
    this.app = await launch(this.device, this.faults, this.time, this.pieces);
    this.ended = false;
    this.run = NO_RUN;
    this.result = null;
    this.ending = null;
    this.heldEnd = null;
    const firstMinute =
      this.device.disk.size === 0 ||
      ![...this.device.disk.keys()].some((key) => key.startsWith(PREFIX));
    if (this.unread) {
      bump(this.coverage, 'launch:unread');
      await this.settle('launch unread');
      return;
    }
    if (firstMinute) {
      await this.firstMinute();
      return;
    }
    bump(this.coverage, 'launch:read');
    await this.fromHome('launch');
  }

  /**
   * Home's first show, which makes the plan: with an item shown, home's
   * heading, the model's counts line, `Start` and the root's frame rule
   * held, then `Start` and Today's first show; with none, home's done state
   * (`homeDone`), which ends the launch.
   */
  async fromHome(step: string) {
    const app = this.screen;
    if (
      !(await app.until(
        () => app.headings().join('|') === 'Your field' && homeCounts(app).length > 0,
      ))
    )
      throw new Error(
        `after ${this.log.join(' > ')} > ${step}: no home, saw ${app.headings().join('|') || 'pending'}`,
      );
    this.run = madeModel(this.run, this.planNow(), false);
    if (shownModel(this.run, this.recallsNow) === null) {
      bump(this.coverage, 'done:first-show');
      return this.homeDone(step);
    }
    this.log.push(`${step} on home`);
    this.onHome(true);
    if (!(await app.tap('Start'))) throw new Error(`after ${this.log.join(' > ')}: no Start`);
    bump(this.coverage, 'home:begin');
    await this.settle('Start');
  }

  /** Home as the model expects it: one heading, `Your field`; the model's counts line; `Start` exactly when `begin`; and no frame fault of the root's rule or the footer's. */
  onHome(begin: boolean) {
    const app = this.screen;
    const counts = homeCounts(app);
    const want =
      this.unread || this.run.plan === null
        ? []
        : [cardLineModel(this.run.plan, this.recallsNow, shownModel(this.run, this.recallsNow))];
    const seen = { headings: app.headings(), counts, begin: app.has('Start') };
    const expected = { headings: ['Your field'], counts: want, begin };
    if (JSON.stringify(seen) !== JSON.stringify(expected))
      throw new Error(
        `after ${this.log.join(' > ')}: home showed ${JSON.stringify(seen)}, expected ${JSON.stringify(expected)}`,
      );
    const root = rootFaults(app.host, this.unread ? 'unread' : 'read');
    if (root.length > 0 || app.faults.length > 0)
      throw new Error(
        `after ${this.log.join(' > ')}: on home, ${[...root, ...app.faults].join(', ')}`,
      );
  }

  async firstMinute() {
    const app = this.screen;
    if (!(await app.until(() => app.headings().includes('Heartseed'))))
      throw new Error('no welcome');
    await app.tap('Skip');
    if (!(await app.until(() => app.headings().includes('Hear it'))))
      throw new Error('no first minute');
    MutableRef.set(app.hearing, { kind: 'heard', text: passage.text, skip: [] });
    await app.tap('Next');
    await app.until(() => app.headings().includes('Say it with help'));
    await this.recite();
    await app.until(() => app.headings().includes('Say it alone'));
    this.time.now += 10_000;
    this.expectRecall(PASSAGE, this.time.now);
    await this.recite();
    if (!(await app.until(() => app.headings().includes('Planted'))))
      throw new Error('nothing planted');
    await app.tap('Continue');
    bump(this.coverage, 'first-minute');
    await this.fromHome('the first minute');
  }

  /** Say it, then Listening once it listens: the recognizer hears at the finish. */
  async recite() {
    const app = this.screen;
    await app.tap('Say it');
    if (!(await app.until(() => app.has('Listening')))) throw new Error('never listened');
    await app.tap('Listening');
    await app.until(() => !app.has('Listening'));
  }

  /** A recital of the shown item: heard (a word skipped or not), unheard, heard with its write refused, or cancelled while it listens. */
  async say(how: How) {
    const app = this.screen;
    const shown = this.unread ? (this.pieces[0] ?? null) : shownModel(this.run, this.recallsNow);
    if (shown === null) return;
    const piece = this.pieceOf(shown.reference);
    const skip =
      (how === 'heard' || how === 'refused') && this.next() < 0.4 && piece.words > 1
        ? [below(this.next, piece.words)]
        : [];
    MutableRef.set(
      app.hearing,
      how === 'unheard' ? { kind: 'unheard' } : { kind: 'heard', text: piece.text, skip },
    );
    this.faults.refuse = how === 'refused';
    const startedAt = this.time.now;
    const cue = this.cueNow(piece);
    if (!this.unread) this.run = startedModel(this.run, this.recallsNow);
    await this.recital(how);
    const key = how === 'heard' ? this.expectRecall(piece, startedAt) : null;
    this.result = how === 'unheard' ? 'alert' : how === 'cancelled' ? null : 'grades';
    this.ending = how === 'heard' ? null : how;
    this.heldEnd = this.unread ? null : how;
    bump(this.coverage, `say:${this.unread ? 'unread' : how}`);
    if (skip.length > 0) bump(this.coverage, 'say:skipped');
    this.tallyShown(piece, 'fresh' in shown && !this.unread ? shown.fresh : null);
    await this.settle(`say ${how}`);
    this.faults.refuse = false;
    if (key !== null) this.checkRecall(key, piece, skip.length === 0 ? cue : null);
  }

  /** The taps of one recital: Say it, then a cancel while it listens, or Listening, which finishes it. */
  async recital(how: How) {
    const app = this.screen;
    await app.tap('Say it');
    if (!(await app.until(() => app.has('Listening')))) throw new Error('never listened');
    if (how === 'cancelled') {
      await app.cancel();
      return;
    }
    await app.tap('Listening');
  }

  /** The cue the model says `piece` is recited under now: its garden's in a read launch, none claimed in an unread one. */
  cueNow(piece: TextPiece) {
    if (this.unread) return null;
    return cueModel(plantsOf(this.device).get(piece.reference) ?? []);
  }

  /** The recall kept at `key` is the piece said: its reference, its word count, and, for a recital heard whole under `cue`, the matcher's suggestion (Good under nothing, else Hard at most). */
  checkRecall(key: string, piece: TextPiece, cue: 'full' | 'initials' | 'none' | null) {
    const value = this.device.disk.get(key);
    if (value === undefined) throw new Error(`after ${this.log.join(' > ')}: no recall kept`);
    const recall = JSON.parse(value) as Recall;
    const want = cue === null ? recall.suggested : cue === 'none' ? 3 : 2;
    if (
      recall.reference !== piece.reference ||
      recall.words !== piece.words ||
      recall.suggested !== want
    )
      throw new Error(
        `after ${this.log.join(' > ')}: kept ${JSON.stringify({ reference: recall.reference, words: recall.words, suggested: recall.suggested })}, expected ${JSON.stringify({ reference: piece.reference, words: piece.words, suggested: want })}`,
      );
    bump(this.coverage, `kept:cue:${cue ?? 'any'}`);
  }

  /** Tallies the piece said: long or one word, and the new piece or a review. */
  tallyShown(piece: TextPiece, fresh: boolean | null) {
    if (piece.words >= 60) bump(this.coverage, 'shown:long');
    if (piece.words === 1) bump(this.coverage, 'shown:one-word');
    if (fresh !== null) bump(this.coverage, fresh ? 'shown:fresh' : 'shown:review');
  }

  /**
   * A Minutes trip the reader's way, from Today: `Your field`, home held to
   * the plan as it was, the gear, `<n> min` in the sheet (the making, at
   * that tap, with no recital under way), the radio checked and home's
   * counts line under the sheet the new plan's, `Done`, home held to the
   * new plan, then `Start` when the model shows an item. Every frame of the
   * sheet is held by `watchSheet`. Answers whether Today shows again; when
   * not, the launch is left on home's done state for the caller to end.
   */
  async tapMinutes(minutes: number) {
    const before = this.run.hold;
    const wasDone = this.run.plan !== null && shownModel(this.run, this.recallsNow) === null;
    const app = this.screen;
    const step = `${minutes} min`;
    if (!(await app.tap('Your field')))
      throw new Error(`after ${this.log.join(' > ')} > ${step}: no Your field`);
    if (
      !(await app.until(
        () =>
          app.headings().join('|') === 'Your field' &&
          homeCounts(app).length > 0 &&
          app.has('Settings'),
      ))
    )
      throw new Error(
        `after ${this.log.join(' > ')} > ${step}: no home with Settings, saw ${app.headings().join('|') || 'pending'}`,
      );
    this.onHome(shownModel(this.run, this.recallsNow) !== null);
    const watch = watchSheet();
    try {
      await openSettings(app);
      if (!(await tapInSheet(step))) throw new Error(`no ${step} in the sheet`);
      this.minutes = minutes;
      this.expected.set(MINUTES_KEY, String(minutes));
      if (this.run.plan !== null) this.run = madeModel(this.run, this.planNow(), false);
      const counts = JSON.stringify(
        this.run.plan === null
          ? []
          : [cardLineModel(this.run.plan, this.recallsNow, shownModel(this.run, this.recallsNow))],
      );
      const checked = () =>
        modalOf()
          ?.querySelector(`[role="radio"][aria-label="${step}"]`)
          ?.getAttribute('aria-checked') === 'true';
      if (!(await app.until(() => checked() && JSON.stringify(homeCounts(app)) === counts)))
        throw new Error(
          `${step} not checked with the plan's counts, home showed ${JSON.stringify(homeCounts(app))}, expected ${counts}`,
        );
      if (!(await closeSettings(app, 'Done'))) throw new Error('the sheet stayed after Done');
    } catch (error) {
      watch.stop();
      throw new Error(`after ${this.log.join(' > ')} > ${step}: ${String(error)}`, {
        cause: error,
      });
    }
    watch.stop();
    if (watch.faults.length > 0 || watch.frames.looked === 0)
      throw new Error(
        `after ${this.log.join(' > ')} > ${step}: sheet ${watch.faults.join('; ') || 'faultless'}, its look checked on ${watch.frames.looked} frames`,
      );
    bump(this.coverage, 'settings:minutes');
    this.tallyMade(before, wasDone);
    const offers = shownModel(this.run, this.recallsNow) !== null;
    this.log.push(`${step}, Done`);
    this.onHome(offers);
    if (!offers) return false;
    if (!(await app.tap('Start'))) throw new Error(`after ${this.log.join(' > ')}: no Start`);
    return true;
  }

  /** Tallies a making by a Minutes trip: the hold it let go (after which ending, and where the new plan put the held item), and the done state it reached or left. */
  tallyMade(before: RunModel['hold'], wasDone: boolean) {
    if (before !== null) {
      bump(this.coverage, 'made:drops-hold');
      if (this.result === 'alert') bump(this.coverage, 'made:drops-hold:unheard');
      if (this.ending !== null) bump(this.coverage, `minutes:after:${this.ending}`);
      if (this.heldEnd !== null) {
        const placed =
          shownModel(this.run, this.recallsNow)?.reference === before.reference ? 'kept' : 'moved';
        bump(this.coverage, cellKey(this.heldEnd, placed));
      }
      this.result = null;
    }
    this.ending = null;
    this.heldEnd = null;
    const shown = shownModel(this.run, this.recallsNow);
    if (shown === null) bump(this.coverage, 'done:after-minutes');
    else if (wasDone) bump(this.coverage, 'minutes:appears');
  }

  /** A Minutes trip at `minutes`, then Today settled, or home's done state, which ends the launch. */
  async minutesTrip(minutes: number, step: string) {
    const today = await this.tapMinutes(minutes);
    bump(this.coverage, 'minutes');
    if (!today) return this.homeDone(step);
    await this.settle(step);
  }

  async minutesTap() {
    await this.minutesTrip(pickOf(this.next, MINUTES), 'minutes');
  }

  /** In an unread launch, in place of a trip: no Settings, no `<n> min` radio and no Minutes group show (sq4 a). */
  async minutesNone() {
    const app = this.screen;
    const found = MINUTES.map((each) => `${each} min`).filter(
      (label) => app.has(label) || app.has(label, 'radio'),
    );
    if (
      app.has('Settings') ||
      found.length > 0 ||
      app.host.querySelector('[role="radiogroup"][aria-label="Minutes"]') !== null
    )
      throw new Error(`after ${this.log.join(' > ')}: a Minutes or Settings on an unread garden`);
    bump(this.coverage, 'minutes:none-unread');
    await this.settle('no minutes, unread');
  }

  async nextTap() {
    const was = this.run.hold;
    await this.screen.tap('Next');
    this.run = nextModel(this.run);
    this.result = null;
    this.ending = null;
    this.heldEnd = null;
    bump(this.coverage, 'next');
    const now = shownModel(this.run, this.recallsNow);
    if (now === null) bump(this.coverage, 'done:after-next');
    else if (was !== null && now.group !== was.group) bump(this.coverage, 'next:another-group');
    await this.settle('Next');
    if (now !== null && !now.fresh) bump(this.coverage, `next:review:${this.drawnNow(now)}`);
  }

  async again() {
    await this.screen.tap('Again', 'radio');
    bump(this.coverage, 'again');
    await this.settle('Again');
  }

  async peekTap() {
    const mark = [...this.screen.host.querySelectorAll('[role="button"]')].find((node) =>
      /^Missed word \d+$/.test(node.getAttribute('aria-label') ?? ''),
    );
    if (mark === undefined) return this.wait();
    await this.screen.tap(mark.getAttribute('aria-label') ?? '');
    bump(this.coverage, 'peek');
    await this.settle('peek');
  }

  /** Today's `Your field`, then back by home's `Start` while Today showed an action; in the done state home shows the model's counts and no `Start`, and the launch ends there (`homeDone`). A hold kept there is tallied by what the model shows after it lets the item go (`field:held:last` none, `again` the held reference, `more` another), and as `field:held:next:<kind>` when Today showed `Next`. */
  async field() {
    const app = this.screen;
    await app.tap('Your field');
    if (
      !(await app.until(() => app.headings().includes('Your field') && homeCounts(app).length > 0))
    )
      throw new Error('no field');
    bump(this.coverage, this.run.hold === null ? 'field:none' : 'field:held');
    if (this.run.hold !== null) {
      const after = shownModel(nextModel(this.run), this.recallsNow);
      const kind =
        after === null ? 'last' : after.reference === this.run.hold.reference ? 'again' : 'more';
      bump(this.coverage, `field:held:${kind}`);
      if (actionModel(this.run, this.recallsNow) === 'Next')
        bump(this.coverage, `field:held:next:${kind}`);
    }
    if (this.run.hold === null && shownModel(this.run, this.recallsNow) === null) {
      bump(this.coverage, 'done:field');
      return this.homeDone('the field');
    }
    if (!(await app.tap('Start'))) throw new Error(`after ${this.log.join(' > ')}: no Start`);
    await this.settle('the field and back');
  }

  /** Home in the done state, reached by `step`: the model's counts line, no `Start`, and the root's frame rule (`rootFaults`) kept; the launch ends on it, with no Today frame after. */
  async homeDone(step: string) {
    this.log.push(`${step}, done`);
    this.onHome(false);
    const app = this.screen;
    await app.until(() => app.headings().join('|') !== 'Your field', 10);
    if (app.headings().join('|') !== 'Your field')
      throw new Error(`after ${this.log.join(' > ')}: home left for ${app.headings().join('|')}`);
    bump(this.coverage, 'home:done');
    this.ended = true;
  }

  async wait() {
    this.time.now += pickOf(this.next, [MINUTE, 7 * MINUTE, 2 * HOUR, 9 * HOUR] as const);
    bump(this.coverage, 'wait');
    await this.settle('wait');
  }

  /** One command, chosen by the screen the model expects. */
  async command(steer: Steer) {
    const roll = this.next();
    if (this.unread) {
      if (roll < 0.7) return this.say(this.next() < 0.8 ? 'heard' : 'unheard');
      return this.minutesNone();
    }
    const action = actionModel(this.run, this.recallsNow);
    if (action === 'Say it') return this.atSayIt(steer, roll);
    if (action === 'Next') return this.atNext(steer, roll);
    return this.atDone(roll);
  }

  /** Leaning to the hold: a heard recital, then a Minutes trip with its item still held at the fewest minutes whose plan leaves the shown item out, when one does; none otherwise. */
  guided(roll: number) {
    const shown = shownModel(this.run, this.recallsNow);
    if (shown === null) return null;
    const minutes = this.minutes;
    const leaves = MINUTES.find((each) => {
      this.minutes = each;
      const plan = this.planNow();
      this.minutes = minutes;
      return each !== minutes && !plan.some((item) => item.reference === shown.reference);
    });
    if (leaves === undefined) return null;
    bump(this.coverage, 'guide:left-out');
    if (roll >= 0.8) return null;
    return this.sayThenMinutes('heard', leaves);
  }

  /** Where the plan a Minutes trip at `minutes` makes now puts `shown`: first again (`kept`) or not (`moved`), the plants and the clock as they are. */
  placedAt(shown: { readonly reference: string }, minutes: number): Placed {
    const was = this.minutes;
    this.minutes = minutes;
    const plan = this.planNow();
    this.minutes = was;
    return shownModel({ plan, hold: null }, this.recallsNow)?.reference === shown.reference
      ? 'kept'
      : 'moved';
  }

  /**
   * Leaning to the endings: a recital aimed at a cell no trip has reached
   * yet, then a Minutes trip at the minutes whose plan places the shown
   * item as the cell asks (a heard recital's trip is moved whatever the
   * minutes, its recall just kept); none when no open cell is reachable
   * here, `moved` cells first. The cell tallied is the one the trip
   * reached, read from the model at its tap.
   */
  aimed() {
    const shown = shownModel(this.run, this.recallsNow);
    if (shown === null) return null;
    const reach = CELLS.flatMap((cell) => {
      if ((this.coverage[cell.key] ?? 0) > 0) return [];
      const minutes = MINUTES.filter(
        (each) => cell.how === 'heard' || this.placedAt(shown, each) === cell.placed,
      );
      return minutes.length === 0 ? [] : [{ cell, minutes }];
    });
    const moved = reach.filter((each) => each.cell.placed === 'moved' && each.cell.how !== 'heard');
    const open = moved.length > 0 ? moved : this.next() < 0.5 ? reach : [];
    const aim = open[below(this.next, open.length)];
    if (aim === undefined) return null;
    const minutes = aim.minutes[below(this.next, aim.minutes.length)] ?? this.minutes;
    bump(this.coverage, 'aim');
    return this.sayThenMinutes(aim.cell.how, minutes);
  }

  /** Whether a walk leaning to the cells has met every cell, its commands done. */
  cellsMet(steer: Steer) {
    return steer === 'cells' && CELLS.every((cell) => (this.coverage[cell.key] ?? 0) > 0);
  }

  /** A recital ended `how`, then a Minutes trip at `minutes` while its item is still held. */
  async sayThenMinutes(how: How, minutes: number) {
    await this.say(how);
    if (this.run.hold === null) return;
    await this.minutesTrip(minutes, `minutes ${minutes}`);
  }

  /** The minutes of a trip right after a recital: 2 minutes often (most often leaning to the hold), else any. */
  heldMinutesOf(steer: Steer) {
    const two = this.next() < (crowds(steer) ? 0.7 : 0.5);
    return two ? 2 : pickOf(this.next, MINUTES);
  }

  /** A recital cancelled while it listens, followed now and then by a Minutes trip with its item still held. */
  sayCancelled(steer: Steer) {
    if (this.next() < 0.4) return this.sayThenMinutes('cancelled', this.heldMinutesOf(steer));
    return this.say('cancelled');
  }

  /** A recital heard, unheard or refused, then a Minutes trip with its item still held. */
  sayDuring(steer: Steer) {
    const how = this.next() < 0.6 ? 'heard' : this.next() < 0.5 ? 'unheard' : 'refused';
    return this.sayThenMinutes(how, this.heldMinutesOf(steer));
  }

  /** At Say it: a Minutes trip now and then right after a recital that kept nothing, else a recital of any ending (followed by a Minutes trip with its item still held, now and then), a Minutes trip, the field or a wait. */
  async atSayIt(steer: Steer, roll: number) {
    const guided = steer === 'hold' ? this.guided(roll) : null;
    if (guided !== null) return guided;
    if (steer === 'cells') return this.aimed() ?? this.say('heard');
    const weights = AT_SAY_IT[steer];
    if (this.ending !== null && this.next() < weights.after) return this.minutesTap();
    let edge = weights.heard;
    if (roll < edge) return this.say(this.next() < 0.85 ? 'heard' : 'refused');
    edge += weights.unheard;
    if (roll < edge) return this.say('unheard');
    edge += weights.refused;
    if (roll < edge) return this.say('refused');
    edge += weights.cancelled;
    if (roll < edge) return this.sayCancelled(steer);
    edge += weights.during;
    if (roll < edge) return this.sayDuring(steer);
    edge += weights.minutes;
    if (roll < edge) return this.minutesTap();
    edge += weights.field;
    if (roll < edge) return this.field();
    return this.wait();
  }

  async atNext(steer: Steer, roll: number) {
    const next = steer === 'cells' ? 0.9 : crowds(steer) ? 0.55 : 0.65;
    if (roll < next) return this.nextTap();
    if (roll < next + 0.08) return this.again();
    if (roll < next + 0.14) return this.peekTap();
    if (roll < next + 0.24) return this.minutesTap();
    if (roll < next + 0.32) return this.field();
    return this.wait();
  }

  /** The `l`-th launch: minutes to a month after the last, in the same zone or another, unread now and then once a recall is on disk, then 4-9 commands. */
  async launchAt(l: number, steer: Steer) {
    const next = this.next;
    if (l > 0) {
      this.time.now += pickOf(next, [
        7 * MINUTE,
        11 * MINUTE,
        5 * HOUR,
        DAY,
        2 * DAY,
        3 * DAY,
        30 * DAY,
      ] as const);
      if (this.run.hold !== null) bump(this.coverage, 'relaunch:held');
    }
    this.zone = l === 0 || next() < 0.3 ? pickOf(next, ZONES) : this.zone;
    bump(this.coverage, `zone:${this.zone}`);
    this.unread =
      steer !== 'cells' &&
      (steer === 'edges' ? next() < 0.35 : next() < 0.1) &&
      [...this.device.disk.keys()].some((key) => key.startsWith(PREFIX));
    this.log.push(`launch ${l}`);
    await this.launchNow();
    const commands = (steer === 'cells' ? 10 : 4) + below(next, 6);
    for (let c = 0; c < commands && !this.cellsMet(steer) && !this.ended; c += 1)
      await this.command(steer);
    await this.screen.leave();
  }

  async atDone(roll: number) {
    if (roll < 0.4) {
      this.time.now += pickOf(this.next, [7 * MINUTE, 3 * HOUR, DAY] as const);
      return this.minutesTap();
    }
    if (roll < 0.6) return this.field();
    return this.wait();
  }
}

/** The recalls of one planted piece, in time order: 1-4 over 1-60 days back (1-2 over 20-60 days, all due, leaning to the hold or the cells). */
const plantRecords = (next: () => number, steer: Steer, piece: TextPiece) => {
  const crowded = allDue(steer);
  const recalls = crowded ? 1 + below(next, 2) : 1 + below(next, 4);
  const starts = Array.from(
    { length: recalls },
    () => T0 - ((crowded ? 20 : 1) + below(next, crowded ? 40 : 60)) * DAY - below(next, 20) * HOUR,
  ).toSorted((a, b) => a - b);
  return starts.map((startedAt) => recordOf(next, piece.reference, piece.words, startedAt));
};

/** A device's recall records: none for an empty disk (the first minute), else most pieces planted and, now and then, a plant no piece names; every piece planted, leaning to the cells. */
const recordsOf = (
  next: () => number,
  steer: Steer,
  pieces: readonly TextPiece[],
  coverage: Coverage,
) => {
  if (steer === 'cells') return pieces.flatMap((piece) => plantRecords(next, steer, piece));
  const empty = steer === 'edges' ? next() < 0.4 : next() < 0.1;
  if (empty) return [];
  const entries: (readonly [string, string])[] = [];
  for (const piece of pieces)
    if (next() < (crowds(steer) ? 0.8 : 0.7)) entries.push(...plantRecords(next, steer, piece));
  if (next() < 0.3) {
    entries.push(recordOf(next, 'Stray 9:9', 4, T0 - 3 * DAY));
    bump(coverage, 'disk:unnamed-plant');
  }
  if (entries.length === 0) entries.push(recordOf(next, 'Stray 9:9', 4, T0 - 2 * DAY));
  return entries;
};

/** One device: its pieces and disk, then 2-3 launches of 4-9 commands each. */
const deviceRun = async (next: () => number, steer: Steer, coverage: Coverage) => {
  const pieces = piecesOf(next, steer);
  const entries = recordsOf(next, steer, pieces, coverage);
  const stored = allDue(steer)
    ? pickOf(next, ['10', '20'] as const)
    : pickOf(next, [undefined, '2', '5', '10', '20'] as const);
  if (stored !== undefined) entries.push([MINUTES_KEY, stored]);
  const device = deviceOf(entries);
  const log: string[] = [];
  const walk = new Walk(next, device, pieces, coverage, log);
  walk.minutes = stored === undefined ? 5 : Number(stored);
  const before = hostZone();
  try {
    const launches = 2 + below(next, 2);
    for (let l = 0; l < launches; l += 1) await walk.launchAt(l, steer);
  } finally {
    if (walk.app !== null) await walk.app.leave();
    restore(before);
  }
  if (pieces.length >= 3) bump(coverage, 'pieces:many');
  if (pieces[0] !== PASSAGE) bump(coverage, 'pieces:no-passage-first');
  if (new Set(pieces.map((piece) => piece.group)).size >= 2) bump(coverage, 'pieces:groups');
};

/** `devices` generated devices from `seed`, leaning toward `steer`; the coverage reached. */
export const walkRun = async (steer: Steer, seed: number, devices: number) => {
  const next = random(seed);
  const coverage: Coverage = {};
  for (let d = 0; d < devices; d += 1) await deviceRun(next, steer, coverage);
  return coverage;
};

/** What each steer leans toward, as a walk case names it. */
const LEANS: Record<Steer, string> = {
  run: 'whole plans',
  hold: 'the hold',
  edges: 'the edges',
  end: 'the recital’s endings',
  cells: 'a Minutes trip after each ending, the held item moved or kept',
};

/** The floors of `floors` that `coverage` misses; `zones` asks for at least that many zones. */
const missing = (coverage: Coverage, floors: readonly string[], zones: number) => [
  ...floors.filter((key) => (coverage[key] ?? 0) === 0),
  ...(Object.keys(coverage).filter((key) => key.startsWith('zone:')).length < zones
    ? [`${zones} zones`]
    : []),
];

/**
 * One walk case: `devices` generated devices from `seed` leaning toward
 * `steer`, each of `floors` met by those devices alone. The environment's
 * `HSRUN_WALK_SEED` and `HSRUN_WALK_DEVICES` replace the two for a longer
 * or another walk.
 */
export const walkCase = (
  steer: Steer,
  seed: number,
  devices: number,
  floors: readonly string[],
  zones = 1,
) => {
  const at = Number(process.env['HSRUN_WALK_SEED'] ?? seed);
  const many = Number(process.env['HSRUN_WALK_DEVICES'] ?? devices);
  describe(`Today’s run on generated devices, leaning toward ${LEANS[steer]}`, () => {
    it(`shows, says and moves on as the model does on ${many} devices (seed ${at})`, async () => {
      const coverage = await walkRun(steer, at, many);
      console.log(
        `run ${steer} coverage ${Object.entries(coverage)
          .toSorted(([a], [b]) => a.localeCompare(b))
          .map(([key, value]) => `${key}=${value}`)
          .join(' ')}`,
      );
      expect(missing(coverage, floors, zones)).toEqual([]);
    });
  });
};
