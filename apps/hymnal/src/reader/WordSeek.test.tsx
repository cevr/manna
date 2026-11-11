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

/**
 * The highest the sounding bar and its `#` reach over a hymn page's foot,
 * as the player lays them out: the bar rises `SOUNDING - REST` over the
 * page, and the `#` stands `HASH_GAP` over the bar while the find room says
 * it is there. The words are seen down to it.
 */
const barReach = (room: number) => SOUNDING - REST + ((room > 0 && HASH_GAP + HASH) || 0);

/** How far line `k`'s block's middle sits from the middle of the words seen, after the page's last scroll. */
const offMiddle = (page: Page, k: number, floor = barReach(HYMN_PAGE_ROOM)) => {
  const rect = fixtureRects[k] ?? { top: 0, height: 0 };
  const y = page.scrolls.at(-1)?.y ?? 0;
  return Math.abs(page.padTop() + rect.top + rect.height / 2 - y - (VIEWPORT - floor) / 2);
};

/** Whether the page offers a screen reader the action `name` on its words. */
const offers = (page: Page, name: string) => page.offers().includes(name);

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

it.effect('the screen reader’s actions hold, step, centre each choice and play from it', () =>
  Effect.gen(function* () {
    const app = yield* openWordSeek(false);
    const page = yield* mountSeekReader(app, { viewport: VIEWPORT });
    const before = page.offers();
    yield* inAct(app.play);
    const playing = page.offers();
    page.act('seek');
    yield* inAct(app.untilHold('Held'));
    const opened = page.offers();
    const held = [shownOf(page, 0)];
    page.act('next-line', 2);
    held.push(shownOf(page, 1));
    const lastWord = offers(page, 'next-word');
    page.act('prev-word');
    held.push(shownOf(page, 1));
    page.act('next-line');
    page.act('next-line');
    held.push(shownOf(page, 3));
    const atEnd = page.offers();
    page.act('next-line');
    yield* inAct(TestClock.adjust(3000));
    const still = page.scrolls.every(({ animated }) => !animated);
    expect([before, playing, opened]).toEqual([
      [],
      ['seek'],
      ['next-line', 'prev-word', 'release', 'cancel'],
    ]);
    expect([seeks(app), lastWord, atEnd, still]).toEqual([
      [],
      false,
      ['prev-line', 'release', 'cancel'],
      true,
    ]);
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
    page.act('release', 1);
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
    page.act('seek');
    yield* inAct(app.untilHold('Held'));
    page.key('Escape');
    yield* inAct(app.untilHold('Free'));
    const steps = offers(page, 'cancel') || Option.isSome(page.find('reader-seek-status'));
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
      const entry = offers(web, 'seek');
      web.keyOn('Enter');
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
      const after = [offers(phone, 'seek'), gestureOf(HOLD).enabled !== false];
      phone.act('seek');
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
      page.act('seek');
      yield* inAct(app.untilHold('Held'));
      page.act('next-line');
      page.act('cancel');
      yield* inAct(app.untilHold('Free'));
      const cancelled = [
        seeks(app),
        [...page.cues],
        Option.isSome(page.find('reader-seek-status')),
      ];
      yield* inAct(Effect.andThen(TestClock.adjust(250), app.untilPlayer(Player.$is('Playing'))));
      page.act('seek');
      yield* inAct(app.untilHold('Held'));
      page.show(false);
      yield* inAct(app.untilHold('Free'));
      const revoked = [page.chosenLines(), app.registry.get(seekHeld), seeks(app)];
      const covered = offers(page, 'seek');
      page.show(true);
      yield* inAct(Effect.sync(() => app.send(Command.Pause())));
      const paused = offers(page, 'seek');
      page.keyOn('Enter');
      expect([
        cancelled,
        revoked,
        covered,
        paused,
        app.registry.get(app.player.hold.state)._tag,
      ]).toEqual([[[], ['seek-grab', 'seek-tick'], false], [[], false, []], false, false, 'Free']);
    }).pipe(Effect.scoped),
);

it.effect('the marker and the choice sit mid the words seen over the sounding bar and its #', () =>
  Effect.gen(function* () {
    const app = yield* openWordSeek(false);
    const page = yield* mountSeekReader(app, { viewport: VIEWPORT });
    yield* inAct(app.play);
    page.act('seek');
    yield* inAct(app.untilHold('Held'));
    const seen = [HYMN_PAGE_ROOM, 0].map((room) => {
      page.room(room);
      page.act('next-line');
      page.act('prev-line');
      const marker = Option.getOrElse(page.rise('reader-seek-marker'), () => Number.NaN);
      return [Math.abs(marker - barReach(room)) <= 0.5, offMiddle(page, 0, barReach(room)) <= 2];
    });
    expect(seen).toEqual([
      [true, true],
      [true, true],
    ]);
  }).pipe(Effect.scoped),
);

/** The names a seek's control would carry, as a button, a group or its text. */
const SEEK_CONTROL =
  /^(Seek|Seek by line or word|Previous line|Next line|Previous word|Next word|Play from here|Cancel)$/;

/**
 * What the page draws for the held seek beyond the hold's own marks: any
 * element named as a seek's control, the old entry, dock and panel by id,
 * and the status drawn larger than its one clear point.
 */
const drawnForSeek = (page: Page) => {
  const named = [...page.host.querySelectorAll('[role="button"], button, [role="group"]')].filter(
    (element) =>
      SEEK_CONTROL.test(element.getAttribute('aria-label') ?? '') ||
      SEEK_CONTROL.test((element.textContent ?? '').trim()),
  ).length;
  const byId = ['hymn-word-seek', 'reader-seek-dock', 'reader-seek-controls'].filter((id) =>
    Option.isSome(page.find(id)),
  );
  const status = Option.match(page.find('reader-seek-status'), {
    onNone: () => 'none',
    onSome: (it) => {
      const style = getComputedStyle(it);
      const unseen =
        style.width === '1px' &&
        style.height === '1px' &&
        /^(transparent|rgba\(.*,\s*0(\.0+)?\))$/.test(style.color);
      return (unseen && 'unseen') || 'seen';
    },
  });
  return { named, byId, status };
};

it.effect(
  'the page draws no seek button or panel: idle, playing, held by a finger or by a screen reader',
  () =>
    Effect.gen(function* () {
      const app = yield* openWordSeek(false);
      const page = yield* mountSeekReader(app, { viewport: VIEWPORT, words: 'boxed' });
      const drawn = [drawnForSeek(page)];
      yield* inAct(app.play);
      drawn.push(drawnForSeek(page));
      page.act('seek');
      yield* inAct(app.untilHold('Held'));
      page.act('next-line');
      drawn.push(drawnForSeek(page));
      page.act('cancel');
      yield* inAct(Effect.andThen(TestClock.adjust(250), app.untilPlayer(Player.$is('Playing'))));
      page.pointer('pointerdown');
      page.elapse();
      yield* inAct(app.untilHold('Held'));
      drawn.push(drawnForSeek(page));
      page.pointer('pointerup', {}, 'area');
      yield* inAct(app.untilHold('Free'));
      expect(drawn).toEqual([
        { named: 0, byId: [], status: 'none' },
        { named: 0, byId: [], status: 'none' },
        { named: 0, byId: [], status: 'unseen' },
        { named: 0, byId: [], status: 'unseen' },
      ]);
    }).pipe(Effect.scoped),
);

it.effect(
  'on the web the focused words take Enter, the arrows and Escape, with no control drawn',
  () =>
    Effect.gen(function* () {
      const app = yield* openWordSeek(false);
      const page = yield* mountSeekReader(app, { viewport: VIEWPORT });
      yield* inAct(app.play);
      const area = Option.getOrThrow(page.find('reader-word-seek-area'));
      const focus = [area.tabIndex, area.getAttribute('aria-keyshortcuts')];
      page.keyOn('ArrowDown');
      const idleArrow = app.registry.get(app.player.hold.state)._tag;
      page.keyOn('Enter');
      yield* inAct(app.untilHold('Held'));
      const trail = ['ArrowDown', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowRight'].map((key) => {
        page.keyOn(key);
        return Option.getOrElse(page.status(), () => '');
      });
      page.keyOn('Enter');
      yield* inAct(app.untilHold('Free'));
      const released = [...page.cues];
      yield* inAct(Effect.andThen(TestClock.adjust(250), app.untilPlayer(Player.$is('Playing'))));
      page.keyOn('Enter');
      yield* inAct(app.untilHold('Held'));
      page.keyOn('ArrowDown');
      page.key('Escape');
      yield* inAct(app.untilHold('Free'));
      expect([focus, idleArrow, trail]).toEqual([
        [0, 'Enter ArrowUp ArrowDown ArrowLeft ArrowRight Escape'],
        'Free',
        [
          'row=2 line=2 word=2 targetMs=6200',
          'row=2 line=2 word=1 targetMs=6100',
          'row=3 line=3 word=1 targetMs=11100',
          'row=2 line=2 word=1 targetMs=6100',
          'row=2 line=2 word=2 targetMs=6200',
        ],
      ]);
      expect([released, seeks(app), page.cues.slice(released.length)]).toEqual([
        ['seek-grab', ...Array.from({ length: 5 }, () => 'seek-tick'), 'seek-release'],
        [6200],
        ['seek-grab', 'seek-tick'],
      ]);
    }).pipe(Effect.scoped),
);
