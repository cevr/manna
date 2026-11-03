/**
 * Acceptance (countin A2): the count-in and the intro start, Sound off and
 * Sound on, over the score clock over a fake device on the TestClock.
 *
 * - Sound off, `Intro` on: Play from the start holds the place at the first
 *   sung line (`first`) through one bar of the meter's beat at the hymn's
 *   tempo: the player's `countIn` atom gives `Some({ index: k, of: beats })`
 *   at the play's time plus `k × beatMs / rate` (none early, none skipped),
 *   then `None` at `beats × beatMs / rate`; through it the player is Playing
 *   at `first` and the place stands; then it runs from `first` at the rate.
 *   The device is asked for nothing. Over the lowest hymn of each meter the
 *   bundle carries, and hymn 78 with stanza 3 chosen, at 50, 100 and 150 %.
 * - Sound off, `Intro` off, and the defaults (no `intro` atom): no beat, the
 *   place runs from `first` at once, as on base.
 * - Sound on: `Intro` on plays the recording from 0; off plays it from the
 *   first sung line, of the chosen stanzas when a choice is held (hymn 78,
 *   stanza 3: line 16's recording start), with no seek and no beat.
 * - Each play carries `intro` and `countIn` as the atom stands at the play;
 *   with no atom it carries neither.
 * - During a count-in: Pause leaves it and keeps the place, Play counts in
 *   again from beat 0; a tempo change keeps the beat in progress's share and
 *   counts the rest at the new rate; an `Intro` change waits for the next
 *   play; a Sound switch on leaves it and plays the device at `first`; a seek
 *   leaves it and moves the place. A play that does not start at the start
 *   (a resume mid-hymn, a seek then Play) has no count-in.
 *
 * The test's own oracle counts the beat from the meter (simple meters the
 * denominator's note, compound ones over three the dotted note), apart from
 * `tempo.ts` and `countin.ts`. Numbers only: hymns by number, lines by index,
 * times in ms; no hymn's words are read into a message.
 *
 * Final path: `apps/hymnal/src/player/countin.play.test.ts`.
 */

import {
  Array as Arr,
  Clock,
  Effect,
  Layer,
  Match,
  Option,
  References,
  Stream,
  SubscriptionRef,
} from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import * as Atom from 'effect/reactivity/Atom';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import { TestClock } from 'effect/testing';
import bundled from 'virtual:hymnal-timing';

import { still } from '~/hymns/chords';

import { type FirstTempo, type Timeline, timingBook } from '../follow/timeline';
import { hymns } from '../hymns/hymns';
import {
  Command,
  Playback,
  type PlaybackApi,
  type PlayOptions,
  Player,
  playerOn,
  type Status,
  statusEvery,
} from './player';
import { soundOn } from './sound';
import { keptOf } from './stanzas';

const book = timingBook(bundled);

/** One poll of the player (`statusEvery`), ms. */
const POLL = 250;
/** How far a beat or a held place may stray from the oracle's, ms. */
const EXACT = 1;
/** The dial's tempos the count-in is checked at, percent. */
const TEMPOS: ReadonlyArray<number> = [50, 100, 150];
/** A hymn in 4/4 with a long lead: four beats of 1090.909 ms, `first` 25089 ms. */
const LONG = 116;
/** A four-stanza hymn with its refrain after each stanza (stanzas A2). */
const CHOICES = 78;
/** Stanza 3 of hymn 78 is sung on lines 16 to 23 (stanzas A2's oracle). */
const STANZA_3 = [3];
const STANZA_3_FIRST = 16;
/** The fake recording runs this far past the timeline's end, ms. */
const TAIL = 1500;

const timelineAt = (number: number): Timeline => Option.getOrThrow(book.of(number));
const trackOf = (number: number) => ({ number, title: `Hymn ${number}` });

/** The lowest hymn of each meter at plan time (spec, Acceptance). */
const LOWEST_PER_METER = {
  '3/4': 1,
  '4/4': 2,
  '6/8': 33,
  '9/4': 44,
  '3/2': 46,
  '2/4': 49,
  '6/4': 69,
  '2/2': 96,
  '1/2': 131,
  '9/8': 343,
  '4/2': 357,
  '12/8': 373,
  '3/8': 478,
  '4/8': 532,
} satisfies Readonly<Record<string, number>>;

const meterOf = (tempo: FirstTempo) => `${tempo.numerator}/${tempo.denominator}`;

/** The lowest hymn of each meter the bundle carries, by meter. */
const lowestPerMeter = (): Readonly<Record<string, number>> => {
  const lowest = new Map<string, number>();
  for (const [number] of bundled) {
    const meter = meterOf(timelineAt(number).tempo);
    lowest.set(meter, Math.min(number, lowest.get(meter) ?? Number.POSITIVE_INFINITY));
  }
  return Object.fromEntries(lowest);
};

/** A count-in as the oracle counts it: how many beats, and one beat's length in hymn ms. */
interface Counted {
  readonly beats: number;
  readonly beatMs: number;
}

/**
 * The oracle's beat in quarter notes: a meter of more than three to the bar
 * in a multiple of three, over a half note or shorter, beats the dotted note
 * worth three of its denominator's; every other meter beats the denominator's.
 */
const quartersOf = (tempo: FirstTempo) => {
  const compound = tempo.numerator > 3 && tempo.numerator % 3 === 0 && tempo.denominator >= 2;
  if (compound) return 12 / tempo.denominator;
  return 4 / tempo.denominator;
};

/** One bar of the meter's beat at the hymn's first tempo. */
const countedOf = (tempo: FirstTempo): Counted => {
  const quarters = quartersOf(tempo);
  return {
    beats: (tempo.numerator * (4 / tempo.denominator)) / quarters,
    beatMs: (quarters * tempo.microsPerQuarter) / 1000,
  };
};

/** The host ms after the play that count `k` comes at `rate`; `k = beats` is the first sung line. */
const countAt = (counted: Counted, rate: number, k: number) => (k * counted.beatMs) / rate;

/** A beat as the test reads it: `index/of`, or `none`. */
const keyOf = (beat: Option.Option<{ readonly index: number; readonly of: number }>) =>
  Option.match(beat, {
    onNone: () => 'none',
    onSome: ({ index, of }) => `${index}/${of}`,
  });

/** The keys a count-in of `beats` gives, in order: each beat, then `none`. */
const countKeys = (beats: number) => [
  ...Array.from({ length: beats }, (_, k) => `${k}/${beats}`),
  'none',
];

/** The place a player shows, ms, rounded; `none` when it shows none. */
const placeOf = (player: Player) =>
  Player.$match(player, {
    Playing: ({ at }) => `Playing@${Math.round(at * 1000)}`,
    Paused: ({ at }) => `Paused@${Math.round(at * 1000)}`,
    Buffering: ({ at }) => `Buffering@${Math.round(at * 1000)}`,
    Loading: () => 'Loading',
    Idle: () => 'Idle',
    Ended: () => 'Ended',
    Stopped: () => 'Stopped',
    Failed: () => 'Failed',
  });

/** The place in ms a Playing player shows, else NaN. */
const playingAt = (player: Player) =>
  Option.liftPredicate(player, Player.$is('Playing')).pipe(
    Option.map((playing) => playing.at * 1000),
    Option.getOrElse(() => Number.NaN),
  );

/** One play the device was asked for: from where, at what host time, and the options it carried. */
interface Asked {
  readonly fromMs: number;
  readonly now: number;
  readonly options: Option.Option<PlayOptions>;
}

/**
 * A device holding a recording `length` ms long that plays at 1000 ms a
 * second, and what it was asked: each play with its options, each seek and
 * resume, and each piece of the recording it sounded (`heard`).
 */
const recorded = (length: number) => {
  const asked = {
    plays: new Array<Asked>(),
    seeks: new Array<{ readonly from: number; readonly to: number; readonly now: number }>(),
    resumes: new Array<number>(),
    heard: new Array<readonly [number, number]>(),
  };
  let state: Status['state'] = 'idle';
  let at = 0;
  let since = 0;
  const read = Effect.map(Clock.currentTimeMillis, (now): Status => {
    if (state === 'playing') {
      const to = Math.min(length, at + (now - since));
      if (to > at) asked.heard.push([at, to]);
      at = to;
    }
    since = now;
    if (state === 'playing' && at >= length) state = 'ended';
    return { state, positionMs: at, durationMs: length };
  });
  const then = (change: () => void) =>
    Effect.flatMap(read, () => {
      change();
      return read;
    });
  const device: PlaybackApi = {
    play: (_uri, fromMs, options) =>
      then(() => {
        asked.plays.push({ fromMs, now: since, options: Option.fromUndefinedOr(options) });
        at = fromMs;
        state = 'playing';
      }),
    pause: then(() => {
      state = 'paused';
    }),
    resume: then(() => {
      asked.resumes.push(since);
      if (state === 'ended') at = 0;
      state = 'playing';
    }),
    seek: (ms) =>
      then(() => {
        asked.seeks.push({ from: at, to: ms, now: since });
        at = ms;
      }),
    status: read,
    setRate: () => Effect.void,
    stop: Effect.asVoid(
      then(() => {
        state = 'idle';
      }),
    ),
    connection: Stream.make(true),
    announce: () => Effect.void,
    remote: Stream.empty,
  };
  return { device, asked };
};

/** The lines of a hymn's timeline a choice keeps, as `LivePlayer.tsx` gives them. */
const keptFor = (number: number, stanzas: ReadonlyArray<number>): ReadonlyArray<boolean> =>
  Arr.findFirst(hymns, (it) => it.number === number).pipe(
    Option.map((it) => keptOf(it.sections, stanzas)),
    Option.getOrElse(() => []),
  );

/** Every hymn as printed: no transpose, no capo. */
const printed = Atom.make(still);

/** Let the player's fibers run what the clock's last move woke. */
const settle = Effect.forEach(Array.from({ length: 20 }), () => Effect.yieldNow, {
  discard: true,
});

/** What the app is built with: Sound, the `intro` atom (none: the defaults), hymn 78's choice. */
interface Built {
  readonly on: boolean;
  readonly intro: Option.Option<boolean>;
  readonly chosen?: ReadonlyArray<number>;
  /** Over the score clock (`soundOn`), or straight over the fake device. */
  readonly scored?: boolean;
  readonly length?: number;
}

/** A read of the player at a host time: its place and its beat. */
interface Read {
  readonly now: number;
  readonly player: Player;
  readonly beat: string;
}

/**
 * The app's player as `LivePlayer.tsx` builds it, over the score clock over
 * the fake device, with each hymn's tempo in its own atom, hymn 78's stanza
 * choice held in `choice` (every other hymn's is all), and the `intro` atom
 * as `built` gives it. Every value the `countIn` atom takes is kept, in order.
 */
const composed = (built: Built) =>
  Effect.gen(function* () {
    const clock = yield* TestClock.testClockWith(Effect.succeed);
    const clockLayer = Layer.succeed(Clock.Clock, clock);
    const fake = recorded(built.length ?? 600_000);
    const sound = yield* SubscriptionRef.make(built.on);
    const choice = Atom.make<ReadonlyArray<number>>(built.chosen ?? []).pipe(Atom.keepAlive);
    const every = Atom.make<ReadonlyArray<number>>([]).pipe(Atom.keepAlive);
    const intro = Atom.make(Option.getOrElse(built.intro, () => true)).pipe(Atom.keepAlive);
    const tempoFor = Atom.family((_number: number) => Atom.make(100).pipe(Atom.keepAlive));
    const playback = Match.value(built.scored ?? true).pipe(
      Match.when(true, () =>
        soundOn(Layer.succeed(Playback, fake.device), book.of, sound, keptFor).pipe(
          Layer.provide(clockLayer),
        ),
      ),
      Match.orElse(() => Layer.succeed(Playback, fake.device)),
    );
    const layer = Layer.mergeAll(
      playback,
      clockLayer,
      Layer.succeed(References.MinimumLogLevel, 'None'),
    );
    const stanzasFor = (number: number) =>
      Match.value(number).pipe(
        Match.when(CHOICES, () => choice),
        Match.orElse(() => every),
      );
    const player = Option.match(built.intro, {
      onNone: () => playerOn(layer, statusEvery, () => printed, tempoFor, stanzasFor),
      onSome: () => playerOn(layer, statusEvery, () => printed, tempoFor, stanzasFor, intro),
    });
    const registry = AtomRegistry.make();
    registry.mount(player.send);
    registry.mount(player.remote);
    for (const key of Object.values(player)) if (Atom.isAtom(key)) registry.mount<unknown>(key);
    const state = () => registry.get(player.state);
    const counting = Option.filter(Option.some(player.countIn), (it) => Atom.isAtom(it));
    const beatNow = () =>
      Option.match(counting, {
        onNone: () => 'none',
        onSome: (atom) => keyOf(registry.get(atom)),
      });
    /** Each value the `countIn` atom took, with the host's time, from its first read. */
    const beats = new Array<{ readonly now: number; readonly beat: string }>();
    beats.push({ now: clock.currentTimeMillisUnsafe(), beat: beatNow() });
    Option.map(counting, (atom) =>
      registry.subscribe(atom, (beat) => {
        beats.push({ now: clock.currentTimeMillisUnsafe(), beat: keyOf(beat) });
      }),
    );
    const read = Effect.map(Clock.currentTimeMillis, (now): Read => ({
      now,
      player: state(),
      beat: beatNow(),
    }));
    return {
      asked: fake.asked,
      beats,
      /**
       * The distinct beats the atom stood at from the mark `from` (`beats.length` then) on, in
       * order: the one it stood at then, and each it took after.
       */
      beatsFrom: (from: number) =>
        Arr.dedupeAdjacent(beats.slice(Math.max(0, from - 1)).map((it) => it.beat)),
      state,
      beatNow,
      /** Set a hymn's tempo, as the sheet's dial does, and let the player take it. */
      tempo: (number: number, tempo: number) =>
        Effect.andThen(
          Effect.sync(() => registry.set(tempoFor(number), tempo)),
          settle,
        ),
      /** Set the `Intro` switch and let the player take it. */
      setIntro: (to: boolean) =>
        Effect.andThen(
          Effect.sync(() => registry.set(intro, to)),
          settle,
        ),
      /** Send a command and let the player take it; the host's time it was taken at. */
      send: (command: Command) =>
        Effect.andThen(
          Effect.sync(() => registry.set(player.send, command)),
          Effect.andThen(settle, Clock.currentTimeMillis),
        ),
      /** Switch Sound and let the score clock hand the place over; the host's time it was switched at. */
      switchSound: (to: boolean) =>
        Effect.andThen(
          SubscriptionRef.set(sound, to),
          Effect.andThen(settle, Clock.currentTimeMillis),
        ),
      /** Move the clock on to the host's time `now` and read the player there. */
      at: (now: number) => Effect.andThen(Effect.andThen(clock.setTime(now), settle), read),
      /** Move the clock on `ms` a poll at a time, reading the player after each. */
      walk: (ms: number) =>
        Effect.gen(function* () {
          const reads = new Array<Read>();
          for (let t = 0; t < ms; t += POLL) {
            yield* TestClock.adjust(POLL);
            yield* settle;
            reads.push(yield* read);
          }
          return reads;
        }),
      [Symbol.dispose]: () => registry.dispose(),
    };
  });

type App = Effect.Success<ReturnType<typeof composed>>;

/**
 * The places shown in `reads` that stray from a place running at `rate` from
 * `from` at the host's time `since`: ahead of it by more than `EXACT`, or
 * behind it by more than one poll's run.
 */
const straysOf = (
  reads: ReadonlyArray<Read>,
  from: number,
  since: number,
  rate: number,
): ReadonlyArray<string> =>
  reads.flatMap(({ now, player }) => {
    const at = playingAt(player);
    const expected = from + Math.max(0, now - since) * rate;
    if (at <= expected + EXACT && at >= expected - POLL * rate - EXACT) return [];
    return [`${now}: ${placeOf(player)}, expected ${Math.round(expected)}`];
  });

/**
 * A count-in from the play at host time `t0`: the reads one ms before and
 * after each count, the hold's places, and the run's places after it.
 */
const countIn = (app: App, hymn: number, rate: number, t0: number) =>
  Effect.gen(function* () {
    const { first, tempo } = timelineAt(hymn);
    const counted = countedOf(tempo);
    const at0 = yield* app.at(t0);
    const reads = [at0];
    const around = new Array<string>();
    around.push(at0.beat);
    for (let k = 1; k <= counted.beats; k++) {
      const before = yield* app.at(t0 + countAt(counted, rate, k) - EXACT);
      const after = yield* app.at(t0 + countAt(counted, rate, k) + EXACT);
      reads.push(before, after);
      around.push(before.beat, after.beat);
    }
    const end = t0 + countAt(counted, rate, counted.beats);
    const held = reads
      .filter((it) => it.now < end && (it.now >= t0 + POLL || !Player.$is('Loading')(it.player)))
      .flatMap((it) => {
        const shown = placeOf(it.player);
        if (shown === `Playing@${Math.round(first)}`) return [];
        return [`${Math.round(it.now - t0)}: ${shown}`];
      });
    const run = [
      yield* app.at(end + 2 * POLL + EXACT),
      yield* app.at(end + 4 * POLL + EXACT),
      yield* app.at(end + 8 * POLL + EXACT),
    ];
    return {
      counted,
      around,
      held,
      ran: straysOf(run, first, end, rate),
    };
  });

/** The keys `countIn` reads one ms before and after each count: beat k−1 then k, `none` last. */
const aroundOf = (beats: number) => [
  `0/${beats}`,
  ...Array.from({ length: beats }, (_, j) => {
    const k = j + 1;
    if (k === beats) return [`${k - 1}/${beats}`, 'none'];
    return [`${k - 1}/${beats}`, `${k}/${beats}`];
  }).flat(),
];

describe('the oracle', () => {
  it.effect(
    'finds the lowest hymn of each of the 14 meters, and counts hymns 78, 116, 33, 131',
    () =>
      Effect.sync(() => {
        expect(lowestPerMeter()).toEqual(LOWEST_PER_METER);
        expect(countedOf(timelineAt(CHOICES).tempo)).toEqual({ beats: 3, beatMs: 1000 });
        const long = countedOf(timelineAt(LONG).tempo);
        expect(long.beats).toBe(4);
        expect(Math.abs(long.beatMs - 1090.909)).toBeLessThan(0.001);
        expect(countedOf(timelineAt(33).tempo).beats).toBe(2);
        expect(countedOf(timelineAt(131).tempo).beats).toBe(1);
        expect(timelineAt(CHOICES).lines).toHaveLength(32);
        const lines = keptFor(CHOICES, STANZA_3).map((kept, line) => ({ kept, line }));
        expect(lines.filter((it) => it.kept).map((it) => it.line)).toEqual(
          Array.from({ length: 8 }, (_, k) => STANZA_3_FIRST + k),
        );
      }),
  );
});

describe('Sound off, Intro on', () => {
  it.effect(
    'counts in one bar at the tempo on the lowest hymn of each meter and on hymn 78 with stanza 3, holds the place at the first sung line, then runs; the device is asked for nothing',
    () =>
      Effect.gen(function* () {
        using app = yield* composed({ on: false, intro: Option.some(true), chosen: STANZA_3 });
        const chosen = [...Object.values(LOWEST_PER_METER), CHOICES];
        const seen = new Array<object>();
        const wanted = new Array<object>();
        for (const tempo of TEMPOS)
          for (const hymn of chosen) {
            yield* app.tempo(hymn, tempo);
            const from = app.beats.length;
            const t0 = yield* app.send(Command.Start({ track: trackOf(hymn) }));
            const counted = yield* countIn(app, hymn, tempo / 100, t0);
            seen.push({
              hymn,
              tempo,
              beats: app.beatsFrom(from),
              around: counted.around,
              held: counted.held,
              ran: counted.ran,
            });
            wanted.push({
              hymn,
              tempo,
              beats: ['none', ...countKeys(counted.counted.beats)],
              around: aroundOf(counted.counted.beats),
              held: [],
              ran: [],
            });
          }
        expect(seen).toEqual(wanted);
        expect(app.asked.plays).toEqual([]);
        expect(app.asked.seeks).toEqual([]);
        expect(app.asked.heard).toEqual([]);
      }),
  );
});

describe('Sound off, no count-in', () => {
  const runsAtOnce = (built: Built) =>
    Effect.gen(function* () {
      using app = yield* composed(built);
      const { first } = timelineAt(LONG);
      const from = app.beats.length;
      const t0 = yield* app.send(Command.Start({ track: trackOf(LONG) }));
      const reads = yield* app.walk(8 * POLL);
      expect(reads.filter((it) => it.beat !== 'none')).toEqual([]);
      expect(app.beatsFrom(from)).toEqual(['none']);
      expect(straysOf(reads, first, t0, 1)).toEqual([]);
      expect(reads.filter((it) => Player.$is('Playing')(it.player))).toHaveLength(reads.length);
      expect(app.asked.plays).toEqual([]);
    });

  it.effect(
    'with Intro off, no beat comes and the place runs from the first sung line at once',
    () => runsAtOnce({ on: false, intro: Option.some(false) }),
  );

  it.effect('with no intro atom (the defaults), the same', () =>
    runsAtOnce({ on: false, intro: Option.none() }),
  );
});

describe('Sound on', () => {
  const playsFrom = (built: Built, hymn: number, fromMs: number) =>
    Effect.gen(function* () {
      const timeline = timelineAt(hymn);
      using app = yield* composed({ ...built, length: timeline.end + TAIL });
      const from = app.beats.length;
      yield* app.send(Command.Start({ track: trackOf(hymn) }));
      const reads = yield* app.walk(2000);
      expect(app.asked.plays.map((it) => it.fromMs)).toEqual([fromMs]);
      expect(app.asked.seeks).toEqual([]);
      expect(app.beatsFrom(from)).toEqual(['none']);
      expect(reads.filter((it) => it.beat !== 'none')).toEqual([]);
      return app;
    });

  it.effect('with Intro on, the device plays the recording from 0', () =>
    Effect.asVoid(playsFrom({ on: true, intro: Option.some(true) }, LONG, 0)),
  );

  it.effect('with no intro atom (the defaults), the device plays the recording from 0', () =>
    Effect.asVoid(playsFrom({ on: true, intro: Option.none() }, LONG, 0)),
  );

  it.effect('with Intro off, the device plays from the first sung line', () =>
    Effect.asVoid(playsFrom({ on: true, intro: Option.some(false) }, LONG, timelineAt(LONG).first)),
  );

  it.effect(
    'with Intro off and stanza 3 chosen, the device plays from stanza 3’s first line, and nothing before it sounds',
    () =>
      Effect.gen(function* () {
        const start = timelineAt(CHOICES).lines[STANZA_3_FIRST]?.start ?? Number.NaN;
        const app = yield* playsFrom(
          { on: true, intro: Option.some(false), chosen: STANZA_3 },
          CHOICES,
          start,
        );
        const before = app.asked.heard.filter(([from]) => from < start);
        expect(before).toEqual([]);
      }),
  );
});

describe('each play carries the Intro switch as it stands at the play', () => {
  it.effect(
    'intro and countIn both as the atom stands; a change mid-play asks nothing until the next play',
    () =>
      Effect.gen(function* () {
        using app = yield* composed({ on: true, intro: Option.some(true), scored: false });
        yield* app.send(Command.Start({ track: trackOf(LONG) }));
        yield* app.walk(POLL);
        yield* app.setIntro(false);
        yield* app.walk(2 * POLL);
        expect(app.asked.plays).toHaveLength(1);
        yield* app.send(Command.Start({ track: trackOf(LONG) }));
        expect(app.asked.plays).toHaveLength(2);
        expect(Option.getOrThrow(app.asked.plays[0]?.options ?? Option.none())).toMatchObject({
          intro: true,
          countIn: true,
        });
        expect(Option.getOrThrow(app.asked.plays[1]?.options ?? Option.none())).toMatchObject({
          intro: false,
          countIn: false,
        });
      }),
  );

  it.effect('with no intro atom, a play carries neither field', () =>
    Effect.gen(function* () {
      using app = yield* composed({ on: true, intro: Option.none(), scored: false });
      yield* app.send(Command.Start({ track: trackOf(LONG) }));
      expect(app.asked.plays).toHaveLength(1);
      const keys = Option.match(app.asked.plays[0]?.options ?? Option.none(), {
        onNone: () => [],
        onSome: (options) => Object.keys(options),
      });
      expect(keys.filter((key) => key === 'intro' || key === 'countIn')).toEqual([]);
    }),
  );
});

describe('during a count-in (hymn 116, Sound off, Intro on)', () => {
  const { first, tempo } = timelineAt(LONG);
  const counted = countedOf(tempo);
  /** Start hymn 116 at 100 % and stand halfway through beat 1; the play's host time. */
  const midBeat1 = (app: App) =>
    Effect.gen(function* () {
      const t0 = yield* app.send(Command.Start({ track: trackOf(LONG) }));
      const read = yield* app.at(t0 + 1.5 * counted.beatMs);
      expect(read.beat).toBe(`1/${counted.beats}`);
      return t0;
    });

  it.effect('Pause leaves it and keeps the place; Play counts in again from beat 0', () =>
    Effect.gen(function* () {
      using app = yield* composed({ on: false, intro: Option.some(true) });
      yield* midBeat1(app);
      yield* app.send(Command.Pause());
      expect(app.beatNow()).toBe('none');
      const paused = yield* app.walk(8 * POLL);
      expect(paused.map((it) => `${placeOf(it.player)} ${it.beat}`)).toEqual(
        paused.map(() => `Paused@${Math.round(first)} none`),
      );
      const from = app.beats.length;
      const t1 = yield* app.send(Command.Resume());
      const again = yield* countIn(app, LONG, 1, t1);
      expect(app.beatsFrom(from)).toEqual(['none', ...countKeys(counted.beats)]);
      expect(again.around).toEqual(aroundOf(counted.beats));
      expect(again.held).toEqual([]);
      expect(again.ran).toEqual([]);
      expect(app.asked.plays).toEqual([]);
    }),
  );

  it.effect(
    'a tempo change keeps the beat in progress’s share and counts the later beats at the new rate',
    () =>
      Effect.gen(function* () {
        using app = yield* composed({ on: false, intro: Option.some(true) });
        const t0 = yield* midBeat1(app);
        const changed = t0 + 1.5 * counted.beatMs;
        yield* app.tempo(LONG, 150);
        const from = app.beats.length;
        const at = (k: number) => changed + ((k - 1.5) * counted.beatMs) / 1.5;
        const around = new Array<string>();
        for (let k = 2; k <= counted.beats; k++) {
          around.push((yield* app.at(at(k) - EXACT)).beat, (yield* app.at(at(k) + EXACT)).beat);
        }
        expect(around).toEqual(aroundOf(counted.beats).slice(3));
        expect(app.beatsFrom(from)).toEqual(countKeys(counted.beats).slice(1));
        const run = [yield* app.at(at(counted.beats) + 4 * POLL + EXACT)];
        expect(straysOf(run, first, at(counted.beats), 1.5)).toEqual([]);
      }),
  );

  it.effect('an Intro change waits for the next play: the count-in goes on', () =>
    Effect.gen(function* () {
      using app = yield* composed({ on: false, intro: Option.some(true) });
      const t0 = yield* midBeat1(app);
      yield* app.setIntro(false);
      const around = new Array<string>();
      for (let k = 2; k <= counted.beats; k++) {
        const due = t0 + countAt(counted, 1, k);
        around.push((yield* app.at(due - EXACT)).beat, (yield* app.at(due + EXACT)).beat);
      }
      expect(around).toEqual(aroundOf(counted.beats).slice(3));
    }),
  );

  it.effect('a Sound switch on leaves it and plays the device once at the first sung line', () =>
    Effect.gen(function* () {
      using app = yield* composed({ on: false, intro: Option.some(true) });
      yield* midBeat1(app);
      yield* app.switchSound(true);
      expect(app.beatNow()).toBe('none');
      const reads = yield* app.walk(8 * POLL);
      expect(reads.filter((it) => it.beat !== 'none')).toEqual([]);
      expect(app.asked.plays).toHaveLength(1);
      expect(Math.abs((app.asked.plays[0]?.fromMs ?? Number.NaN) - first)).toBeLessThanOrEqual(
        EXACT,
      );
      expect(app.asked.seeks).toEqual([]);
    }),
  );

  it.effect('a seek leaves it and moves the place there, with no count-in', () =>
    Effect.gen(function* () {
      using app = yield* composed({ on: false, intro: Option.some(true) });
      yield* midBeat1(app);
      const line = timelineAt(LONG).lines[2];
      const to = ((line?.start ?? 0) + (line?.until ?? 0)) / 2;
      const sought = yield* app.send(Command.Seek({ seconds: to / 1000 }));
      expect(app.beatNow()).toBe('none');
      const reads = yield* app.walk(8 * POLL);
      expect(reads.filter((it) => it.beat !== 'none')).toEqual([]);
      expect(straysOf(reads, to, sought, 1)).toEqual([]);
    }),
  );
});

describe('a play that does not start at the start (hymn 116, Sound off, Intro on)', () => {
  it.effect('a resume mid-hymn, and a seek then Play, have no count-in', () =>
    Effect.gen(function* () {
      using app = yield* composed({ on: false, intro: Option.some(true) });
      const { first, tempo } = timelineAt(LONG);
      const counted = countedOf(tempo);
      const t0 = yield* app.send(Command.Start({ track: trackOf(LONG) }));
      const end = t0 + countAt(counted, 1, counted.beats);
      yield* app.at(end + 2000);
      yield* app.send(Command.Pause());
      const from = app.beats.length;
      const resumed = yield* app.send(Command.Resume());
      const playing = yield* app.walk(4 * POLL);
      expect(app.beatsFrom(from)).toEqual(['none']);
      expect(straysOf(playing, first + 2000, resumed, 1)).toEqual([]);
      yield* app.send(Command.Pause());
      const to = first + 10_000;
      yield* app.send(Command.Seek({ seconds: to / 1000 }));
      const played = yield* app.send(Command.Resume());
      const after = yield* app.walk(4 * POLL);
      expect(app.beatsFrom(from)).toEqual(['none']);
      expect(after.filter((it) => it.beat !== 'none')).toEqual([]);
      expect(straysOf(after, to, played, 1)).toEqual([]);
    }),
  );
});
