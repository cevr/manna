import {
  Array as Arr,
  Clock,
  Deferred,
  Effect,
  Layer,
  Match,
  Option,
  Queue,
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
  Remote,
  type Status,
  statusEvery,
} from './player';
import { scoreClock, soundOn } from './sound';

const book = timingBook(bundled);
const POLL = 250;
const NEAR = 25;
const HYMN = 78;
const CHOSEN: ReadonlyArray<number> = [1, 3];
const TAIL = 1500;
const track = { number: HYMN, title: `Hymn ${HYMN}` };
const printed = Atom.make(still);
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
    Option.getOrElse(() => -1),
  );
const middleOf = (cut: Cut, index: number) =>
  Option.getOrThrow(
    Arr.findFirst(cut.kept, (it) => it.line === index).pipe(
      Option.map((it) => it.sung + lengthOf(it) / 2),
    ),
  );
const heardOf = (heard: ReadonlyArray<readonly [number, number]>, from: number, to: number) =>
  heard.reduce((sum, [a, b]) => sum + Math.max(0, Math.min(to, b) - Math.max(from, a)), 0);
const skipOf = (cut: Cut, index: number) => Option.getOrThrow(Arr.get(cut.skips, index));

const recorded = (presses: Queue.Queue<Remote>) => {
  const asked = {
    plays: new Array<{ readonly fromMs: number; readonly now: number; readonly rate: number }>(),
    seeks: new Array<{ readonly from: number; readonly to: number; readonly now: number }>(),
    heard: new Array<readonly [number, number]>(),
    slow: new Array<{ readonly start: number; readonly end: number }>(),
    rates: new Array<{ readonly rate: number; readonly now: number }>(),
  };
  const control = {
    gate: Option.none<Deferred.Deferred<void>>(),
    slowNext: false,
    slowStarted: Option.none<number>(),
    resumeLoads: 0,
    loadingUntil: Option.none<number>(),
  };
  let state: Status['state'] = 'idle';
  let at = 0;
  let since = 0;
  let rate = 1;
  const read = Effect.map(Clock.currentTimeMillis, (now): Status => {
    if (Option.isSome(control.loadingUntil)) {
      if (now < control.loadingUntil.value) {
        since = now;
        return { state: 'loading', positionMs: at, durationMs: LENGTH };
      }
      since = control.loadingUntil.value;
      control.loadingUntil = Option.none();
    }
    if (state === 'playing') {
      const to = Math.min(LENGTH, at + (now - since) * rate);
      if (to > at) asked.heard.push([at, to]);
      at = to;
    }
    since = now;
    if (state === 'playing' && at >= LENGTH) state = 'ended';
    return { state, positionMs: Math.floor(at), durationMs: LENGTH };
  });
  const then = (change: () => void) =>
    Effect.flatMap(read, () => {
      change();
      return read;
    });
  const device: PlaybackApi = {
    play: (_uri, fromMs, options) =>
      Effect.gen(function* () {
        const gate = control.gate;
        if (Option.isSome(gate)) {
          yield* then(() => {
            state = 'loading';
            at = fromMs;
          });
          yield* Deferred.await(gate.value);
        }
        return yield* then(() => {
          asked.plays.push({ fromMs, now: since, rate: options?.rate ?? Number.NaN });
          at = fromMs;
          rate = options?.rate ?? 1;
          state = 'playing';
        });
      }),
    pause: then(() => {
      state = 'paused';
    }),
    resume: then(() => {
      if (state === 'ended') at = 0;
      state = 'playing';
      if (control.resumeLoads > 0) control.loadingUntil = Option.some(since + control.resumeLoads);
    }),
    seek: (ms) =>
      then(() => {
        asked.seeks.push({ from: at, to: ms, now: since });
        at = ms;
      }),
    status: Effect.suspend(() => {
      if (!control.slowNext) return read;
      control.slowNext = false;
      return Effect.gen(function* () {
        const start = yield* Clock.currentTimeMillis;
        control.slowStarted = Option.some(start);
        const told = yield* read;
        // oxlint-disable-next-line effect/noFixedWaitInTests -- the read is held 100 ms of the TestClock, which each case moves itself
        yield* Effect.sleep(100);
        asked.slow.push({ start, end: yield* Clock.currentTimeMillis });
        return told;
      });
    }),
    setRate: (to) =>
      Effect.asVoid(
        then(() => {
          asked.rates.push({ rate: to, now: since });
          rate = to;
        }),
      ),
    stop: Effect.asVoid(
      then(() => {
        state = 'idle';
      }),
    ),
    connection: Stream.make(true),
    announce: () => Effect.void,
    remote: Stream.fromQueue(presses),
  };
  return { device, asked, control };
};

const settle = Effect.forEach(Array.from({ length: 10 }), () => Effect.yieldNow, { discard: true });

const composed = (chosen: ReadonlyArray<number>, tempoValue = 100) =>
  Effect.gen(function* () {
    const clock = yield* TestClock.testClockWith(Effect.succeed);
    const clockLayer = Layer.succeed(Clock.Clock, clock);
    const presses = yield* Queue.unbounded<Remote>();
    const fake = recorded(presses);
    const sound = yield* SubscriptionRef.make(true);
    const choice = Atom.make<ReadonlyArray<number>>(chosen).pipe(Atom.keepAlive);
    const every = Atom.make<ReadonlyArray<number>>([]).pipe(Atom.keepAlive);
    const tempo = Atom.make(tempoValue).pipe(Atom.keepAlive);
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
      () => tempo,
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
      control: fake.control,
      presses,
      registry,
      player,
      choice,
      choose: (stanzas: ReadonlyArray<number>) =>
        Effect.andThen(
          Effect.sync(() => registry.set(choice, stanzas)),
          Effect.andThen(settle, Clock.currentTimeMillis),
        ),
      setTempo: (to: number) =>
        Effect.andThen(
          Effect.sync(() => registry.set(tempo, to)),
          Effect.andThen(settle, Clock.currentTimeMillis),
        ),
      send: (command: Command) =>
        Effect.andThen(
          Effect.sync(() => registry.set(player.send, command)),
          Effect.andThen(settle, Clock.currentTimeMillis),
        ),
      walk: (ms: number) =>
        Effect.gen(function* () {
          const samples = new Array<{ readonly now: number; readonly player: Player }>();
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
      state,
      [Symbol.dispose]: () => registry.dispose(),
    };
  });

const skipperSeeks = (
  seeks: ReadonlyArray<{ readonly from: number; readonly to: number; readonly now: number }>,
  after: number,
  skip: Skip,
) => seeks.filter((it) => it.now > after && Math.abs(it.to - skip.to) <= NEAR);

describe('the skipper after a seek', () => {
  it.effect('seeks the later span on time after a seek forward to 5 s before it', () =>
    Effect.gen(function* () {
      using app = yield* composed(CHOSEN);
      const cut = cutBy(CHOSEN);
      const skip2 = skipOf(cut, 1);
      yield* app.send(Command.Start({ track }));
      yield* app.until(Player.$is('Playing'), 2000);
      yield* app.walk(1000);
      const target = sungAt(cut, skip2.from - 5000);
      expect(lineAt(cut, target)).toBeGreaterThanOrEqual(16);
      const sought = yield* app.send(Command.Seek({ seconds: target / 1000 }));
      yield* app.walk(8000);
      const seeks = skipperSeeks(app.asked.seeks, sought, skip2);
      expect(seeks).toHaveLength(1);
      expect(Math.abs((seeks[0]?.from ?? Number.NaN) - skip2.from)).toBeLessThanOrEqual(NEAR);
      expect(heardOf(app.asked.heard, skip2.from, skip2.to)).toBeLessThanOrEqual(NEAR);
    }),
  );

  it.effect('seeks the earlier span on time after a seek back to 5 s before it', () =>
    Effect.gen(function* () {
      using app = yield* composed(CHOSEN);
      const cut = cutBy(CHOSEN);
      const skip1 = skipOf(cut, 0);
      yield* app.send(Command.Start({ track }));
      yield* app.until(Player.$is('Playing'), 2000);
      yield* app.send(Command.Seek({ seconds: middleOf(cut, 17) / 1000 }));
      yield* app.walk(1000);
      const back = yield* app.send(
        Command.Seek({ seconds: sungAt(cut, skip1.from - 5000) / 1000 }),
      );
      yield* app.walk(8000);
      const seeks = skipperSeeks(app.asked.seeks, back, skip1);
      expect(seeks.length).toBeGreaterThanOrEqual(1);
      expect(Math.abs((seeks[0]?.from ?? Number.NaN) - skip1.from)).toBeLessThanOrEqual(NEAR);
      expect(heardOf(app.asked.heard, skip1.from, skip1.to)).toBeLessThanOrEqual(NEAR);
    }),
  );

  it.effect('does not undo a seek back that lands while it reads the device', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const cut = cutBy(CHOSEN);
        const skip1 = skipOf(cut, 0);
        const fake = recorded(yield* Queue.unbounded<Remote>());
        const sound = yield* SubscriptionRef.make(true);
        const api = yield* scoreClock(fake.device, book.of, sound, keptFor);
        yield* api.play(`https://example.invalid/${HYMN}.mp3`, 0, {
          continuous: false,
          ready: true,
          intent: 'play',
          stanzas: CHOSEN,
          recording: { number: HYMN, offset: 0 },
        });
        yield* settle;
        yield* api.seek(sungAt(cut, skip1.from - 3000));
        yield* settle;
        yield* TestClock.adjust(2999);
        yield* settle;
        const early = skipperSeeks(fake.asked.seeks, -1, skip1).length;
        fake.control.slowNext = true;
        yield* TestClock.adjust(1);
        yield* settle;
        const readBegan = Option.isSome(fake.control.slowStarted) && fake.asked.slow.length === 0;
        const backAt = yield* Clock.currentTimeMillis;
        yield* api.seek(middleOf(cut, 2));
        yield* settle;
        const inWindow = fake.asked.slow.length === 0;
        yield* TestClock.adjust(200);
        yield* settle;
        const undone = skipperSeeks(fake.asked.seeks, backAt - 1, skip1).filter(
          (it) => it.now >= backAt,
        );
        expect(early).toBe(0);
        expect(readBegan).toBe(true);
        expect(inWindow).toBe(true);
        expect(fake.asked.slow).toHaveLength(1);
        expect(undone).toHaveLength(0);
      }),
    ),
  );
});

describe('the skipper at a tempo', () => {
  for (const tempoValue of [125, 80])
    it.effect(`seeks each span on time at tempo ${tempoValue}`, () =>
      Effect.gen(function* () {
        using app = yield* composed(CHOSEN, tempoValue);
        const cut = cutBy(CHOSEN);
        const rate = tempoValue / 100;
        yield* app.send(Command.Start({ track }));
        yield* app.walk((cut.end + TAIL) / rate + 4 * POLL);
        const bleeds = cut.skips.map((skip) => heardOf(app.asked.heard, skip.from, skip.to));
        const late = cut.skips.map(
          (skip, index) => (app.asked.seeks[index]?.from ?? Number.NaN) - skip.from,
        );
        expect(app.asked.plays[0]?.rate).toBe(rate);
        expect(app.asked.seeks).toHaveLength(cut.skips.length);
        for (const it of late) expect(Math.abs(it)).toBeLessThanOrEqual(NEAR);
        for (const it of bleeds) expect(it).toBeLessThanOrEqual(NEAR);
      }),
    );

  it.effect('seeks the first span on time after a turn from 100 to 125 before it', () =>
    Effect.gen(function* () {
      using app = yield* composed(CHOSEN, 100);
      const cut = cutBy(CHOSEN);
      const skip1 = skipOf(cut, 0);
      yield* app.send(Command.Start({ track }));
      yield* app.until(Player.$is('Playing'), 2000);
      yield* app.walk(2000);
      const turned = yield* app.setTempo(125);
      yield* app.walk(skip1.from / 1.25 + 2000);
      const seeks = skipperSeeks(app.asked.seeks, turned, skip1);
      expect(app.asked.rates.at(-1)?.rate).toBe(1.25);
      expect(seeks.length).toBeGreaterThanOrEqual(1);
      expect(Math.abs((seeks[0]?.from ?? Number.NaN) - skip1.from)).toBeLessThanOrEqual(NEAR);
      expect(heardOf(app.asked.heard, skip1.from, skip1.to)).toBeLessThanOrEqual(NEAR);
    }),
  );
});

describe('a choice made while paused', () => {
  for (const loads of [0, 100])
    it.effect(`sounds none of a span it skips at the resume (the device loads ${loads} ms)`, () =>
      Effect.gen(function* () {
        using app = yield* composed([]);
        const all = cutBy([]);
        const cut = cutBy(CHOSEN);
        const skip1 = skipOf(cut, 0);
        yield* app.send(Command.Start({ track }));
        yield* app.until(Player.$is('Playing'), 2000);
        yield* app.send(Command.Seek({ seconds: middleOf(all, 9) / 1000 }));
        yield* app.walk(500);
        yield* app.send(Command.Pause());
        yield* app.walk(500);
        yield* app.choose(CHOSEN);
        yield* app.walk(500);
        const heardBefore = heardOf(app.asked.heard, skip1.from, skip1.to);
        app.control.resumeLoads = loads;
        const resumed = yield* app.send(Command.Resume());
        yield* app.walk(2000);
        const seeks = skipperSeeks(app.asked.seeks, -1, skip1);
        const plays = app.asked.plays.filter((it) => it.now >= resumed);
        expect(seeks.length + plays.length).toBeGreaterThanOrEqual(1);
        expect(heardOf(app.asked.heard, skip1.from, skip1.to) - heardBefore).toBeLessThanOrEqual(
          NEAR,
        );
        expect(Player.$is('Playing')(app.state())).toBe(true);
      }),
    );
});

describe('a choice made as Play starts', () => {
  it.effect('is sung when it comes while the play loads', () =>
    Effect.gen(function* () {
      using app = yield* composed([]);
      const cut = cutBy(CHOSEN);
      const gate = yield* Deferred.make<void>();
      app.control.gate = Option.some(gate);
      yield* app.send(Command.Start({ track }));
      yield* app.walk(500);
      const pending = app.asked.plays.length;
      yield* app.choose(CHOSEN);
      yield* app.walk(500);
      app.control.gate = Option.none();
      yield* Deferred.completeWith(gate, Effect.void);
      yield* settle;
      const samples = yield* app.walk(cut.end + TAIL + 4 * POLL);
      const bleeds = cut.skips.map((skip) => heardOf(app.asked.heard, skip.from, skip.to));
      const last = samples
        .map(({ player }) => player)
        .filter(Player.$is('Playing'))
        .flatMap((player) => Option.toArray(player.length));
      expect(pending).toBe(0);
      for (const it of bleeds) expect(it).toBeLessThanOrEqual(NEAR);
      expect(Math.abs((last.at(-1) ?? Number.NaN) * 1000 - (cut.end + TAIL))).toBeLessThanOrEqual(
        1,
      );
    }),
  );

  for (const yields of [0, 1, 2, 3, 4, 6, 8, 12])
    it.effect(`is sung when it comes ${yields} yields after Start`, () =>
      Effect.gen(function* () {
        using app = yield* composed([]);
        const cut = cutBy(CHOSEN);
        app.registry.set(app.player.send, Command.Start({ track }));
        for (let k = 0; k < yields; k++) yield* Effect.yieldNow;
        app.registry.set(app.choice, CHOSEN);
        yield* settle;
        yield* app.walk(cut.end + TAIL + 4 * POLL);
        const bleeds = cut.skips.map((skip) => heardOf(app.asked.heard, skip.from, skip.to));
        for (const it of bleeds) expect(it).toBeLessThanOrEqual(NEAR);
      }),
    );
});

describe('a change of choice mid-play', () => {
  it.effect('from every stanza to 1 and 3 in a kept line: the first span is sought on time', () =>
    Effect.gen(function* () {
      using app = yield* composed([]);
      const cut = cutBy(CHOSEN);
      const skip1 = skipOf(cut, 0);
      yield* app.send(Command.Start({ track }));
      yield* app.until(Player.$is('Playing'), 2000);
      yield* app.walk(2000);
      const chose = yield* app.choose(CHOSEN);
      yield* app.walk(skip1.from + 2000);
      expect(skipperSeeks(app.asked.seeks, chose, skip1).length).toBeGreaterThanOrEqual(1);
      expect(heardOf(app.asked.heard, skip1.from, skip1.to)).toBeLessThanOrEqual(NEAR);
    }),
  );

  it.effect(
    '1 and 3, then every stanza, then 1 and 3 again: the first span is sought on time',
    () =>
      Effect.gen(function* () {
        using app = yield* composed(CHOSEN);
        const cut = cutBy(CHOSEN);
        const skip1 = skipOf(cut, 0);
        yield* app.send(Command.Start({ track }));
        yield* app.until(Player.$is('Playing'), 2000);
        yield* app.walk(2000);
        yield* app.choose([]);
        yield* app.walk(1000);
        const again = yield* app.choose(CHOSEN);
        yield* app.walk(skip1.from + 2000);
        expect(skipperSeeks(app.asked.seeks, again, skip1).length).toBeGreaterThanOrEqual(1);
        expect(heardOf(app.asked.heard, skip1.from, skip1.to)).toBeLessThanOrEqual(NEAR);
      }),
  );
});

describe('a lock-screen seek', () => {
  it.effect('into a skipped span lands at its end; into a kept line, there', () =>
    Effect.gen(function* () {
      using app = yield* composed(CHOSEN, 100);
      const presses = app.presses;
      const cut = cutBy(CHOSEN);
      const skip1 = skipOf(cut, 0);
      yield* app.send(Command.Start({ track }));
      yield* app.until(Player.$is('Playing'), 2000);
      yield* app.walk(1000);
      const into = skip1.from + 2000;
      const pressed = yield* Clock.currentTimeMillis;
      yield* Queue.offer(presses, Remote.Seek({ seconds: Option.some(into / 1000) }));
      yield* settle;
      yield* app.walk(500);
      const first = app.asked.seeks.filter((it) => it.now >= pressed);
      const line17 = Option.getOrThrow(Arr.get(timeline.lines, 17));
      const kept = (line17.start + line17.until) / 2;
      const pressed2 = yield* Clock.currentTimeMillis;
      yield* Queue.offer(presses, Remote.Seek({ seconds: Option.some(kept / 1000) }));
      yield* settle;
      yield* app.walk(500);
      const second = app.asked.seeks.filter((it) => it.now >= pressed2);
      expect(Math.abs((first[0]?.to ?? Number.NaN) - skip1.to)).toBeLessThanOrEqual(NEAR);
      expect(Math.abs((second[0]?.to ?? Number.NaN) - kept)).toBeLessThanOrEqual(1);
      expect(heardOf(app.asked.heard, skip1.from, skip1.to)).toBeLessThanOrEqual(NEAR);
    }),
  );
});
