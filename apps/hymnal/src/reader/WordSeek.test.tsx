import { expect, it } from 'effect-bun-test';
import { Deferred, Effect, Option } from 'effect';
import { TestClock } from 'effect/testing';

import { act } from 'react';

import { Command, type PlaybackError, Player, type Status } from '~/player/player';
import { HASH, HASH_GAP, REST, SOUNDING } from '~/player/bar';
import { drag, gestureOf, longPress } from '~/test/gesture';

import { SeekArea } from './WordSeek.native';
import { LINE_STEP, seekHeld, WORD_STEP } from './word-seek';
import { fixtureRects, HYMN_PAGE_ROOM, inAct, mountSeekReader } from '~/test/reader-word-seek';
import { openWordSeek } from '~/test/word-seek';

type Page = Effect.Success<ReturnType<typeof mountSeekReader>>;

const VIEWPORT = 800;
/** The entry's least height, and the gap between it and the open controls over it. */
const ENTRY = 48;
const GAP = 8;

/**
 * Where the words stop being seen, over the page's foot: the top of the
 * entry `Seek` (`entry` points tall), or of the open controls over it
 * (`panel` points tall, none while closed).
 */
const floorOf = (page: Page, entry = ENTRY, panel = 0) =>
  Option.getOrElse(page.rise('hymn-word-seek'), () => Number.NaN) +
  entry +
  ((panel > 0 && GAP + panel) || 0);

/** How far line `k`'s block's middle sits from the middle of the words seen, after the page's last scroll. */
const offMiddle = (page: Page, k: number, floor = floorOf(page)) => {
  const rect = fixtureRects[k] ?? { top: 0, height: 0 };
  const y = page.scrolls.at(-1)?.y ?? 0;
  return Math.abs(page.padTop() + rect.top + rect.height / 2 - y - (VIEWPORT - floor) / 2);
};

/**
 * The highest the sounding bar and its `#` reach over a hymn page's foot,
 * as the player lays them out: the bar rises `SOUNDING - REST` over the
 * page, and the `#` stands `HASH_GAP` over the bar while the find room says
 * it is there.
 */
const barReach = (room: number) => SOUNDING - REST + ((room > 0 && HASH_GAP + HASH) || 0);

/** What the page shows of the hold: its numbers, the outlined lines, the underlined words of `k`, the marker. */
const shownOf = (page: Page, k: number) => ({
  status: Option.getOrElse(page.status(), () => ''),
  lines: page.chosenLines(),
  words: page.underlined(k),
  marker: Option.isSome(page.find('reader-seek-marker')),
  lineOnly: Option.isSome(page.find('reader-seek-line-only')),
  centred: offMiddle(page, k) <= 2,
});

/** The outlined line and its underlined word, by place (-1 for none), and whether that line is centred. */
const choiceShown = (page: Page) => {
  const line = page.chosenLines()[0] ?? -1;
  return [line, page.underlined(line)[0] ?? -1, offMiddle(page, line) <= 2];
};

const HOLD = 'reader-word-seek-hold';

/** `play`'s result, the page drawn after it. */
const played = <A,>(play: () => A): A => {
  let out = Option.none<A>();
  act(() => {
    out = Option.some(play());
  });
  return Option.getOrThrow(out);
};

const seeks = (app: Effect.Success<ReturnType<typeof openWordSeek>>) =>
  app.commands.filter(({ kind }) => kind === 'seek').map(({ ms }) => ms);

it.effect('the accessible path holds, steps, centres each choice and plays from it', () =>
  Effect.gen(function* () {
    const app = yield* openWordSeek(false);
    const page = yield* mountSeekReader(app, { viewport: VIEWPORT });
    expect(page.enabled('hymn-word-seek')).toBe(false);
    yield* inAct(app.play);
    expect(page.enabled('hymn-word-seek')).toBe(true);
    page.press('hymn-word-seek');
    yield* inAct(app.untilHold('Held'));
    const held = [shownOf(page, 0)];
    page.press('reader-seek-next-line');
    held.push(shownOf(page, 1));
    const lastWord = page.enabled('reader-seek-next-word');
    page.press('reader-seek-prev-word');
    held.push(shownOf(page, 1));
    page.press('reader-seek-next-line');
    page.press('reader-seek-next-line');
    held.push(shownOf(page, 3));
    const atEnd = ['reader-seek-next-line', 'reader-seek-next-word', 'reader-seek-prev-word'].map(
      page.enabled,
    );
    yield* inAct(TestClock.adjust(3000));
    const still = page.scrolls.every(({ animated }) => !animated);
    expect([seeks(app), lastWord, atEnd, still]).toEqual([[], false, [false, false, false], true]);
    expect(held).toEqual([
      {
        status: 'row=1 line=1 word=2 targetMs=1200',
        lines: [0],
        words: [1],
        marker: true,
        lineOnly: false,
        centred: true,
      },
      {
        status: 'row=2 line=2 word=2 targetMs=6200',
        lines: [1],
        words: [1],
        marker: true,
        lineOnly: false,
        centred: true,
      },
      {
        status: 'row=2 line=2 word=1 targetMs=6100',
        lines: [1],
        words: [0],
        marker: true,
        lineOnly: false,
        centred: true,
      },
      {
        status: 'row=4 line=4 word=0 targetMs=16000',
        lines: [3],
        words: [],
        marker: true,
        lineOnly: true,
        centred: true,
      },
    ]);
    page.press('reader-seek-release');
    yield* inAct(app.untilHold('Free'));
    expect([
      seeks(app),
      page.cues,
      Option.isSome(page.find('reader-seek-marker')),
      page.chosenLines(),
      page.padTop(),
    ]).toEqual([
      [16_000],
      ['seek-grab', 'seek-tick', 'seek-tick', 'seek-tick', 'seek-tick', 'seek-release'],
      false,
      [],
      8,
    ]);
  }).pipe(Effect.scoped),
);

it.effect('a still finger holds and both axes choose; a quick swipe or a drift never holds', () =>
  Effect.gen(function* () {
    const app = yield* openWordSeek(false);
    const page = yield* mountSeekReader(app, { viewport: VIEWPORT, area: SeekArea });
    yield* inAct(app.play);
    const swipe = played(() => drag(HOLD, { x: 100, y: 200, dx: 4, dy: -80 }));
    const drift = played(() => longPress(HOLD, { x: 100, y: 200, dx: 8, dy: 8 }));
    const drifted = app.registry.get(app.player.hold.state)._tag;
    act(() => drift.lift());
    const before = [Option.isSome(swipe), drifted, [...page.cues], app.commands.length];
    const held = played(() => longPress(HOLD, { x: 100, y: 200, dx: 3, dy: -4 }));
    yield* inAct(app.untilHold('Held'));
    const locked = app.registry.get(seekHeld);
    const trail = [
      [3, -4 - LINE_STEP],
      [3 - WORD_STEP, -4 - LINE_STEP],
      [3 - WORD_STEP, -4 - LINE_STEP - 10],
      [3 - WORD_STEP, -4 - 2 * LINE_STEP],
      [3, -4 - LINE_STEP],
      [3 + WORD_STEP, -4 - 2 * LINE_STEP],
      [3 + 1e9, -4 + 1e9],
      [3, -4],
    ].map(([dx = 0, dy = 0]) => {
      act(() => held.move(dx, dy));
      return choiceShown(page);
    });
    act(() => held.lift());
    yield* inAct(app.untilHold('Free'));
    expect([before, Option.isSome(held.taken), locked, app.registry.get(seekHeld)]).toEqual([
      [false, 'Free', [], 0],
      true,
      true,
      false,
    ]);
    expect(trail).toEqual([
      [1, 1, true],
      [1, 0, true],
      [1, 0, true],
      [2, 0, true],
      [1, 1, true],
      [2, 1, true],
      [0, 1, true],
      [0, 1, true],
    ]);
    expect([seeks(app), page.cues]).toEqual([
      [1200],
      ['seek-grab', ...Array.from({ length: 6 }, () => 'seek-tick'), 'seek-release'],
    ]);
  }).pipe(Effect.scoped),
);

it.effect('the platform cancels a held finger once; a neighbour page never holds', () =>
  Effect.gen(function* () {
    const app = yield* openWordSeek(false);
    const page = yield* mountSeekReader(app, { viewport: VIEWPORT, area: SeekArea });
    yield* inAct(app.play);
    const held = played(() => longPress(HOLD, { x: 100, y: 200 }));
    yield* inAct(app.untilHold('Held'));
    act(() => held.move(0, -LINE_STEP));
    act(() => held.cancel());
    act(() => held.lift());
    yield* inAct(app.untilHold('Free'));
    const cancelled = [seeks(app), [...page.cues], page.chosenLines(), app.registry.get(seekHeld)];
    page.show(false);
    const neighbour = played(() => longPress(HOLD, { x: 100, y: 200 }));
    expect([
      cancelled,
      Option.isSome(neighbour.taken),
      app.registry.get(app.player.hold.state)._tag,
    ]).toEqual([[[], ['seek-grab', 'seek-tick'], [], false], false, 'Free']);
  }).pipe(Effect.scoped),
);

it.effect('on the web only a still primary pointer holds, and only its main lift plays', () =>
  Effect.gen(function* () {
    const app = yield* openWordSeek(false);
    const page = yield* mountSeekReader(app, { viewport: VIEWPORT });
    yield* inAct(app.play);
    const ignored = [{ button: 2 }, { primary: false }, { x: 10 }].map((init) => {
      page.pointer('pointerdown', init);
      const armed = page.waiting().length;
      page.pointer('pointerup', init);
      return armed;
    });
    page.pointer('pointerdown');
    page.pointer('pointermove', { x: 100, y: 189 });
    const swiped = page.waiting().length;
    page.pointer('pointerup', { x: 100, y: 189 });
    const before = [page.heldBack('wheel'), page.heldBack('touchmove'), page.touch()];
    page.pointer('pointerdown');
    page.pointer('pointermove', { x: 103, y: 196 });
    const armed = page.waiting();
    page.elapse();
    yield* inAct(app.untilHold('Held'));
    const during = [page.heldBack('wheel'), page.heldBack('touchmove'), page.touch()];
    page.pointer('pointerdown', { id: 2, primary: false, x: 300, y: 300 });
    page.pointer('pointermove', { id: 2, x: 300, y: 0 });
    page.pointer('pointerup', { id: 2, x: 300, y: 0 });
    page.pointer('pointerup', { button: 2, x: 103, y: 196 }, 'area');
    const others = choiceShown(page);
    const trail = [
      [103 - WORD_STEP, 196 - LINE_STEP],
      [103 + WORD_STEP, 196 - 2 * LINE_STEP - 30],
      [103 - WORD_STEP, 196 - LINE_STEP],
    ].map(([x = 0, y = 0]) => {
      page.pointer('pointermove', { x, y }, 'area');
      return choiceShown(page);
    });
    page.pointer('pointerup', { x: 103 - WORD_STEP, y: 196 - LINE_STEP }, 'area');
    page.pointer('lostpointercapture', {}, 'area');
    yield* inAct(app.untilHold('Free'));
    expect([ignored, swiped, before, armed, during, others]).toEqual([
      [0, 0, 0],
      0,
      [false, false, ['pan-y', false]],
      [350],
      [true, true, ['none', true]],
      [0, 1, true],
    ]);
    expect([trail, seeks(app), page.cues, page.touch()]).toEqual([
      [
        [1, 0, true],
        [2, 1, true],
        [1, 0, true],
      ],
      [6100],
      ['seek-grab', 'seek-tick', 'seek-tick', 'seek-tick', 'seek-release'],
      ['pan-y', false],
    ]);
  }).pipe(Effect.scoped),
);

it.effect('on the web a cancel, a lost capture or Escape cancels once; a late timer is inert', () =>
  Effect.gen(function* () {
    const app = yield* openWordSeek(false);
    const page = yield* mountSeekReader(app, { viewport: VIEWPORT });
    yield* inAct(app.play);
    page.pointer('pointerdown');
    const menu = page.heldBack('contextmenu');
    page.pointer('pointerup');
    const lifted = page.waiting().length;
    const ends = (['pointercancel', 'lostpointercapture', 'Escape'] as const).map((end) =>
      Effect.gen(function* () {
        yield* inAct(Effect.andThen(TestClock.adjust(250), app.untilPlayer(Player.$is('Playing'))));
        page.pointer('pointerdown');
        page.elapse();
        yield* inAct(app.untilHold('Held'));
        page.pointer('pointermove', { y: 200 - LINE_STEP }, 'area');
        if (end === 'Escape') page.key('Escape');
        else page.pointer(end, {}, 'area');
        page.pointer('pointerup', { y: 200 - LINE_STEP }, 'area');
        yield* inAct(app.untilHold('Free'));
        return [page.chosenLines(), [...page.touch()]];
      }),
    );
    const ended = yield* Effect.all(ends);
    yield* inAct(Effect.andThen(TestClock.adjust(250), app.untilPlayer(Player.$is('Playing'))));
    page.press('hymn-word-seek');
    yield* inAct(app.untilHold('Held'));
    page.key('Escape');
    yield* inAct(app.untilHold('Free'));
    const steps = Option.isSome(page.find('reader-seek-controls'));
    expect([menu, lifted, ended, steps, seeks(app)]).toEqual([
      true,
      0,
      Array.from({ length: 3 }, () => [[], ['pan-y', false]]),
      false,
      [],
    ]);
    expect(page.cues).toEqual([
      ...Array.from({ length: 3 }, () => ['seek-grab', 'seek-tick']).flat(),
      'seek-grab',
    ]);
  }).pipe(Effect.scoped),
);

it.effect(
  'a playing hymn whose player would refuse a hold offers none anywhere until it would take',
  () =>
    Effect.gen(function* () {
      const app = yield* openWordSeek(false);
      const web = yield* mountSeekReader(app, { viewport: VIEWPORT });
      yield* inAct(app.play);
      const landed = yield* Deferred.make<Status, PlaybackError>();
      app.boundaries.set('seek', landed);
      yield* inAct(
        Effect.andThen(
          Effect.sync(() => app.send(Command.Seek({ seconds: 3 }))),
          app.waitCall('boundary:seek'),
        ),
      );
      const playing = app.registry.get(app.player.state)._tag;
      const entry = web.enabled('hymn-word-seek');
      web.press('hymn-word-seek');
      web.pointer('pointerdown');
      const armed = web.waiting().length;
      web.pointer('pointerup');
      const pressed = app.registry.get(app.player.hold.state)._tag;
      web.unmount();
      const phone = yield* mountSeekReader(app, { viewport: VIEWPORT, area: SeekArea });
      const recognizer = gestureOf(HOLD).enabled !== false;
      const finger = played(() => longPress(HOLD, { x: 100, y: 200 }));
      const fingered = [Option.isSome(finger.taken), app.registry.get(app.player.hold.state)._tag];
      act(() => finger.lift());
      app.boundaries.delete('seek');
      yield* inAct(
        Deferred.succeed(landed, { state: 'playing', positionMs: 3000, durationMs: 21_000 }),
      );
      yield* inAct(TestClock.adjust(250));
      const after = [phone.enabled('hymn-word-seek'), gestureOf(HOLD).enabled !== false];
      phone.press('hymn-word-seek');
      yield* inAct(app.untilHold('Held'));
      expect([playing, entry, pressed, armed, recognizer, fingered, after, phone.cues]).toEqual([
        'Playing',
        false,
        'Free',
        0,
        false,
        [false, 'Free'],
        [true, true],
        ['seek-grab'],
      ]);
    }).pipe(Effect.scoped),
);

it.effect(
  'cancel keeps the origin; covering revokes; a paused or covered page offers no hold',
  () =>
    Effect.gen(function* () {
      const app = yield* openWordSeek(false);
      const page = yield* mountSeekReader(app, { viewport: VIEWPORT });
      yield* inAct(app.play);
      page.press('hymn-word-seek');
      yield* inAct(app.untilHold('Held'));
      page.press('reader-seek-next-line');
      page.press('reader-seek-cancel');
      yield* inAct(app.untilHold('Free'));
      const cancelled = [
        seeks(app),
        [...page.cues],
        Option.isSome(page.find('reader-seek-controls')),
      ];
      yield* inAct(Effect.andThen(TestClock.adjust(250), app.untilPlayer(Player.$is('Playing'))));
      page.press('hymn-word-seek');
      yield* inAct(app.untilHold('Held'));
      page.show(false);
      yield* inAct(app.untilHold('Free'));
      const revoked = [page.chosenLines(), app.registry.get(seekHeld), seeks(app)];
      const covered = page.enabled('hymn-word-seek');
      page.show(true);
      yield* inAct(Effect.sync(() => app.send(Command.Pause())));
      const paused = page.enabled('hymn-word-seek');
      page.press('hymn-word-seek');
      expect([
        cancelled,
        revoked,
        covered,
        paused,
        app.registry.get(app.player.hold.state)._tag,
      ]).toEqual([[[], ['seek-grab', 'seek-tick'], false], [[], false, []], false, false, 'Free']);
    }).pipe(Effect.scoped),
);

it.effect(
  'the entry stands clear of the sounding bar and its #, and the marker and the choice sit mid the words left seen',
  () =>
    Effect.gen(function* () {
      const app = yield* openWordSeek(false);
      const page = yield* mountSeekReader(app, { viewport: VIEWPORT });
      yield* inAct(app.play);
      const closed = [HYMN_PAGE_ROOM, 0].map((room) => {
        page.room(room);
        return Option.getOrElse(page.rise('hymn-word-seek'), () => Number.NaN) >= barReach(room);
      });
      page.press('hymn-word-seek');
      yield* inAct(app.untilHold('Held'));
      const seen = [HYMN_PAGE_ROOM, 0].flatMap((room) =>
        [ENTRY, 72].flatMap((entry) =>
          [120, 260].map((panel) => {
            page.room(room);
            page.entry(entry);
            page.panel(panel);
            page.press('reader-seek-next-line');
            page.press('reader-seek-prev-line');
            const floor = floorOf(page, entry, panel);
            const marker = Option.getOrElse(page.rise('reader-seek-marker'), () => Number.NaN);
            return [
              Option.getOrElse(page.rise('hymn-word-seek'), () => Number.NaN) >= barReach(room),
              Math.abs(marker - floor) <= 0.5,
              offMiddle(page, 0, floor) <= 2,
            ];
          }),
        ),
      );
      expect([closed, seen]).toEqual([
        [true, true],
        Array.from({ length: 8 }, () => [true, true, true]),
      ]);
    }).pipe(Effect.scoped),
);
