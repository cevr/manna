import { expect, it } from 'effect-bun-test';
import { Deferred, Effect, Option } from 'effect';
import { TestClock } from 'effect/testing';

import { act } from 'react';

import { Command, type PlaybackError, Player, type Status } from '~/player/player';
import { drag, gestureOf, longPress } from '~/test/gesture';

import { SeekArea } from './WordSeek.native';
import {
  LINE_STEP,
  type SeekActionProps,
  type SeekAreaProps,
  seekHeld,
  type Step,
  useSeekActionProps,
  WORD_STEP,
} from './word-seek';
import { HYMN_PAGE_ROOM, inAct, mountSeekReader } from '~/test/reader-word-seek';
import {
  barReach,
  choiceShown,
  offers,
  offMiddle,
  type SeekPage,
  seeks,
  VIEWPORT,
} from '~/test/seek-page';
import { openWordSeek } from '~/test/word-seek';

/** What the page shows of the hold: its numbers, the outlined lines, the underlined words of `k`, the marker. */
const shownOf = (page: SeekPage, k: number) => ({
  status: Option.getOrElse(page.status(), () => ''),
  lines: page.chosenLines(),
  words: page.underlined(k),
  marker: Option.isSome(page.find('reader-seek-marker')),
  lineOnly: Option.isSome(page.find('reader-seek-line-only')),
  centred: offMiddle(page, k) <= 2,
});

const HOLD = 'reader-word-seek-hold';

/** `play`'s result, the page drawn after it. */
const played = <A,>(play: () => A): A => {
  let out = Option.none<A>();
  act(() => {
    out = Option.some(play());
  });
  return Option.getOrThrow(out);
};

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

it.effect('an unoffered next-line action never reaches the seek and leaves it Free', () =>
  Effect.gen(function* () {
    const app = yield* openWordSeek(false);
    const forwarded: Array<Step> = [];
    let props: SeekActionProps = {};
    const ActionArea = ({ seek, children }: SeekAreaProps) => {
      props = useSeekActionProps({
        ...seek,
        step: (kind) => {
          forwarded.push(kind);
          seek.step(kind);
        },
      });
      return children;
    };
    const page = yield* mountSeekReader(app, { viewport: VIEWPORT, area: ActionArea });
    yield* inAct(app.play);
    expect(props.accessibilityActions?.map(({ name }) => name)).toEqual(['seek']);
    const perform = (actionName: string) =>
      act(() => props.onAccessibilityAction?.({ nativeEvent: { actionName } }));
    perform('next-line');
    expect([
      forwarded,
      app.registry.get(app.player.hold.state)._tag,
      page.chosenLines(),
      page.cues,
      seeks(app),
    ]).toEqual([[], 'Free', [], [], []]);
    perform('seek');
    yield* inAct(app.untilHold('Held'));
    perform('next-line');
    expect([forwarded, page.chosenLines()]).toEqual([['next-line'], [1]]);
    perform('cancel');
    yield* inAct(app.untilHold('Free'));
  }).pipe(Effect.scoped),
);
