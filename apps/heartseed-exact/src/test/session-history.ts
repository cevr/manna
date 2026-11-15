/* oxlint-disable effect/noAsyncFunction, effect/noNewPromise, effect/noNullish, effect/noTernary, effect/noGlobals, effect/maxCognitiveComplexity, eslint/complexity, no-await-in-loop -- a test model: each step is awaited as Exact asks its sources one by one, the wire's options are null, the zone is the process's own, and one history's walk and its invariants read as one list of cases, as step.model.test.ts's do. */

/**
 * One generated history of the daily session (spec A1, A2), run as a
 * reader's steps on the port's sources and on the current app's services
 * side by side (`session-model.ts`): plant a list or a verse, remove one
 * mid-run, open Today or home, tap a verse (planted, planned, in the canon
 * and not planted, not in the canon), change the Minutes (each of
 * `MINUTES`) or the Voice, peek, Show all, Say it, finish, grade, Next,
 * Say it again, leave without Next, hours and days passing, a zone
 * change, a relaunch. After every step the two sides' session view (the
 * minutes, the plan, the hold, the visit), the item shown with its words,
 * its cue at rest, the counts, the end and its grown list, and the
 * garden, are equal. On every step A2's invariants hold.
 */

import { runCall } from '@manna/exact-kit/effect';
import { withDataHost } from '@manna/exact-kit/data-host/testing';
import { offsetAt } from '@manna/heartseed/day';
import type { ReadGarden } from '@manna/heartseed/garden';
import type { Grade } from '@manna/heartseed/sayit';
import { listsOf } from '@manna/heartseed/lists';
import { verseReference, type Range } from '@manna/heartseed/passages';
import { isDone, MINUTES, type Minutes } from '@manna/heartseed/session';
import { expect } from 'bun:test';
import { Option, Predicate } from 'effect';

import { readGarden, type Held } from '../garden/program';
import { slugOf } from '../garden/view';
import type { TodayScreen } from '../today/sources';
import { appPlant, appRecall, appRemove, plainOf, rangeIn, storageOf } from './garden-model';
import { seeded, type Random } from './random';
import {
  makeSessionOracle,
  makeSessionPort,
  seenOf,
  setZone,
  showingOf,
  ZONES,
  type Seen,
} from './session-model';

/** A step after which the reader's clock moves on: a plant, a Next or a Say it. */
const movesTime = Predicate.or(
  Predicate.or(Predicate.isTagged('plant'), Predicate.isTagged('next')),
  Predicate.isTagged('say'),
);

/** The most steps a history takes. */
export const STEPS = 30;

const START = Date.UTC(2026, 10, 15, 13, 0, 0);
const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const HOST = { turn: withDataHost, wait: () => Promise.resolve() };

/** The verses a tap may name that no history plants: one in the canon, and one outside it. */
const UNPLANTED = ['Genesis 1:1', 'Nowhere 1:1'];

type Route = 'home' | 'today' | 'start' | 'verses';
type Phase = 'resting' | 'listening' | 'graded';

/** Where the reader stands: the instant, the route and its verse, the choices, the recital, and the help taken on it. */
interface Reader {
  now: number;
  route: Route;
  slug: string;
  tapped: string;
  minutes: Minutes;
  voice: string;
  opened: string;
  phase: Phase;
  tries: number;
  peeked: Set<number>;
  shownAt: number | null;
  reciting: { reference: string; text: string } | null;
}

export type SessionStep =
  | { readonly _tag: 'plant'; readonly range: Range }
  | { readonly _tag: 'remove'; readonly id: string }
  | { readonly _tag: 'open'; readonly route: 'home' | 'today' }
  | { readonly _tag: 'tap'; readonly verse: string }
  | { readonly _tag: 'leave' }
  | { readonly _tag: 'minutes'; readonly minutes: Minutes }
  | { readonly _tag: 'voice'; readonly voice: string }
  | { readonly _tag: 'hear' }
  | { readonly _tag: 'peek'; readonly index: number }
  | { readonly _tag: 'showAll' }
  | { readonly _tag: 'say' }
  | { readonly _tag: 'finish'; readonly said: 'all' | 'half' | 'none' }
  | { readonly _tag: 'grade'; readonly grade: Grade }
  | { readonly _tag: 'next' }
  | { readonly _tag: 'again' }
  | { readonly _tag: 'pass'; readonly ms: number }
  | { readonly _tag: 'zone'; readonly zone: string }
  | { readonly _tag: 'relaunch' };

const runs = (route: Route) => route !== 'verses';

/** The reader's world as the oracle holds it, for drawing a step. */
interface Known {
  readonly held: Held;
  readonly planned: readonly string[];
}

const plantedOf = (held: Held): readonly string[] =>
  held.garden._tag === 'Read' ? [...held.garden.plants.keys()] : [];

const versesOf = (held: Held): readonly string[] => {
  const lists =
    held.passages._tag === 'Read'
      ? listsOf([], held.passages, []).flatMap((list) => list.verses)
      : [];
  const singles = Option.getOrElse(held.singles, () => []).map((range) =>
    verseReference(range.book, range.chapter, range.first),
  );
  return [...lists, ...singles];
};

const removableOf = (held: Held): readonly string[] => [
  ...(held.passages._tag === 'Read' ? listsOf([], held.passages, []).map((list) => list.id) : []),
  ...Option.getOrElse(held.singles, () => []).map(
    (range) => `single:${verseReference(range.book, range.chapter, range.first)}`,
  ),
];

/** The next step of a history: what a reader may do from where they stand. */
const stepOf = (random: Random, reader: Reader, screen: TodayScreen, known: Known): SessionStep => {
  const roll = random.below(100);
  const plant = (): SessionStep => ({ _tag: 'plant', range: rangeIn(random) });
  const minutes = (): SessionStep => ({
    _tag: 'minutes',
    minutes: random.pick(MINUTES.filter((each) => each !== reader.minutes)),
  });
  const pass = (): SessionStep => ({
    _tag: 'pass',
    ms: random.pick([MINUTE, 10 * MINUTE, HOUR, 5 * HOUR, DAY, 3 * DAY]) + random.below(MINUTE),
  });
  const remove = (): SessionStep => {
    const ids = removableOf(known.held);
    return { _tag: 'remove', id: ids.length > 0 ? random.pick(ids) : 'single:Genesis 1:1' };
  };
  if (reader.phase === 'listening') {
    if (roll < 65)
      return {
        _tag: 'finish',
        said: random.pick<'all' | 'half' | 'none'>(['all', 'half', 'none']),
      };
    if (roll < 75) return minutes();
    if (roll < 80) return plant();
    if (roll < 88) return remove();
    if (roll < 96) return pass();
    return { _tag: 'relaunch' };
  }
  if (reader.phase === 'graded') {
    if (roll < 15) return { _tag: 'grade', grade: random.pick<Grade>([1, 2, 3, 4]) };
    if (roll < 65) return { _tag: 'next' };
    if (roll < 72) return { _tag: 'again' };
    if (roll < 80) return { _tag: 'leave' };
    if (roll < 86) return minutes();
    if (roll < 92) return plant();
    if (roll < 97) return pass();
    return { _tag: 'relaunch' };
  }
  const tap = (): SessionStep => {
    const verses = [...versesOf(known.held), ...known.planned, ...plantedOf(known.held)];
    const verse =
      verses.length > 0 && random.chance(0.85) ? random.pick(verses) : random.pick(UNPLANTED);
    return { _tag: 'tap', verse };
  };
  const shown = runs(reader.route) && screen.session.item;
  const draws: readonly (readonly [number, number, () => SessionStep])[] = [
    [8, 30, plant],
    [4, 6, remove],
    [4, 14, () => ({ _tag: 'open', route: random.pick<'home' | 'today'>(['home', 'today']) })],
    [7, 14, tap],
    [4, 6, () => ({ _tag: 'leave' })],
    [5, 8, minutes],
    [3, 4, () => ({ _tag: 'voice', voice: random.pick(['her', 'him', 'off']) })],
    [3, 0, () => ({ _tag: 'hear' })],
    [7, 0, () => ({ _tag: 'peek', index: random.below(screen.words.length + 1) })],
    [4, 0, () => ({ _tag: 'showAll' })],
    [40, 0, () => ({ _tag: 'say' })],
    [6, 10, pass],
    [2, 4, () => ({ _tag: 'zone', zone: random.pick(ZONES) })],
    [3, 4, () => ({ _tag: 'relaunch' })],
  ];
  const weights = draws.map(([onItem, otherwise]) => (shown ? onItem : otherwise));
  let at = random.below(weights.reduce((sum, each) => sum + each, 0));
  for (const [index, weight] of weights.entries()) {
    if (at < weight) return draws[index]?.[2]() ?? pass();
    at -= weight;
  }
  return pass();
};

/** The words a reader says of `text`: all of them, the first half, or none. */
const saidOf = (text: string, said: 'all' | 'half' | 'none') => {
  const words = text.split(/\s+/u).filter((word) => word !== '');
  if (said === 'all') return words.join(' ');
  if (said === 'half') return words.slice(0, Math.ceil(words.length / 2)).join(' ');
  return '';
};

/** What the port shows, in the oracle's terms: the session's view on the wire, and Today's item, cue, counts and end. */
const portSeen = (screen: TodayScreen, resting: boolean): Seen => ({
  wire: screen.session.wire,
  shown: {
    reference: screen.session.item ? screen.reference : '',
    text: screen.session.item ? screen.passage : '',
    cue: screen.session.item && resting ? screen.cue : '',
    counts: screen.session.counts,
    ended: screen.session.ended,
    grown: screen.session.grown,
  },
});

/** The oracle's view, as Today would show it where the reader stands. */
const oracleSeen = (seen: Seen, ranOn: boolean, resting: boolean): Seen => ({
  wire: seen.wire,
  shown: ranOn
    ? { ...seen.shown, cue: resting && seen.shown.reference !== '' ? seen.shown.cue : '' }
    : seen.shown,
});

/** Runs the history of `seed` on both sides; a broken step fails naming its seed and step. */
export const runSessionHistory = async (seed: number) => {
  const random = seeded(seed);
  const zoneWas = process.env.TZ;
  setZone(random.pick(ZONES));
  const port = makeSessionPort(storageOf());
  const oracle = await makeSessionOracle();
  const reader: Reader = {
    now: START + random.below(DAY),
    route: 'home',
    slug: '',
    tapped: '',
    minutes: 5,
    voice: '',
    opened: '',
    phase: 'resting',
    tries: 0,
    peeked: new Set(),
    shownAt: null,
    reciting: null,
  };
  let screen = await port.call<TodayScreen>('todayBoot', []);
  const portHeld = () => runCall(readGarden(port.storage), { now: reader.now, seed }, HOST);
  const oracleView = () => oracle.viewAt(reader.now);
  const known = async (): Promise<Known> => {
    const view = await oracleView();
    return {
      held: {
        garden: view.garden,
        passages: view.passages,
        singles: view.passages._tag === 'Read' ? Option.some(view.passages.singles) : Option.none(),
      },
      planned: Option.match(view.session.plan, {
        onNone: () => [],
        onSome: (plan) => plan.items.map((item) => item.reference),
      }),
    };
  };

  /** Sends the route, the Minutes and the Voice to the port as the Contract's keyed task does, and the same arrival to the oracle. */
  const open = async () => {
    const key = `${reader.route}|${reader.slug}|${reader.minutes}|${reader.voice}`;
    if (key === reader.opened) return;
    const before = reader.opened.split('|');
    reader.opened = key;
    screen = await port.call<TodayScreen>('todayOpen', [
      reader.route,
      reader.slug,
      '',
      String(reader.minutes),
      reader.voice,
      reader.now,
      seed,
    ]);
    const now = reader.now;
    const was = before[0] ?? '';
    if (was !== '' && was !== 'verses' && !runs(reader.route) && reader.phase !== 'listening') {
      await oracle.session(now, (each) => each.next);
      reader.phase = 'resting';
      clearHelp();
    }
    const view = await oracleView();
    if (view.session.minutes !== reader.minutes)
      await oracle.session(now, (each) => each.choose(reader.minutes));
    if (!runs(reader.route)) return;
    await oracle.session(now, (each) => each.begin);
    const arrival = `${before[0] ?? ''}|${before[1] ?? ''}`;
    if (reader.route === 'start' && arrival !== `start|${reader.slug}`)
      await oracle.session(now, (each) => each.start(reader.tapped));
  };

  const clearHelp = () => {
    reader.peeked = new Set();
    reader.shownAt = null;
  };

  /** Holds the item the oracle shows, as the current app's Say it does, and listens. */
  const holdShown = async () => {
    const view = await oracleView();
    const showing = showingOf(view.session, view.garden);
    if (Option.isSome(showing))
      await oracle.session(reader.now, (each) => each.hold(showing.value.item));
    oracle.recital.listening = true;
  };

  const say = async () => {
    reader.tries += 1;
    const before = screen;
    screen = await port.call<TodayScreen>('todaySay', [`r${reader.tries}`, reader.now, seed]);
    expect({ seed, said: screen.phase }).toEqual({ seed, said: 'listening' });
    reader.phase = 'listening';
    reader.reciting = { reference: before.reference, text: before.passage };
    await holdShown();
  };

  let doneInPlan = new Set<string>();
  let planWas = '';

  await open();
  for (let n = 1 + random.below(STEPS); n > 0; n--) {
    const step = stepOf(random, reader, screen, await known());
    const where = { seed, step };
    const writes = port.counts.writes;
    const heldBefore = await portHeld();
    const pendingBefore = screen.pending;
    const referenceBefore = screen.reference;
    const taken: Taken = {
      peeked: [...reader.peeked].sort((a, b) => a - b),
      shown: reader.shownAt !== null,
    };
    switch (step._tag) {
      case 'plant': {
        const { book, chapter, first, last } = step.range;
        const changed = await port.call<{ answer: string }>('gardenPlant', [
          book,
          chapter,
          first,
          last,
          reader.now,
          offsetAt(reader.now),
          seed,
        ]);
        const answer = await oracle.at(reader.now, appPlant(step.range));
        if (answer === 'Planted') await oracle.session(reader.now, (each) => each.remake);
        expect({ ...where, answer: changed.answer }).toEqual({ ...where, answer });
        screen = await port.call<TodayScreen>('todayBoot', []);
        break;
      }
      case 'remove': {
        const changed = await port.call<{ answer: string }>('gardenRemove', [
          step.id,
          reader.now,
          offsetAt(reader.now),
          seed,
        ]);
        const answer = await oracle.at(reader.now, appRemove(step.id));
        if (answer === 'Removed') await oracle.session(reader.now, (each) => each.remake);
        expect({ ...where, answer: changed.answer }).toEqual({ ...where, answer });
        screen = await port.call<TodayScreen>('todayBoot', []);
        break;
      }
      case 'open':
        reader.route = step.route;
        reader.slug = '';
        await open();
        break;
      case 'tap':
        if (reader.route === 'start') {
          reader.route = 'home';
          reader.slug = '';
          await open();
        }
        reader.route = 'start';
        reader.tapped = step.verse;
        reader.slug = slugOf(step.verse);
        await open();
        break;
      case 'leave':
        reader.route = 'verses';
        reader.slug = '';
        await open();
        break;
      case 'minutes':
        reader.minutes = step.minutes;
        await open();
        break;
      case 'voice':
        reader.voice = step.voice;
        await open();
        break;
      case 'hear': {
        const offered = screen.canHear;
        screen = await port.call<TodayScreen>('todayHear', [`u${reader.tries}`]);
        expect({ ...where, read: screen.phase === 'reading' }).toEqual({ ...where, read: offered });
        if (reader.voice === 'off')
          expect({ ...where, offered }).toEqual({ ...where, offered: false });
        screen = await port.call<TodayScreen>('todayStop', []);
        break;
      }
      case 'peek': {
        const word = screen.words[step.index];
        const peekable = word?.peekable === true;
        screen = await port.call<TodayScreen>('todayPeek', [step.index]);
        if (peekable) reader.peeked.add(step.index);
        screen = await port.call<TodayScreen>('todayPeekEnded', [step.index]);
        break;
      }
      case 'showAll': {
        const offered = screen.canShowAll;
        screen = await port.call<TodayScreen>('todayShowAll', [reader.now]);
        if (offered) {
          reader.shownAt = reader.now;
          screen.words.forEach((_, index) => reader.peeked.add(index));
        }
        break;
      }
      case 'say':
        if (screen.canSay) await say();
        break;
      case 'finish': {
        const text = reader.reciting?.text ?? '';
        screen = await port.call<TodayScreen>('todayHeard', [
          `r${reader.tries}`,
          saidOf(text, step.said),
          true,
        ]);
        screen = await port.call<TodayScreen>('todayFinish', []);
        reader.phase = 'graded';
        oracle.recital.listening = false;
        break;
      }
      case 'grade':
        screen = await port.call<TodayScreen>('todayGrade', [step.grade]);
        break;
      case 'next': {
        const pending = screen.pending;
        screen = await port.call<TodayScreen>('todayNext', [
          offsetAt(reader.now),
          reader.now,
          seed,
        ]);
        if (pending !== null) {
          const { reference: _reference, ...recall } = pending.recall;
          const help = pending.help ?? { peeked: [], shownAt: null, cap: 4 as Grade };
          await oracle.at(
            reader.now,
            appRecall({
              _tag: 'recall',
              reference: pending.reference,
              recall,
              help: { peeked: [...help.peeked], shownAt: help.shownAt, cap: help.cap },
            }),
          );
          await oracle.session(reader.now, (each) => each.next);
        }
        reader.phase = 'resting';
        reader.reciting = null;
        clearHelp();
        break;
      }
      case 'again':
        screen = await port.call<TodayScreen>('todayAgain', []);
        reader.phase = 'resting';
        await say();
        break;
      case 'pass':
        reader.now += step.ms;
        break;
      case 'zone':
        setZone(step.zone);
        break;
      case 'relaunch':
        port.relaunch();
        await oracle.relaunch();
        Object.assign(reader, {
          route: 'home',
          slug: '',
          opened: '',
          phase: 'resting',
          reciting: null,
        });
        clearHelp();
        screen = await port.call<TodayScreen>('todayBoot', []);
        await open();
        break;
    }

    const phase: Phase =
      screen.phase === 'listening' || screen.phase === 'graded' ? screen.phase : 'resting';
    if (screen.reference !== referenceBefore || (reader.phase === 'graded' && phase === 'resting'))
      clearHelp();
    if (phase === 'resting') reader.reciting = null;
    reader.phase = phase;
    oracle.recital.listening = phase === 'listening';

    const heldAfter = await portHeld();
    const view = await oracleView();
    const oracleHeld: Held = {
      garden: view.garden,
      passages: view.passages,
      singles: view.passages._tag === 'Read' ? Option.some(view.passages.singles) : Option.none(),
    };
    expect({ ...where, held: plainOf(heldAfter) }).toEqual({ ...where, held: plainOf(oracleHeld) });
    const resting = screen.phase === 'resting';
    const ranOn = runs(reader.route);
    const expected = oracleSeen(seenOf(view.session, view.garden), ranOn, resting);
    const seen = portSeen(screen, resting);
    expect({ ...where, wire: seen.wire }).toEqual({ ...where, wire: expected.wire });
    if (ranOn) expect({ ...where, shown: seen.shown }).toEqual({ ...where, shown: expected.shown });

    const planKey = JSON.stringify(screen.session.wire.items);
    if (planKey !== planWas) doneInPlan = new Set();
    planWas = planKey;
    if (step._tag === 'next' && pendingBefore !== null && heldAfter.garden._tag === 'Read') {
      const read: ReadGarden = heldAfter.garden;
      const item = Option.flatMap(view.session.plan, (plan) =>
        Option.fromUndefinedOr(
          plan.items.find((each) => each.reference === pendingBefore.reference),
        ),
      );
      if (Option.exists(item, (each) => isDone(read, each)))
        doneInPlan.add(pendingBefore.reference);
    }
    invariants({
      where,
      step,
      writes: { before: writes, after: port.counts.writes },
      pending: pendingBefore,
      held: { before: heldBefore, after: heldAfter },
      reader,
      taken,
      screen,
      ranOn,
      doneInPlan,
      pieces: view.session.pieces,
    });

    if (movesTime(step)) reader.now += MINUTE + random.below(MINUTE);
  }
  if (zoneWas === undefined) Reflect.deleteProperty(process.env, 'TZ');
  else setZone(zoneWas);
  return { port, oracle, reader };
};

/**
 * A2 on one step: nothing is written but by a plant, a remove or a Next
 * with a try, which writes one recall with the help the reader took; a
 * held item stays shown with its own words while its recital is under way
 * or graded, whatever making came between; an item done in the garden is
 * not shown again in that plan; the plan offers no verse without words;
 * Voice Off offers no Hear it.
 */
const invariants = (at: {
  readonly where: { seed: number; step: SessionStep };
  readonly step: SessionStep;
  readonly writes: { readonly before: number; readonly after: number };
  readonly pending: TodayScreen['pending'];
  readonly held: { readonly before: Held; readonly after: Held };
  readonly reader: Reader;
  readonly taken: Taken;
  readonly screen: TodayScreen;
  readonly ranOn: boolean;
  readonly doneInPlan: ReadonlySet<string>;
  readonly pieces: readonly { readonly reference: string; readonly text: string }[];
}) => {
  const { where, step, writes, pending, reader, screen, ranOn } = at;
  const writer =
    step._tag === 'plant' || step._tag === 'remove' || (step._tag === 'next' && pending !== null);
  if (!writer)
    expect({ ...where, writes: writes.after }).toEqual({ ...where, writes: writes.before });
  if (step._tag === 'next' && pending !== null) nextRecorded(where, pending, at.held, at.taken);
  if (reader.phase !== 'resting' && reader.reciting !== null && ranOn)
    expect({ ...where, held: { reference: screen.reference, text: screen.passage } }).toEqual({
      ...where,
      held: reader.reciting,
    });
  if (
    ranOn &&
    screen.session.item &&
    !screen.session.held &&
    screen.session.wire.visit.length === 0
  )
    expect({ ...where, again: at.doneInPlan.has(screen.reference) }).toEqual({
      ...where,
      again: false,
    });
  for (const item of screen.session.wire.items)
    expect({
      ...where,
      words: at.pieces.some(
        (piece) => piece.reference === item.reference && piece.text.trim() !== '',
      ),
    }).toEqual({ ...where, words: true });
  if (reader.voice === 'off')
    expect({ ...where, hear: screen.canHear }).toEqual({ ...where, hear: false });
};

/** Next wrote one recall of the try's verse at the try's start, with the help the reader took. */
const nextRecorded = (
  where: { seed: number; step: SessionStep },
  pending: NonNullable<TodayScreen['pending']>,
  held: { readonly before: Held; readonly after: Held },
  taken: Taken,
) => {
  const count = (each: Held) =>
    each.garden._tag === 'Read'
      ? (each.garden.plants.get(pending.reference)?.recalls ?? []).filter(
          (recall) => recall.startedAt === pending.recall.startedAt,
        ).length
      : 0;
  expect({ ...where, recalls: count(held.after) - count(held.before) }).toEqual({
    ...where,
    recalls: 1,
  });
  const saw: Taken = {
    peeked: [...(pending.help?.peeked ?? [])].sort((a, b) => a - b),
    shown: (pending.help?.shownAt ?? null) !== null,
  };
  expect({ ...where, help: saw }).toEqual({ ...where, help: taken });
};

/** The help a reader took on the verse before a step: the words peeked, and whether Show all was taken. */
interface Taken {
  readonly peeked: readonly number[];
  readonly shown: boolean;
}
