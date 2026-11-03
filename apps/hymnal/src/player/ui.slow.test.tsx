/**
 * The player's controls on the web: the full player (`/player`) and the
 * bottom bar, over a hymn page or none, mounted in a browser's document
 * (`src/test/setup.ts`) over a player whose device the test holds
 * (`src/test/device.ts`).
 */

import { RegistryContext } from '@effect/atom-react';
import { describe, expect, it } from 'effect-bun-test';
import {
  Array as Arr,
  Deferred,
  Duration,
  Effect,
  Latch,
  Layer,
  Match,
  Option,
  Stream,
} from 'effect';
import type * as Atom from 'effect/reactivity/Atom';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import { act, type ReactNode, useEffect, useState } from 'react';
import { View } from 'react-native';
import { createRoot } from 'react-dom/client';

import { hymnAt } from '~/hymns/hymns';
import { endSpace } from '~/reader/end';
import { ListEnd } from '~/reader/ListEnd';
import { HymnScreen } from '~/reader/HymnScreen';
import { StackHeader } from '~/test/stack';
import { perform } from '~/test/props';
import { settings } from '~/store';
import { audioUrl } from '~/remote';
import { theme } from '~/theme';
import { book } from '~/follow/book';

import { fakeDevice } from '../test/device';
import { opened, opening, params, routed, safeArea, stack } from '../test/one';
import { PlayerContext } from './context';
import { FullPlayer } from './FullPlayer';
import { useShowsPage } from './page';
import { Command, Playback, Player, playerOn, type Track, type RecordingSelection } from './player';
import { RecordingNotice } from './RecordingNotice';
import { PlayerBar } from './PlayerBar';
import { StackBottom } from './StackBottom';
import { useCommitAtRest, useScrub } from './scrub';

const morning = Option.getOrThrow(hymnAt('100'));

const setValue = (input: HTMLInputElement, value: string) =>
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);

/** The reader's pointer on the bar: `pointerdown` opens a press, `pointerup` ends it. */
const pointer = (bar: HTMLInputElement, type: 'pointerdown' | 'pointerup' | 'pointercancel') =>
  bar.dispatchEvent(
    new PointerEvent(type, { bubbles: true, button: 0, pointerId: 1, pointerType: 'touch' }),
  );

/** The reader moves the bar to `value`: the browser sets it and says `input`. */
const drag = (bar: HTMLInputElement, value: string) => {
  setValue(bar, value);
  bar.dispatchEvent(new Event('input', { bubbles: true }));
};

/**
 * The browser's `change` after a drag: it fits the bar's value to its step,
 * as Chrome does and happy-dom does not, then says `change`.
 */
const release = (bar: HTMLInputElement) => {
  const step = Number(bar.step) || 1;
  setValue(bar, String(Math.round(Number(bar.value) / step) * step));
  bar.dispatchEvent(new Event('change', { bubbles: true }));
};
const praise = Option.getOrThrow(hymnAt('1'));

/** A hymn page shown, as its screen says to the bar. */
function Shows({ track }: { readonly track: Track }) {
  useShowsPage(track);
  return <></>;
}

/**
 * The full player over `track`'s page, opened on it (`/player?hymn=<n>`), as
 * a phone's sheet leaves the page mounted under it, with the bottom bar.
 */
const sheetOver = (track: Track) => {
  params['hymn'] = String(track.number);
  return (
    <>
      <Shows track={track} />
      <FullPlayer />
      <PlayerBar />
    </>
  );
};

/** The full player opened on `track` over no hymn page, as the web's sheet is over the home list. */
const sheetOn = (track: Track) => {
  params['hymn'] = String(track.number);
  return <FullPlayer />;
};

/** The bottom bar over `page`'s page, or over no hymn page. */
const barOver = (page: Option.Option<Track>) => (
  <>
    {Option.match(page, { onNone: () => <></>, onSome: (track) => <Shows track={track} /> })}
    <PlayerBar />
  </>
);

/** The hymn route at `/hymns/<n>`, its header and screen in `page`, and the bottom bar under it. */
const route = (n: number) => {
  params['number'] = String(n);
  return (
    <>
      <View testID="page">
        <StackHeader />
        <HymnScreen />
      </View>
      <PlayerBar />
    </>
  );
};

/** The route's params set back to none, as a test that set them ends. */
const clearParams = () => {
  for (const key of Object.keys(params)) delete params[key];
};

const schemes = ['light', 'dark'] as const;

/**
 * The page's roles as `scheme` gives them (`color.ts` writes each as a
 * `light-dark()` of the two, which the test's document does not resolve);
 * they go when the `using` ends.
 */
const showing = (scheme: (typeof schemes)[number]) => {
  const style = document.createElement('style');
  style.textContent = `:root { ${Object.entries(theme[scheme])
    .map(([role, value]) => `--${role}: ${value};`)
    .join(' ')} }`;
  document.head.append(style);
  return { [Symbol.dispose]: () => style.remove() };
};

/** A CSS colour (`#rgb`, `#rrggbb`, `rgb()` or `rgba()`) as its red, green and blue. */
const rgbOf = (css: string): string => {
  const text = css.trim().toLowerCase();
  const hex = (digits: string) =>
    Match.value(digits.length).pipe(
      Match.when(3, () => [...digits].map((digit) => Number.parseInt(digit.repeat(2), 16))),
      Match.orElse(() => [0, 2, 4].map((at) => Number.parseInt(digits.slice(at, at + 2), 16))),
    );
  return Option.fromNullishOr(/^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text)?.[1]).pipe(
    Option.map(hex),
    Option.orElse(() =>
      Option.map(Option.fromNullishOr(/^rgba?\(([^)]*)\)$/.exec(text)?.[1]), (channels) =>
        channels
          .split(/[\s,/]+/)
          .slice(0, 3)
          .map(Number),
      ),
    ),
    Option.map((channels) => `rgb(${channels.join(', ')})`),
    Option.getOrThrowWith(() => `not a colour: ${css}`),
  );
};

/** `text` split at its commas outside parentheses. */
const topLevel = (text: string) => {
  const parts = [''];
  let depth = 0;
  for (const char of text) {
    depth += Match.value(char).pipe(
      Match.when('(', () => 1),
      Match.when(')', () => -1),
      Match.orElse(() => 0),
    );
    if (char === ',' && depth === 0) parts.push('');
    else parts.push(`${parts.pop()}${char}`);
  }
  return parts.map((part) => part.trim());
};

/** A gradient's direction (`to right` or `90deg`) in degrees. */
const degrees = (direction: string) =>
  Match.value(direction).pipe(
    Match.when('top', () => 0),
    Match.when('right', () => 90),
    Match.when('bottom', () => 180),
    Match.when('left', () => 270),
    Match.orElse(Number),
  );

/**
 * A `linear-gradient()` as drawn: its angle, and the colour at each share
 * of its length (0 to 100), or `blend` where two colours meet over a span.
 * Each stop takes its positions in percent; a stop with none sits at the
 * start (the first) or the end (the last).
 */
const gradientOf = (css: string) => {
  const inner = Option.getOrThrow(
    Option.fromNullishOr(/^linear-gradient\((.*)\)$/.exec(css.trim())?.[1]),
  );
  const [head = '', ...rest] = topLevel(inner);
  const turned = Option.fromNullishOr(
    /^to (\w+)$/.exec(head)?.[1] ?? /^(-?[\d.]+)deg$/.exec(head)?.[1],
  );
  const angle = Option.match(turned, { onNone: () => 180, onSome: degrees });
  const listed = Option.match(turned, { onNone: () => [head, ...rest], onSome: () => rest });
  const stops = listed.flatMap((stop, index) => {
    const [colour = '', ...at] = topLevel(stop.replace(/\s+(?=-?[\d.]+%)/g, ','));
    const places = Match.value(at.length).pipe(
      Match.when(0, () => [Math.min(index, 1) * 100]),
      Match.orElse(() => at.map(Number.parseFloat)),
    );
    return places.map((place) => ({ colour: rgbOf(colour), place }));
  });
  const at = (share: number) => {
    const before = Arr.findLast(stops, (stop) => stop.place < share);
    const after = Arr.findFirst(stops, (stop) => stop.place > share);
    return Option.getOrThrow(
      Option.firstSomeOf([
        Option.map(
          Arr.findFirst(stops, (stop) => stop.place === share),
          (stop) => stop.colour,
        ),
        Option.zipWith(before, after, (from, to) =>
          Match.value(from.colour === to.colour).pipe(
            Match.when(true, () => from.colour),
            Match.orElse(() => 'blend'),
          ),
        ),
        Option.map(
          Option.orElse(before, () => after),
          (stop) => stop.colour,
        ),
      ]),
    );
  };
  return { angle, at };
};

/**
 * `screen` (by default the full player over hymn 100's page) over a fresh
 * player, mounted in the document; it unmounts when the test's `using` ends.
 */
const mount = (
  screen: ReactNode = sheetOver(morning),
  observing: Effect.Effect<void> = Effect.void,
) => {
  opened.splice(0);
  const { device, layer } = fakeDevice();
  const controlled = Layer.effect(Playback)(
    Effect.map(Playback, (device) => ({
      ...device,
      status: observing.pipe(Effect.andThen(device.status)),
    })),
  ).pipe(Layer.provide(layer));
  const player = playerOn(controlled, Duration.millis(1));
  const registry = AtomRegistry.make();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <RegistryContext value={registry}>
        <PlayerContext value={Option.some(player)}>{screen}</PlayerContext>
      </RegistryContext>,
    ),
  );
  /** Wait, as the page shows each change, until the player's state is one `holds` is true of. */
  const until = (holds: (player: Player) => boolean) =>
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
  const find = (selector: string) => Option.fromNullishOr(host.querySelector(selector));
  /** The position bar, once it shows. */
  const bar = () =>
    Option.getOrThrow(
      Option.filter(
        find('input[type="range"]'),
        (found): found is HTMLInputElement => found instanceof HTMLInputElement,
      ),
    );
  const press = (label: string) =>
    act(() => {
      const target = Option.getOrThrow(find(`[aria-label="${label}"]`));
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });
  return {
    device,
    until,
    find,
    /** Every element `selector` matches. */
    all: (selector: string) => [...host.querySelectorAll(selector)],
    bar,
    press,
    /** A command from elsewhere in the app: another hymn's page, or the lock screen. */
    send: (command: Command) => act(() => registry.set(player.send, command)),
    /** An atom's value in the page's registry: a setting as the page reads it. */
    get: <A,>(atom: Atom.Atom<A>) => registry.get(atom),
    /** An atom set from outside the page: a setting the reader set elsewhere. */
    set: <R, W>(atom: Atom.Writable<R, W>, value: W) => act(() => registry.set(atom, value)),
    text: () => host.textContent,
    /** The player's state now. */
    player: () => registry.get(player.state),
    selection: (selection: Option.Option<RecordingSelection>) =>
      act(() => registry.set(player.recording, selection)),
    [Symbol.dispose]: () => {
      act(() => root.unmount());
      host.remove();
      registry.dispose();
      clearParams();
    },
  };
};

describe('the full player', () => {
  it.live('shows a recording fallback only for its held hymn and an unequal effective key', () =>
    Effect.sync(() => {
      using screen = mount(
        <>
          <RecordingNotice number={100} />
          <RecordingNotice number={3} />
        </>,
      );
      expect(screen.all('[role="status"]').length).toBe(0);
      screen.selection(Option.some({ number: 100, requested: 2, effective: 0 }));
      expect(screen.all('[role="status"]').length).toBe(1);
      expect(screen.find('[data-testid="recording-key-fallback"]').pipe(Option.isSome)).toBe(true);
      screen.selection(Option.some({ number: 100, requested: 0, effective: 0 }));
      expect(screen.all('[role="status"]').length).toBe(0);
      screen.selection(Option.some({ number: 4, requested: 2, effective: 0 }));
      expect(screen.all('[role="status"]').length).toBe(0);
      screen.selection(Option.some({ number: 3, requested: -1, effective: 0 }));
      expect(screen.all('[role="status"]').length).toBe(1);
      screen.selection(Option.none());
      expect(screen.all('[role="status"]').length).toBe(0);
    }),
  );
  it.live('plays hymn 100: loading, then playing with its place and length, then paused', () =>
    Effect.gen(function* () {
      using page = mount();
      expect(page.text()).toContain('Recording');
      page.press('Play hymn 100');
      yield* page.until(Player.$is('Loading'));
      expect(page.device.played).toEqual([audioUrl(100)]);
      expect(page.text()).toContain('Loading the recording…');
      expect(Option.isSome(page.find('[aria-label="Loading hymn 100"]'))).toBe(true);

      page.device.now = { state: 'playing', positionMs: 62_000, durationMs: 151_000 };
      yield* page.until(Player.$is('Playing'));
      const bar = page.bar();
      expect({
        value: bar.getAttribute('value'),
        max: bar.getAttribute('max'),
        said: bar.getAttribute('aria-valuetext'),
      }).toEqual({ value: '62', max: '151', said: '1:02 of 2:31' });
      expect(page.text()).toContain('1:02');
      expect(page.text()).toContain('2:31');

      page.press('Pause hymn 100');
      yield* page.until(Player.$is('Paused'));
      expect(page.text()).toContain('Paused');
      expect(Option.isSome(page.find('[aria-label="Play hymn 100"]'))).toBe(true);
    }),
  );

  it.live('seeks once the reader lets go of the bar, and the bar then follows playback', () =>
    Effect.gen(function* () {
      using page = mount();
      page.press('Play hymn 100');
      page.device.now = { state: 'playing', positionMs: 10_400, durationMs: 151_000 };
      yield* page.until((player) => Player.$is('Playing')(player) && player.at === 10.4);
      const bar = page.bar();

      act(() => void pointer(bar, 'pointerdown'));
      act(() => drag(bar, '75'));
      expect(page.device.sought).toEqual([]);
      act(() => void pointer(bar, 'pointerup'));
      yield* page.device.reads(3);
      page.device.now = { ...page.device.now, positionMs: 75_400 };
      yield* page.until((player) => Player.$is('Playing')(player) && player.at === 75.4);
      act(() => release(bar));
      expect(page.device.sought).toEqual([75_000]);

      page.device.now = { ...page.device.now, positionMs: 80_400 };
      yield* page.until((player) => Player.$is('Playing')(player) && player.at === 80.4);
      expect(bar.getAttribute('aria-valuetext')).toBe('1:20 of 2:31');
      act(
        () => void bar.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Shift' })),
      );
      act(() => void bar.dispatchEvent(new Event('change', { bubbles: true })));
      expect(page.device.sought).toEqual([75_000]);
    }),
  );

  it.live('sends nothing on a `change` the browser fits from a fractional place', () =>
    Effect.gen(function* () {
      using page = mount();
      page.press('Play hymn 100');
      page.device.now = { state: 'playing', positionMs: 80_400, durationMs: 151_000 };
      yield* page.until((player) => Player.$is('Playing')(player) && player.at === 80.4);
      const bar = page.bar();

      act(() => {
        setValue(bar, '80');
        bar.dispatchEvent(new Event('change', { bubbles: true }));
      });
      page.device.now = { ...page.device.now, positionMs: 85_400 };
      yield* page.until((player) => Player.$is('Playing')(player) && player.at === 85.4);
      expect(bar.getAttribute('aria-valuetext')).toBe('1:25 of 2:31');
      expect(page.device.sought).toEqual([]);
    }),
  );

  it.live('seeks a key’s step at once, with no press', () =>
    Effect.gen(function* () {
      using page = mount();
      page.press('Play hymn 100');
      page.device.now = { state: 'playing', positionMs: 40_200, durationMs: 151_000 };
      yield* page.until((player) => Player.$is('Playing')(player) && player.at === 40.2);
      const bar = page.bar();

      act(() => drag(bar, '41'));
      expect(page.device.sought).toEqual([41_000]);
      act(() => void bar.dispatchEvent(new Event('change', { bubbles: true })));
      expect(page.device.sought).toEqual([41_000]);
    }),
  );

  it.live('opens no press on the other buttons: a key’s step after one still seeks', () =>
    Effect.gen(function* () {
      using page = mount();
      page.press('Play hymn 100');
      page.device.now = { state: 'playing', positionMs: 40_200, durationMs: 151_000 };
      yield* page.until((player) => Player.$is('Playing')(player) && player.at === 40.2);
      const bar = page.bar();

      act(
        () =>
          void bar.dispatchEvent(
            new PointerEvent('pointerdown', { bubbles: true, button: 2, pointerType: 'mouse' }),
          ),
      );
      act(() => drag(bar, '41'));
      expect(page.device.sought).toEqual([41_000]);
    }),
  );

  it.live('holds the place it sent until the player reaches it', () =>
    Effect.gen(function* () {
      using page = mount();
      page.press('Play hymn 100');
      page.device.now = { state: 'playing', positionMs: 10_000, durationMs: 151_000 };
      yield* page.until(Player.$is('Playing'));
      const bar = page.bar();

      page.device.lagging = true;
      act(() => {
        pointer(bar, 'pointerdown');
        drag(bar, '75');
        pointer(bar, 'pointerup');
        release(bar);
      });
      expect(page.device.sought).toEqual([75_000]);
      page.device.now = { ...page.device.now, positionMs: 10_500 };
      yield* page.until((player) => Player.$is('Playing')(player) && player.at === 75);
      expect(bar.getAttribute('aria-valuetext')).toBe('1:15 of 2:31');

      page.device.now = { ...page.device.now, positionMs: 75_000 };
      yield* page.device.reads(3);
      page.device.now = { ...page.device.now, positionMs: 75_200 };
      yield* page.until((player) => Player.$is('Playing')(player) && player.at === 75.2);
      page.device.now = { ...page.device.now, positionMs: 80_000 };
      yield* page.until((player) => Player.$is('Playing')(player) && player.at === 80);
      expect(bar.getAttribute('aria-valuetext')).toBe('1:20 of 2:31');
    }),
  );

  it.live('drops a drag the page takes away, unsent', () =>
    Effect.gen(function* () {
      using page = mount();
      page.press('Play hymn 100');
      page.device.now = { state: 'playing', positionMs: 10_000, durationMs: 151_000 };
      yield* page.until(Player.$is('Playing'));
      const bar = page.bar();

      act(() => {
        pointer(bar, 'pointerdown');
        drag(bar, '95');
        pointer(bar, 'pointercancel');
      });
      page.device.now = { ...page.device.now, positionMs: 80_000 };
      yield* page.until((player) => Player.$is('Playing')(player) && player.at === 80);
      expect(bar.getAttribute('aria-valuetext')).toBe('1:20 of 2:31');
      expect(page.device.sought).toEqual([]);
    }),
  );

  it.live('keeps the bar and Pause while the recording loads again mid-hymn', () =>
    Effect.gen(function* () {
      using page = mount();
      page.press('Play hymn 100');
      page.device.now = { state: 'playing', positionMs: 60_000, durationMs: 151_000 };
      yield* page.until(Player.$is('Playing'));

      page.device.now = { state: 'loading', positionMs: 61_000 };
      yield* page.until((player) => Player.$is('Playing')(player) && player.at === 61);
      expect(page.bar().getAttribute('aria-valuetext')).toBe('1:01 of 2:31');

      page.press('Pause hymn 100');
      yield* page.until(Player.$is('Paused'));
      expect(page.device.now.state).toBe('paused');
    }),
  );

  it.live(
    'says a recording needs a connection when the device is offline, and plays on Retry',
    () =>
      Effect.gen(function* () {
        using page = mount();
        page.device.online = false;
        page.press('Play hymn 100');
        yield* page.until(Player.$is('Failed'));
        expect(page.text()).toContain('The recording needs a connection.');

        page.device.online = true;
        page.press('Retry hymn 100');
        yield* page.until(Player.$is('Loading'));
        expect(page.device.played).toEqual([audioUrl(100), audioUrl(100)]);
      }),
  );

  it.live(
    'offers Play on another hymn’s page while hymn 100 plays, and playing it replaces 100',
    () =>
      Effect.gen(function* () {
        using page = mount(sheetOver(praise));
        page.send(Command.Start({ track: morning }));
        page.device.now = { state: 'playing', positionMs: 5_000, durationMs: 151_000 };
        yield* page.until(Player.$is('Playing'));
        expect(Option.getOrThrow(page.find('[aria-label="Play hymn 1"]')).textContent).toBe(
          'Play 1',
        );

        page.press('Play hymn 1');
        yield* page.until((player) => Player.$is('Loading')(player) && player.track.number === 1);
        expect(page.device.played).toEqual([audioUrl(100), audioUrl(1)]);
        expect(Option.getOrThrow(page.find('[aria-label="Open player"]')).textContent).toBe('');
      }),
  );
  it.live('draws Play and Pause in the text on the accent, on an accent fill, in each scheme', () =>
    Effect.gen(function* () {
      using page = mount();
      /** The button's fill and its title's colour, as the document computes them. */
      const drawn = (label: string) => {
        const button = Option.getOrThrow(
          Option.filter(
            page.find(`[aria-label="${label}"]`),
            (found): found is HTMLElement => found instanceof HTMLElement,
          ),
        );
        const title = Option.getOrThrow(Option.fromNullishOr(button.firstElementChild));
        return {
          fill: rgbOf(getComputedStyle(button).backgroundColor),
          title: rgbOf(getComputedStyle(title).color),
        };
      };
      const each = (label: string) => {
        for (const scheme of schemes) {
          using _ = showing(scheme);
          expect(drawn(label)).toEqual({
            fill: rgbOf(theme[scheme].accent),
            title: rgbOf(theme[scheme].onAccent),
          });
        }
      };
      each('Play hymn 100');
      const textOf = (label: string) =>
        Option.map(page.find(`[aria-label="${label}"]`), (found) => found.textContent);
      expect(textOf('Play hymn 100')).toEqual(Option.some('Play'));
      page.press('Play hymn 100');
      page.device.now = { state: 'playing', positionMs: 5_000, durationMs: 151_000 };
      yield* page.until(Player.$is('Playing'));
      each('Pause hymn 100');
      expect(textOf('Pause hymn 100')).toEqual(Option.some('Pause'));

      const held = Option.getOrThrow(page.find('[aria-label="Pause hymn 100"]'));
      act(() => {
        held.dispatchEvent(
          new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: ' ' }),
        );
      });
      for (const scheme of schemes) {
        using _ = showing(scheme);
        expect(drawn('Pause hymn 100')).toEqual({
          fill: rgbOf(theme[scheme].pressed),
          title: rgbOf(theme[scheme].onPressed),
        });
      }
    }),
  );

  it.live('draws the part played in the accent and the rest in the line role, in each scheme', () =>
    Effect.gen(function* () {
      using page = mount();
      page.press('Play hymn 100');
      page.device.now = { state: 'playing', positionMs: 75_000, durationMs: 150_000 };
      yield* page.until(Player.$is('Playing'));
      for (const scheme of schemes) {
        using _ = showing(scheme);
        const track = gradientOf(getComputedStyle(page.bar()).backgroundImage);
        const accent = rgbOf(theme[scheme].accent);
        const line = rgbOf(theme[scheme].line);
        expect(track.angle).toBe(90);
        expect([0, 25, 49, 51, 75, 100].map(track.at)).toEqual([
          accent,
          accent,
          accent,
          line,
          line,
          line,
        ]);
      }
    }),
  );
});

describe('the full player’s title', () => {
  /** The stack under the sheet: `under`, then the sheet on hymn 100, shown. */
  const over = (under: ReadonlyArray<{ readonly name: string; readonly params?: object }>) => {
    stack.state = {
      routes: [...under, { name: 'player', params: { hymn: '100' } }],
      index: under.length,
    };
    routed.splice(0);
  };
  const title = `100, ${morning.title}`;

  it.live(
    'is a button named by its hymn that closes the sheet over that hymn’s page, the track playing on',
    () =>
      Effect.gen(function* () {
        over([{ name: 'index' }, { name: 'hymns/[number]', params: { number: '100' } }]);
        using page = mount();
        page.press('Play hymn 100');
        page.device.now = { state: 'playing', positionMs: 30_000, durationMs: 151_000 };
        yield* page.until(Player.$is('Playing'));
        const button = Option.getOrThrow(page.find(`[aria-label="${title}"]`));
        expect(button.getAttribute('role')).toBe('button');
        expect(button.textContent).toBe(`100 ${morning.title}`);
        page.press(title);
        expect(routed).toEqual(['back']);
        yield* page.device.reads(2);
        expect(page.device.played).toEqual([audioUrl(100)]);
        expect(Player.$is('Playing')(page.player())).toBe(true);
      }),
  );

  it.live(
    'closes the sheet and pushes that hymn’s page over the home list, paused, the track kept',
    () =>
      Effect.gen(function* () {
        over([{ name: 'index' }]);
        using page = mount(sheetOn(morning));
        page.press('Play hymn 100');
        page.device.now = { state: 'playing', positionMs: 30_000, durationMs: 151_000 };
        yield* page.until(Player.$is('Playing'));
        page.press('Pause hymn 100');
        yield* page.until(Player.$is('Paused'));
        page.press(title);
        expect(routed).toEqual(['back', 'push /hymns/100']);
        expect(Player.$is('Paused')(page.player())).toBe(true);
      }),
  );

  it.live('closes the sheet and pushes that hymn’s page over another hymn’s page', () =>
    Effect.sync(() => {
      over([{ name: 'index' }, { name: 'hymns/[number]', params: { number: '3' } }]);
      using page = mount();
      page.press(title);
      expect(routed).toEqual(['back', 'push /hymns/100']);
    }),
  );

  it.live('replaces the sheet with that hymn’s page when no screen is under it', () =>
    Effect.sync(() => {
      over([]);
      using page = mount();
      page.press(title);
      expect(routed).toEqual(['replace /hymns/100']);
    }),
  );
});

describe('the full player in every state', () => {
  it.live('shows the hymn, its button, the Position bar and both times, still with no length', () =>
    Effect.gen(function* () {
      using page = mount();
      const shows = (button: string, still: boolean, times: ReadonlyArray<string>) => {
        const heading = Option.getOrThrow(page.find('[role="heading"][aria-level="1"]'));
        expect(heading.textContent).toBe(`100 ${morning.title}`);
        expect(Option.isSome(page.find(`[aria-label="${button}"]`))).toBe(true);
        const bar = page.bar();
        expect(bar.getAttribute('aria-label')).toBe('Position');
        expect(bar.disabled).toBe(still);
        for (const time of times) expect(page.text()).toContain(time);
      };
      shows('Play hymn 100', true, ['0:00', '–:––']);

      page.press('Play hymn 100');
      yield* page.until(Player.$is('Loading'));
      shows('Loading hymn 100', true, ['0:00', '–:––']);

      page.device.now = { state: 'playing', positionMs: 30_000, durationMs: 120_000 };
      yield* page.until(Player.$is('Playing'));
      shows('Pause hymn 100', false, ['0:30', '2:00']);

      page.press('Pause hymn 100');
      yield* page.until(Player.$is('Paused'));
      shows('Play hymn 100', false, ['0:30', '2:00']);
    }),
  );

  it.live('keeps the Position bar, still, once a recording fails', () =>
    Effect.gen(function* () {
      using page = mount();
      page.device.online = false;
      page.press('Play hymn 100');
      yield* page.until(Player.$is('Failed'));
      expect(page.bar().disabled).toBe(true);
      expect(Option.isSome(page.find('[aria-label="Retry hymn 100"]'))).toBe(true);
    }),
  );
});

/** The bar's button named `label`: its text, the mark it holds, and its `aria-checked`. */
const markOf = (bar: Element, label: string) => {
  const button = Option.getOrThrow(
    Option.fromNullishOr(bar.querySelector(`[aria-label="${label}"]`)),
  );
  const mark = Option.fromNullishOr(button.querySelector('[data-testid^="mark-"]'));
  return {
    text: button.textContent,
    mark: Option.match(mark, {
      onNone: () => 'none',
      onSome: (found) => (found.getAttribute('data-testid') ?? '').slice('mark-'.length),
    }),
    checked: Option.fromNullishOr(button.getAttribute('aria-checked')),
  };
};

describe('the bottom bar', () => {
  it.live(
    'draws nothing off a hymn page until a hymn plays, then shows it and opens the player',
    () =>
      Effect.gen(function* () {
        using page = mount(barOver(Option.none()));
        expect(Option.isNone(page.find('[aria-label="Player"]'))).toBe(true);

        page.send(Command.Start({ track: morning }));
        page.device.now = { state: 'playing', positionMs: 5_000, durationMs: 151_000 };
        yield* page.until(Player.$is('Playing'));
        const bar = Option.getOrThrow(page.find('[aria-label="Player"]'));
        expect(bar.querySelector('[aria-label="Open player"]')?.textContent).toBe(
          `100${morning.title}`,
        );
        expect(bar.querySelector('[aria-label="Key"]')).toBeNull();
        expect(markOf(bar, 'Sound')).toEqual({
          text: '',
          mark: 'sound-on',
          checked: Option.some('true'),
        });
        expect(markOf(bar, 'Pause hymn 100')).toEqual({
          text: '',
          mark: 'pause',
          checked: Option.none(),
        });

        page.press('Open player');
        expect(opened).toEqual(['/player?hymn=100']);
      }),
  );

  it.live('pauses from the bar while another hymn’s page shows, then gives way to the page', () =>
    Effect.gen(function* () {
      using page = mount(barOver(Option.some(praise)));
      page.send(Command.Start({ track: morning }));
      page.device.now = { state: 'playing', positionMs: 5_000, durationMs: 151_000 };
      yield* page.until(Player.$is('Playing'));
      const opener = () =>
        page.find('[aria-label="Open player"]').pipe(Option.map((e) => e.textContent));
      expect(opener()).toEqual(Option.some(`100${morning.title}`));
      expect(Option.isSome(page.find('[aria-label="Play hymn 1"]'))).toBe(true);

      page.press('Pause hymn 100');
      yield* page.until(Player.$is('Paused'));
      expect(page.device.now.state).toBe('paused');
      expect(opener()).toEqual(Option.some(''));
      expect(Option.isSome(page.find('[aria-label="Play hymn 1"]'))).toBe(true);
    }),
  );
});

describe('a list’s end over the bottom bar', () => {
  /** A phone list's end space in the layout's stack, and the bar docked under it. */
  const home = (
    <>
      <StackBottom>
        <ListEnd />
      </StackBottom>
      <PlayerBar />
    </>
  );
  const heightOf = (found: Option.Option<Element>) =>
    Option.map(found, (e) => Number.parseFloat(getComputedStyle(e).height));
  const paddingOf = (found: Option.Option<Element>) =>
    Option.map(found, (e) => Number.parseFloat(getComputedStyle(e).paddingBottom));

  it.live('ends over the home indicator with no bar, and over the bar once a hymn is held', () =>
    Effect.gen(function* () {
      safeArea.bottom = 34;
      using page = mount(home);
      const end = () => page.find('[data-testid="list-end"]');
      expect(Option.isNone(page.find('[aria-label="Player"]'))).toBe(true);
      expect(heightOf(end())).toEqual(Option.some(endSpace(34)));

      page.send(Command.Start({ track: morning }));
      page.device.now = { state: 'playing', positionMs: 5_000, durationMs: 151_000 };
      yield* page.until(Player.$is('Playing'));
      expect(paddingOf(page.find('[aria-label="Player"]'))).toEqual(Option.some(34));
      expect(heightOf(end())).toEqual(Option.some(endSpace(0)));
      expect(endSpace(0)).toBeGreaterThanOrEqual(24);
    }).pipe(Effect.ensuring(Effect.sync(() => void (safeArea.bottom = 0)))),
  );
});

describe('the hymn page with the bottom bar', () => {
  const three = Option.getOrThrow(hymnAt('3'));
  const inPage = (page: ReturnType<typeof mount>, selector: string) =>
    page.find(`[data-testid="page"] ${selector}`);

  it.live('holds no player in the page; the bar holds hymn 3 and plays it', () =>
    Effect.gen(function* () {
      using page = mount(route(3));
      expect(
        Option.isNone(inPage(page, '[data-testid="hymn-scroll"] [aria-label="Play hymn 3"]')),
      ).toBe(true);
      expect(
        Option.isNone(inPage(page, '[data-testid="hymn-scroll"] [aria-label="Recording"]')),
      ).toBe(true);
      const bar = Option.getOrThrow(page.find('[aria-label="Player"]'));
      expect(bar.querySelector('[aria-label="Play hymn 3"]')).not.toBeNull();
      expect(
        [...bar.querySelectorAll('[role="button"]')].map((button) =>
          button.getAttribute('aria-label'),
        ),
      ).toEqual(['Key', 'Open player', 'Sound', 'Play hymn 3']);
      expect(bar.querySelector('[aria-label="Open player"]')?.textContent).toBe('');
      expect(markOf(bar, 'Play hymn 3')).toEqual({
        text: '',
        mark: 'play',
        checked: Option.none(),
      });

      page.press('Play hymn 3');
      yield* page.until(Player.$is('Loading'));
      expect(page.device.played).toEqual([audioUrl(3)]);
    }),
  );

  it.live(
    'draws the bar in the page while nothing is held, and docks it under the stack once a hymn is',
    () =>
      Effect.gen(function* () {
        using page = mount(route(3));
        const bars = () => page.all('[aria-label="Player"]');
        expect(bars()).toHaveLength(1);
        expect(Option.isSome(inPage(page, '[aria-label="Player"]'))).toBe(true);

        page.press('Play hymn 3');
        yield* page.until(Player.$is('Loading'));
        expect(bars()).toHaveLength(1);
        expect(Option.isNone(inPage(page, '[aria-label="Player"]'))).toBe(true);
        expect(bars()[0]?.querySelector('[aria-label="Loading hymn 3"]')).not.toBeNull();
      }),
  );

  it.live(
    'fills the seeker to the share played while the hymn plays, and the bar says the place',
    () =>
      Effect.gen(function* () {
        using page = mount(route(3));
        page.press('Play hymn 3');
        page.device.now = { state: 'playing', positionMs: 30_000, durationMs: 120_000 };
        yield* page.until((player) => Player.$is('Playing')(player) && player.at === 30);
        const seek = Option.getOrThrow(page.find('[role="slider"][aria-label="Seek"]'));
        const played = Option.getOrThrow(page.find('[data-testid="seek-played"]'));
        expect(getComputedStyle(played).width).toBe('25%');
        expect(seek.getAttribute('aria-valuetext')).toBe('0:30 of 2:00');
        expect(
          Option.getOrThrow(page.find('[aria-label="Open player"]')).getAttribute('aria-valuetext'),
        ).toBe('0:30 of 2:00');
      }),
  );

  it.live('holds no button in the header: the key button is the bar’s, at the thumb', () =>
    Effect.sync(() => {
      using page = mount(route(3));
      const header = Option.getOrThrow(page.find('[data-testid="header"]'));
      expect(header.querySelectorAll('[role="button"]')).toHaveLength(0);
      expect(Option.isNone(page.find('[aria-label="Aa"]'))).toBe(true);
      expect(Option.isNone(page.find('[aria-label="Chords"]'))).toBe(true);
      const key = Option.getOrThrow(page.find('[aria-label="Player"] [aria-label="Key"]'));
      expect(key.getAttribute('role')).toBe('button');
      expect(Option.isNone(page.find('[role="switch"]'))).toBe(true);
    }),
  );

  it.live('opens the full player from the bar’s body', () =>
    Effect.sync(() => {
      using page = mount(route(3));
      page.press('Open player');
      expect(opened).toEqual(['/player?hymn=3']);
    }),
  );

  it.live('shows hymn 3 sounding on hymn 4’s page, and plays 4 from its compact Play', () =>
    Effect.gen(function* () {
      using page = mount(route(4));
      page.send(Command.Start({ track: three }));
      page.device.now = { state: 'playing', positionMs: 5_000, durationMs: 120_000 };
      yield* page.until(Player.$is('Playing'));
      const bar = Option.getOrThrow(page.find('[aria-label="Player"]'));
      expect(bar.querySelector('[aria-label="Open player"]')?.textContent).toBe(`3${three.title}`);
      expect(bar.querySelector('[aria-label="Pause hymn 3"]')).not.toBeNull();

      page.press('Play hymn 4');
      yield* page.until((player) => Player.$is('Loading')(player) && player.track.number === 4);
      expect(page.device.played).toEqual([audioUrl(3), audioUrl(4)]);
      expect(bar.querySelector('[aria-label="Open player"]')?.textContent).toBe('');
      expect(bar.querySelector('[aria-label="Key"]')).not.toBeNull();
    }),
  );
});

describe('the tempo dial in the full player', () => {
  /** Hymn 100's and 101's tempos, and Sound, set for a test and put back as it ends. */
  const keeping = (page: ReturnType<typeof mount>, sound: boolean) => {
    const was = page.get(settings.sound);
    page.set(settings.tempo(100), 100);
    page.set(settings.tempo(101), 100);
    page.set(settings.sound, sound);
    return {
      [Symbol.dispose]: () => {
        page.set(settings.tempo(100), 100);
        page.set(settings.sound, was);
      },
    };
  };
  const dialOf = (page: ReturnType<typeof mount>) =>
    Option.getOrThrow(page.find('[data-testid="dial-tempo"]'));

  it.live('holds hymn 100’s Tempo dial at 100%, and a step down keeps tempo(100) = 95', () =>
    Effect.sync(() => {
      using page = mount();
      using _kept = keeping(page, false);
      const dial = dialOf(page);
      expect({
        role: dial.getAttribute('role'),
        label: dial.getAttribute('aria-label'),
        said: dial.getAttribute('aria-valuetext'),
      }).toEqual({ role: 'slider', label: 'Tempo', said: '100%' });

      perform(dial, 'decrement');
      expect(page.get(settings.tempo(100))).toBe(95);
      expect(dialOf(page).getAttribute('aria-valuetext')).toBe('95%');
      expect(page.get(settings.tempo(101))).toBe(100);

      page.set(settings.tempo(100), 150);
      perform(dialOf(page), 'increment');
      expect(page.get(settings.tempo(100))).toBe(150);
      expect(dialOf(page).getAttribute('aria-valuetext')).toBe('150%');
    }),
  );

  it.live('stands under the position bar, before the reader’s settings', () =>
    Effect.sync(() => {
      using page = mount();
      using _kept = keeping(page, false);
      const before = (first: Element, second: Element) =>
        Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
      const size = Option.getOrThrow(page.find('[role="slider"][aria-label="Text size"]'));
      const chords = Option.getOrThrow(page.find('[aria-label="Chord settings"]'));
      expect({
        underPosition: before(page.bar(), dialOf(page)),
        beforeChords: before(dialOf(page), chords),
        beforeReading: before(dialOf(page), size),
      }).toEqual({ underPosition: true, beforeChords: true, beforeReading: true });
    }),
  );

  it.live('stands the bpm read-out and Tap under the dial, before Chord settings', () =>
    Effect.sync(() => {
      using page = mount();
      using _kept = keeping(page, false);
      const before = (first: Element, second: Element) =>
        Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
      const bpm = Option.getOrThrow(page.find('[data-testid="tempo-bpm"]'));
      const tapChip = Option.getOrThrow(page.find('[aria-label="Tap"]'));
      const chords = Option.getOrThrow(page.find('[aria-label="Chord settings"]'));
      expect({
        said: bpm.getAttribute('aria-label'),
        bpmUnderDial: before(dialOf(page), bpm),
        tapUnderDial: before(dialOf(page), tapChip),
        bpmBeforeChords: before(bpm, chords),
        tapBeforeChords: before(tapChip, chords),
      }).toEqual({
        said: 'quarter note = 90',
        bpmUnderDial: true,
        tapUnderDial: true,
        bpmBeforeChords: true,
        tapBeforeChords: true,
      });
    }),
  );

  it.live('says no note of the pace under the Tempo dial, with Sound on or off', () =>
    Effect.sync(() => {
      using page = mount();
      using _kept = keeping(page, true);
      expect(dialOf(page).getAttribute('aria-valuetext')).toBe('100%');
      expect(page.text()).not.toContain('sets the pace');
      expect(page.text()).not.toContain('With Sound on');
      page.set(settings.sound, false);
      expect(page.text()).not.toContain('sets the pace');
      page.set(settings.sound, true);
      expect(page.text()).not.toContain('sets the pace');
    }),
  );

  it.live('leaves the bar on hymn 100’s page as it was: Key, the opener, Sound, Play', () =>
    Effect.sync(() => {
      using page = mount(route(100));
      using _kept = keeping(page, false);
      const bar = Option.getOrThrow(page.find('[aria-label="Player"]'));
      expect(
        [...bar.querySelectorAll('[role="button"]')].map((button) =>
          button.getAttribute('aria-label'),
        ),
      ).toEqual(['Key', 'Open player', 'Sound', 'Play hymn 100']);
      expect(page.all('[aria-label="Tempo"]')).toHaveLength(0);
    }),
  );
});

describe('the stanza chips in the full player', () => {
  /** Hymn 78: four stanzas, the refrain after each. */
  const four = Option.getOrThrow(hymnAt('78'));
  /** Hymn 78's choice set to all for a test and put back as it ends. */
  const keeping = (page: ReturnType<typeof mount>) => {
    page.set(settings.stanzas(78), []);
    return { [Symbol.dispose]: () => page.set(settings.stanzas(78), []) };
  };
  const before = (first: Element, second: Element) =>
    Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
  /** Each chip in the group, by its testID, and whether it reads checked (`none`: no checked state). */
  const chipsOf = (page: ReturnType<typeof mount>) =>
    page
      .all('[data-testid="stanzas"] [role="button"]')
      .map((chip) => [
        chip.getAttribute('data-testid'),
        Option.getOrElse(Option.fromNullishOr(chip.getAttribute('aria-checked')), () => 'none'),
      ]);

  it.live('stand after the bpm read-out and Tap, before Chord settings, all checked', () =>
    Effect.sync(() => {
      using page = mount(sheetOver(four));
      using _kept = keeping(page);
      const group = Option.getOrThrow(page.find('[data-testid="stanzas"]'));
      const tap = Option.getOrThrow(page.find('[data-testid="tempo-tap"]'));
      const chords = Option.getOrThrow(page.find('[aria-label="Chord settings"]'));
      expect({
        role: group.getAttribute('role'),
        label: group.getAttribute('aria-label'),
        afterTap: before(tap, group),
        beforeChords: before(group, chords),
        labels: page
          .all('[data-testid="stanzas"] [role="button"]')
          .map((chip) => chip.getAttribute('aria-label')),
      }).toEqual({
        role: 'group',
        label: 'Stanzas',
        afterTap: true,
        beforeChords: true,
        labels: ['Stanza 1', 'Stanza 2', 'Stanza 3', 'Stanza 4'],
      });
      expect(chipsOf(page)).toEqual([
        ['stanza-1', 'true'],
        ['stanza-2', 'true'],
        ['stanza-3', 'true'],
        ['stanza-4', 'true'],
      ]);
    }),
  );

  it.live('uncheck Stanza 2 at a tap, show All, and keep the choice for hymn 78', () =>
    Effect.sync(() => {
      using page = mount(sheetOver(four));
      using _kept = keeping(page);
      page.press('Stanza 2');
      expect(chipsOf(page)).toEqual([
        ['stanza-1', 'true'],
        ['stanza-2', 'false'],
        ['stanza-3', 'true'],
        ['stanza-4', 'true'],
        ['stanzas-all', 'none'],
      ]);
      expect(page.get(settings.stanzas(78))).toEqual([1, 3, 4]);
      expect(page.get(settings.stanzas(65))).toEqual([]);

      page.press('All');
      expect(chipsOf(page).map(([id]) => id)).toEqual([
        'stanza-1',
        'stanza-2',
        'stanza-3',
        'stanza-4',
      ]);
      expect(page.get(settings.stanzas(78))).toEqual([]);
    }),
  );

  it.live('draw no group for hymn 481, a hymn of one stanza', () =>
    Effect.sync(() => {
      using page = mount(sheetOver(Option.getOrThrow(hymnAt('481'))));
      expect(page.find('[data-testid="tempo-tap"]')._tag).toBe('Some');
      expect(page.all('[data-testid="stanzas"]')).toHaveLength(0);
      expect(page.all('[data-testid^="stanza-"]')).toHaveLength(0);
    }),
  );
});

/**
 * The web's stack as One draws it (`WebStackHeader`): the focused screen
 * alone. It starts on the hymn route at `/hymns/<from>`; a link the app
 * opens becomes the focused screen, with the params its href gives, and the
 * hymn page under it is gone, as no screen is kept mounted.
 */
function WebStack({ from }: { readonly from: number }) {
  const [href, setHref] = useState(`/hymns/${from}`);
  useEffect(() => {
    const open = (next: string) => {
      const url = new URL(next, 'https://hymnal.test');
      clearParams();
      Object.assign(params, Object.fromEntries(url.searchParams));
      setHref(url.pathname);
    };
    opening.add(open);
    return () => void opening.delete(open);
  }, []);
  return Match.value(href).pipe(
    Match.when('/player', () => <FullPlayer />),
    Match.orElse(() => <HymnScreen />),
  );
}

describe('the full player on the web’s stack', () => {
  const three = Option.getOrThrow(hymnAt('3'));
  /** `/hymns/<from>` on the web's stack, with the docked bar under it. */
  const stack = (from: number) => {
    params['number'] = String(from);
    return (
      <>
        <WebStack from={from} />
        <PlayerBar />
      </>
    );
  };
  const heading = (page: ReturnType<typeof mount>) =>
    Option.map(
      page.find('[role="group"][aria-label="Recording"] [role="heading"]'),
      (found) => found.textContent,
    );

  it.live('Play on page 3 moves follow from the former hymn to its first line', () =>
    Effect.gen(function* () {
      using page = mount(route(3));
      page.send(Command.Start({ track: morning }));
      page.device.now = { state: 'playing', positionMs: 90_000, durationMs: 151_000 };
      yield* page.until(Player.$is('Playing'));
      const selected = () =>
        page
          .all('[data-testid="line"]')
          .flatMap((line, index) =>
            Arr.filter([index], () => line.getAttribute('aria-selected') === 'true'),
          );
      expect(selected()).toEqual([]);
      page.press('Play hymn 3');
      yield* page.until(Player.$is('Loading'));
      page.device.now = {
        state: 'playing',
        positionMs: Option.getOrThrow(book.of(3)).first + 3,
        durationMs: 120_000,
      };
      yield* page.until(Player.$is('Playing'));
      expect(selected()).toEqual([0]);
      expect(Option.isNone(page.find('[aria-label="Pause hymn 100"]'))).toBe(true);
      expect(Option.isSome(page.find('[aria-label="Pause hymn 3"]'))).toBe(true);
    }),
  );

  it.live('a sheet for hymn 3 offers its Play while 100 sounds, then shows only hymn 3', () =>
    Effect.gen(function* () {
      using page = mount(stack(3));
      page.send(Command.Start({ track: morning }));
      page.device.now = { state: 'playing', positionMs: 90_000, durationMs: 151_000 };
      yield* page.until(Player.$is('Playing'));
      page.press('Open player');
      expect(heading(page)).toEqual(Option.some(`100 ${morning.title}`));
      expect(Option.isSome(page.find('[aria-label="Pause hymn 100"]'))).toBe(true);
      page.press('Play hymn 3');
      yield* page.until(Player.$is('Loading'));
      expect(page.device.now.positionMs).toBe(0);
      page.device.now = { state: 'playing', positionMs: 300, durationMs: 120_000 };
      yield* page.until(Player.$is('Playing'));
      expect(heading(page)).toEqual(Option.some(`3 ${three.title}`));
      expect(Option.isSome(page.find('[aria-label="Pause hymn 3"]'))).toBe(true);
      expect(Option.isNone(page.find('[aria-label="Pause hymn 100"]'))).toBe(true);
      expect(page.device.played).toEqual([audioUrl(100), audioUrl(3)]);
      page.press('Pause hymn 3');
      yield* page.until(Player.$is('Paused'));
      expect(heading(page)).toEqual(Option.some(`3 ${three.title}`));
      expect(Option.isSome(page.find('[aria-label="Play hymn 3"]'))).toBe(true);
    }),
  );

  it.live("a sheet swap clears the former hymn's unlanded seek immediately", () =>
    Effect.gen(function* () {
      const gate = yield* Latch.make(true);
      const waiting = yield* Deferred.make<boolean>();
      const observing = Effect.suspend(() => {
        if (Latch.isOpen(gate)) return Effect.void;
        return Deferred.succeed(waiting, true).pipe(Effect.andThen(gate.await));
      });
      using page = mount(stack(3), observing);
      page.send(Command.Start({ track: morning }));
      page.device.now = { state: 'playing', positionMs: 40_000, durationMs: 151_000 };
      yield* page.until(Player.$is('Playing'));
      page.press('Open player');
      yield* gate.close;
      yield* Deferred.await(waiting);
      page.device.lagging = true;
      act(() => drag(page.bar(), '90'));
      expect(page.bar().getAttribute('aria-valuetext')).toBe('1:30 of 2:31');
      page.press('Play hymn 3');
      yield* page.until(Player.$is('Loading'));
      expect(page.bar().getAttribute('aria-valuetext')).toBe('0:00 of 0:00');
      page.device.now = { state: 'playing', positionMs: 300, durationMs: 120_000 };
      yield* gate.open;
      yield* page.until(Player.$is('Playing'));
      expect(page.bar().getAttribute('aria-valuetext')).toBe('0:00 of 2:00');
      expect(page.device.sought).toEqual([90_000]);
    }),
  );

  it.live('opened from hymn 3’s page with nothing held, shows hymn 3 with Play and its bar', () =>
    Effect.sync(() => {
      using page = mount(stack(3));
      page.press('Open player');
      expect(Option.isNone(page.find('[aria-label="Open player"]'))).toBe(true);
      expect(heading(page)).toEqual(Option.some(`3 ${three.title}`));
      expect(Option.isSome(page.find('[aria-label="Play hymn 3"]'))).toBe(true);
      expect(page.bar().getAttribute('aria-label')).toBe('Position');
    }),
  );

  it.live('opened from hymn 3’s page while hymn 100 is held paused, shows hymn 3', () =>
    Effect.gen(function* () {
      using page = mount(stack(3));
      page.send(Command.Start({ track: morning }));
      page.device.now = { state: 'playing', positionMs: 5_000, durationMs: 151_000 };
      yield* page.until(Player.$is('Playing'));
      page.send(Command.Pause());
      yield* page.until(Player.$is('Paused'));
      page.press('Open player');
      expect(heading(page)).toEqual(Option.some(`3 ${three.title}`));
      expect(Option.isSome(page.find('[aria-label="Play hymn 3"]'))).toBe(true);
    }),
  );

  it.live(
    'opened while hymn 100 sounds over hymn 3’s page, shows hymn 100 and keeps it paused',
    () =>
      Effect.gen(function* () {
        using page = mount(stack(3));
        page.send(Command.Start({ track: morning }));
        page.device.now = { state: 'playing', positionMs: 5_000, durationMs: 151_000 };
        yield* page.until(Player.$is('Playing'));
        page.press('Open player');
        expect(heading(page)).toEqual(Option.some(`100 ${morning.title}`));
        page.press('Pause hymn 100');
        yield* page.until(Player.$is('Paused'));
        expect(heading(page)).toEqual(Option.some(`100 ${morning.title}`));
      }),
  );
});

/**
 * A bar over `useScrub` alone, at a player that stays at 0:10, its seeks
 * kept: it lets a drag go once it rests for 20 ms, as iOS's and Android's
 * bars do, and holds a place it sent for `settle`. It unmounts when the
 * test's `using` ends.
 */
const hooked = (settle: Duration.Input = Duration.seconds(2)) => {
  const sought = new Array<number>();
  const bar = { scrub: Option.none<ReturnType<typeof useScrub>>() };
  function Bar() {
    const scrub = useScrub(
      { at: 10, length: Option.some(151), onSeek: (s) => sought.push(s) },
      settle,
    );
    useCommitAtRest(scrub, Duration.millis(20));
    bar.scrub = Option.some(scrub);
    return <></>;
  }
  const host = document.createElement('div');
  const root = createRoot(host);
  act(() => root.render(<Bar />));
  let mounted = true;
  const scrub = () => Option.getOrThrow(bar.scrub);
  const unmount = () => {
    if (mounted) act(() => root.unmount());
    mounted = false;
  };
  return {
    sought,
    value: () => scrub().value,
    change: (seconds: number) => act(() => scrub().change(seconds)),
    /** The web's press by pointer 1: down, a move to `seconds`, and up. */
    drag: (seconds: number) =>
      act(() => {
        scrub().press(1);
        scrub().move(seconds);
        scrub().lift(1);
      }),
    /** Wait while the bar rests past its `rest`. */
    rest: Effect.promise(() => act(() => Effect.runPromise(Effect.sleep(Duration.millis(60))))),
    /** Wait, as the bar draws, until `holds` is true of its value. */
    until: (holds: (value: number) => boolean) =>
      Effect.promise(() => act(() => Effect.runPromise(Effect.sleep(Duration.millis(1))))).pipe(
        Effect.map(() => scrub().value),
        Effect.repeat({ until: holds }),
        Effect.timeoutOrElse({
          duration: Duration.seconds(1),
          orElse: () => Effect.die(`the bar stayed at ${scrub().value}`),
        }),
      ),
    unmount,
    [Symbol.dispose]: unmount,
  };
};

describe('a bar that tells no drag’s end (iOS, Android)', () => {
  it.live('sends the drag once, where it rests, and nothing while it moves', () =>
    Effect.gen(function* () {
      using bar = hooked();
      bar.change(40);
      bar.change(70);
      expect(bar.sought).toEqual([]);
      yield* bar.rest;
      expect(bar.sought).toEqual([70]);
      yield* bar.rest;
      expect(bar.sought).toEqual([70]);
    }),
  );

  it.live('sends nothing once the bar is gone before the drag rests', () =>
    Effect.gen(function* () {
      using bar = hooked();
      bar.change(40);
      bar.unmount();
      yield* bar.rest;
      expect(bar.sought).toEqual([]);
    }),
  );
});

describe('the place a bar sent', () => {
  it.live('is held while the player is elsewhere, then given up after `settle`', () =>
    Effect.gen(function* () {
      using bar = hooked(Duration.millis(30));
      bar.drag(75);
      expect(bar.sought).toEqual([75]);
      expect(bar.value()).toBe(75);
      yield* bar.until((value) => value === 10);
    }),
  );
});
