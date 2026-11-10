import { expect, it } from 'effect-bun-test';
import { Effect, Option } from 'effect';
import { TestClock } from 'effect/testing';

import { act } from 'react';

import { Command } from '~/player/player';
import { RISE } from '~/player/bar';
import { drag, longPress } from '~/test/gesture';

import { SeekArea } from './WordSeek.native';
import { LINE_STEP, seekHeld, WORD_STEP } from './word-seek';
import { fixtureRects, inAct, mountSeekReader } from '~/test/reader-word-seek';
import { openWordSeek } from '~/test/word-seek';

type Page = Effect.Success<ReturnType<typeof mountSeekReader>>;

const VIEWPORT = 800;

/** How far line `k`'s block's middle sits from the lyric viewport's after the page's last scroll. */
const offMiddle = (page: Page, k: number) => {
  const rect = fixtureRects[k] ?? { top: 0, height: 0 };
  const y = page.scrolls.at(-1)?.y ?? 0;
  return Math.abs(page.padTop() + rect.top + rect.height / 2 - y - (VIEWPORT - RISE) / 2);
};

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

it.effect('cancel keeps the origin, and a paused or covered page offers no hold', () =>
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
    page.show(false);
    const covered = page.enabled('hymn-word-seek');
    page.show(true);
    yield* inAct(Effect.sync(() => app.send(Command.Pause())));
    const paused = page.enabled('hymn-word-seek');
    page.press('hymn-word-seek');
    expect([cancelled, covered, paused, app.registry.get(app.player.hold.state)._tag]).toEqual([
      [[], ['seek-grab', 'seek-tick'], false],
      false,
      false,
      'Free',
    ]);
  }).pipe(Effect.scoped),
);
