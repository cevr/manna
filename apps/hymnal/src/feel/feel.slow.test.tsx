/* oxlint-disable effect/noGlobals -- the phone's list runs as a Bun script in a process of its own (`list-feel.tsx`), so its React Native stand-in never reaches the other screens, and its report is read as the JSON it prints. */

/**
 * The app's screens under a Feel whose two ports record their calls: bar J
 * on a hymn page, the player sheet, Settings and the phone's hymn list,
 * mounted as `thumb.slow.test.tsx` mounts them (a browser's document, a
 * player over a device the test holds, a reader's store the test holds).
 * Each touch gives exactly its cues, in order, and each cue its body; the
 * `Sounds and haptics` switch silences both ports; and no touch reaches the
 * player's device but what the control itself sends.
 *
 * The Feel's clock moves a second each read, so no tick is held back by
 * the floor: the floor itself is `feel.test.ts`'s.
 */

import { RegistryContext } from '@effect/atom-react';
import { describe, expect, it } from 'effect-bun-test';
import { Duration, Effect, Option, Stream } from 'effect';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import { act, type ReactNode } from 'react';
import { View } from 'react-native';
import { createRoot } from 'react-dom/client';

import Settings from '../../app/(hymnal)/settings';
import { hymnAt } from '~/hymns/hymns';
import { ChordReaderContext } from '~/player/Dials';
import { PlayerContext } from '~/player/context';
import { DETENT, FLING_CAP, glide } from '~/player/dial';
import { FullPlayer } from '~/player/FullPlayer';
import { Player, playerOn } from '~/player/player';
import { PageBar, PlayerBar } from '~/player/PlayerBar';
import type { ChordReader } from '~/reader/HymnPage';
import { HymnPage } from '~/reader/HymnPage';
import { Shown } from '~/reader/screen';
import { settings } from '~/store';
import { StackHeader } from '~/test/stack';

import { fakeDevice } from '../test/device';
import { drag, gestureOf } from '../test/gesture';
import { params, routed } from '../test/one';
import { propsWith } from '../test/props';
import { readerOn } from '../test/reader';
import { bodyOf, type Haptic, type SoundName } from './body';
import { type Cue, CueProvider, plain, useCue } from './cue';
import { FeelProvider } from './FeelProvider';

/** The cues told, and what each port was told, over one stretch. */
interface Taken {
  readonly cues: ReadonlyArray<Cue>;
  readonly felt: ReadonlyArray<Haptic>;
  readonly heard: ReadonlyArray<SoundName>;
}

/** What the Feel's ports were told, and the cues the controls told it. */
const recorder = () => {
  const cues: Array<Cue> = [];
  const felt: Array<Haptic> = [];
  const heard: Array<SoundName> = [];
  let clock = 0;
  return {
    cues,
    felt,
    heard,
    haptics: { play: (haptic: Haptic) => void felt.push(haptic) },
    voice: { port: { play: (sound: SoundName) => void heard.push(sound) }, load: Effect.void },
    clock: () => (clock += 1000),
    /** Everything recorded so far, then cleared. */
    take: (): Taken => {
      const taken = { cues: [...cues], felt: [...felt], heard: [...heard] };
      cues.splice(0);
      felt.splice(0);
      heard.splice(0);
      return taken;
    },
  };
};

type Recorder = ReturnType<typeof recorder>;

/** The cues `cues` and the bodies the table gives them, as `take` reads them. */
const expected = (cues: ReadonlyArray<Cue>): Taken => ({
  cues,
  felt: cues.map((cue) => bodyOf(cue).haptic),
  heard: cues.map((cue) => bodyOf(cue).sound),
});

/** Records each cue told under it, then hands it on to the Feel above. */
function Spy({ into, children }: { readonly into: Recorder; readonly children: ReactNode }) {
  const tell = useCue();
  return (
    <CueProvider
      value={(cue) => {
        into.cues.push(cue);
        tell(cue);
      }}
    >
      {children}
    </CueProvider>
  );
}

const chordsOn = () => new Map([['chords', 'true']]);

/** Hymn 100's route: its header, its page with its own bar, the docked bar, and the sheet when `sheet`. */
const route =
  (sheet = false) =>
  (reader: ChordReader) => {
    params['number'] = '100';
    if (sheet) params['hymn'] = '100';
    const hymn = Option.getOrThrow(hymnAt('100'));
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

/** `screen` under a recording Feel, a fresh player and the reader's store `device`; it unmounts when the `using` ends. */
const mount = (
  screen: (reader: ChordReader) => ReactNode,
  device: Map<string, string> = chordsOn(),
) => {
  routed.splice(0);
  const played = fakeDevice();
  const player = playerOn(played.layer, Duration.millis(1));
  const registry = AtomRegistry.make();
  const reader = readerOn(device);
  const feel = recorder();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <RegistryContext value={registry}>
        <FeelProvider haptics={feel.haptics} voice={feel.voice} clock={feel.clock}>
          <Spy into={feel}>
            <ChordReaderContext value={reader}>
              <PlayerContext value={Option.some(player)}>{screen(reader)}</PlayerContext>
            </ChordReaderContext>
          </Spy>
        </FeelProvider>
      </RegistryContext>,
    ),
  );
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
  const get = (selector: string) =>
    Option.getOrThrow(Option.fromNullishOr(host.querySelector(selector)));
  const click = (element: Element) =>
    act(() => {
      element.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      );
    });
  return {
    feel,
    device: played.device,
    registry,
    until,
    untilChords,
    get,
    click,
    press: (label: string) => click(get(`[aria-label="${label}"]`)),
    /** What the device was asked: each URL played, each place sought, each stop. */
    asked: () => ({
      played: [...played.device.played],
      sought: [...played.device.sought],
      stopped: played.device.stopped,
    }),
    [Symbol.dispose]: () => {
      act(() => root.unmount());
      host.remove();
      registry.dispose();
      for (const key of Object.keys(params)) delete params[key];
    },
  };
};

type Page = ReturnType<typeof mount>;

const keyButton = (page: Page) => page.get('[role="button"][aria-label="Key"]');

/** The key button held down until the hold turns chords to `to`, then let go. */
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

/** A drag of dial `testID` by `by` detents in one update, then let go at `velocity` points a second. */
const fling = (testID: string, by: number, velocity: number) => {
  const pan = () => gestureOf(`${testID}-pan`);
  act(() => pan().onBegin?.({ x: 0, y: 0 }));
  act(() => pan().onActivate?.({ x: 0, y: 0 }));
  act(() => pan().onUpdate?.({ x: 0, y: 0, translationX: -by * DETENT }));
  act(() =>
    pan().onDeactivate?.({
      x: 0,
      y: 0,
      translationX: -by * DETENT,
      velocityX: velocity,
      canceled: false,
    }),
  );
  act(() => pan().onFinalize?.({ x: 0, y: 0, canceled: false }));
};

const nothingAsked = { played: [], sought: [], stopped: 0 };

describe('the dials under the Feel', () => {
  it.live(
    'the capo: a drag of 2 detents in one update, then a fling at the cap, gives 11 detents, each with its fret, then a wall',
    () =>
      Effect.sync(() => {
        using page = mount(route());
        page.click(keyButton(page));
        expect(page.feel.take()).toEqual(expected([plain('press')]));
        fling('dial-capo', 2, -FLING_CAP);
        const frets = Array.from({ length: 11 }, (_, k) => k + 1);
        expect(page.feel.take()).toEqual(
          expected([
            ...frets.map((at): Cue => ({ _tag: 'detent', dial: 'capo', at })),
            plain('wall'),
          ]),
        );
        expect(page.asked()).toEqual(nothingAsked);
      }),
  );

  it.live('the key: a fling gives one detent per key crossed, each key’s own, in order', () =>
    Effect.sync(() => {
      using page = mount(route());
      page.click(keyButton(page));
      page.feel.take();
      // Hymn 100 is printed in Db, pitch class 1.
      const crossed = glide({ name: 'key', count: 12, wrap: true }, DETENT, FLING_CAP).crossed;
      fling('dial-key', 0, -FLING_CAP);
      expect(crossed.length).toBeGreaterThan(12);
      expect(page.feel.take()).toEqual(
        expected(crossed.map((at): Cue => ({ _tag: 'detent', dial: 'key', at }))),
      );
      expect(page.asked()).toEqual(nothingAsked);
    }),
  );
});

describe('the page’s and the bar’s touches under the Feel', () => {
  it.live('Favourite chimes up, and pressed again, down', () =>
    Effect.sync(() => {
      using page = mount(route());
      page.press('Favourite');
      expect(page.feel.take()).toEqual(expected([plain('favourite-on')]));
      page.press('Favourite');
      expect(page.feel.take()).toEqual(expected([plain('favourite-off')]));
      expect(page.asked()).toEqual(nothingAsked);
    }),
  );

  it.live(
    'the sheet’s Chords switch gives chords-on, and the bar’s Key hold gives chords-off',
    () =>
      Effect.gen(function* () {
        using page = mount(route(true), new Map());
        page.click(page.get('[aria-label="Chord settings"] [aria-label="Chords"]'));
        yield* page.untilChords(true);
        expect(page.feel.take()).toEqual(expected([plain('chords-on')]));
        yield* hold(page, false);
        expect(page.feel.take()).toEqual(expected([plain('chords-off')]));
        expect(page.asked()).toEqual(nothingAsked);
      }),
  );

  it.live(
    'Sound gives switch-off, then switch-on; with it off, Play gives play and Pause gives pause',
    () =>
      Effect.gen(function* () {
        using page = mount(route());
        page.press('Sound');
        expect(page.feel.take()).toEqual(expected([plain('switch-off')]));
        expect(page.asked()).toEqual(nothingAsked);
        page.press('Play hymn 100');
        expect(page.feel.take()).toEqual(expected([plain('play')]));
        // The one call Play sends: the hymn's recording (the test's device stands under the score clock).
        expect(page.asked().played).toHaveLength(1);
        page.device.now = { state: 'playing', positionMs: 1_000, durationMs: 151_000 };
        yield* page.until(Player.$is('Playing'));
        page.press('Pause hymn 100');
        yield* page.until(Player.$is('Paused'));
        expect(page.feel.take()).toEqual(expected([plain('pause')]));
        expect({ ...page.asked(), played: page.asked().played.length }).toEqual({
          ...nothingAsked,
          played: 1,
        });
        page.press('Sound');
        expect(page.feel.take()).toEqual(expected([plain('switch-on')]));
        expect(page.registry.get(settings.sound)).toBe(true);
      }),
  );

  it.live('a tap on Key gives press, and a Reading radio gives choose', () =>
    Effect.sync(() => {
      using page = mount(route(true));
      page.click(keyButton(page));
      expect(page.feel.take()).toEqual(expected([plain('press')]));
      page.click(page.get('[role="radiogroup"][aria-label="Font"] [aria-label="Serif"]'));
      expect(page.feel.take()).toEqual(expected([plain('choose')]));
      page.click(page.get('[role="radiogroup"][aria-label="Font"] [aria-label="System"]'));
      page.feel.take();
      expect(page.asked()).toEqual(nothingAsked);
    }),
  );

  it.live(
    'a drag of Seek across 20 s of the track gives seek-grab, 4 seek-ticks and seek-release',
    () =>
      Effect.gen(function* () {
        using page = mount(route());
        page.press('Play hymn 100');
        page.device.now = { state: 'playing', positionMs: 1_000, durationMs: 151_000 };
        yield* page.until((state) => Player.$is('Playing')(state) && state.at === 1);
        page.feel.take();
        const seek = page.get('[role="slider"][aria-label="Seek"]');
        act(() =>
          (
            propsWith(seek, 'onLayout')['onLayout'] as (event: {
              readonly nativeEvent: { readonly layout: Record<string, number> };
            }) => void
          )({ nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 32 } } }),
        );
        // The track is 286 points of 151 s: the knob is taken near 22.5 s and let go near 42.5 s.
        const before = page.asked();
        act(() => void drag('seek-pan', { x: 41, dx: 46.5, dy: 0 }));
        const sought = (page.device.sought.at(-1) ?? 0) / 1000;
        expect(Math.abs(sought - 42.5)).toBeLessThan(1.5);
        expect(page.feel.take()).toEqual(
          expected([
            plain('seek-grab'),
            plain('seek-tick'),
            plain('seek-tick'),
            plain('seek-tick'),
            plain('seek-tick'),
            plain('seek-release'),
          ]),
        );
        // The seek is the one call the drag sends.
        expect(page.asked()).toEqual({ ...before, sought: [...before.sought, sought * 1000] });
      }),
  );
});

describe('Settings under the Feel', () => {
  it.live(
    'a Settings radio gives choose; Sounds and haptics off silences Favourite, and turned on is felt at once',
    () =>
      Effect.sync(() => {
        using page = mount((reader) => (
          <>
            <Settings />
            {route()(reader)}
          </>
        ));
        const toggle = () => page.get('[aria-label="Sounds and haptics"]') as HTMLInputElement;
        expect(toggle().checked).toBe(true);
        page.click(page.get('[role="radiogroup"][aria-label="Appearance"] [aria-label="Dark"]'));
        expect(page.feel.take()).toEqual(expected([plain('choose')]));
        page.click(page.get('[role="radiogroup"][aria-label="Appearance"] [aria-label="System"]'));
        page.feel.take();

        act(() => toggle().click());
        expect(toggle().checked).toBe(false);
        page.press('Favourite');
        // The press still tells its cue; the Feel gives it no body.
        expect(page.feel.take()).toEqual({ cues: [plain('favourite-on')], felt: [], heard: [] });

        act(() => toggle().click());
        expect(toggle().checked).toBe(true);
        expect(page.feel.take()).toEqual(expected([plain('switch-on')]));
        page.press('Favourite');
        expect(page.feel.take()).toEqual(expected([plain('favourite-off')]));
        expect(page.asked()).toEqual(nothingAsked);
      }),
  );
});

describe('the phone’s hymn list under the Feel', () => {
  it.live(
    'gives one section, with its place, as a topic takes the pin, and none as it mounts',
    () =>
      Effect.sync(() => {
        // The phone's stand-ins are registered in a process of the script's own.
        const run = Bun.spawnSync(['bun', Bun.resolveSync('./list-feel.tsx', import.meta.dir)], {
          stderr: 'pipe',
        });
        // The report is its last line: the store's fallback is logged before it.
        const report = run.stdout.toString().trim().split('\n').at(-1) ?? '';
        expect(JSON.parse(report)).toEqual({
          mounted: [],
          scrolled: [{ _tag: 'section', place: 1 }],
          felt: 1,
          heard: ['section-1'],
        });
      }),
  );
});
