/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noTernary, effect/noAsyncFunction, effect/noTryCatch, effect/noThrowStatement, effect/noNewError, eslint/no-await-in-loop -- the foreground's model walk: it fails a step the model disagrees with by throwing to bun's runner, and it drives launches of the root in happy-dom through the wake rig's promise-based steps, one after another, over a disk, faults, a clock and a zone kept in plain values the steps change (the generator's choices as plain branches), the zone in `process.env.TZ`, put back in a `finally` even when a step throws. */

/**
 * Today's run against its model on generated devices, with the host's app
 * state in the walk's hands (`src/test/wake-rig.tsx`): returns to the
 * foreground and states that are no return land among hsrun's commands.
 *
 * A device holds 1 to 8 pieces of made-up words in 1 to 3 groups (one-word
 * pieces, pieces of 60 to 90 words, the passage first or absent), a disk of
 * their plants (due or not, a plant no piece names, a verse planted at
 * 21:00 the evening before, one planted an hour before the first launch) or
 * an empty one (the first minute, with states sent in each of its phases),
 * and its stored minutes. It is launched 2 or 3 times, in zones that
 * change, minutes to a month apart, some launches unread, some starting in
 * the background (sent `active` on the screen the launch lands on). A read
 * launch and the first minute's Continue land on home, whose first show
 * makes the plan: with an item shown, home shows the model's counts line
 * and `Start`, which the walk takes to Today; with none (and after the
 * field in the done state), home shows the done state's counts line and no
 * `Start`, and stays the screen, with commands of its own: an away (states
 * sent while home shows, a return making the plan again, and `Start` taken
 * once it shows an item), a wait, and the launch's end. On Today each
 * launch runs commands chosen by the screen the
 * model expects: an away (a wait of a minute to a month, then a return or
 * a sequence that is none: `inactive` alone, a second `active`), a recital
 * heard, unheard, refused or cancelled, a recital then a Minutes trip with
 * its item held, a return or a sequence that is none while it listens or,
 * its end held back, while it finishes, Next, Again, a Minutes trip, the
 * field with states sent on it, and a wait. A Minutes trip is the
 * reader's: `Your field`, home's `Settings`, now and then states sent with
 * the sheet open (a return makes the plan again under it, and the sheet
 * stays), the `<n> min` radio, `Done`, then `Start` and Today, or home's
 * done state. No Minutes is chosen while a recital listens or finishes: no
 * reader reaches one (Today shows no `Your field` then), and
 * `test:session-cells` makes that making at the session seam. Leaning
 * toward Listen, the voice's old switch is stored on or off or not at all
 * (read as Her or Off), and the walk taps Listen where it shows (the speak
 * refused now and then) and takes a Voice trip, the same way to the sheet,
 * whose `Voice` cycles Off, Her, Him; while a reading is under way it ends
 * it (finished or interrupted), presses Say it, takes a Voice trip (Off
 * stops the reading, Her to Him lets it go on through the trip), goes
 * away, takes a Minutes trip (the reading goes on), opens the field or
 * waits. An unread launch offers no choices: in place of a trip, no
 * `Settings`, `Voice`, `<n> min` radio or Minutes group shows.
 *
 * The oracle is `src/test/wake-model.ts` (which states are returns, the run
 * after one) over `src/test/run-model.ts`'s run and
 * `src/test/session-model.ts`'s plan, made at home's first show, at each
 * return and at each `<n> min` tap in the sheet: on home its heading,
 * counts line and `Start`, before and after each trip, and the counts line
 * under the open sheet after each tap and each state sent there; in the
 * sheet the radio checked and the `Voice` value the model's choice after
 * each tap; and on Today after every step the heading, the reference
 * shown, the action, the counts line, the result and alert (none while
 * nothing is held), the end of a run (`The field is tended` once every item
 * of a run that is not empty is done and none is held: no counts line, the
 * line of what grew and each grown verse's name by `tendedModel`, tallied
 * `end:none`, `end:one` or `end:many`, and a return there `wake:at:end`,
 * after which the new plan's first item shows, or bare `Today` over an
 * empty one), the done state's scroll text read exactly (the counts line,
 * or the end's line, alone), whether Listen shows
 * (`listenModel`), and the disk (the start's keys unchanged, plus each
 * recall key a `Next` kept, a finished recital's recall pending and
 * counted as kept until then and let go unwritten by a return, `Your
 * field` or a launch's end, the minutes key after a Minutes trip and the voice's key
 * after each Voice tap; a state sent and a Listen write nothing); every text the
 * voice's source was given, and whether it reads, against the walk's own;
 * every frame holds the root's frame rule (`rootFaults`), every Today
 * frame Listen's place (`listenFaults`), and every frame of a trip the
 * sheet's (`watchSheet`). Every tap fails when its control is absent. A
 * no-op is tallied toward its `:differs` floor only where a making would
 * show another screen.
 */

import { describe, expect, it } from 'bun:test';
import { MutableRef } from 'effect';
import passage from 'virtual:heartseed-passage';

import { sourceWords } from '../matcher/words';
import type { Recall } from '../sayit';
import type { TextPiece } from '../session';
import { MINUTES_KEY } from '../session/service';
import { CHOICE_KEY, ENABLED_KEY, nextChoice, type Choice } from '../voice';
import { below, keyOf, pickOf, PREFIX, random } from './garden-model';
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
import { deviceOf, PASSAGE, type Device, type Faults } from './run-rig';
import { cardLineModel } from './home-model';
import { END, homeLines, rootFaults } from './root-rule';
import { countsModel, DAY, HOUR, MINUTE, planModel } from './session-model';
import { choicesOf } from './session-rig';
import { closeSettings, modalOf, openSettings, tapInSheet, watchSheet } from './settings-rig';
import { listenModel, returnsModel, wakeModel } from './wake-model';
import {
  readingVoice,
  wakeLaunch,
  type HostState,
  type ReadingVoice,
  type WakeLaunch,
} from './wake-rig';
import { hostZone, offsetIn, restore, travel } from './zone';

/** Which commands a walk leans toward: returns at every run state, the no-ops (recitals under way, unread launches, the first minute, states that are no return), or the clocks (long aways, zones, evening plantings, many returns). */
export type Steer = 'returns' | 'quiet' | 'clocks' | 'listen';

const T0 = Date.UTC(2026, 4, 4, 13);

/** Zones every side of UTC, Lord Howe's half-hour daylight saving among them. */
const ZONES = [
  'America/Los_Angeles',
  'Asia/Kathmandu',
  'Australia/Lord_Howe',
  'UTC',
  'Asia/Tokyo',
  'America/St_Johns',
  'Pacific/Kiritimati',
] as const;

const VOCABULARY = ['amber', 'brook', 'cedar', 'dawn', 'ember', 'fern', 'grove', 'heron'] as const;

const MINUTES = [2, 5, 10, 20] as const;

/** A piece of `words` made-up words under `reference` in `group`. */
const pieceOf = (next: () => number, reference: string, group: string, words: number) => {
  const text = Array.from({ length: words }, () => pickOf(next, VOCABULARY)).join(' ');
  return { reference, text, words: sourceWords(text).length, group };
};

/** `count` pieces in 1-3 groups, each of `wordsOf()` words, the passage first in some devices. */
const piecesBy = (next: () => number, count: number, wordsOf: () => number): TextPiece[] => {
  const groups = 1 + below(next, 3);
  const pieces: TextPiece[] = [];
  if (next() < 0.35) pieces.push(PASSAGE);
  while (pieces.length < count)
    pieces.push(
      pieceOf(next, `Alder ${1 + pieces.length}:1`, `G${below(next, groups)}`, wordsOf()),
    );
  return pieces;
};

/** 1-8 pieces in 1-3 groups (one piece alone a fifth of the time), one-word 8%, 60-90 words 12%, the passage first in some devices. */
const piecesOf = (next: () => number): TextPiece[] => {
  const count = next() < 0.2 ? 1 : 2 + below(next, 7);
  return piecesBy(next, count, () => {
    const roll = next();
    return roll < 0.08 ? 1 : roll < 0.2 ? 60 + below(next, 31) : 2 + below(next, 20);
  });
};

/** A crowded device: 6-8 pieces of 40-90 words, more than a short plan holds once all are due, so the minutes chosen decide which are taken. */
const crowdedOf = (next: () => number): TextPiece[] =>
  piecesBy(next, 6 + below(next, 3), () => 40 + below(next, 51));

/** A recall of `reference` at `startedAt`, as the garden writes it, under `offset`. */
const recordOf = (
  next: () => number,
  reference: string,
  words: number,
  startedAt: number,
  offset: number | undefined,
): readonly [string, string] => {
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

/** The instant of `hour`:00 on the wall clock of `zone`, on the local date `days` before `at`'s. */
export const wallAt = (zone: string, at: number, days: number, hour: number) => {
  const local = at + offsetIn(zone, at) * MINUTE;
  const midnight = local - (((local % DAY) + DAY) % DAY) - days * DAY;
  const guess = midnight + hour * HOUR;
  return guess - offsetIn(zone, guess - offsetIn(zone, guess) * MINUTE) * MINUTE;
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

/** A walk's tally of the cases it reached. */
export type Coverage = Record<string, number>;

const bump = (coverage: Coverage, key: string) => {
  coverage[key] = (coverage[key] ?? 0) + 1;
};

/** A sequence of states with exactly one return: away (a `background` at least, `inactive` around it), then `active`. */
const returnOf = (next: () => number): HostState[] => {
  const away: HostState[] = [];
  if (next() < 0.5) away.push('inactive');
  away.push('background');
  if (next() < 0.3) away.push('background');
  if (next() < 0.35) away.push('inactive');
  return [...away, 'active'];
};

/** A sequence of states that holds no return: `inactive` once or more then `active`, a second `active`, or `inactive` repeated then `active`. */
const quietOf = (next: () => number): HostState[] => {
  const roll = next();
  if (roll < 0.35) return ['inactive', 'active'];
  if (roll < 0.6) return ['active'];
  return [...Array.from({ length: 2 + below(next, 3) }, () => 'inactive' as const), 'active'];
};

/** A random sequence of 1-6 states over all three, ending `active`. */
const anyOf = (next: () => number): HostState[] => [
  ...Array.from({ length: below(next, 6) }, () =>
    pickOf(next, ['active', 'inactive', 'background'] as const),
  ),
  'active',
];

/** The gaps an away waits, by steer. */
const GAPS: Record<Steer, readonly [number, ...number[]]> = {
  returns: [MINUTE, 7 * MINUTE, 2 * HOUR, DAY],
  quiet: [MINUTE, 7 * MINUTE, 3 * HOUR, DAY],
  clocks: [MINUTE, 3 * HOUR, 9 * HOUR, DAY, 2 * DAY, 30 * DAY],
  listen: [MINUTE, 7 * MINUTE, DAY, DAY],
};

const gapName = (gap: number) =>
  gap < HOUR
    ? 'minutes'
    : gap < DAY
      ? 'hours'
      : gap < 2 * DAY
        ? 'day'
        : gap < 30 * DAY
          ? 'days'
          : 'month';

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
  readonly grades: number;
  readonly alerts: number;
  readonly doneText: boolean;
  readonly listen: boolean;
}

/** How a recital ends: heard and kept, unheard, heard with its write refused, or cancelled while it listens. */
type How = 'heard' | 'unheard' | 'refused' | 'cancelled';

/** What comes during a recital: a return, or a sequence that is no return; while it listens or while it finishes. */
interface During {
  readonly what: 'return' | 'quiet';
  readonly at: 'listening' | 'finishing';
}

/** The Today card's lines home shows, as `homeLines` reads them. */
const homeCounts = (app: WakeLaunch) => homeLines(app.host);

/** The walk of one device: its pieces, its disk, the model's run, and the expected disk. */
class Walk {
  readonly faults: Faults = { unread: false, refuse: false };
  readonly time = { now: T0 };
  run: RunModel = NO_RUN;
  unread = false;
  minutes = 5;
  zone: string = 'UTC';
  /** The last host state the launch reported. */
  last: HostState = 'active';
  /** The held item's last recital's end shown: its grades, its alert, or none. */
  result: 'grades' | 'alert' | null = null;
  /** How the held item's last recital ended, until a making or Next lets the hold go. */
  ending: How | null = null;
  /** The last commands, newest last, for the floors a pattern of them reaches. */
  trail: string[] = [];
  returnsThisLaunch = 0;
  /** The voice's choice, Off, Her or Him. */
  choice: Choice = 'her';

  /** Whether the voice reads: any choice but Off. */
  get voiceOn() {
    return this.choice !== 'off';
  }
  /** The text Listen's reading under way reads, none when none reads. */
  reading: string | null = null;
  /** Every text the voice was given to speak, in order, over the walk's launches of this device. */
  readonly spoken: string[] = [];
  voice: ReadingVoice | null = null;
  app: WakeLaunch | null = null;
  /** Whether home shows in the done state, the screen the next command acts on. */
  home = false;
  /** Whether the launch under way ended on home. */
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
    readonly aside: () => number,
    readonly steer: Steer,
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

  /** The recall a finished recital of the held item leaves pending until `Next` keeps it (its write refused when `refused`), or a leave or a return's making lets it go; Today counts it as kept meanwhile. */
  pending: {
    readonly piece: TextPiece;
    readonly startedAt: number;
    readonly refused: boolean;
  } | null = null;

  recallsNow = (reference: string) =>
    (plantsOf(this.device).get(reference)?.length ?? 0) +
    (this.pending !== null && this.pending.piece.reference === reference ? 1 : 0);

  /** Today left by `Your field`: the hold, its result and the recall pending let go, nothing written. */
  leaveToday() {
    this.run = nextModel(this.run);
    this.pending = null;
    this.result = null;
    this.ending = null;
  }

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

  /** The end's want over `run` while its model is done: the run's grown verses by `tendedModel` over its items' baselines and the disk's recalls, computed once per run and disk, so a poll reads it again for free; null off the end. */
  tendedOf(run: RunModel) {
    if (this.unread || run.plan === null || shownModel(run, this.recallsNow) !== null) return null;
    const size = this.device.disk.size;
    const cached = this.endWant;
    if (cached !== null && cached.run === run && cached.size === size) return cached.tended;
    const tended = tendedModel(run, [], [...plantsOf(this.device).values()].flat());
    this.endWant = { run, size, tended };
    return tended;
  }

  /** Today's counts line over `run`: the plan's by `countsModel`, none before a plan or in an unread launch. */
  todayWant(run: RunModel) {
    return this.unread || run.plan === null ? [] : [countsModel(run.plan, this.recallsNow)];
  }

  /** The Today card's line home shows over `run`: the plan's by `cardLineModel`, the end's run among them, none before a plan or in an unread launch. */
  homeWant(run: RunModel) {
    return this.unread || run.plan === null
      ? []
      : [cardLineModel(run.plan, this.recallsNow, shownModel(run, this.recallsNow))];
  }

  /** What the model expects the screen to show at rest, over `run`. */
  expectOf(run: RunModel): Seen {
    const listen = listenModel(run, this.recallsNow, {
      unread: this.unread,
      voiceOn: this.voiceOn,
      reading: this.reading !== null,
      underWay: false,
    });
    if (this.unread) {
      const first = this.pieces[0];
      return {
        headings: ['Today'],
        grew: [],
        grown: [],
        references: first === undefined ? [] : [first.reference],
        actions: first === undefined ? [] : ['Say it'],
        counts: [],
        grades: this.result === 'grades' ? 1 : 0,
        alerts: this.result === 'alert' ? 1 : 0,
        doneText: true,
        listen,
      };
    }
    const shown = shownModel(run, this.recallsNow);
    const action = actionModel(run, this.recallsNow);
    const held = run.hold !== null;
    const tended = this.tendedOf(run);
    return {
      headings: [tended === null ? 'Today' : END],
      grew: tended === null ? [] : [grewLine(tended.length)],
      grown: tended === null ? [] : tended.map((each) => `${each.reference}, ${each.stage}`),
      references: shown === null ? [] : [shown.reference],
      actions: action === null ? [] : [action],
      counts: tended !== null ? [] : this.todayWant(run),
      grades: held && this.result === 'grades' ? 1 : 0,
      alerts: held && this.result === 'alert' ? 1 : 0,
      doneText: true,
      listen,
    };
  }

  seen(): Seen {
    const app = this.screen;
    const shown = this.unread ? this.pieces[0] : shownModel(this.run, this.recallsNow);
    const counts = app.counts();
    const grew = app.grew();
    return {
      headings: app.headings(),
      grew,
      grown: app.grown(),
      references: app.references(),
      actions: app.actions(),
      counts,
      grades: app.grades().length,
      alerts: app.alerts(),
      doneText:
        shown !== undefined && shown !== null
          ? true
          : app.scrollText() === [...counts, ...grew].join(' '),
      listen: app.has('Listen'),
    };
  }

  /** What the voice's source shows wrong: a text spoken the model did not expect (counted, never printed), or a reading under way the model does not hold, or the reverse. */
  voiceFaults() {
    const voice = this.voice;
    if (voice === null) return [];
    const out: string[] = [];
    const same =
      voice.spoken.length === this.spoken.length &&
      voice.spoken.every((each, index) => each === this.spoken[index]);
    if (!same)
      out.push(`the voice spoke ${voice.spoken.length} texts, expected ${this.spoken.length}`);
    if (voice.reading() !== (this.reading !== null))
      out.push(`the voice ${voice.reading() ? 'reads' : 'reads nothing'}`);
    return out;
  }

  /** Tallies where Listen stood at a settle, by the screen the model expects. */
  tallyListen(want: Seen) {
    if (want.listen) bump(this.coverage, 'listen:offered');
    const shown = this.unread ? null : shownModel(this.run, this.recallsNow);
    const state = this.stateName();
    if (state === 'unread' && this.voiceOn) bump(this.coverage, 'listen:unread');
    if (state === 'done' && this.voiceOn) bump(this.coverage, 'listen:done');
    if (shown === null) return;
    if (!shown.fresh && this.voiceOn && state !== 'next')
      bump(this.coverage, 'listen:review-voice-on');
    if (!shown.fresh) return;
    if (state === 'next' && this.voiceOn) bump(this.coverage, 'listen:next-fresh');
    if (state === 'next') return;
    if (!this.voiceOn) bump(this.coverage, 'listen:fresh-voice-off');
    else if (this.reading !== null) bump(this.coverage, 'listen:fresh-reading');
    else if (this.ending === 'unheard' || this.ending === 'refused')
      bump(this.coverage, `listen:after-${this.ending}`);
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

  fail(what: string): never {
    throw new Error(`after ${this.log.join(' > ')}: ${what}`);
  }

  /** Taps `label` on the screen; fails `no <label> to tap after …` when it shows no such control, so no step passes on a tap that did nothing. */
  async press(label: string, role = 'button') {
    if (!(await this.screen.tap(label, role)))
      throw new Error(`no ${label} to tap after ${this.log.join(' > ')}`);
  }

  /** Waits for the screen the model expects, then holds it to the model and the disk. */
  async settle(step: string) {
    this.log.push(step);
    const expected = this.expectOf(this.run);
    const want = JSON.stringify(expected);
    await this.screen.until(
      () => JSON.stringify(this.seen()) === want && this.diskFaults().length === 0,
    );
    const seen = JSON.stringify(this.seen());
    if (seen !== want) this.fail(`saw ${seen}, expected ${want}`);
    const disk = this.diskFaults();
    if (disk.length > 0) this.fail(`disk ${disk.join(', ')}`);
    if (this.screen.faults.length > 0) this.fail(`frames ${this.screen.faults.join('; ')}`);
    const voice = this.voiceFaults();
    if (voice.length > 0) this.fail(voice.join(', '));
    this.tallyListen(expected);
    const tended = this.tendedOf(this.run);
    if (tended !== null) bump(this.coverage, END_FLOORS[Math.min(tended.length, 2)] ?? 'end:many');
  }

  /** Where the run stands, as a floor names it. */
  stateName() {
    if (this.unread) return 'unread';
    const shown = shownModel(this.run, this.recallsNow);
    if (shown === null) return 'done';
    if (actionModel(this.run, this.recallsNow) === 'Next') return 'next';
    if (this.ending === 'unheard' || this.ending === 'refused' || this.ending === 'cancelled')
      return this.ending;
    return shown.fresh ? 'fresh' : 'review';
  }

  /**
   * Hands the host `states`, then the run the model gives: each return makes
   * the plan again (`wakeModel`), unless a recital is under way, the garden
   * is unread or no plan is made yet; the hold dropped takes its result with
   * it. Tallies what the states met, and whether a making (or a wrongly
   * made one) shows another screen.
   */
  async states(states: readonly HostState[], underWay: boolean) {
    const returns = returnsModel(this.last, states).filter(Boolean).length;
    this.last = states[states.length - 1] ?? this.last;
    const before = this.run;
    const at = this.stateName();
    await this.screen.send(states);
    this.log.push(`states ${states.join(',')}`);
    const made = madeModel(before, this.planNow(), false);
    const wouldDiffer =
      before.plan !== null &&
      !this.unread &&
      JSON.stringify(this.expectOf(made)) !== JSON.stringify(this.expectOf(before));
    const planDiffers =
      before.plan !== null &&
      JSON.stringify(made.plan?.map((item) => item.reference)) !==
        JSON.stringify(before.plan.map((item) => item.reference));
    if (returns === 0) {
      bump(this.coverage, 'wake:not-a-return');
      if (wouldDiffer || (underWay && before.hold !== null))
        bump(this.coverage, 'wake:not-a-return:differs');
      return returns;
    }
    this.returnsThisLaunch += returns;
    if (this.returnsThisLaunch >= 3) bump(this.coverage, 'wake:many');
    for (let each = 0; each < returns; each += 1)
      this.run = wakeModel(this.run, () => this.planNow(), { unread: this.unread, underWay });
    if (this.run.hold === null) this.pending = null;
    if (this.unread) {
      bump(this.coverage, 'wake:unread');
      if (this.result !== null) bump(this.coverage, 'wake:unread:result');
      return returns;
    }
    if (before.plan === null) return returns;
    if (underWay) {
      bump(this.coverage, 'wake:under-way');
      if (planDiffers) bump(this.coverage, 'wake:under-way:differs');
      return returns;
    }
    this.made(before, at, wouldDiffer);
    if (this.minutes !== 5 && this.differsAtFive()) bump(this.coverage, 'wake:minutes:differs');
    return returns;
  }

  /** Whether the run a making at 5 minutes would leave shows another screen than the minutes chosen. */
  differsAtFive() {
    const chosen = this.minutes;
    this.minutes = 5;
    const five = madeModel(this.run, this.planNow(), false);
    this.minutes = chosen;
    return JSON.stringify(this.expectOf(five)) !== JSON.stringify(this.expectOf(this.run));
  }

  /** A return's making with nothing under way: the hold dropped takes its result, and the floors it reached. */
  made(before: RunModel, at: string, differs: boolean) {
    bump(this.coverage, 'wake:made');
    bump(this.coverage, `wake:at:${at}`);
    bump(this.coverage, `wake:minutes:${this.minutes}`);
    if (differs) bump(this.coverage, 'wake:made:differs');
    if (before.hold !== null) {
      bump(this.coverage, 'wake:drops-hold');
      this.result = null;
      this.ending = null;
    }
    const wasDone = shownModel(before, this.recallsNow) === null;
    if (wasDone && shownModel(this.run, this.recallsNow) !== null)
      bump(this.coverage, 'wake:done-to-item');
    if (this.trail.at(-1) !== 'minutes') return;
    bump(this.coverage, 'wake:after-minutes');
    if (this.trail.at(-2) === 'return') bump(this.coverage, 'wake:return-minutes-return');
  }

  /** An away: a wait, then a return or a sequence that is none, and the screen the model gives. */
  async away() {
    if (this.steer !== 'quiet' && this.next() < 0.3) {
      await this.minutesTap();
      if (this.home) return this.homeAway();
    }
    const gap = pickOf(this.next, GAPS[this.steer]);
    this.time.now += gap;
    const roll = this.next();
    const share = this.steer === 'quiet' ? 0.55 : 0.82;
    const states =
      roll < share
        ? returnOf(this.next)
        : roll < share + 0.1
          ? anyOf(this.next)
          : quietOf(this.next);
    const returns = returnsModel(this.last, states).some(Boolean);
    if (returns) bump(this.coverage, `wake:gap:${gapName(gap)}`);
    if (returns && this.reading !== null) bump(this.coverage, 'listen:return-reading');
    const atEnd = this.tendedOf(this.run) !== null;
    await this.states(states, false);
    await this.settle(`away ${gapName(gap)}`);
    if (atEnd && returns) {
      bump(this.coverage, 'wake:at:end');
      if (shownModel(this.run, this.recallsNow) !== null) bump(this.coverage, 'wake:end-to-item');
    }
    this.trail.push(returns ? 'return' : 'quiet');
  }

  /** A recall the reader's press keeps under `piece`. */
  expectRecall(piece: TextPiece, startedAt: number) {
    this.expected.set(keyOf({ reference: piece.reference, startedAt }), null);
  }

  /** Ends a recital that listens: cancelled, or by `Listening`, its end held back while `during` comes as it finishes. */
  async endRecital(how: How, during?: During) {
    const app = this.screen;
    if (how === 'cancelled') return app.cancel();
    if (during?.at !== 'finishing') return this.press('Listening');
    app.deferEnd();
    await this.press('Listening');
    if (!(await app.until(() => app.status() === 'finishing'))) this.fail('never finishing');
    await this.during(during);
    if (app.status() !== 'finishing') this.fail('finished before its end was sent');
    await app.release();
  }

  /** What a recital ended `how` leaves: in an unread garden its recall kept at once; on a held item its recall pending until `Next`; the result shown and the ending Listen reads. */
  recitalEnded(how: How, piece: TextPiece, startedAt: number) {
    const finished = how === 'heard' || how === 'refused';
    if (finished && this.unread) this.expectRecall(piece, startedAt);
    if (finished && !this.unread && this.run.hold !== null)
      this.pending = { piece, startedAt, refused: how === 'refused' };
    this.result = how === 'unheard' ? 'alert' : how === 'cancelled' ? null : 'grades';
    this.ending = this.unread || finished ? null : how;
  }

  /** A recital of the shown item, ended `how`, with `during` coming while it listens or finishes. */
  async say(how: How, during?: During) {
    const app = this.screen;
    const shown = this.unread ? (this.pieces[0] ?? null) : shownModel(this.run, this.recallsNow);
    if (shown === null) return;
    const piece = this.pieceOf(shown.reference);
    MutableRef.set(
      app.hearing,
      how === 'unheard' ? { kind: 'unheard' } : { kind: 'heard', text: piece.text, skip: [] },
    );
    const startedAt = this.time.now;
    if (!this.unread) this.run = startedModel(this.run, this.recallsNow);
    const stopped = this.stopCheck();
    await this.press('Say it');
    if (!(await app.until(() => app.has('Listening')))) this.fail('never listened');
    stopped();
    if (during?.at === 'listening') await this.during(during);
    await this.endRecital(how, during);
    this.recitalEnded(how, piece, startedAt);
    bump(this.coverage, `say:${this.unread ? 'unread' : how}`);
    await this.settle(
      `say ${how}${during === undefined ? '' : ` with ${during.what} while ${during.at}`}`,
    );
    this.trail.push('say');
  }

  /** The voice's stops so far. */
  stops() {
    return this.voice?.calls.filter((each) => each.call === 'stop') ?? [];
  }

  /** R9c, read before a press of Say it and held after it: while Listen's reading is under way, the press stopped the voice once, before the recognizer listened. */
  stopCheck() {
    const listens = this.screen.listens.n;
    const stops = this.stops().length;
    return () => {
      if (this.reading === null) return;
      const calls = this.stops();
      const stop = calls[stops];
      if (calls.length !== stops + 1 || stop === undefined)
        this.fail('Say it never stopped the voice');
      if (stop.listens !== listens) this.fail('the recognizer listened before the voice stopped');
      if (this.screen.listens.n !== listens + 1) this.fail('Say it never listened');
      this.reading = null;
      bump(this.coverage, 'listen:say-stops');
    };
  }

  /** A tap on Listen: the voice speaks the shown piece's own text once, which reads until its end, or the speak is refused. */
  async listenTap() {
    const voice = this.voice;
    const shown = shownModel(this.run, this.recallsNow);
    if (voice === null || shown === null) return;
    const piece = this.pieceOf(shown.reference);
    const refused = this.next() < 0.2;
    voice.state.refuse = refused;
    await this.press('Listen');
    voice.state.refuse = false;
    this.spoken.push(piece.text);
    this.reading = refused ? null : piece.text;
    bump(this.coverage, refused ? 'listen:refused' : 'listen:read');
    if (this.pieces.includes(PASSAGE) && piece !== PASSAGE)
      bump(this.coverage, 'listen:not-passage');
    await this.settle(refused ? 'Listen refused' : 'Listen');
    this.trail.push('listen');
  }

  /** The reading under way ends at its own end: finished or interrupted. */
  async endReading(kind: 'finish' | 'interrupt') {
    await this.voice?.end(kind);
    this.reading = null;
    bump(this.coverage, `listen:end:${kind}`);
    await this.settle(`the reading's ${kind}`);
    this.trail.push('end');
  }

  /** One tap on Voice: the next choice of the cycle Off, Her, Him, stored under the choice's key; landing on Off stops a reading under way, and Her to Him lets it go on. */
  async cycleTap() {
    if (!(await tapInSheet('Voice'))) throw new Error('no Voice in the sheet');
    const was = this.choice;
    this.choice = nextChoice(was);
    this.expected.set(CHOICE_KEY, this.choice);
    bump(this.coverage, 'voice:tap');
    if (this.reading !== null) {
      if (!this.voiceOn) this.reading = null;
      if (!this.voiceOn) bump(this.coverage, 'listen:voice-off-reading');
      if (was !== 'off' && this.voiceOn) bump(this.coverage, 'listen:her-him-reading');
    }
    if (was === 'off' && this.stateName() === 'fresh') bump(this.coverage, 'listen:voice-on-fresh');
    const want = `Voice:${this.choice[0]?.toUpperCase()}${this.choice.slice(1)}`;
    const seen = () => JSON.stringify(choicesOf(modalOf() ?? document.body).voices);
    if (
      !(await this.screen.until(
        () =>
          seen() === JSON.stringify([want]) &&
          this.diskFaults().length === 0 &&
          this.voiceFaults().length === 0,
      ))
    )
      throw new Error(
        `Voice ${this.choice}: the sheet showed ${seen()}, disk ${this.diskFaults().join(', ')}, ${this.voiceFaults().join(', ')}`,
      );
  }

  /** Home with its gear, reached from Today by `Your field` and held to the model as it stands. */
  async toHome(step: string) {
    const app = this.screen;
    await this.press('Your field');
    this.leaveToday();
    if (
      !(await app.until(
        () =>
          app.headings().join('|') === 'Your field' &&
          homeCounts(app).length > 0 &&
          app.has('Settings'),
      ))
    )
      this.fail(`${step}: no home with Settings, saw ${app.headings().join('|') || 'pending'}`);
    this.onHome(shownModel(this.run, this.recallsNow) !== null);
  }

  /** `act` inside the open sheet, every frame held by `watchSheet`, then `Done`; fails on a thrown step, a sheet fault or a sheet whose look was never checked. */
  async inSheet(step: string, act: () => Promise<void>) {
    const app = this.screen;
    const watch = watchSheet();
    try {
      await openSettings(app);
      await act();
      if (!(await closeSettings(app, 'Done'))) throw new Error('the sheet stayed after Done');
    } catch (error) {
      watch.stop();
      this.fail(`${step}: ${String(error)}`);
    }
    watch.stop();
    if (watch.faults.length > 0 || watch.frames.looked === 0)
      this.fail(
        `${step}: sheet ${watch.faults.join('; ') || 'faultless'}, its look checked on ${watch.frames.looked} frames`,
      );
  }

  /** After a trip's `Done`: home held to the model, then `Start` and Today when the model shows an item, else home's done state; answers whether Today shows. */
  async back(step: string) {
    const begin = shownModel(this.run, this.recallsNow) !== null;
    this.log.push(`${step}, Done`);
    this.onHome(begin);
    if (!begin) {
      await this.homeDone(step);
      return false;
    }
    if (!(await this.screen.tap('Start'))) this.fail('no Start');
    return true;
  }

  /** In an unread launch, in place of a trip: no Settings, no Voice, no `<n> min` radio and no Minutes group show (sq4 a). */
  async noChoices(floor: string) {
    const app = this.screen;
    if (
      app.has('Settings') ||
      app.has('Voice') ||
      MINUTES.some((each) => app.has(`${each} min`, 'radio')) ||
      app.host.querySelector('[role="radiogroup"][aria-label="Minutes"]') !== null
    )
      this.fail('a Minutes, Voice or Settings on an unread garden');
    bump(this.coverage, floor);
    await this.settle('no choices, unread');
  }

  /**
   * Voice turned on or off in the Settings sheet, reached from Today by
   * `Your field` and home's gear: from Off one tap to Her, and now and then
   * a second to Him; from Her or Him the taps through to Off (Her by Him,
   * the reading under way going on through it); then `Done`, and `Start`
   * and Today, or home's done state. Whether a second tap goes on to Him is
   * drawn from `aside`, so the walk's own draws run as they do with the
   * voice turned on and off alone. An unread launch offers no choices.
   */
  async voiceTap() {
    if (this.unread) return this.noChoices('voice:none-unread');
    await this.toHome('Voice');
    await this.inSheet('Voice', async () => {
      if (this.choice === 'off') {
        await this.cycleTap();
        if (this.aside() < 0.25) await this.cycleTap();
      } else {
        do await this.cycleTap();
        while (this.voiceOn);
      }
    });
    bump(this.coverage, 'settings:voice');
    this.trail.push('voice');
    if (await this.back(`Voice ${this.choice}`)) await this.settle(`Voice ${this.choice}`);
  }

  /** While a reading is under way: its end, Say it, a Voice trip, an away, a Minutes trip, the field or a wait. */
  async whileReading() {
    const roll = this.next();
    if (roll < 0.34) return this.endReading(roll < 0.18 ? 'finish' : 'interrupt');
    if (roll < 0.52 && actionModel(this.run, this.recallsNow) === 'Say it')
      return this.say(this.next() < 0.5 ? 'heard' : 'unheard');
    if (roll < 0.66) return this.voiceTap();
    if (roll < 0.78) return this.away();
    if (roll < 0.88) return this.minutesTap();
    if (roll < 0.97) return this.field();
    return this.wait();
  }

  /** The Listen walk's own commands, before hsrun's: while a reading is under way most often one of `whileReading`, now and then a Voice tap, and Listen half the time it shows; none (hsrun's commands) otherwise. */
  listenCommand() {
    if (this.reading !== null && this.next() < 0.85) return this.whileReading();
    if (this.next() < 0.08) return this.voiceTap();
    if (this.expectOf(this.run).listen && this.next() < 0.75) return this.listenTap();
    const shown = this.unread ? null : shownModel(this.run, this.recallsNow);
    const state = this.stateName();
    if (shown?.fresh === true && state !== 'next') {
      if (!this.voiceOn && this.next() < 0.5) return this.voiceTap();
      if (this.next() < 0.3) return this.say(this.next() < 0.5 ? 'unheard' : 'refused');
    }
    if (state === 'review' && this.next() < 0.6) return this.say('heard');
    if (state === 'next' && this.next() < 0.6) return this.nextTap();
    return null;
  }

  /** What comes while a recital listens or finishes: states sent (nothing made). */
  async during(during: During) {
    const app = this.screen;
    const status = app.status();
    if (during.what === 'return') {
      this.time.now += pickOf(this.next, [MINUTE, 2 * HOUR, DAY, 3 * DAY] as const);
      await this.states(returnOf(this.next), true);
      bump(this.coverage, during.at === 'finishing' ? 'held:finishing-return' : 'held:return');
    } else {
      await this.states(quietOf(this.next), true);
      bump(this.coverage, `held:quiet:${during.at}`);
    }
    if (app.status() !== status)
      this.fail(`a recital ${status} became ${app.status()} at a state sent`);
  }

  /** In the open sheet: `<n> min`, the plan made at that tap with nothing under way, the radio checked and home's counts line under the sheet the new plan's. */
  async tapMinutes(minutes: number) {
    const before = this.run.hold;
    const app = this.screen;
    const step = `${minutes} min`;
    if (!(await tapInSheet(step))) throw new Error(`no ${step} in the sheet`);
    this.minutes = minutes;
    this.expected.set(MINUTES_KEY, String(minutes));
    if (this.run.plan !== null) this.run = madeModel(this.run, this.planNow(), false);
    const counts = JSON.stringify(this.homeWant(this.run));
    const checked = () =>
      modalOf()
        ?.querySelector(`[role="radio"][aria-label="${step}"]`)
        ?.getAttribute('aria-checked') === 'true';
    if (!(await app.until(() => checked() && JSON.stringify(homeCounts(app)) === counts)))
      throw new Error(
        `${step} not checked with the plan's counts, home showed ${JSON.stringify(homeCounts(app))}, expected ${counts}`,
      );
    if (before !== null) this.result = null;
    this.ending = null;
  }

  /** States sent while the sheet is open on home: a return makes the plan again under it, and the sheet stays; a return whose plan moves Today's counts line is noted (`wake:sheet-return-differs`). */
  async sheetAway() {
    const app = this.screen;
    this.time.now += pickOf(this.next, GAPS[this.steer]);
    const states = this.next() < 0.75 ? returnOf(this.next) : quietOf(this.next);
    const before = JSON.stringify(this.todayWant(this.run));
    const returns = await this.states(states, false);
    const counts = JSON.stringify(this.homeWant(this.run));
    const after = JSON.stringify(this.todayWant(this.run));
    if (!(await app.until(() => modalOf() !== null && JSON.stringify(homeCounts(app)) === counts)))
      throw new Error(
        `states ${states.join(',')} with the sheet open: sheet ${modalOf() !== null}, home showed ${JSON.stringify(homeCounts(app))}, expected ${counts}`,
      );
    bump(this.coverage, returns > 0 ? 'wake:sheet-return' : 'wake:sheet-quiet');
    if (returns > 0 && after !== before) bump(this.coverage, 'wake:sheet-return-differs');
  }

  /** A Minutes trip the reader's way: `Your field`, the gear, now and then states sent with the sheet open, `<n> min`, `Done`, then `Start` and Today, or home's done state. */
  async minutesTap() {
    const minutes = pickOf(this.next, MINUTES);
    if (this.unread) return this.noChoices('minutes:none-unread');
    if (this.reading !== null) bump(this.coverage, 'listen:minutes-reading');
    await this.toHome(`${minutes} min`);
    await this.inSheet(`${minutes} min`, async () => {
      if (this.next() < 0.2) await this.sheetAway();
      await this.tapMinutes(minutes);
    });
    bump(this.coverage, 'settings:minutes');
    bump(this.coverage, 'minutes');
    const today = await this.back(`${minutes} min`);
    if (today) await this.settle('minutes');
    this.trail.push('minutes');
  }

  /** A recital, then a Minutes trip with its item still held. */
  async sayThenMinutes(how: How) {
    await this.say(how);
    if (!this.home) await this.minutesTap();
  }

  /** `Next`: the recall pending is kept (its write refused when the recital was, which leaves the item to say again), then the hold let go. */
  async nextTap() {
    const pending = this.pending;
    this.faults.refuse = pending?.refused === true;
    if (pending !== null && !pending.refused) this.expectRecall(pending.piece, pending.startedAt);
    await this.press('Next');
    this.pending = null;
    this.run = nextModel(this.run);
    this.result = null;
    this.ending = pending?.refused === true ? 'refused' : null;
    bump(this.coverage, 'next');
    await this.settle('Next');
    this.faults.refuse = false;
    this.trail.push('next');
  }

  async again() {
    await this.press('Again', 'radio');
    bump(this.coverage, 'again');
    await this.settle('Again');
    this.trail.push('again');
  }

  /** The field and back by `Start`, a return or a sequence that is none sent on it now and then; when the run shows no item after them, home is left in its done state (`homeDone`) and the launch goes on there. */
  async field() {
    const app = this.screen;
    await this.press('Your field');
    if (this.run.hold !== null) bump(this.coverage, 'field:held');
    this.leaveToday();
    if (
      !(await app.until(() => app.headings().includes('Your field') && homeCounts(app).length > 0))
    )
      this.fail('no field');
    if (this.reading !== null) bump(this.coverage, 'listen:field-reading');
    const sends = this.next() < 0.7;
    if (sends) {
      this.time.now += pickOf(this.next, GAPS[this.steer]);
      const states = this.next() < 0.8 ? returnOf(this.next) : quietOf(this.next);
      const differs =
        JSON.stringify(this.expectOf(madeModel(this.run, this.planNow(), false))) !==
        JSON.stringify(this.expectOf(this.run));
      const returns = await this.states(states, false);
      if (!app.headings().includes('Your field')) this.fail('a state sent left the field');
      if (returns > 0 && !this.unread && this.run.plan !== null) {
        bump(this.coverage, 'wake:field');
        if (differs) bump(this.coverage, 'wake:field:differs');
      }
    }
    if (shownModel(this.run, this.recallsNow) === null) {
      bump(this.coverage, 'done:field');
      return this.homeDone(sends ? 'the field, states sent' : 'the field');
    }
    if (!(await app.tap('Start'))) this.fail('no Start');
    bump(this.coverage, 'field');
    await this.settle(sends ? 'the field, states sent, and back' : 'the field and back');
    this.trail.push('field');
  }

  /** Waits for home as the model expects it (`onHome`), the counts line and `Start` given a few frames to follow a making. */
  async homeSettled(begin: boolean) {
    const app = this.screen;
    const want = JSON.stringify(this.homeWant(this.run));
    await app.until(() => JSON.stringify(homeCounts(app)) === want && app.has('Start') === begin);
    this.onHome(begin);
  }

  /** Home as the model expects it: one heading, `Your field`; the model's counts line; `Start` exactly when `begin`; the disk; and no fault of the root's frame rule, the rig's frames or the voice. */
  onHome(begin: boolean) {
    const app = this.screen;
    const seen = { headings: app.headings(), counts: homeCounts(app), begin: app.has('Start') };
    const expected = { headings: ['Your field'], counts: this.homeWant(this.run), begin };
    if (JSON.stringify(seen) !== JSON.stringify(expected))
      this.fail(`home showed ${JSON.stringify(seen)}, expected ${JSON.stringify(expected)}`);
    const faults = [
      ...rootFaults(app.host, this.unread ? 'unread' : 'read'),
      ...app.faults,
      ...this.voiceFaults(),
      ...this.diskFaults(),
    ];
    if (faults.length > 0) this.fail(`on home, ${faults.join(', ')}`);
  }

  /**
   * Home's first show, which makes the plan; a launch in the background is
   * sent `active` there first. With an item shown, `Start` and Today's first
   * show; with none, home's done state (`homeDone`).
   */
  async fromHome(step: string, background: boolean) {
    const app = this.screen;
    if (
      !(await app.until(
        () => app.headings().join('|') === 'Your field' && homeCounts(app).length > 0,
      ))
    )
      this.fail(`${step}: no home, saw ${app.headings().join('|') || 'pending'}`);
    this.run = madeModel(this.run, this.planNow(), false);
    this.log.push(`${step} on home`);
    if (background) {
      await this.states(['active'], false);
      this.log.push('active from the background');
    }
    if (shownModel(this.run, this.recallsNow) === null) return this.homeDone(step);
    await this.homeSettled(true);
    await this.begin('home:begin');
  }

  /** Home's `Start`, then Today as the model expects it; `floor` names the way home was reached. */
  async begin(floor: string) {
    if (!(await this.screen.tap('Start'))) this.fail('no Start');
    this.home = false;
    bump(this.coverage, floor);
    await this.settle('Start');
    this.trail.push('begin');
  }

  /** Home in the done state, reached by `step`: the model's counts line, no `Start`, and the root's frame rule kept; home stays the screen, with its own commands (`homeCommand`). */
  async homeDone(step: string) {
    this.log.push(`${step}, done`);
    await this.homeSettled(false);
    this.home = true;
    bump(this.coverage, 'home:done');
  }

  /** On home in the done state: the launch's end now and then, a wait, or an away. */
  async homeCommand() {
    const roll = this.next();
    if (roll < 0.2) {
      this.ended = true;
      this.log.push('the end on home');
      bump(this.coverage, 'home:end');
      return;
    }
    if (roll < 0.35) return this.homeWait();
    return this.homeAway();
  }

  /** A wait on home: the clock moves and home stays as it was, with no `Start`. */
  async homeWait() {
    this.time.now += pickOf(this.next, [MINUTE, 7 * MINUTE, 2 * HOUR, 9 * HOUR] as const);
    this.log.push('a wait on home');
    await this.screen.until(() => false, 5);
    this.onHome(false);
    bump(this.coverage, 'home:wait');
  }

  /** An away while home shows the done state: a wait, then states sent; a return makes the plan again, and when it shows an item home shows `Start`, which the walk takes. */
  async homeAway() {
    const gap = pickOf(this.next, GAPS[this.steer]);
    this.time.now += gap;
    const roll = this.next();
    const states =
      roll < 0.75 ? returnOf(this.next) : roll < 0.85 ? anyOf(this.next) : quietOf(this.next);
    const returns = returnsModel(this.last, states).some(Boolean);
    if (returns) bump(this.coverage, `wake:gap:${gapName(gap)}`);
    if (returns && this.reading !== null) bump(this.coverage, 'listen:return-reading');
    await this.states(states, false);
    this.log.push(`away ${gapName(gap)} on home`);
    bump(this.coverage, 'home:away');
    this.trail.push(returns ? 'return' : 'quiet');
    if (shownModel(this.run, this.recallsNow) === null) return this.homeSettled(false);
    await this.homeSettled(true);
    await this.begin('home:away-to-begin');
  }

  async wait() {
    this.time.now += pickOf(this.next, [MINUTE, 7 * MINUTE, 2 * HOUR, 9 * HOUR] as const);
    bump(this.coverage, 'wait');
    await this.settle('wait');
    this.trail.push('wait');
  }

  /** A recital with something coming during it, more often, leaning to the no-ops; in place of a Minutes choice during it, which no reader reaches, a recital then a Minutes trip. */
  sayDuring() {
    const what = pickOf(this.next, ['return', 'return', 'quiet', 'quiet', 'minutes'] as const);
    const at = this.next() < 0.5 ? 'listening' : 'finishing';
    const how = this.next() < 0.6 ? 'heard' : this.next() < 0.5 ? 'unheard' : 'refused';
    if (what === 'minutes') return this.sayThenMinutes(how);
    return this.say(how, { what, at });
  }

  /** One command, chosen by the screen the model expects. */
  async command() {
    if (this.home) return this.homeCommand();
    if (this.steer === 'listen') {
      const chosen = this.listenCommand();
      if (chosen !== null) return chosen;
    }
    const roll = this.next();
    if (this.unread) {
      if (roll < 0.4) return this.say(this.next() < 0.7 ? 'heard' : 'unheard');
      if (roll < 0.85) return this.away();
      return this.minutesTap();
    }
    const action = actionModel(this.run, this.recallsNow);
    if (action === 'Say it') return this.atSayIt(roll);
    if (action === 'Next') return this.atNext(roll);
    if (roll < 0.55) return this.away();
    if (roll < 0.75) return this.minutesTap();
    if (roll < 0.88) return this.field();
    return this.wait();
  }

  /** At Say it: leaning to returns, an away half the time on the new piece or after a recital that kept nothing; else a recital of any ending, one with something during it (most often leaning to the no-ops, or a recital then a Minutes trip), an away, the field, a Minutes trip or a wait. */
  async atSayIt(roll: number) {
    const aimed = this.ending !== null || this.stateName() === 'fresh';
    if (this.steer === 'returns' && aimed && this.next() < 0.5) return this.away();
    if (roll < (this.steer === 'quiet' ? 0.35 : 0.12)) return this.sayDuring();
    if (roll < 0.4) return this.say(this.next() < 0.85 ? 'heard' : 'refused');
    if (roll < 0.47) return this.say('unheard');
    if (roll < 0.5) return this.say('cancelled');
    if (roll < 0.75) return this.away();
    if (roll < 0.83) return this.field();
    if (roll < 0.9) return this.minutesTap();
    return this.wait();
  }

  /** At Next: leaning to returns, the field or Again a third of the time; else Next, Again, an away, the field, a Minutes trip or a wait (an away, the field and a Minutes trip each let the recital go, the item open again). */
  async atNext(roll: number) {
    if (this.steer === 'returns' && this.next() < 0.3)
      return this.next() < 0.5 ? this.field() : this.again();
    if (roll < 0.3) return this.nextTap();
    if (roll < 0.36) return this.again();
    if (roll < 0.7) return this.away();
    if (roll < 0.8) return this.field();
    if (roll < 0.9) return this.minutesTap();
    return this.wait();
  }

  /** States sent in a first minute's phase now and then: never a plan, the phase unchanged. */
  async phase(heading: string) {
    const app = this.screen;
    if (!(await app.until(() => app.headings().includes(heading)))) this.fail(`no ${heading}`);
    if (this.next() >= (this.steer === 'quiet' ? 0.85 : 0.4)) return;
    this.time.now += MINUTE;
    const states = this.next() < 0.8 ? returnOf(this.next) : quietOf(this.next);
    await this.states(states, false);
    await app.until(() => false, 5);
    if (!app.headings().includes(heading) || app.counts().length > 0)
      this.fail(`states sent in ${heading} moved it`);
    bump(this.coverage, `wake:first:${heading}`);
  }

  /** The first minute, states sent in its phases, then Today's first show at Continue. */
  async firstMinute() {
    const app = this.screen;
    MutableRef.set(app.hearing, { kind: 'heard', text: passage.text, skip: [] });
    if (!(await app.until(() => app.headings().includes('Heartseed')))) this.fail('no welcome');
    await app.tap('Skip');
    await this.phase('Hear it');
    await this.press('Next');
    await this.phase('Say it with help');
    await this.recite();
    await this.phase('Say it alone');
    this.time.now += 10_000;
    this.expectRecall(PASSAGE, this.time.now);
    await this.recite();
    await this.phase('Planted');
    this.time.now += MINUTE;
    await this.press('Continue');
    bump(this.coverage, 'first-minute');
    await this.fromHome('the first minute', false);
  }

  async recite() {
    const app = this.screen;
    await this.press('Say it');
    if (!(await app.until(() => app.has('Listening')))) this.fail('never listened');
    await this.press('Listening');
    await app.until(() => !app.has('Listening'));
  }

  /** Tallies what the plan at a first show holds. */
  tallyPlan() {
    const plan = planModel({
      plants: plantsOf(this.device),
      pieces: this.pieces,
      at: this.time.now,
      offset: offsetIn(this.zone, this.time.now),
      minutes: this.minutes,
    });
    bump(this.coverage, `plan:fresh:${plan.fresh}`);
    if (plan.items.length === 0) bump(this.coverage, 'plan:nothing-due');
    if (plan.items.some((item) => item.fresh) && plan.items.some((item) => !item.fresh))
      bump(this.coverage, 'plan:fresh-and-review');
  }

  async launchAt(l: number) {
    const next = this.next;
    if (l > 0)
      this.time.now += pickOf(next, [7 * MINUTE, 5 * HOUR, DAY, 3 * DAY, 30 * DAY] as const);
    this.zone = l === 0 || next() < 0.3 ? pickOf(next, ZONES) : this.zone;
    bump(this.coverage, `zone:${this.zone}`);
    const planted = [...this.device.disk.keys()].some((key) => key.startsWith(PREFIX));
    this.unread =
      planted && next() < (this.steer === 'quiet' ? 0.3 : this.steer === 'listen' ? 0.2 : 0.1);
    this.last = next() < 0.15 ? 'background' : 'active';
    this.log.push(`launch ${l}${this.last === 'background' ? ' in the background' : ''}`);
    travel(this.zone);
    this.faults.unread = this.unread;
    this.voice = readingVoice();
    this.app = await wakeLaunch(this.device, this.faults, this.time, this.pieces, {
      state: this.last,
      voice: this.voice,
    });
    this.reading = null;
    this.spoken.length = 0;
    this.run = NO_RUN;
    this.pending = null;
    this.result = null;
    this.ending = null;
    this.trail = [];
    this.returnsThisLaunch = 0;
    this.home = false;
    this.ended = false;
    const background = this.last === 'background';
    if (background) {
      if (!planted) await this.screen.send(['active']);
      bump(this.coverage, 'launch:background');
    }
    if (this.unread) {
      bump(this.coverage, 'launch:unread');
      await this.settle('launch unread');
      if (background) {
        await this.states(['active'], false);
        await this.settle('active from the background');
      }
    } else if (!planted) await this.firstMinute();
    else {
      this.tallyPlan();
      await this.fromHome('launch', background);
    }
    this.last = 'active';
    const commands = 5 + below(next, 6);
    for (let c = 0; c < commands && !this.ended; c += 1) await this.command();
    await this.leave();
  }

  /** The launch's runtime closes: a reading under way stops at the voice's source. */
  async leave() {
    const stops = this.stops().length;
    await this.screen.leave();
    if (this.reading === null) return;
    if (this.stops().length !== stops + 1) this.fail('a relaunch left the reading under way');
    bump(this.coverage, 'listen:relaunch-reading');
  }
}

/** The recalls of one planted piece, in time order: 1-3 over 1-60 days back, each under the zone's offset then. */
const plantOf = (next: () => number, piece: TextPiece, zone: string) =>
  Array.from(
    { length: 1 + below(next, 3) },
    () => T0 - (1 + below(next, 60)) * DAY - below(next, 20) * HOUR,
  )
    .toSorted((a, b) => a - b)
    .map((startedAt) =>
      recordOf(next, piece.reference, piece.words, startedAt, offsetIn(zone, startedAt)),
    );

/** Whether the first piece is planted at 21:00 the evening before, minutes before the first launch, or as any other (none), by `roll`. */
const firstPlantOf = (steer: Steer, roll: number): 'evening' | 'today' | null => {
  if (roll < (steer === 'clocks' ? 0.4 : 0.15)) return 'evening';
  if (roll < (steer === 'clocks' ? 0.7 : 0.25)) return 'today';
  return null;
};

/** The one recall of a first piece planted at 21:00 the evening before, or minutes before the first launch. */
const firstRecords = (
  next: () => number,
  first: 'evening' | 'today',
  piece: TextPiece,
  zone: string,
) => {
  const at = first === 'evening' ? wallAt(zone, T0, 1, 21) : T0 - 10 * MINUTE;
  return [
    recordOf(next, piece.reference, piece.words, at, offsetIn(zone, first === 'evening' ? at : T0)),
  ];
};

/** The share of devices whose piece at `index` is planted: most, and for Listen the first piece nearly always and the rest seldom, so a new piece other than the first is offered. */
const plantedShare = (steer: Steer, index: number) => {
  if (steer !== 'listen') return 0.65;
  return index === 0 ? 0.9 : 0.3;
};

/** A device's disk: empty (the first minute) now and then, else most pieces planted 1-60 days back, with now and then an evening planting the day before, a planting minutes before (the next piece left unplanted, so the new piece waits for the day), and a plant no piece names. */
const recordsOf = (
  next: () => number,
  steer: Steer,
  pieces: readonly TextPiece[],
  zone: string,
  coverage: Coverage,
) => {
  if (next() < (steer === 'quiet' ? 0.45 : 0.08)) return [];
  const entries: (readonly [string, string])[] = [];
  let today = false;
  for (const [index, piece] of pieces.entries()) {
    const roll = next();
    const first = index === 0 ? firstPlantOf(steer, roll) : null;
    if (first !== null) {
      today = first === 'today' && pieces.length > 1;
      bump(coverage, today ? 'disk:planted-today' : `disk:first-${first}`);
      entries.push(...firstRecords(next, first, piece, zone));
      continue;
    }
    if (today && index === 1) continue;
    if (next() > plantedShare(steer, index)) continue;
    entries.push(...plantOf(next, piece, zone));
  }
  if (entries.length === 0 || next() < 0.3) {
    entries.push(recordOf(next, 'Stray 9:9', 4, T0 - 3 * DAY, 0));
    bump(coverage, 'disk:unnamed-plant');
  }
  if (pieces.every((piece) => entries.some(([key]) => key.includes(piece.reference))))
    bump(coverage, 'disk:all-planted');
  return entries;
};

/** One device: its pieces and disk, then 2-3 launches; `aside` draws how far a Voice tap goes. */
const deviceRun = async (
  next: () => number,
  aside: () => number,
  steer: Steer,
  coverage: Coverage,
) => {
  const crowded =
    steer !== 'quiet' && steer !== 'listen' && next() < (steer === 'clocks' ? 0.2 : 0.3);
  const pieces = crowded ? crowdedOf(next) : piecesOf(next);
  const zone = pickOf(next, ZONES);
  const entries = crowded
    ? pieces.map((piece) =>
        recordOf(next, piece.reference, piece.words, T0 - (20 + below(next, 40)) * DAY, 0),
      )
    : [...recordsOf(next, steer, pieces, zone, coverage)];
  if (crowded) bump(coverage, 'disk:crowded');
  const stored = crowded
    ? pickOf(next, ['2', '20'] as const)
    : pickOf(next, [undefined, '2', '5', '10', '20'] as const);
  if (stored !== undefined) entries.push([MINUTES_KEY, stored]);
  const switched =
    steer === 'listen' ? pickOf(next, [undefined, 'true', 'false'] as const) : undefined;
  if (switched !== undefined) entries.push([ENABLED_KEY, switched]);
  const log: string[] = [];
  const walk = new Walk(next, aside, steer, deviceOf(entries), pieces, coverage, log);
  walk.minutes = stored === undefined ? 5 : Number(stored);
  walk.choice = switched === 'false' ? 'off' : 'her';
  walk.zone = zone;
  const before = hostZone();
  try {
    const launches = 2 + below(next, 2);
    for (let l = 0; l < launches; l += 1) await walk.launchAt(l);
  } finally {
    if (walk.app !== null) await walk.app.leave();
    restore(before);
  }
  if (pieces.length === 1) bump(coverage, 'pieces:one');
  if (pieces.length >= 3) bump(coverage, 'pieces:many');
  if (pieces[0] === PASSAGE) bump(coverage, 'pieces:passage-first');
  else bump(coverage, 'pieces:no-passage');
  if (pieces.some((piece) => piece.words === 1)) bump(coverage, 'pieces:one-word');
  if (pieces.some((piece) => piece.words >= 60)) bump(coverage, 'pieces:long');
  if (new Set(pieces.map((piece) => piece.group)).size >= 2) bump(coverage, 'pieces:groups');
};

/** What each steer leans toward, as a walk case names it. */
const LEANS: Record<Steer, string> = {
  returns: 'returns at every run state',
  quiet: 'returns that change nothing',
  clocks: 'long aways across zones and mornings',
  listen: 'Listen on the new piece, its readings and the Voice button',
};

/** The floors every walk case of a steer meets beside its own: leaning toward Listen, a Voice tap from Her to Him while a reading is under way, which goes on, and a Voice trip through the Settings sheet. */
const STEER_FLOORS: Partial<Record<Steer, readonly string[]>> = {
  listen: ['listen:her-him-reading', 'settings:voice'],
};

/** The floors of `floors` that `coverage` misses; `zones` asks for at least that many zones. */
const missing = (coverage: Coverage, floors: readonly string[], zones: number) => [
  ...floors.filter((key) => (coverage[key] ?? 0) === 0),
  ...(Object.keys(coverage).filter((key) => key.startsWith('zone:')).length < zones
    ? [`${zones} zones`]
    : []),
];

/** The tally of `devices` generated devices from `seed` leaning toward `steer`, walked one after another. */
export const wakeRun = async (steer: Steer, seed: number, devices: number) => {
  const next = random(seed);
  const coverage: Coverage = {};
  const aside = random(seed + 1);
  for (let d = 0; d < devices; d += 1) await deviceRun(next, aside, steer, coverage);
  return coverage;
};

/**
 * One walk case: `devices` generated devices from `seed` leaning toward
 * `steer`, each of `floors` met by those devices alone. The environment's
 * `HSWAKE_WALK_SEED` and `HSWAKE_WALK_DEVICES` replace the two for a longer
 * or another walk.
 */
export const wakeCase = (
  steer: Steer,
  seed: number,
  devices: number,
  floors: readonly string[],
  zones = 1,
) => {
  const at = Number(process.env['HSWAKE_WALK_SEED'] ?? seed);
  const many = Number(process.env['HSWAKE_WALK_DEVICES'] ?? devices);
  describe(`Today’s run on generated devices, the host’s state sent, leaning toward ${LEANS[steer]}`, () => {
    it(`shows, says and makes the plan again as the model does on ${many} devices (seed ${at})`, async () => {
      const coverage = await wakeRun(steer, at, many);
      console.log(
        `wake ${steer} coverage ${Object.entries(coverage)
          .toSorted(([a], [b]) => a.localeCompare(b))
          .map(([key, value]) => `${key}=${value}`)
          .join(' ')}`,
      );
      expect(missing(coverage, [...floors, ...(STEER_FLOORS[steer] ?? [])], zones)).toEqual([]);
    });
  });
};
