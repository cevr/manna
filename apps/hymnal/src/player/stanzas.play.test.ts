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

import { timingBook } from '../follow/timeline';
import { hymns } from '../hymns/hymns';
import {
  Command,
  Playback,
  type PlaybackApi,
  Player,
  playerOn,
  type Status,
  statusEvery,
} from './player';
import { soundOn } from './sound';

const book = timingBook(bundled);

const POLL = 250;
const NEAR = 25;
const HYMN = 78;
const CHOSEN: ReadonlyArray<number> = [1, 3];
const TAIL = 1500;

const track = { number: HYMN, title: `Hymn ${HYMN}` };
const printed = Atom.make(still);
const asWritten = Atom.make(100);
const timeline = Option.getOrThrow(book.of(HYMN));
const LENGTH = timeline.end + TAIL;

const ownersOf = (number: number): ReadonlyArray<number> => {
  const sections = Arr.findFirst(hymns, (it) => it.number === number).pipe(
    Option.map((it) => it.sections),
    Option.getOrElse(() => []),
  );
  let owner = 0;
  return sections.flatMap((section) => {
    if (section.kind === 'stanza') owner = section.n;
    return section.lines.map(() => owner);
  });
};

const keptFor = (number: number, stanzas: ReadonlyArray<number>): ReadonlyArray<boolean> =>
  ownersOf(number).map((owner) => stanzas.length === 0 || owner === 0 || stanzas.includes(owner));

interface Kept {
  readonly line: number;
  readonly start: number;
  readonly until: number;
  readonly sung: number;
}

interface Skip {
  readonly from: number;
  readonly to: number;
}

interface Cut {
  readonly kept: ReadonlyArray<Kept>;
  readonly end: number;
  readonly skips: ReadonlyArray<Skip>;
}

const lengthOf = (kept: Kept) => kept.until - kept.start;

const cutBy = (stanzas: ReadonlyArray<number>): Cut => {
  const keeps = keptFor(HYMN, stanzas);
  const kept = new Array<Kept>();
  let sung = timeline.first;
  timeline.lines.forEach((line, index) => {
    if (keeps[index] !== true) return;
    kept.push({ line: index, start: line.start, until: line.until, sung });
    sung += line.until - line.start;
  });
  const nextStart = (index: number) =>
    Arr.findFirst(kept, (it) => it.line > index).pipe(
      Option.map((it) => it.start),
      Option.getOrElse(() => timeline.end),
    );
  const skips = timeline.lines.flatMap((line, index) => {
    if (keeps[index] === true || (index > 0 && keeps[index - 1] !== true)) return [];
    return [{ from: line.start, to: nextStart(index) }];
  });
  return { kept, end: sung, skips };
};

const recordingAt = (cut: Cut, sung: number) => {
  if (sung < timeline.first) return sung;
  if (sung >= cut.end) return timeline.end + (sung - cut.end);
  const span = Option.getOrThrow(Arr.findFirst(cut.kept, (it) => sung < it.sung + lengthOf(it)));
  return span.start + (sung - span.sung);
};

const sungAt = (cut: Cut, at: number) => {
  if (at < timeline.first) return at;
  if (at >= timeline.end) return cut.end + (at - timeline.end);
  return Arr.findFirst(cut.kept, (it) => at < it.until).pipe(
    Option.map((it) => it.sung + Math.max(0, at - it.start)),
    Option.getOrElse(() => cut.end),
  );
};

const lineAt = (cut: Cut, sung: number) =>
  Arr.findFirst(cut.kept, (it) => it.sung <= sung && sung < it.sung + lengthOf(it)).pipe(
    Option.map((it) => it.line),
  );

const middleOf = (cut: Cut, index: number) =>
  Option.getOrThrow(
    Arr.findFirst(cut.kept, (it) => it.line === index).pipe(
      Option.map((it) => it.sung + lengthOf(it) / 2),
    ),
  );

const recorded = () => {
  const asked = {
    plays: new Array<{ readonly fromMs: number; readonly now: number }>(),
    seeks: new Array<{ readonly from: number; readonly to: number; readonly now: number }>(),
    heard: new Array<readonly [number, number]>(),
  };
  let state: Status['state'] = 'idle';
  let at = 0;
  let since = 0;
  const read = Effect.map(Clock.currentTimeMillis, (now): Status => {
    if (state === 'playing') {
      const to = Math.min(LENGTH, at + (now - since));
      if (to > at) asked.heard.push([at, to]);
      at = to;
    }
    since = now;
    if (state === 'playing' && at >= LENGTH) state = 'ended';
    return { state, positionMs: at, durationMs: LENGTH };
  });
  const then = (change: () => void) =>
    Effect.flatMap(read, () => {
      change();
      return read;
    });
  const device: PlaybackApi = {
    play: (_uri, fromMs) =>
      then(() => {
        asked.plays.push({ fromMs, now: since });
        at = fromMs;
        state = 'playing';
      }),
    pause: then(() => {
      state = 'paused';
    }),
    resume: then(() => {
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

const settle = Effect.forEach(Array.from({ length: 10 }), () => Effect.yieldNow, {
  discard: true,
});

interface Sample {
  readonly now: number;
  readonly player: Player;
}

interface Shown {
  readonly now: number;
  readonly at: number;
  readonly length: number;
}

const shownIn = (samples: ReadonlyArray<Sample>): ReadonlyArray<Shown> =>
  samples.flatMap(({ now, player }) =>
    Option.toArray(
      Option.liftPredicate(player, Player.$is('Playing')).pipe(
        Option.map((playing) => ({
          now,
          at: playing.at * 1000,
          length: Option.getOrElse(
            Option.map(playing.length, (seconds) => seconds * 1000),
            () => Number.NaN,
          ),
        })),
      ),
    ),
  );

const driftOf = (shown: ReadonlyArray<Shown>, expected: (now: number) => number) =>
  Math.max(0, ...shown.map((it) => Math.abs(it.at - expected(it.now))));

const endedAt = (samples: ReadonlyArray<Sample>) =>
  Arr.findFirst(samples, (it) => Player.$is('Ended')(it.player)).pipe(
    Option.map((it) => it.now),
    Option.getOrElse(() => Number.POSITIVE_INFINITY),
  );

const heardOf = (heard: ReadonlyArray<readonly [number, number]>, from: number, to: number) =>
  heard.reduce((sum, [a, b]) => sum + Math.max(0, Math.min(to, b) - Math.max(from, a)), 0);

const composed = (chosen: ReadonlyArray<number>, on: boolean) =>
  Effect.gen(function* () {
    const clock = yield* TestClock.testClockWith(Effect.succeed);
    const clockLayer = Layer.succeed(Clock.Clock, clock);
    const fake = recorded();
    const sound = yield* SubscriptionRef.make(on);
    const choice = Atom.make<ReadonlyArray<number>>(chosen).pipe(Atom.keepAlive);
    const every = Atom.make<ReadonlyArray<number>>([]).pipe(Atom.keepAlive);
    const player = playerOn(
      Layer.mergeAll(
        soundOn(Layer.succeed(Playback, fake.device), book.of, sound, keptFor).pipe(
          Layer.provide(clockLayer),
        ),
        clockLayer,
        Layer.succeed(References.MinimumLogLevel, 'None'),
      ),
      statusEvery,
      () => printed,
      () => asWritten,
      (number: number) =>
        Match.value(number).pipe(
          Match.when(HYMN, () => choice),
          Match.orElse(() => every),
        ),
    );
    const registry = AtomRegistry.make();
    registry.mount(player.send);
    registry.mount(player.remote);
    for (const key of Object.values(player)) if (Atom.isAtom(key)) registry.mount<unknown>(key);
    const state = () => registry.get(player.state);
    return {
      asked: fake.asked,
      sound,
      state,
      choose: (stanzas: ReadonlyArray<number>) =>
        Effect.andThen(
          Effect.sync(() => registry.set(choice, stanzas)),
          settle,
        ),
      send: (command: Command) =>
        Effect.andThen(
          Effect.sync(() => registry.set(player.send, command)),
          Effect.andThen(settle, Clock.currentTimeMillis),
        ),
      switchSound: (to: boolean) =>
        Effect.andThen(
          SubscriptionRef.set(sound, to),
          Effect.andThen(settle, Clock.currentTimeMillis),
        ),
      walk: (ms: number) =>
        Effect.gen(function* () {
          const samples = new Array<Sample>();
          for (let t = 0; t < ms; t += POLL) {
            yield* TestClock.adjust(POLL);
            yield* settle;
            samples.push({ now: yield* Clock.currentTimeMillis, player: state() });
            if (Player.$is('Ended')(state())) break;
          }
          return samples;
        }),
      until: (holds: (player: Player) => boolean, ms: number) =>
        Effect.gen(function* () {
          yield* settle;
          for (let t = 0; t < ms && !holds(state()); t += POLL) {
            yield* TestClock.adjust(POLL);
            yield* settle;
          }
          return state();
        }),
      [Symbol.dispose]: () => registry.dispose(),
    };
  });

describe('the oracle', () => {
  it.effect(
    'binds hymn 78’s 32 lines to stanzas 1 to 4, each with the refrain after it, and keeps 0-7 and 16-23 for stanzas 1 and 3',
    () =>
      Effect.sync(() => {
        expect(timeline.lines).toHaveLength(32);
        expect(ownersOf(HYMN)).toEqual(Array.from({ length: 32 }, (_, k) => Math.floor(k / 8) + 1));
        const cut = cutBy(CHOSEN);
        expect(cut.kept.map((it) => it.line)).toEqual([
          ...Array.from({ length: 8 }, (_, k) => k),
          ...Array.from({ length: 8 }, (_, k) => 16 + k),
        ]);
        expect(cut.skips).toHaveLength(2);
        expect(cut.end).toBeLessThan(timeline.end);
      }),
  );
});

describe('a stanza choice, Sound off', () => {
  it.effect(
    'follows only the chosen stanzas’ lines for the cut’s length, and asks the device for nothing',
    () =>
      Effect.gen(function* () {
        using app = yield* composed(CHOSEN, false);
        const cut = cutBy(CHOSEN);
        const began = yield* app.send(Command.Start({ track }));
        const samples = yield* app.walk(cut.end + 4 * POLL);
        const shown = shownIn(samples);
        expect(shown.length).toBeGreaterThan(0);
        expect(driftOf(shown, (now) => timeline.first + (now - began))).toBeLessThanOrEqual(POLL);
        expect(Math.max(...shown.map((it) => Math.abs(it.length - cut.end)))).toBeLessThanOrEqual(
          1,
        );
        expect(
          Arr.dedupeAdjacent(shown.flatMap((it) => Option.toArray(lineAt(cut, it.at)))),
        ).toEqual(cut.kept.map((it) => it.line));
        expect(endedAt(samples) - began - (cut.end - timeline.first)).toBeLessThanOrEqual(2 * POLL);
        expect(endedAt(samples) - began - (cut.end - timeline.first)).toBeGreaterThanOrEqual(-POLL);
        expect(app.asked.plays).toEqual([]);
        expect(app.asked.seeks).toEqual([]);
        expect(app.asked.heard).toEqual([]);
      }),
  );

  it.effect('a choice made on a now skipped line moves the place on to the next kept line', () =>
    Effect.gen(function* () {
      using app = yield* composed([], false);
      const all = cutBy([]);
      const cut = cutBy(CHOSEN);
      yield* app.send(Command.Start({ track }));
      yield* app.until(Player.$is('Playing'), 2000);
      const from = middleOf(all, 10);
      const sought = yield* app.send(Command.Seek({ seconds: from / 1000 }));
      yield* app.walk(POLL);
      const changed = yield* Clock.currentTimeMillis;
      const left = from + (changed - sought);
      yield* app.choose(CHOSEN);
      const shown = shownIn(yield* app.walk(1000));
      const onto = sungAt(cut, left);
      expect(lineAt(cut, onto)).toEqual(Option.some(16));
      expect(shown.length).toBeGreaterThan(0);
      expect(driftOf(shown, (now) => onto + (now - changed))).toBeLessThanOrEqual(POLL);
      expect(Math.min(...shown.map((it) => recordingAt(cut, it.at) - left))).toBeGreaterThanOrEqual(
        0,
      );
      expect(Math.abs((shown.at(-1)?.length ?? 0) - cut.end)).toBeLessThanOrEqual(1);
    }),
  );

  it.effect(
    'a choice of every stanza made mid-play keeps the line and the offset in the hymn',
    () =>
      Effect.gen(function* () {
        using app = yield* composed(CHOSEN, false);
        const cut = cutBy(CHOSEN);
        yield* app.send(Command.Start({ track }));
        yield* app.until(Player.$is('Playing'), 2000);
        const from = middleOf(cut, 17);
        const sought = yield* app.send(Command.Seek({ seconds: from / 1000 }));
        yield* app.walk(POLL);
        const changed = yield* Clock.currentTimeMillis;
        const left = recordingAt(cut, from + (changed - sought));
        yield* app.choose([]);
        const shown = shownIn(yield* app.walk(1000));
        expect(shown.length).toBeGreaterThan(0);
        expect(driftOf(shown, (now) => left + (now - changed))).toBeLessThanOrEqual(POLL);
        expect(Math.abs((shown.at(-1)?.length ?? 0) - timeline.end)).toBeLessThanOrEqual(1);
      }),
  );
});

describe('a stanza choice, Sound on', () => {
  it.effect(
    'seeks the device across each skipped span within 25 ms and shows the place in sung time',
    () =>
      Effect.gen(function* () {
        using app = yield* composed(CHOSEN, true);
        const cut = cutBy(CHOSEN);
        const sung = cut.end + TAIL;
        const began = yield* app.send(Command.Start({ track }));
        const samples = yield* app.walk(sung + 4 * POLL);
        const shown = shownIn(samples);
        expect(app.asked.plays.map((it) => it.fromMs)).toEqual([0]);
        expect(app.asked.seeks).toHaveLength(cut.skips.length);
        cut.skips.forEach((skip, index) => {
          const seek = app.asked.seeks[index];
          expect(Math.abs((seek?.from ?? Number.NaN) - skip.from)).toBeLessThanOrEqual(NEAR);
          expect(Math.abs((seek?.to ?? Number.NaN) - skip.to)).toBeLessThanOrEqual(NEAR);
          expect(heardOf(app.asked.heard, skip.from, skip.to)).toBeLessThanOrEqual(NEAR);
        });
        const spans: ReadonlyArray<readonly [number, number]> = [
          [0, timeline.first],
          ...cut.kept.map((it) => [it.start, it.until] as const),
          [timeline.end, LENGTH],
        ];
        for (const [from, to] of spans)
          expect(heardOf(app.asked.heard, from, to)).toBeGreaterThanOrEqual(to - from - NEAR);
        expect(shown.length).toBeGreaterThan(0);
        expect(driftOf(shown, (now) => now - began)).toBeLessThanOrEqual(POLL);
        expect(Math.abs((shown.at(-1)?.length ?? 0) - sung)).toBeLessThanOrEqual(1);
        expect(endedAt(samples) - began - sung).toBeLessThanOrEqual(2 * POLL);
        expect(endedAt(samples) - began - sung).toBeGreaterThanOrEqual(-POLL);
      }),
  );

  it.effect(
    'a choice made on a now skipped line seeks the device at once to the next kept line',
    () =>
      Effect.gen(function* () {
        using app = yield* composed([], true);
        const all = cutBy([]);
        const cut = cutBy(CHOSEN);
        yield* app.send(Command.Start({ track }));
        yield* app.until(Player.$is('Playing'), 2000);
        const from = middleOf(all, 9);
        const sought = yield* app.send(Command.Seek({ seconds: from / 1000 }));
        yield* app.walk(POLL);
        const changed = yield* Clock.currentTimeMillis;
        const left = from + (changed - sought);
        yield* app.choose(CHOSEN);
        const shown = shownIn(yield* app.walk(1000));
        const after = app.asked.seeks.filter((it) => it.now >= changed);
        expect(after.length).toBeGreaterThan(0);
        expect((after[0]?.now ?? Number.NaN) - changed).toBeLessThanOrEqual(NEAR);
        const next = Option.getOrThrow(Arr.findFirst(cut.kept, (it) => it.line === 16));
        expect(Math.abs((after[0]?.to ?? Number.NaN) - next.start)).toBeLessThanOrEqual(NEAR);
        expect(shown.length).toBeGreaterThan(0);
        expect(driftOf(shown, (now) => sungAt(cut, left) + (now - changed))).toBeLessThanOrEqual(
          POLL,
        );
      }),
  );

  it.effect(
    'a Sound switch off and on hands the place over with no jump, then seeks across the next skip',
    () =>
      Effect.gen(function* () {
        using app = yield* composed(CHOSEN, true);
        const cut = cutBy(CHOSEN);
        const sung = cut.end + TAIL;
        yield* app.send(Command.Start({ track }));
        yield* app.until(Player.$is('Playing'), 2000);
        const from = middleOf(cut, 17);
        const sought = yield* app.send(Command.Seek({ seconds: from / 1000 }));
        const sungNow = (now: number) => from + (now - sought);
        const before = yield* app.walk(1000);
        const off = yield* app.switchSound(false);
        const heardAtOff = heardOf(app.asked.heard, 0, LENGTH);
        const silent = yield* app.walk(2000);
        const on = yield* app.switchSound(true);
        expect(heardOf(app.asked.heard, 0, LENGTH) - heardAtOff).toBeLessThanOrEqual(NEAR);
        expect(off).toBeLessThan(on);
        expect(
          Math.abs((app.asked.plays.at(-1)?.fromMs ?? Number.NaN) - recordingAt(cut, sungNow(on))),
        ).toBeLessThanOrEqual(NEAR);
        const after = yield* app.walk(sung - sungNow(on) + 4 * POLL);
        const shown = shownIn([...before, ...silent, ...after]);
        expect(shown.length).toBeGreaterThan(0);
        expect(driftOf(shown, sungNow)).toBeLessThanOrEqual(POLL);
        const last = cut.skips.at(-1);
        const seeks = app.asked.seeks.filter((it) => it.now > on);
        expect(seeks).toHaveLength(1);
        expect(Math.abs((seeks[0]?.from ?? Number.NaN) - (last?.from ?? 0))).toBeLessThanOrEqual(
          NEAR,
        );
        expect(Math.abs((seeks[0]?.to ?? Number.NaN) - (last?.to ?? 0))).toBeLessThanOrEqual(NEAR);
        for (const skip of cut.skips)
          expect(heardOf(app.asked.heard, skip.from, skip.to)).toBeLessThanOrEqual(NEAR);
        expect(endedAt(after) - sought - (sung - from)).toBeLessThanOrEqual(2 * POLL);
      }),
  );
});
