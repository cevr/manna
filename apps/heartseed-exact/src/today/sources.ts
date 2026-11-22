/* oxlint-disable effect/noAsyncFunction -- Exact's data module answers a Promise, and an answer is carried across an `await` alone (docs/exact-data-layer.md, rule 6), so each queued call awaits the session and the garden in turn. */

/**
 * Today's data sources, as `app.ts` registers them: one per input of the
 * recital's `step`, and one (`todayOpen`) for each route Today is drawn on,
 * each answering the screen after it. Two things live the launch here: the
 * recital (`step`'s state) and the session (`../session/live.ts`, the
 * current app's own `Session`).
 *
 * - On `/today` and on home Today runs the session: the plan is made when
 *   Today first shows with the garden read (`begin`), and made again at a
 *   Minutes change (`choose`) and after a plant or a remove that landed
 *   (`remake`); `/start/<slug>` also starts that verse ahead of the plan
 *   (`start`), once per arrival. Today shows the item the current app's
 *   `shownOf` gives, under the cue its plant's stage gives (`cueIn`), and
 *   the recital follows it: a new item shown at rest starts its own try.
 * - Say it holds the item shown (`hold`) as the recital starts. Next hands
 *   the try on to the garden's own `gardenRecall` with its help, then lets
 *   the item go (`next`); nothing is written before it. Leaving Today for
 *   a screen that is not the Settings sheet lets the item and the try go,
 *   unless a recital is under way.
 * - `/cue/<cue>` shows Isaiah 41:10, read from the shipped KJV, under the
 *   cue named, for the recital's own tests: Next there keeps the try in
 *   memory alone.
 *
 * Every call that reads or writes runs one at a time behind those before
 * it. Time is never read: a try's start, Show all's instant and each
 * call's time are its arguments.
 */

import { oneAtATime, makeQueue } from '../garden/writes';
import type { FileStorage } from '@manna/exact-kit/storage';
import { offsetAt } from '@manna/heartseed/day';
import {
  cueIn,
  shownAllCap,
  stageOf,
  withHelp,
  type GardenView,
  type ReadGarden,
} from '@manna/heartseed/garden';
import { STAGE_NAMES } from '@manna/heartseed/garden/names';
import type { Help } from '@manna/heartseed/sayit';
import { tendedOf } from '@manna/heartseed/home/grown';
import { countsOf, type Item, type Minutes, type TextPiece } from '@manna/heartseed/session';
import { shownOf, type Shown } from '@manna/heartseed/session/run';
import type { SessionView } from '@manna/heartseed/session/service';
import type { Choice as Voice } from '@manna/heartseed/voice/reading';
import { Option } from 'effect';

import { backOn } from '../back/shown';
import { slugOf } from '../garden/view';
import { DRAWN } from '../list/page';
import { makeLive, type Call, type Ground, type Live } from '../session/live';
import { minutesOf, voiceOf } from '../settings/choices';
import { textOf } from '../text/text';
import type { Frame } from './hold';
import {
  initial,
  pendingOf,
  SHOWN_ALL_CAP,
  step,
  type Cue,
  type Outcome,
  type Passage,
  type TodayInput,
  type TodayState,
} from './step';
import { view, type TodayView } from './view';

/** Where Today is drawn: the session's run, the recital's own passage under a cue, or not at all. */
export type Mode = 'run' | 'cued' | 'away';

/** An item of the plan, a visit or the hold, as the wire carries it. */
export interface SessionItem {
  reference: string;
  fresh: boolean;
  recalls: number;
  seconds: number;
}

/** The session's view as the wire carries it, for a screen that reads the plan (home): no plan made is `planned` false and no items. */
export interface SessionWire {
  minutes: number;
  planned: boolean;
  items: SessionItem[];
  // oxlint-disable-next-line effect/noNullish -- Exact's option<SessionItem> is null on the wire.
  held: SessionItem | null;
  visit: SessionItem[];
}

/** A verse that grew in the run, its nodes named by `slug`. */
export interface SessionGrown {
  reference: string;
  slug: string;
  stage: string;
}

/** What Today shows of the session: the counts, the item shown, the end and what grew, and the session's view. */
export interface SessionShown {
  mode: string;
  read: boolean;
  planned: boolean;
  nothing: boolean;
  counts: string;
  item: boolean;
  fresh: boolean;
  done: boolean;
  held: boolean;
  ended: boolean;
  recorded: number;
  grown: SessionGrown[];
  wire: SessionWire;
  stage: string;
  stageLine: string;
  stageDrawn: string;
}

/** The stage of the verse at `reference` in the garden read, Show all's step back of `help` laid over it, the line Today shows of it and the home picture its plant is drawn with (none unplanted); none for an unread garden, which claims no stage. */
export const stageShown = (
  garden: Option.Option<ReadGarden>,
  reference: string,
  help: Option.Option<Help>,
): { readonly stage: string; readonly stageLine: string; readonly stageDrawn: string } =>
  Option.match(garden, {
    onNone: () => ({ stage: '', stageLine: '', stageDrawn: '' }),
    onSome: (read) => {
      const laid = Option.match(
        Option.filter(help, (taken) => taken.reference === reference),
        { onNone: () => read, onSome: (taken) => withHelp(read, taken) },
      );
      return Option.match(Option.fromUndefinedOr(laid.plants.get(reference)), {
        onNone: () => ({ stage: 'not planted', stageLine: 'Not planted yet', stageDrawn: '' }),
        onSome: (plant) => {
          const stage = stageOf(plant);
          return { stage, stageLine: STAGE_NAMES[stage].shown, stageDrawn: DRAWN[stage] };
        },
      });
    },
  });

/** Today's screen: the recital's, and the session's around it. */
export interface TodayScreen extends TodayView {
  session: SessionShown;
  back: boolean;
}

/** The verse `/cue/<cue>` shows: Isaiah 41:10. */
const CUED = { book: 23, chapter: 41, first: 10, last: 10 };

/** The cued verse as the shipped KJV gives it. */
const cuedPassage = (): Passage => {
  const read = textOf(CUED);
  return {
    reference: read.reference,
    text: read.verses.map((verse) => verse.text).join(' '),
  };
};

/** A cue as the route names it; none for any other name. */
const cueOf = (text: string): Cue => {
  if (text === 'initials' || text === 'full') return text;
  return 'none';
};

/** The voice's ending as `step` reads it: anything but a spoken end is an error. */
const outcomeOf = (text: string): Outcome => {
  if (text === 'end') return 'end';
  return 'error';
};

/** The zone's offset at a try's start, `offsetAt`'s; 0 for an instant that is no time. */
const zoneAt = (at: number) => {
  if (!Number.isFinite(at)) return 0;
  return offsetAt(at);
};

/** An instant as the garden keeps it: whole milliseconds. */
const whole = (at: number) => {
  if (!Number.isFinite(at)) return at;
  return Math.floor(at);
};

/** The reference a `/start/<slug>` names: its book's words, then its chapter and verse; none for a slug of another form. */
export const referenceOfSlug = (slug: string): Option.Option<string> =>
  Option.map(
    Option.fromNullishOr(/^(?<book>.+?)-(?<chapter>\d+)-(?<verse>\d+)$/u.exec(slug)?.groups),
    (parts) =>
      `${String(parts['book']).replaceAll('-', ' ')} ${parts['chapter']}:${parts['verse']}`,
  );

const itemWire = (item: Item): SessionItem => ({
  reference: item.reference,
  fresh: item.fresh,
  recalls: item.recalls,
  seconds: item.seconds,
});

/** The session's view on the wire. */
export const sessionWire = (session: SessionView): SessionWire => ({
  minutes: session.minutes,
  planned: Option.isSome(session.plan),
  items: Option.match(session.plan, {
    onNone: () => [],
    onSome: (plan) => plan.items.map(itemWire),
  }),
  held: Option.getOrNull(Option.map(session.held, itemWire)),
  visit: session.visit.map((each) => itemWire(each.item)),
});

/** The garden a read found; none while unread. */
const readOf = (garden: GardenView) => {
  if (garden._tag === 'Unread') return Option.none();
  return Option.some(garden);
};

/** The piece the run shows, and its item when it is one of the run's. */
interface Showing {
  readonly piece: TextPiece;
  readonly item: Option.Option<Item>;
  readonly done: boolean;
  readonly held: boolean;
}

/** What `shown` shows: a piece before a plan, an item of the run, or nothing at the end. */
const showingOf = (shown: Shown): Option.Option<Showing> => {
  if (shown._tag === 'Unplanned')
    return Option.map(shown.piece, (piece) => ({
      piece,
      item: Option.none(),
      done: false,
      held: false,
    }));
  if (shown._tag === 'Item')
    return Option.some({
      piece: shown.piece,
      item: Option.some(shown.item),
      done: shown.done,
      held: shown.held,
    });
  return Option.none();
};

/** The cue a verse is said under at rest, and the cap Show all sets on it. */
interface RestCue {
  readonly cue: Cue;
  readonly cap: TodayState['shownAllCap'];
}

/** The cue the run's verse at `reference` is said under at rest, and the cap Show all sets on it: the current app's ladder over the garden read; the full text in an unread garden. */
const cueFor = (garden: GardenView, reference: string): RestCue => {
  if (garden._tag === 'Unread') return { cue: 'full', cap: SHOWN_ALL_CAP };
  return {
    cue: cueIn(garden, reference),
    cap: Option.match(Option.fromUndefinedOr(garden.plants.get(reference)), {
      onNone: () => SHOWN_ALL_CAP,
      onSome: (plant) => shownAllCap(stageOf(plant)),
    }),
  };
};

/** Exact's `Store` argument, as much of it as names it: Today keeps nothing there. */
interface ExactStore {
  readonly forget: (name: string) => void;
}

/** The garden's sources Today calls: the read it makes again after a plant or a remove, and the one write, Next's recall. */
export interface GardenCalls {
  readonly gardenPlant: (
    args: readonly [number, number, number, number, number, number, number],
    store: ExactStore,
    storage: FileStorage,
  ) => Promise<{ answer: string; line: string }>;
  readonly gardenJoin: (
    args: readonly [number, number, number, number, number, number, number],
    store: ExactStore,
    storage: FileStorage,
  ) => Promise<{ answer: string; line: string }>;
  readonly gardenRemove: (
    args: readonly [string, number, number, number],
    store: ExactStore,
    storage: FileStorage,
  ) => Promise<{ answer: string; line: string }>;
  readonly addPlant: (
    args: readonly [string, number, number, number],
    store: ExactStore,
    storage: FileStorage,
  ) => Promise<{ answer: string; line: string }>;
  readonly gardenRecall: (
    args: readonly [string, unknown, unknown, number, number, number],
    store: ExactStore,
    storage: FileStorage,
  ) => Promise<{ answer: string }>;
}

type Source<A extends readonly unknown[]> = (
  args: A,
  store: ExactStore,
  storage: FileStorage,
) => TodayScreen | Promise<TodayScreen>;

/** Today's sources over the garden's `garden`, with the recital and the session of one launch; `live` is the session's, a fresh one by default. */
export const todaySources = (garden: GardenCalls, live: Live = makeLive()) => {
  const queue = makeQueue();
  let state: TodayState = initial(cuedPassage());
  let mode: Mode = 'away';
  let arrived = '';
  let minutes: Minutes = minutesOf('');
  let voice: Voice = voiceOf('');
  let session: Option.Option<SessionView> = Option.none();
  let ground: Option.Option<Ground> = Option.none();
  let recorded = 0;

  const listening = () => state.phase === 'listening';
  const shown = (): Option.Option<Showing> =>
    Option.flatMap(session, (each) =>
      showingOf(
        shownOf(
          each,
          Option.flatMap(ground, (read) => readOf(read.garden)),
        ),
      ),
    );

  /** The recital on the run's verse: a new verse shown at rest starts its own try; the verse shown keeps its try, its cue following the garden at rest; with none shown, a try not under way is let go. */
  const follow = () => {
    if (mode !== 'run') return;
    const showing = shown();
    if (Option.isNone(showing)) {
      state = step(state, { _tag: 'leave' });
      return;
    }
    const { piece } = showing.value;
    const read = Option.match(ground, {
      onNone: (): GardenView => ({ _tag: 'Unread' }),
      onSome: (now) => now.garden,
    });
    const { cue, cap } = cueFor(read, piece.reference);
    if (state.passage.reference === piece.reference && state.passage.text === piece.text) {
      state = step(state, { _tag: 'cue', cue, cap });
      return;
    }
    if (state.phase === 'listening') return;
    state = step(initial({ reference: piece.reference, text: piece.text }), {
      _tag: 'cue',
      cue,
      cap,
    });
  };

  const hearable = (showing: Option.Option<Showing>) => {
    if (voice === 'off') return false;
    if (mode === 'cued') return true;
    return Option.exists(showing, (each) =>
      Option.exists(each.item, (item) => item.fresh && !each.done),
    );
  };

  const screen = (): TodayScreen => {
    const recital = view(state);
    const showing = Option.filter(shown(), () => mode === 'run');
    const read = Option.flatMap(ground, (now) => readOf(now.garden));
    const ended = Option.flatMap(session, (each) => tendedOf(each, read));
    const counts = Option.flatMap(
      Option.all({ plan: Option.flatMap(session, (each) => each.plan), garden: read }),
      ({ plan, garden: planted }) => Option.some(countsOf(plan, planted)),
    );
    const wire = Option.match(session, {
      onNone: (): SessionWire => ({
        minutes,
        planned: false,
        items: [],
        held: Option.getOrNull(Option.none()),
        visit: [],
      }),
      onSome: sessionWire,
    });
    const shows = mode === 'cued' || Option.isSome(showing);
    return {
      ...recital,
      canHear: recital.canHear && shows && hearable(showing),
      canSay: recital.canSay && shows,
      back: backOn(showing, session, read, listening(), recital.shownAll),
      session: {
        mode,
        read: Option.isSome(read),
        planned: wire.planned,
        nothing:
          Option.isSome(read) &&
          Option.isNone(showing) &&
          Option.exists(session, (each) => each.pieces.length === 0),
        counts: Option.getOrElse(counts, () => ''),
        item: Option.isSome(showing),
        fresh: Option.exists(showing, (each) => Option.exists(each.item, (item) => item.fresh)),
        done: Option.exists(showing, (each) => each.done),
        held: Option.exists(showing, (each) => each.held),
        ended: Option.isSome(ended),
        recorded,
        grown: Option.match(ended, {
          onNone: () => [],
          onSome: (grown) =>
            grown.map((each) => ({
              reference: each.reference,
              slug: slugOf(each.reference),
              stage: each.stage,
            })),
        }),
        wire,
        ...stageShown(read, state.passage.reference, state.help),
      },
    };
  };

  const apply = (input: TodayInput) => {
    state = step(state, input);
    return screen();
  };

  /** Runs `command` on the session over the garden read now, in the queue, and keeps what it answers. */
  const onSession = async (
    storage: FileStorage,
    call: Call,
    command: Parameters<Live['run']>[4],
  ) => {
    const ran = await live.run(storage, call, listening(), minutes, command);
    session = Option.some(ran.view);
    ground = Option.some(ran.ground);
    follow();
  };

  const queued = <A>(run: () => Promise<A>) => oneAtATime(queue, run);

  const todayOpen: Source<readonly [string, string, string, string, string, number, number]> = (
    [route, slug, cue, chosenMinutes, chosenVoice, now, seed],
    _store,
    storage,
  ) =>
    queued(async () => {
      const call = { now, seed };
      voice = voiceOf(chosenVoice);
      const chose = minutesOf(chosenMinutes);
      const arrival = `${route}|${slug}`;
      const arriving = arrival !== arrived;
      arrived = arrival;
      const runs = route === 'today' || route === 'start' || route === 'home';
      if (mode === 'run' && !runs && !listening()) {
        state = step(state, { _tag: 'leave' });
        await onSession(storage, call, (each) => each.next);
      }
      const changed = Option.exists(session, (each) => each.minutes !== chose);
      minutes = chose;
      if (changed) await onSession(storage, call, (each) => each.choose(chose));
      if (route === 'cued') {
        if (mode !== 'cued' && !listening()) state = initial(cuedPassage());
        mode = 'cued';
        state = step(state, { _tag: 'cue', cue: cueOf(cue), cap: SHOWN_ALL_CAP });
        return screen();
      }
      if (!runs) {
        mode = 'away';
        return screen();
      }
      mode = 'run';
      await onSession(storage, call, (each) => each.begin);
      const verse = referenceOfSlug(slug);
      if (route === 'start' && arriving && Option.isSome(verse))
        await onSession(storage, call, (each) => each.start(verse.value));
      return screen();
    });

  const todaySay: Source<readonly [string, number, number]> = (
    [recognition, at, seed],
    _store,
    storage,
  ) =>
    queued(async () => {
      const startedAt = whole(at);
      const before = state;
      state = step(state, { _tag: 'say', recognition, at: startedAt, offset: zoneAt(startedAt) });
      const item = Option.flatMap(
        Option.filter(shown(), () => mode === 'run' && state !== before),
        (each) => each.item,
      );
      if (Option.isSome(item))
        await onSession(storage, { now: startedAt, seed }, (each) => each.hold(item.value));
      return screen();
    });

  const todayNext: Source<readonly [number, number, number]> = (
    [offset, now, seed],
    store,
    storage,
  ) =>
    queued(async () => {
      const pending = pendingOf(state);
      if (Option.isNone(pending)) return screen();
      state = step(state, { _tag: 'next' });
      if (mode !== 'run') return screen();
      const { reference, recall, help } = pending.value;
      const { reference: _recalled, ...kept } = recall;
      await garden.gardenRecall(
        [
          reference,
          { ...kept, offset: Option.getOrElse(Option.fromNullishOr(kept.offset), () => 0) },
          Option.match(help, {
            onNone: () => ({ peeked: [], shownAt: Option.getOrNull(Option.none()), cap: 4 }),
            onSome: (taken) => ({
              peeked: [...taken.peeked],
              shownAt: taken.shownAt,
              cap: taken.cap,
            }),
          }),
          now,
          offset,
          seed,
        ],
        store,
        storage,
      );
      recorded += 1;
      await onSession(storage, { now, seed }, (each) => each.next);
      return screen();
    });

  /** The garden's plant (a range, a range's verses joined by `gardenJoin`, or a shelf's list by `addPlant`) and remove, and the session's plan made again after one that landed. */
  const gardenPlant: GardenCalls['gardenPlant'] = (args, store, storage) =>
    queued(async () => {
      const changed = await garden.gardenPlant(args, store, storage);
      if (changed.answer === 'Planted')
        await onSession(storage, { now: args[4], seed: args[6] }, (each) => each.remake);
      return changed;
    });
  const gardenJoin: GardenCalls['gardenJoin'] = (args, store, storage) =>
    queued(async () => {
      const changed = await garden.gardenJoin(args, store, storage);
      if (changed.answer === 'Planted')
        await onSession(storage, { now: args[4], seed: args[6] }, (each) => each.remake);
      return changed;
    });
  const addPlant: GardenCalls['addPlant'] = (args, store, storage) =>
    queued(async () => {
      const changed = await garden.addPlant(args, store, storage);
      if (changed.answer === 'Planted')
        await onSession(storage, { now: args[1], seed: args[3] }, (each) => each.remake);
      return changed;
    });
  const gardenRemove: GardenCalls['gardenRemove'] = (args, store, storage) =>
    queued(async () => {
      const changed = await garden.gardenRemove(args, store, storage);
      if (changed.answer === 'Removed')
        await onSession(storage, { now: args[1], seed: args[3] }, (each) => each.remake);
      return changed;
    });

  return {
    todayBoot: (() => screen()) satisfies Source<readonly []>,
    todayOpen,
    todayHear: (([utterance]) => {
      if (!screen().canHear) return screen();
      return apply({ _tag: 'hear', utterance });
    }) satisfies Source<readonly [string]>,
    todayVoice: (([utterance, charIndex, charLength]) =>
      apply({ _tag: 'voice', utterance, charIndex, charLength })) satisfies Source<
      readonly [string, number, number]
    >,
    todayVoiceEnded: (([utterance, outcome]) =>
      apply({ _tag: 'voiceEnded', utterance, outcome: outcomeOf(outcome) })) satisfies Source<
      readonly [string, string]
    >,
    todayStop: (() => apply({ _tag: 'stop' })) satisfies Source<readonly []>,
    todayDown: (([pointer, x, y]) =>
      apply({
        _tag: 'contact',
        contact: { _tag: 'down', pointer, at: { x, y } },
      })) satisfies Source<readonly [number, number, number]>,
    todayHoldNow: (([key, frames]) =>
      apply({ _tag: 'contact', contact: { _tag: 'elapsed', key, frames } })) satisfies Source<
      readonly [number, readonly Frame[]]
    >,
    todayMove: (([pointer, x, y, frames]) =>
      apply({
        _tag: 'contact',
        contact: { _tag: 'move', pointer, at: { x, y }, frames },
      })) satisfies Source<readonly [number, number, number, readonly Frame[]]>,
    todayUp: (([pointer, x, y]) =>
      apply({ _tag: 'contact', contact: { _tag: 'up', pointer, at: { x, y } } })) satisfies Source<
      readonly [number, number, number]
    >,
    todaySought: (([utterance]) => apply({ _tag: 'sought', utterance })) satisfies Source<
      readonly [string]
    >,
    todaySay,
    todayHeard: (([recognition, transcript, final]) =>
      apply({ _tag: 'heard', recognition, transcript, final })) satisfies Source<
      readonly [string, string, boolean]
    >,
    todayFinish: (() => apply({ _tag: 'finish' })) satisfies Source<readonly []>,
    todayDenied: (() => apply({ _tag: 'denied' })) satisfies Source<readonly []>,
    todayPeek: (([index]) => apply({ _tag: 'peek', index })) satisfies Source<readonly [number]>,
    todayPeekEnded: (([index]) => apply({ _tag: 'peekEnded', index })) satisfies Source<
      readonly [number]
    >,
    todayShowAll: (([at]) => apply({ _tag: 'showAll', at: whole(at) })) satisfies Source<
      readonly [number]
    >,
    todayGrade: (([grade]) => apply({ _tag: 'grade', grade })) satisfies Source<readonly [number]>,
    todayNext,
    todayAgain: (() => apply({ _tag: 'again' })) satisfies Source<readonly []>,
    gardenPlant,
    gardenJoin,
    addPlant,
    gardenRemove,
  };
};
