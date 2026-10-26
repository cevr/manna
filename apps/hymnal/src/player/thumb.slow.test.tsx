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
import { spyOn } from 'bun:test';
import { describe, expect, it } from 'effect-bun-test';
import { Duration, Effect, Option, Stream } from 'effect';
import { TestClock } from 'effect/testing';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import { act, type ReactNode, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { createRoot } from 'react-dom/client';

import { hymnAt } from '~/hymns/hymns';
import type { ChordReader } from '~/reader/HymnPage';
import { HymnPage } from '~/reader/HymnPage';
import { Shown } from '~/reader/screen';
import { StackHeader } from '~/test/stack';

import { fakeDevice } from '../test/device';
import { drag, gestureOf } from '../test/gesture';
import { animations, holdAnimations, landAnimations } from '../test/reanimated';
import { params, routed } from '../test/one';
import { actionsOf, perform, propsWith } from '../test/props';
import { readerOn } from '../test/reader';
import { PlayerContext } from './context';
import { DETENT } from './dial';
import { ChordReaderContext, RESET_WAIT, ResetClock } from './Dials';
import { FullPlayer } from './FullPlayer';
import { Player, playerOn } from './player';
import { REST, RISE, SOUNDING } from './bar';
import { PageBar, PlayerBar } from './PlayerBar';

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

/** Turns the page of `turning`'s route to another hymn, as a settle of the pager does. */
const turned = { to: (_n: number) => {} };

function Turning({ first, reader }: { readonly first: number; readonly reader: ChordReader }) {
  const [n, setN] = useState(first);
  turned.to = setN;
  params['number'] = String(n);
  const hymn = Option.getOrThrow(hymnAt(String(n)));
  return (
    <>
      <View testID="page">
        <StackHeader />
        <Shown hymn={hymn} />
        <HymnPage hymn={hymn} reader={reader} />
        <PageBar track={hymn} />
      </View>
      <PlayerBar />
    </>
  );
}

/** The hymn route at `/hymns/<first>`, whose page the test turns (`turned.to`). */
const turning = (first: number) => (reader: ChordReader) => (
  <Turning first={first} reader={reader} />
);

/**
 * The stops dial `testID` draws at its notch, as their transforms place
 * them: each stop's own detent, its slot's distance from the notch under
 * half a detent.
 */
const atNotch = (page: Page, testID: string) =>
  page
    .all(`[data-testid^="${testID}-stop-"]`)
    .filter(
      (stop) =>
        Math.abs(
          Number.parseFloat(
            /translateX\((-?[\d.e+-]+)px\)/.exec(getComputedStyle(stop).transform)?.[1] ?? 'NaN',
          ),
        ) <
        DETENT / 2,
    )
    .map((stop) => Number(stop.getAttribute('data-testid')?.slice(`${testID}-stop-`.length)));

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
  // A reset's wait for its close runs on this clock, which the test moves: no real time passes.
  const clock = Effect.runSync(Effect.scoped(TestClock.make()));
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <RegistryContext value={registry}>
        <ChordReaderContext value={reader}>
          <ResetClock value={clock}>
            <PlayerContext value={Option.some(player)}>{screen(reader)}</PlayerContext>
          </ResetClock>
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
    /** The reset clock moved on `ms`, with React told of what was set as it moved. */
    advance: (ms: number) =>
      Effect.promise(() => act(() => Effect.runPromise(clock.adjust(Duration.millis(ms))))),
    /** Hymn `n`'s move written to the reader's store, as a dial elsewhere (the twin) writes it. */
    setMove: (n: number, move: { readonly transpose: number; readonly capo: number }) =>
      registry.set(reader.move(n), move),
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

/** One straight drag that starts on the detector of gesture `testID`; the test id of the pan that took it, if one did. */
const dragged = (testID: string, touch: Parameters<typeof drag>[1]) => {
  let took = Option.none<string>();
  act(() => void (took = drag(testID, touch)));
  return took;
};

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

  it.live(
    'takes a touch on the panel between its rows, so it never reaches the page under it',
    () =>
      Effect.sync(() => {
        using page = mount(route(100));
        tapKey(page);
        const panel = page.get('[data-testid="dials-panel"]');
        // The panel itself is a touch target while open: its padding and gaps do not pass a tap to the backdrop.
        expect(getComputedStyle(panel).pointerEvents).toBe('auto');
        holdAnimations();
        using _held = { [Symbol.dispose]: landAnimations };
        tapKey(page);
        // Once its close has started it takes no touch.
        expect(getComputedStyle(page.get('[data-testid="dials-panel"]')).pointerEvents).toBe(
          'none',
        );
      }),
  );

  it.live('fades the dials out on a page turn to a hymn with no chords, as on any page turn', () =>
    Effect.sync(() => {
      using page = mount(turning(100));
      tapKey(page);
      holdAnimations();
      using _held = { [Symbol.dispose]: landAnimations };
      // Hymn 126 has no chords yet: the panel still closes along its path, drawn as it was.
      act(() => turned.to(126));
      expect(page.find('[aria-label="Play hymn 126"]').pipe(Option.isSome)).toBe(true);
      expect(page.find('[data-testid="dials-panel"]').pipe(Option.isSome)).toBe(true);
      act(() => landAnimations());
      expect(page.find('[data-testid="dials-panel"]').pipe(Option.isNone)).toBe(true);
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

  it.live(
    'resets to the printed key and no capo where the reader sees it, and closes the dials after its wait',
    () =>
      Effect.gen(function* () {
        const device = chordsOn();
        using page = mount(route(100), device);
        tapKey(page);
        expect(Option.isNone(page.find('[aria-label="Reset"]'))).toBe(true);
        turn(page, 'Key');
        turn(page, 'Capo');
        expect(valueOf(page, 'Capo')).toEqual(Option.some('Capo 1, Db shapes'));
        expect(page.get('[aria-label="Reset"]').textContent).toBe('↺ Db, no capo');
        page.press('Reset');
        // The rows turn home with the dials still open, and the chip leaves.
        expect(device.get('move.100')).toBe('{"transpose":0,"capo":0}');
        expect(valueOf(page, 'Key')).toEqual(Option.some('Db'));
        expect(valueOf(page, 'Capo')).toEqual(Option.some('No capo'));
        expect(Option.isNone(page.find('[aria-label="Reset"]'))).toBe(true);
        yield* page.advance(RESET_WAIT / 2);
        expect(Option.isSome(dial(page, 'Key'))).toBe(true);
        yield* page.advance(RESET_WAIT / 2 + 100);
        expect(Option.isNone(dial(page, 'Key'))).toBe(true);

        // A double tap on a dial does the same.
        tapKey(page);
        turn(page, 'Capo');
        act(() => gestureOf('dial-capo-twice').onActivate?.({ x: 0 }));
        expect(device.get('move.100')).toBe('{"transpose":0,"capo":0}');
        expect(Option.isSome(dial(page, 'Key'))).toBe(true);
        yield* page.advance(RESET_WAIT + 100);
        expect(Option.isNone(dial(page, 'Key'))).toBe(true);
      }),
  );

  it.live('keeps the dials open after a reset when a dial is touched in its wait', () =>
    Effect.gen(function* () {
      using page = mount(route(100));
      tapKey(page);
      turn(page, 'Capo');
      page.press('Reset');
      act(() => gestureOf('dial-key-pan').onBegin?.({ x: 0 }));
      yield* page.advance(RESET_WAIT + 100);
      expect(Option.isSome(dial(page, 'Key'))).toBe(true);
    }),
  );

  it.live(
    'closes the dials at once on a tap of the key button in a reset’s wait, and opens them again',
    () =>
      Effect.gen(function* () {
        using page = mount(route(100));
        tapKey(page);
        turn(page, 'Capo');
        page.press('Reset');
        tapKey(page);
        expect(Option.isNone(dial(page, 'Key'))).toBe(true);
        tapKey(page);
        yield* page.advance(RESET_WAIT + 100);
        // The wait ended with the tap: the dials opened after it stay open.
        expect(Option.isSome(dial(page, 'Key'))).toBe(true);
      }),
  );

  it.live('keeps the player sheet’s dials after a reset there', () =>
    Effect.gen(function* () {
      using page = mount(route(100, true));
      const sheet = page.get('[role="group"][aria-label="Chord settings"]');
      perform(
        Option.getOrThrow(Option.fromNullishOr(sheet.querySelector('[aria-label="Capo"]'))),
        'increment',
      );
      act(() => {
        Option.getOrThrow(
          Option.fromNullishOr(sheet.querySelector('[aria-label="Reset"]')),
        ).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
      });
      yield* page.advance(RESET_WAIT + 100);
      expect(sheet.querySelector('[aria-label="Capo"]')?.getAttribute('aria-valuetext')).toBe(
        'No capo',
      );
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
      // A sideways drag from a third of the way to the middle seeks, once the finger lifts.
      expect(dragged('seek-pan', { x: 100, dx: 50, dy: 0 })).toEqual(Option.some('seek-pan'));
      expect(page.device.sought).toHaveLength(1);
      expect(Math.abs((page.device.sought[0] ?? 0) - 75_500)).toBeLessThan(1_000);
      expect(routed).toEqual([]);

      page.press('Pause hymn 100');
      yield* page.until(Player.$is('Paused'));
      expect(heightOf(page)).toBe(REST);
      expect(Option.isNone(page.find('[aria-label="Seek"]'))).toBe(true);
      expect(room()).toEqual([`${REST}px`]);
    }),
  );

  it.live('stands the Resume follow pill whole over the sounding bar', () =>
    Effect.gen(function* () {
      using page = mount(route(100));
      page.press('Play hymn 100');
      page.device.now = { state: 'playing', positionMs: 20_000, durationMs: 151_000 };
      yield* page.until((state) => Player.$is('Playing')(state) && state.at === 20);
      expect(heightOf(page)).toBe(SOUNDING);
      // A hand scroll, as the web sees it, holds the follow and shows the pill.
      act(() => {
        page
          .get('[data-testid="hymn-scroll"]')
          .dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -120 }));
      });
      const pill = page.get('[aria-label="Resume follow"]');
      // The page ends on the resting bar's top (its room is REST), so the sounding bar stands RISE over the page's foot.
      const frame = Option.getOrThrow(
        Option.fromNullishOr(page.get('[data-testid="hymn-scroll"]').parentElement),
      );
      let over = 0;
      for (let at = pill.parentElement; at && at !== frame; at = at.parentElement) {
        const style = getComputedStyle(at);
        if (style.position === 'absolute') over += Number.parseFloat(style.bottom) || 0;
      }
      expect(over).toBeGreaterThanOrEqual(RISE);
    }),
  );

  it.live('opens the sheet on a swipe up that starts on the seeker, and moves no place', () =>
    Effect.gen(function* () {
      using page = mount(route(100));
      page.press('Play hymn 100');
      page.device.now = { state: 'playing', positionMs: 20_000, durationMs: 151_000 };
      yield* page.until((state) => Player.$is('Playing')(state) && state.at === 20);
      const seek = page.get('[role="slider"][aria-label="Seek"]');
      // The swipe starts on the seeker's middle, the strip nearest the thumb, and goes up.
      expect(dragged('seek-pan', { x: 150, dx: 0, dy: -60 })).toEqual(Option.some('bar-swipe'));
      expect(routed).toEqual(['push /player?hymn=100']);
      expect(page.device.sought).toEqual([]);
      expect(seek.getAttribute('aria-valuetext')).toBe('0:20 of 2:31');
      // A swipe that wanders a little sideways on its way up is still the swipe.
      expect(dragged('seek-pan', { x: 150, dx: 6, dy: -60 })).toEqual(Option.some('bar-swipe'));
      expect(page.device.sought).toEqual([]);
    }),
  );

  it.live('springs up from rest on the first Play, and a page turn keeps the frame as it is', () =>
    Effect.gen(function* () {
      using page = mount(turning(100));
      const bar = (to: number) =>
        animations.filter((a) => a.kind === 'spring' && a.to === to && a.from !== a.to);
      animations.splice(0);
      // The first Play of a session: the page's own bar gives way to the docked one.
      page.press('Play hymn 100');
      page.device.now = { state: 'playing', positionMs: 1_000, durationMs: 151_000 };
      yield* page.until((state) => Player.$is('Playing')(state) && state.at === 1);
      expect(bar(SOUNDING).map((a) => a.from)).toEqual([REST]);
      expect(heightOf(page)).toBe(SOUNDING);

      const frame = page.get('[data-testid="bar-spring"]');
      const seek = page.get('[role="slider"][aria-label="Seek"]');
      animations.splice(0);
      act(() => turned.to(101));
      expect(page.find('[aria-label="Play hymn 101"]').pipe(Option.isSome)).toBe(true);
      // The same frame and seeker, and no spring started again.
      expect(page.get('[data-testid="bar-spring"]')).toBe(frame);
      expect(page.get('[role="slider"][aria-label="Seek"]')).toBe(seek);
      expect(animations.filter((a) => a.to === REST || a.to === SOUNDING)).toEqual([]);
      expect(heightOf(page)).toBe(SOUNDING);
    }),
  );
});

describe('a dial stopped by a touch', () => {
  it.live('snaps to the nearest detent when the touch never drags', () =>
    Effect.sync(() => {
      const device = chordsOn();
      using page = mount(route(100), device);
      tapKey(page);
      const pan = () => gestureOf('dial-capo-pan');
      holdAnimations();
      // Animations land at once again when the test ends, whatever it found.
      using _held = { [Symbol.dispose]: landAnimations };
      // A fling at the cap: the glide toward fret 11 is under way.
      act(() => pan().onBegin?.({ x: 0 }));
      act(() => pan().onActivate?.({ x: 0 }));
      act(() => pan().onUpdate?.({ x: 0, translationX: 0 }));
      act(() => pan().onDeactivate?.({ x: 0, translationX: 0, velocityX: -3000, canceled: false }));
      act(() => pan().onFinalize?.({ x: 0, canceled: false }));
      // A touch stops it half way, between frets 5 and 6, and lifts with no drag.
      act(() => pan().onBegin?.({ x: 0 }));
      act(() => pan().onFinalize?.({ x: 0, canceled: true }));
      act(() => landAnimations());
      expect(valueOf(page, 'Capo')).toEqual(Option.some('Capo 6, G shapes'));
      expect(device.get('move.100')).toBe('{"transpose":0,"capo":6}');
      // The row rests with fret 6 at the notch, not between two frets.
      expect(atNotch(page, 'dial-capo')).toEqual([6]);
    }),
  );

  // The capo two up comes home to fret 0; the key three up (E) comes home to Db, pitch 1.
  for (const { label, testID, said, home } of [
    { label: 'Capo', testID: 'dial-capo', said: 'No capo', home: 0 },
    { label: 'Key', testID: 'dial-key', said: 'Db', home: 1 },
  ])
    it.live(
      `lets a reset’s turn home end at home when a touch on the ${label} dial never drags`,
      () =>
        Effect.sync(() => {
          using page = mount(route(100), chordsOn());
          tapKey(page);
          turn(page, 'Key');
          turn(page, 'Key');
          turn(page, 'Key');
          turn(page, 'Capo');
          turn(page, 'Capo');
          holdAnimations();
          // Animations land at once again when the test ends, whatever it found.
          using _held = { [Symbol.dispose]: landAnimations };
          // The rows turn home, and a finger comes down on the moving dial and lifts with no drag.
          page.press('Reset');
          act(() => gestureOf(`${testID}-pan`).onBegin?.({ x: 0 }));
          act(() => gestureOf(`${testID}-pan`).onFinalize?.({ x: 0, canceled: true }));
          act(() => landAnimations());
          expect(valueOf(page, label)).toEqual(Option.some(said));
          // The row shows the value the dial holds, not the detent the touch stopped it nearest.
          expect(atNotch(page, testID)).toEqual([home]);
        }),
    );

  it.live('turns home on a Reset pressed while a finger rests on the Key dial (barfix m4)', () =>
    Effect.sync(() => {
      using page = mount(route(100), chordsOn());
      tapKey(page);
      for (let k = 0; k < 3; k += 1) turn(page, 'Key');
      holdAnimations();
      using _held = { [Symbol.dispose]: landAnimations };
      // A finger comes down on the still Key dial; a second finger presses Reset; the first lifts with no drag.
      act(() => gestureOf('dial-key-pan').onBegin?.({ x: 0 }));
      page.press('Reset');
      act(() => gestureOf('dial-key-pan').onFinalize?.({ x: 0, canceled: true }));
      act(() => landAnimations());
      expect(valueOf(page, 'Key')).toEqual(Option.some('Db'));
      expect(atNotch(page, 'dial-key')).toEqual([1]);
    }),
  );

  it.live(
    'lands where a capo set from outside, as the twin dial sets it, put it while a finger held the dial (barfix m3)',
    () =>
      Effect.sync(() => {
        using page = mount(route(100), chordsOn());
        tapKey(page);
        // The twin dial in the player sheet writes the hymn's move to the reader's store, as this does.
        const twin = (capo: number) => act(() => page.setMove(100, { transpose: 0, capo }));
        holdAnimations();
        using _held = { [Symbol.dispose]: landAnimations };
        // The twin dial turns the capo to 2: the row turns toward it.
        twin(2);
        // A finger on the dial stops that turn half way, at fret 1; the twin goes back to 1; the finger lifts.
        act(() => gestureOf('dial-capo-pan').onBegin?.({ x: 0 }));
        twin(1);
        act(() => gestureOf('dial-capo-pan').onFinalize?.({ x: 0, canceled: true }));
        act(() => landAnimations());
        expect(valueOf(page, 'Capo')).toEqual(Option.some('Capo 1, C shapes'));
        expect(atNotch(page, 'dial-capo')).toEqual([1]);
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
        const chords = page.get('[aria-label="Chord settings"]');
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

  it.live(
    'turns chords off and on by its Chords switch, with no hold, and sends the player nothing',
    () =>
      Effect.sync(() => {
        const device = chordsOn();
        using page = mount(route(100, true), device);
        const sends = page.sends();
        const toggle = () =>
          page.get('[aria-label="Chord settings"] [aria-label="Chords"]') as HTMLInputElement;
        const capo = () =>
          page.find('[aria-label="Chord settings"] [role="slider"][aria-label="Capo"]');
        expect(toggle().checked).toBe(true);
        act(() => toggle().click());
        expect(device.get('chords')).toBe('false');
        expect(toggle().checked).toBe(false);
        expect(page.all('[data-testid^="chord-"]')).toHaveLength(0);
        // With chords off the section holds the key dial alone, as over the bar.
        expect(Option.isNone(capo())).toBe(true);
        expect(keyButton(page).getAttribute('aria-valuetext')).toBe('Chords off');
        act(() => toggle().click());
        expect(device.get('chords')).toBe('true');
        expect(Option.isSome(capo())).toBe(true);
        expect(page.sends()).toBe(sends);
      }),
  );
});

/** The panel's transform as drawn, empty when it only fades. */
const panelMotion = (page: Page) =>
  getComputedStyle(page.get('[data-testid="dials-panel"]')).transform;

describe('the bar and its dials under Reduce Motion', () => {
  it.live('follow a change of the setting made while the bar is on screen (M9)', () =>
    Effect.gen(function* () {
      // The system's setting, as `AccessibilityInfo` tells it: off at the start, then changed by the test.
      const told = new Array<(on: boolean) => void>();
      // oxlint-disable-next-line effect/noModuleMocks -- the system's setting is React Native's own boundary, read by the bar's hook; the spy stands in for the system and is put back as the test ends.
      using _enabled = spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
      // oxlint-disable-next-line effect/noModuleMocks -- the system tells a change through this listener; the spy keeps the bar's handler so the test can tell one, and is put back as the test ends.
      using _listen = spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((
        _event: string,
        handler: (on: boolean) => void,
      ) => {
        told.push(handler);
        return { remove: () => void told.splice(told.indexOf(handler), 1) };
      }) as unknown as typeof AccessibilityInfo.addEventListener);
      using page = mount(route(100));
      // The setting's first read lands before the first tap.
      yield* Effect.promise(() => act(() => Effect.runPromise(Effect.void)));
      tapKey(page);
      // Motion allowed: the panel springs out of the key button, scaled and moved.
      expect(panelMotion(page)).toContain('scale(');
      tapKey(page);
      act(() => {
        for (const handler of [...told]) handler(true);
      });
      tapKey(page);
      // Reduce Motion on: the open is a fade alone.
      expect(panelMotion(page)).not.toContain('scale(');
      tapKey(page);
      act(() => {
        for (const handler of [...told]) handler(false);
      });
      tapKey(page);
      expect(panelMotion(page)).toContain('scale(');
    }),
  );
});

describe('the docked bar’s left edge (O3)', () => {
  it.live('goes back on a pan to the right from the docked bar’s edge, and only there', () =>
    Effect.gen(function* () {
      using page = mount(route(100));
      // The page's own bar lies in its screen, where the stack's edge pan reaches: no strip.
      expect(Option.isNone(page.find('[data-testid="bar-back-edge"]'))).toBe(true);
      page.press('Play hymn 100');
      page.device.now = { state: 'playing', positionMs: 1_000, durationMs: 151_000 };
      yield* page.until((state) => Player.$is('Playing')(state) && state.at === 1);
      // Docked under the stack, the bar has the strip over its left padding.
      expect(Option.isSome(page.find('[data-testid="bar-back-edge"]'))).toBe(true);
      const edge = gestureOf('bar-back-edge');
      act(() => edge.onDeactivate?.({ x: 4, translationX: 12, velocityX: 100, canceled: false }));
      expect(routed).toEqual([]);
      act(() => edge.onDeactivate?.({ x: 4, translationX: 80, velocityX: 100, canceled: false }));
      expect(routed).toEqual(['back']);
      act(() => edge.onDeactivate?.({ x: 4, translationX: 20, velocityX: 900, canceled: false }));
      expect(routed).toEqual(['back', 'back']);
    }),
  );
});

describe('a double tap on a dial at home (barfix m7)', () => {
  it.live('closes the dials at once, with no wait for a reset', () =>
    Effect.gen(function* () {
      using page = mount(route(100));
      tapKey(page);
      expect(Option.isSome(dial(page, 'Key'))).toBe(true);
      act(() => gestureOf('dial-capo-twice').onActivate?.({ x: 0 }));
      expect(Option.isNone(dial(page, 'Key'))).toBe(true);
      yield* page.advance(RESET_WAIT + 100);
      expect(Option.isNone(dial(page, 'Key'))).toBe(true);
    }),
  );
});
