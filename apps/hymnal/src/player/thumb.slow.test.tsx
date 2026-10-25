/**
 * Bar J on a hymn page, mounted in a browser's document (`src/test/setup.ts`)
 * over a player whose device the test holds (`src/test/device.ts`) and a
 * reader's store the test holds (`src/test/reader.ts`): the key button and
 * its dials, the hold, reset, the spring and the seeker, the sound left
 * alone by every dial, and the player sheet's reader settings.
 *
 * Animations land at once (`src/test/reanimated.tsx`), so each frame is read
 * as it is once its spring has settled. A drag is played through its
 * gesture's own callbacks (`src/test/gesture.tsx`); VoiceOver's actions and
 * a hold through the props react-native-web keeps off the DOM
 * (`src/test/props.ts`).
 */

import { RegistryContext } from '@effect/atom-react';
import { describe, expect, it } from 'effect-bun-test';
import { Duration, Effect, Option, Stream } from 'effect';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import { act, type ReactNode } from 'react';
import { View } from 'react-native';
import { createRoot } from 'react-dom/client';

import { hymnAt } from '~/hymns/hymns';
import type { ChordReader } from '~/reader/HymnPage';
import { HymnPage } from '~/reader/HymnPage';
import { Shown } from '~/reader/screen';
import { StackHeader } from '~/test/stack';

import { fakeDevice } from '../test/device';
import { gestureOf } from '../test/gesture';
import { params, routed } from '../test/one';
import { actionsOf, perform, propsWith } from '../test/props';
import { readerOn } from '../test/reader';
import { PlayerContext } from './context';
import { ChordReaderContext } from './Dials';
import { FullPlayer } from './FullPlayer';
import { Player, playerOn } from './player';
import { PageBar, PlayerBar, REST, SOUNDING } from './PlayerBar';

const morning = Option.getOrThrow(hymnAt('100'));

const chordsOn = () => new Map([['chords', 'true']]);

/**
 * The hymn route at `/hymns/<n>` over `reader`: its header, its page with
 * the page's own bar, as the screen draws them; the docked bar; and the player
 * sheet on the hymn when `sheet`.
 */
const route =
  (n: number, sheet = false) =>
  (reader: ChordReader) => {
    params['number'] = String(n);
    // The sheet's route names its hymn, as the bar opens it.
    if (sheet) params['hymn'] = String(n);
    const hymn = Option.getOrThrow(hymnAt(String(n)));
    return (
      <>
        <View testID="page">
          <StackHeader />
          <Shown hymn={hymn} />
          <HymnPage hymn={hymn} reader={reader} />
          <PageBar track={hymn} />
        </View>
        {sheet && <FullPlayer />}
        <PlayerBar />
      </>
    );
  };

const clearParams = () => {
  for (const key of Object.keys(params)) delete params[key];
};

/** `screen` over a fresh player and the reader's store `device`, mounted; it unmounts when the `using` ends. */
const mount = (
  screen: (reader: ChordReader) => ReactNode,
  device: Map<string, string> = chordsOn(),
) => {
  routed.splice(0);
  const played = fakeDevice();
  const player = playerOn(played.layer, Duration.millis(1));
  const registry = AtomRegistry.make();
  const reader = readerOn(device);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <RegistryContext value={registry}>
        <ChordReaderContext value={reader}>
          <PlayerContext value={Option.some(player)}>{screen(reader)}</PlayerContext>
        </ChordReaderContext>
      </RegistryContext>,
    ),
  );
  // Each command the player is sent changes its send's result.
  let sends = 0;
  const unsubscribe = registry.subscribe(player.send, () => void (sends += 1));
  const until = (holds: (state: Player) => boolean) =>
    Effect.promise(() =>
      act(() =>
        Effect.runPromise(
          AtomRegistry.toStream(registry, player.state).pipe(
            Stream.filter(holds),
            Stream.runHead,
            Effect.asVoid,
            Effect.timeoutOrElse({
              duration: Duration.seconds(2),
              orElse: () =>
                Effect.die(`no such state; it stayed ${registry.get(player.state)._tag}`),
            }),
          ),
        ),
      ),
    );
  /** Wait until chords are `on`, as the reader's store says. */
  const untilChords = (on: boolean) =>
    Effect.promise(() =>
      act(() =>
        Effect.runPromise(
          AtomRegistry.toStream(registry, reader.chords).pipe(
            Stream.filter((now) => now === on),
            Stream.runHead,
            Effect.asVoid,
            Effect.timeoutOrElse({
              duration: Duration.seconds(2),
              orElse: () => Effect.die(`chords never turned ${on}`),
            }),
          ),
        ),
      ),
    );
  const find = (selector: string) => Option.fromNullishOr(host.querySelector(selector));
  const get = (selector: string) => Option.getOrThrow(find(selector));
  return {
    device: played.device,
    reader,
    until,
    untilChords,
    find,
    get,
    all: (selector: string) => [...host.querySelectorAll(selector)],
    press: (label: string) =>
      act(() => {
        get(`[aria-label="${label}"]`).dispatchEvent(
          new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
        );
      }),
    sends: () => sends,
    player: () => registry.get(player.state),
    [Symbol.dispose]: () => {
      unsubscribe();
      act(() => root.unmount());
      host.remove();
      registry.dispose();
      clearParams();
    },
  };
};

type Page = ReturnType<typeof mount>;

const keyButton = (page: Page) => page.get('[role="button"][aria-label="Key"]');
const dial = (page: Page, label: string) => page.find(`[role="slider"][aria-label="${label}"]`);
const valueOf = (page: Page, label: string) =>
  Option.map(dial(page, label), (found) => found.getAttribute('aria-valuetext'));
/** The dial named `label` turned one detent, as VoiceOver turns it. */
const turn = (page: Page, label: string, way: 'increment' | 'decrement' = 'increment') =>
  perform(Option.getOrThrow(dial(page, label)), way);
/**
 * The key button held down until the hold turns chords to `to`, then let go:
 * the press, the hold, the release, and the click the browser sends after it.
 */
const hold = (page: Page, to: boolean) =>
  Effect.gen(function* () {
    const button = keyButton(page);
    act(() => void button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })));
    yield* page.untilChords(to);
    act(() => {
      button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });
  });
/** A tap on the key button. */
const tapKey = (page: Page) =>
  act(() => {
    keyButton(page).dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
    );
  });

/** The frame's height over the home indicator, as its spring has set it. */
const heightOf = (page: Page) =>
  Number.parseFloat(getComputedStyle(page.get('[data-testid="bar-spring"]')).height);

describe('bar J on a hymn page', () => {
  it.live(
    'holds the key button, the opener, Sound and Play, and names no hymn the page names',
    () =>
      Effect.sync(() => {
        using page = mount(route(100));
        const bar = page.get('[aria-label="Player"]');
        expect(
          [...bar.querySelectorAll('[role="button"]')].map((b) => b.getAttribute('aria-label')),
        ).toEqual(['Key', 'Open player', 'Sound', 'Play hymn 100']);
        expect(keyButton(page).getAttribute('aria-valuetext')).toBe('Db');
        expect(bar.textContent).not.toContain(morning.title);
        expect(bar.textContent).not.toContain('100');
        const header = page.get('[data-testid="header"]');
        expect(header.querySelector('[aria-label="Aa"]')).toBeNull();
        expect(header.querySelector('[aria-label="Chords"]')).toBeNull();
      }),
  );

  it.live('opens the key and capo dials on a tap, and closes them on a tap of the page', () =>
    Effect.sync(() => {
      using page = mount(route(100));
      expect(Option.isNone(dial(page, 'Key'))).toBe(true);
      tapKey(page);
      expect(valueOf(page, 'Key')).toEqual(Option.some('Db'));
      expect(valueOf(page, 'Capo')).toEqual(Option.some('No capo'));
      expect(keyButton(page).getAttribute('aria-expanded')).toBe('true');
      act(() => (page.get('[data-testid="dials-backdrop"]') as HTMLElement).click());
      expect(Option.isNone(dial(page, 'Key'))).toBe(true);
      tapKey(page);
      tapKey(page);
      expect(Option.isNone(dial(page, 'Key'))).toBe(true);
    }),
  );

  it.live('turns chords off on a hold with no tap after it, and the dials show the key alone', () =>
    Effect.gen(function* () {
      const device = chordsOn();
      using page = mount(route(100), device);
      tapKey(page);
      expect(actionsOf(keyButton(page))).toEqual([{ name: 'chords', label: 'Turn chords off' }]);
      yield* hold(page, false);
      expect(device.get('chords')).toBe('false');
      // The click after the hold opened nothing and closed nothing: the dials are still open.
      expect(keyButton(page).getAttribute('aria-valuetext')).toBe('Chords off');
      expect(keyButton(page).textContent).toBe('');
      expect(Option.isSome(dial(page, 'Key'))).toBe(true);
      expect(Option.isNone(dial(page, 'Capo'))).toBe(true);
      expect(page.all('[data-testid^="chord-"]')).toHaveLength(0);
      expect(actionsOf(keyButton(page))).toEqual([{ name: 'chords', label: 'Turn chords on' }]);

      // One turn of the key dial turns chords on and keeps the key turned to.
      turn(page, 'Key');
      expect(device.get('chords')).toBe('true');
      expect(valueOf(page, 'Key')).toEqual(Option.some('D'));
      expect(keyButton(page).getAttribute('aria-valuetext')).toBe('D');
      expect(
        page.find('[data-testid="chord-1-1-1"]').pipe(Option.map((c) => c.textContent)),
      ).toEqual(Option.some('D'));
    }),
  );

  it.live('turns chords on and off by VoiceOver’s action, with no hold', () =>
    Effect.sync(() => {
      const device = chordsOn();
      using page = mount(route(100), device);
      perform(keyButton(page), 'chords');
      expect(device.get('chords')).toBe('false');
      perform(keyButton(page), 'chords');
      expect(device.get('chords')).toBe('true');
    }),
  );

  it.live('resets to the printed key and no capo, and closes the dials', () =>
    Effect.sync(() => {
      const device = chordsOn();
      using page = mount(route(100), device);
      tapKey(page);
      expect(Option.isNone(page.find('[aria-label="Reset"]'))).toBe(true);
      turn(page, 'Key');
      turn(page, 'Capo');
      expect(valueOf(page, 'Capo')).toEqual(Option.some('Capo 1, Db shapes'));
      expect(page.get('[aria-label="Reset"]').textContent).toBe('↺ Db, no capo');
      page.press('Reset');
      expect(Option.isNone(dial(page, 'Key'))).toBe(true);
      expect(device.get('move.100')).toBe('{"transpose":0,"capo":0}');
      tapKey(page);
      expect(valueOf(page, 'Key')).toEqual(Option.some('Db'));
      expect(valueOf(page, 'Capo')).toEqual(Option.some('No capo'));

      // A double tap on a dial does the same.
      turn(page, 'Capo');
      act(() => gestureOf('dial-capo-twice').onActivate?.({ x: 0 }));
      expect(Option.isNone(dial(page, 'Key'))).toBe(true);
      expect(device.get('move.100')).toBe('{"transpose":0,"capo":0}');
    }),
  );

  it.live('turns the capo by a drag and a fling, one detent at a time, and stops at its end', () =>
    Effect.sync(() => {
      const device = chordsOn();
      using page = mount(route(100), device);
      tapKey(page);
      const writes: Array<string> = [];
      const pan = () => gestureOf('dial-capo-pan');
      act(() => pan().onBegin?.({ x: 0 }));
      act(() => pan().onActivate?.({ x: 0 }));
      // A drag two detents left brings fret 2 to the notch.
      for (const translationX of [-20, -44, -70, -88]) {
        act(() => pan().onUpdate?.({ x: 0, translationX }));
        writes.push(String(device.get('move.100')));
      }
      expect(valueOf(page, 'Capo')).toEqual(Option.some('Capo 2, B shapes'));
      // A fling at the cap runs past fret 11, and stops there.
      act(() =>
        pan().onDeactivate?.({ x: 0, translationX: -88, velocityX: -3000, canceled: false }),
      );
      act(() => pan().onFinalize?.({ x: 0, canceled: false }));
      expect(valueOf(page, 'Capo')).toEqual(Option.some('Capo 11, D shapes'));
      expect(device.get('move.100')).toBe('{"transpose":0,"capo":11}');
      // The drag wrote the move once per detent it crossed, and not between them.
      expect(new Set(writes).size).toBe(3);
    }),
  );

  it.live('opens no dials on a hymn with no chords, and its page says it has none yet', () =>
    Effect.sync(() => {
      using page = mount(route(126));
      tapKey(page);
      expect(Option.isNone(dial(page, 'Key'))).toBe(true);
      // A boolean, so a failure prints no hymn words.
      expect(
        page.get('[data-testid="page"]').textContent.includes('No chords for this hymn yet.'),
      ).toBe(true);
      expect(keyButton(page).getAttribute('aria-valuetext')).toBe('No chords');
    }),
  );

  it.live('opens the player sheet on a swipe up of the bar, on the bar’s hymn', () =>
    Effect.sync(() => {
      using _page = mount(route(100));
      act(() =>
        gestureOf('bar-swipe').onDeactivate?.({ x: 0, translationY: -60, canceled: false }),
      );
      expect(routed).toEqual(['push /player?hymn=100']);
      act(() => gestureOf('bar-swipe').onDeactivate?.({ x: 0, translationY: 30, canceled: false }));
      expect(routed).toEqual(['push /player?hymn=100']);
    }),
  );
});

describe('bar J’s spring and seeker', () => {
  it.live('springs taller on Play with the seeker, seeks by a drag, and settles on Pause', () =>
    Effect.gen(function* () {
      using page = mount(route(100));
      const room = () =>
        page.all('[data-testid="bar-room"]').map((r) => getComputedStyle(r).height);
      expect(heightOf(page)).toBe(REST);
      expect(room()).toEqual([`${REST}px`]);
      expect(Option.isNone(page.find('[aria-label="Seek"]'))).toBe(true);

      page.press('Play hymn 100');
      page.device.now = { state: 'playing', positionMs: 1_000, durationMs: 151_000 };
      yield* page.until((state) => Player.$is('Playing')(state) && state.at === 1);
      expect(heightOf(page)).toBe(SOUNDING);
      // The screen keeps the bar's resting room: the spring lays nothing out again.
      expect(room()).toEqual([`${REST}px`]);
      const seek = page.get('[role="slider"][aria-label="Seek"]');
      expect(seek.getAttribute('aria-valuetext')).toBe('0:01 of 2:31');

      // A drag to the seeker's middle: it is laid out 300 points wide.
      act(() =>
        (
          propsWith(seek, 'onLayout')['onLayout'] as (event: {
            readonly nativeEvent: { readonly layout: Record<string, number> };
          }) => void
        )({
          nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 32 } },
        }),
      );
      const pan = () => gestureOf('seek-pan');
      act(() => pan().onBegin?.({ x: 150 }));
      act(() => pan().onUpdate?.({ x: 150 }));
      expect(page.device.sought).toEqual([]);
      act(() => pan().onFinalize?.({ x: 150, canceled: false }));
      expect(page.device.sought).toHaveLength(1);
      expect(Math.abs((page.device.sought[0] ?? 0) - 75_500)).toBeLessThan(1_000);

      page.press('Pause hymn 100');
      yield* page.until(Player.$is('Paused'));
      expect(heightOf(page)).toBe(REST);
      expect(Option.isNone(page.find('[aria-label="Seek"]'))).toBe(true);
      expect(room()).toEqual([`${REST}px`]);
    }),
  );
});

describe('the capo and the key leave the sound alone', () => {
  it.live(
    'sends the player nothing for any capo, any key, a reset or a hold while hymn 100 plays',
    () =>
      Effect.gen(function* () {
        using page = mount(route(100));
        page.press('Play hymn 100');
        page.device.now = { state: 'playing', positionMs: 20_000, durationMs: 151_000 };
        yield* page.until((state) => Player.$is('Playing')(state) && state.at === 20);
        const sends = page.sends();
        const played = [...page.device.played];
        const still = () => {
          expect(page.sends()).toBe(sends);
          expect(page.device.played).toEqual(played);
          expect(page.device.sought).toEqual([]);
          const now = page.player();
          expect(now._tag).toBe('Playing');
          expect(Player.$is('Playing')(now) && now.track.number).toBe(100);
          expect(Player.$is('Playing')(now) && Math.abs(now.at - 20) <= 0.25).toBe(true);
        };
        tapKey(page);
        for (let capo = 0; capo < 12; capo += 1) {
          turn(page, 'Capo');
          still();
        }
        for (let key = 0; key < 12; key += 1) {
          turn(page, 'Key');
          still();
        }
        page.press('Reset');
        still();
        perform(keyButton(page), 'chords');
        still();
        perform(keyButton(page), 'chords');
        still();
      }),
  );
});

describe('the player sheet over a hymn page', () => {
  it.live(
    'holds the text size dial, the font, the spacing and keep-awake, and the page’s key dials',
    () =>
      Effect.sync(() => {
        const device = chordsOn();
        using page = mount(route(100, true), device);
        const sheet = page.get('[aria-label="Reading"]');
        expect(sheet.querySelector('[role="slider"][aria-label="Text size"]')).not.toBeNull();
        expect(sheet.querySelector('[aria-label="Font"]')).not.toBeNull();
        expect(sheet.querySelector('[aria-label="Line spacing"]')).not.toBeNull();
        expect(sheet.querySelector('[aria-label="Keep screen on"]')).not.toBeNull();
        const chords = page.get('[aria-label="Chords"]');
        expect(chords.querySelector('[role="slider"][aria-label="Key"]')).not.toBeNull();
        expect(chords.querySelector('[role="slider"][aria-label="Capo"]')).not.toBeNull();

        const size = () =>
          getComputedStyle(page.get('[data-testid="line"] [data-testid^="syllable-"]')).fontSize;
        expect(size()).toBe('17px');
        perform(
          Option.getOrThrow(Option.fromNullishOr(sheet.querySelector('[aria-label="Text size"]'))),
          'increment',
        );
        expect(size()).toBe('19px');
        expect(device.get('reading.size')).toBe('3');

        perform(
          Option.getOrThrow(Option.fromNullishOr(chords.querySelector('[aria-label="Capo"]'))),
          'increment',
        );
        expect(
          Option.isSome(Option.fromNullishOr(chords.querySelector('[aria-label="Reset"]'))),
        ).toBe(true);
      }),
  );
});
