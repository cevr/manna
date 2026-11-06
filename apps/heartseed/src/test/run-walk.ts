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
 * zones that change, minutes to a month apart, some launches unread, and
 * each launch runs commands chosen by the screen the model expects: at Say
 * it a heard recital (a word skipped or not), an unheard one, a refused
 * write, a Minutes tap while a recital listens, a Minutes tap, the field
 * and back, a wait; at Next, Next, Again, a peek, a Minutes tap, the field
 * and a wait; at the done state a wait, a Minutes tap and the field.
 *
 * The oracle is `src/test/run-model.ts` over `src/test/session-model.ts`'s
 * plan, made at Today's first show and at each Minutes tap: after every
 * step the reference shown, the action, the counts line, each word of the
 * verse as its cue draws it, shown and named (the new piece whole, a
 * review's first letters or empty slots by the ladder, a held recital's own
 * words while its result shows, never a stale mark on an item newly
 * shown), the result and alert (none while nothing is held), the done
 * state's scroll text, and the disk (the start's keys unchanged, plus each
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
import { below, keyOf, pickOf, PREFIX, random } from './garden-model';
import {
  actionModel,
  madeModel,
  nextModel,
  NO_RUN,
  shownModel,
  startedModel,
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
import { countsModel, DAY, HOUR, MINUTE, planModel } from './session-model';
import { hostZone, offsetIn, restore, travel, ZONES } from './zone';
import { MINUTES_KEY } from '../session/service';

/** Which commands a walk leans toward: the run through whole plans, the hold's moments, or the edges (the first minute, unread launches, the done state). */
export type Steer = 'run' | 'hold' | 'edges';

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

/** A word count: one word 6%, 60-90 words 12% (30% leaning to the hold, so a 2-minute plan leaves an item out), else 2-29. */
const wordsOf = (next: () => number, steer: Steer) => {
  const roll = next();
  if (roll < 0.06) return 1;
  if (roll < (steer === 'hold' ? 0.36 : 0.18)) return 60 + below(next, 31);
  return 2 + below(next, 28);
};

/** 1-8 pieces in 1-3 groups with unique references, some a trailing space or a digit apart, the passage first in some devices. */
const piecesOf = (next: () => number, steer: Steer): TextPiece[] => {
  const count =
    steer === 'edges'
      ? 1 + below(next, 8)
      : steer === 'hold'
        ? 5 + below(next, 4)
        : 3 + below(next, 6);
  const groups = steer === 'hold' ? 2 + below(next, 2) : 1 + below(next, 3);
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
 * The cue a piece with `recalls` is said under next, written plainly: the
 * full text before it is planted, first letters at a seed (its one recall,
 * or its latest graded Again: no such card reaches full corn's 21 days),
 * else nothing.
 */
const cueModel = (recalls: readonly Recall[]) => {
  if (recalls.length === 0) return 'full';
  const latest = recalls.toSorted((a, b) => a.startedAt - b.startedAt).at(-1);
  if (recalls.length === 1 || latest?.grade === 1) return 'initials';
  return 'none';
};

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
  const seen = seenText(node);
  if (node.getAttribute('role') === 'button')
    return label === `Missed word ${index + 1}` ? 'M' : 'X';
  if (label === `${word}, peeked`) return 'P';
  if (node.getAttribute('aria-hidden') === 'true') return label === null && seen === '' ? 'H' : 'X';
  if (label !== null) return label === letterOf(word) && seen === label ? 'I' : 'X';
  return text(node) === word ? 'F' : 'X';
};

/** The verse of `piece` as Today draws it, in `verseModel`'s codes: words all whole, marks or peeks read `R`, a recital's own. */
const verseSeen = (host: Element, piece: TextPiece) => {
  const whole = host.querySelector('[data-testid="passage"]');
  if (whole !== null) return (whole.textContent ?? '') === piece.text ? 'W' : 'X';
  const codes = sourceWords(piece.text).map((word, index) =>
    wordCode(host.querySelector(`[data-testid="word-${index}"]`), word, index),
  );
  if (codes.length > 0 && codes.every((code) => code === 'F' || code === 'M' || code === 'P'))
    return 'R';
  return codes.join('');
};

/** A walk's tally of the cases it reached. */
export type Coverage = Record<string, number>;

const bump = (coverage: Coverage, key: string) => {
  coverage[key] = (coverage[key] ?? 0) + 1;
};

/** What the screen shows of the run after a step, and what the model expects. */
interface Seen {
  readonly references: readonly string[];
  readonly actions: readonly string[];
  readonly counts: readonly string[];
  readonly verse: string;
  readonly grades: number;
  readonly alerts: number;
  readonly doneText: boolean;
}

/** The walk of one device: its pieces, its disk, the model's run, and the expected disk. */
class Walk {
  readonly faults: Faults = { unread: false, refuse: false };
  readonly time = { now: T0 };
  run: RunModel = NO_RUN;
  unread = false;
  minutes = 5;
  zone: string = 'UTC';
  /** The last recital's end shown while its item is held: its grades, its alert, or none. */
  result: 'grades' | 'alert' | null = null;
  app: Launch | null = null;
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

  /** What the model expects the screen to show at rest. */
  expect(): Seen {
    if (this.unread) return this.expectUnread();
    const shown = shownModel(this.run, this.recallsNow);
    const action = actionModel(this.run, this.recallsNow);
    const held = this.run.hold !== null;
    return {
      references: shown === null ? [] : [shown.reference.trim()],
      actions: action === null ? [] : [action],
      counts: this.run.plan === null ? [] : [countsModel(this.run.plan, this.recallsNow)],
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
    return {
      references: app.references(),
      actions: app.actions(),
      counts: app.counts(),
      verse: piece === undefined ? '' : verseSeen(app.host, piece),
      grades: app.grades().length,
      alerts: app.alerts(),
      doneText: shown !== undefined || app.scrollText() === 'Nothing to tend now',
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
    await this.screen.until(() => JSON.stringify(this.seen()) === JSON.stringify(this.expect()));
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
    this.run = NO_RUN;
    this.result = null;
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
    this.run = madeModel(this.run, this.planNow(), false);
    bump(this.coverage, 'launch:read');
    if (shownModel(this.run, this.recallsNow) === null) bump(this.coverage, 'done:first-show');
    await this.settle('launch');
  }

  async firstMinute() {
    const app = this.screen;
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
    this.run = madeModel(this.run, this.planNow(), false);
    bump(this.coverage, 'first-minute');
    if (shownModel(this.run, this.recallsNow) === null) bump(this.coverage, 'done:first-show');
    await this.settle('the first minute');
  }

  /** Say it, then Listening once it listens: the recognizer hears at the finish. */
  async recite() {
    const app = this.screen;
    await app.tap('Say it');
    if (!(await app.until(() => app.has('Listening')))) throw new Error('never listened');
    await app.tap('Listening');
    await app.until(() => !app.has('Listening'));
  }

  /** A recital of the shown item: heard (a word skipped or not), unheard, or heard with its write refused; with a Minutes tap while it listens when `minutes` is given. */
  async say(how: 'heard' | 'unheard' | 'refused', minutes?: number) {
    const app = this.screen;
    const shown = this.unread ? (this.pieces[0] ?? null) : shownModel(this.run, this.recallsNow);
    if (shown === null) return;
    const piece = this.pieceOf(shown.reference);
    const skip =
      how !== 'unheard' && this.next() < 0.4 && piece.words > 1
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
    await app.tap('Say it');
    if (!(await app.until(() => app.has('Listening')))) throw new Error('never listened');
    if (minutes !== undefined) await this.heldMinutes(minutes);
    await app.tap('Listening');
    const key = how === 'heard' ? this.expectRecall(piece, startedAt) : null;
    this.result = how === 'unheard' ? 'alert' : 'grades';
    bump(this.coverage, `say:${this.unread ? 'unread' : how}`);
    if (skip.length > 0) bump(this.coverage, 'say:skipped');
    this.tallyShown(piece, 'fresh' in shown && !this.unread ? shown.fresh : null);
    await this.settle(`say ${how}${minutes === undefined ? '' : ` with ${minutes} min`}`);
    this.faults.refuse = false;
    if (key !== null) this.checkRecall(key, piece, skip.length === 0 ? cue : null);
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

  /** A Minutes tap while the held item's recital listens: the plan made again, the hold kept. */
  async heldMinutes(minutes: number) {
    const before = this.run.hold;
    await this.tapMinutes(minutes, true);
    const plan = this.run.plan ?? [];
    bump(this.coverage, 'held:minutes');
    if (before === null) return;
    const at = plan.findIndex((item) => item.reference === before.reference);
    bump(
      this.coverage,
      at < 0 ? 'held:minutes:left-out' : at === 0 ? 'held:minutes:first' : 'held:minutes:later',
    );
    const first = shownModel({ ...this.run, hold: null }, this.recallsNow);
    if (first?.reference !== before.reference) bump(this.coverage, 'made:held-not-first');
  }

  /** Tallies the piece said: long or one word, and the new piece or a review. */
  tallyShown(piece: TextPiece, fresh: boolean | null) {
    if (piece.words >= 60) bump(this.coverage, 'shown:long');
    if (piece.words === 1) bump(this.coverage, 'shown:one-word');
    if (fresh !== null) bump(this.coverage, fresh ? 'shown:fresh' : 'shown:review');
  }

  async tapMinutes(minutes: number, underWay = false) {
    const before = this.run.hold;
    const wasDone = this.run.plan !== null && shownModel(this.run, this.recallsNow) === null;
    const app = this.screen;
    await app.tap(`${minutes} min`, 'radio');
    this.minutes = minutes;
    this.expected.set(MINUTES_KEY, String(minutes));
    if (!this.unread && this.run.plan !== null)
      this.run = madeModel(this.run, this.planNow(), underWay);
    const counts = this.expect().counts;
    const checked = () =>
      app.host
        .querySelector(`[role="radio"][aria-label="${minutes} min"]`)
        ?.getAttribute('aria-checked') === 'true';
    await app.until(() => checked() && JSON.stringify(app.counts()) === JSON.stringify(counts));
    await app.until(() => false, 5);
    if (this.unread) return;
    if (!underWay && before !== null) {
      bump(this.coverage, 'made:drops-hold');
      if (this.result === 'alert') bump(this.coverage, 'made:drops-hold:unheard');
      this.result = null;
    }
    const shown = shownModel(this.run, this.recallsNow);
    if (shown === null) bump(this.coverage, 'done:after-minutes');
    else if (wasDone) bump(this.coverage, 'minutes:appears');
  }

  async minutesTap() {
    await this.tapMinutes(pickOf(this.next, MINUTES));
    bump(this.coverage, 'minutes');
    await this.settle('minutes');
  }

  async nextTap() {
    const was = this.run.hold;
    await this.screen.tap('Next');
    this.run = nextModel(this.run);
    this.result = null;
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

  async field() {
    const app = this.screen;
    await app.tap('Your field');
    if (!(await app.until(() => app.headings().includes('Your field'))))
      throw new Error('no field');
    await app.tap('Today');
    bump(this.coverage, this.run.hold === null ? 'field:none' : 'field:held');
    if (this.run.hold === null && shownModel(this.run, this.recallsNow) === null)
      bump(this.coverage, 'done:field');
    await this.settle('the field and back');
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
      return this.minutesTap();
    }
    const action = actionModel(this.run, this.recallsNow);
    if (action === 'Say it') return this.atSayIt(steer, roll);
    if (action === 'Next') return this.atNext(steer, roll);
    return this.atDone(roll);
  }

  /** Leaning to the hold: a 2-minute tap while listening when that plan leaves the shown item out, and a tap after an unheard recital; none otherwise. */
  guided(roll: number) {
    const shown = shownModel(this.run, this.recallsNow);
    const minutes = this.minutes;
    this.minutes = 2;
    const short = this.planNow();
    this.minutes = minutes;
    if (shown !== null && !short.some((item) => item.reference === shown.reference)) {
      bump(this.coverage, 'guide:left-out');
      if (roll < 0.6) return this.say('heard', 2);
    }
    if (this.run.hold !== null && this.result === 'alert' && roll < 0.5) return this.minutesTap();
    return null;
  }

  async atSayIt(steer: Steer, roll: number) {
    const guided = steer === 'hold' ? this.guided(roll) : null;
    if (guided !== null) return guided;
    const hold = steer === 'hold';
    const heard = steer === 'run' ? 0.6 : hold ? 0.25 : 0.4;
    if (roll < heard) return this.say(this.next() < 0.85 ? 'heard' : 'refused');
    if (roll < heard + 0.1) return this.say('unheard');
    if (roll < heard + 0.15) return this.say('refused');
    if (roll < heard + (hold ? 0.45 : 0.25))
      return this.say('heard', this.next() < (hold ? 0.7 : 0.5) ? 2 : pickOf(this.next, MINUTES));
    if (roll < heard + (hold ? 0.55 : 0.3)) return this.minutesTap();
    if (roll < heard + (hold ? 0.65 : 0.35)) return this.field();
    return this.wait();
  }

  async atNext(steer: Steer, roll: number) {
    const next = steer === 'hold' ? 0.55 : 0.65;
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
      (steer === 'edges' ? next() < 0.35 : next() < 0.1) &&
      [...this.device.disk.keys()].some((key) => key.startsWith(PREFIX));
    this.log.push(`launch ${l}`);
    await this.launchNow();
    const commands = 4 + below(next, 6);
    for (let c = 0; c < commands; c += 1) await this.command(steer);
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

/** The recalls of one planted piece, in time order: 1-4 over 1-60 days back (1-2 over 20-60 days, all due, leaning to the hold). */
const plantRecords = (next: () => number, steer: Steer, piece: TextPiece) => {
  const crowded = steer === 'hold';
  const recalls = crowded ? 1 + below(next, 2) : 1 + below(next, 4);
  const starts = Array.from(
    { length: recalls },
    () => T0 - ((crowded ? 20 : 1) + below(next, crowded ? 40 : 60)) * DAY - below(next, 20) * HOUR,
  ).toSorted((a, b) => a - b);
  return starts.map((startedAt) => recordOf(next, piece.reference, piece.words, startedAt));
};

/** A device's recall records: none for an empty disk (the first minute), else most pieces planted and, now and then, a plant no piece names. */
const recordsOf = (
  next: () => number,
  steer: Steer,
  pieces: readonly TextPiece[],
  coverage: Coverage,
) => {
  const empty = steer === 'edges' ? next() < 0.4 : next() < 0.1;
  if (empty) return [];
  const entries: (readonly [string, string])[] = [];
  for (const piece of pieces)
    if (next() < (steer === 'hold' ? 0.9 : 0.7)) entries.push(...plantRecords(next, steer, piece));
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
  const stored =
    steer === 'hold'
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
  describe(`Today’s run on generated devices, leaning toward ${steer === 'run' ? 'whole plans' : steer === 'hold' ? 'the hold' : 'the edges'}`, () => {
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
