import { expect, it } from 'effect-bun-test';
import { Effect, Option } from 'effect';
import { TestClock } from 'effect/testing';

import { Command } from '~/player/player';
import { RISE } from '~/player/bar';
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
