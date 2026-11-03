import { describe, expect, it, mock } from 'bun:test';
import { RegistryContext } from '@effect/atom-react';
import { Duration, Effect, Option, Stream } from 'effect';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import { act, type ComponentProps, memo, type ReactNode } from 'react';
import { View } from 'react-native';
import { createRoot } from 'react-dom/client';

import { hymnAt } from '~/hymns/hymns';
import * as Sheet from '~/reader/ChordSheet';
import * as Chords from '~/reader/Chords';
import { HymnPage } from '~/reader/HymnPage';
import { Shown } from '~/reader/screen';
import * as Syllables from '~/reader/SyllableWords';

import { fakeDevice } from '../test/device';
import { perform } from '../test/props';
import { readerOn } from '../test/reader';
import { PlayerContext } from './context';
import * as DialsModule from './Dials';
import * as PlacementModule from './PlacementDial';
import { FullPlayer } from './FullPlayer';
import { ChordReaderContext } from './Dials';
import { Command, Player, playerOn } from './player';
import { PageBar, PlayerBar } from './PlayerBar';

const drawn = { sections: 0, lines: 0, chords: 0, dials: 0, placement: 0 };
const Lines = Chords.ChordLines;
const line = Syllables.SyllableLine;
const tap = Sheet.useChordTap;
// oxlint-disable-next-line effect/noModuleMocks -- a section's draws are counted on the real page, so its chord lines are wrapped; the wrapper draws the real ones, and test:slow runs this file alone.
mock.module('~/reader/Chords', () => ({
  ...Chords,
  ChordLines: (props: ComponentProps<typeof Lines>) => {
    drawn.sections += 1;
    return <Lines {...props} />;
  },
}));
// oxlint-disable-next-line effect/noModuleMocks -- a line's draws are counted on the real page, so its line is wrapped; the wrapper draws the real line, and test:slow runs this file alone.
mock.module('~/reader/SyllableWords', () => ({
  SyllableLine: (props: ComponentProps<typeof line>) => {
    drawn.lines += 1;
    return line(props);
  },
}));
type DialsProps = ComponentProps<typeof DialsModule.Dials>;
const RealDials = DialsModule.Dials as unknown as {
  readonly type?: (props: DialsProps) => ReactNode;
};
const memoized = Option.fromNullishOr(RealDials.type);
const drawDials = Option.getOrElse(
  memoized,
  () => RealDials as unknown as (props: DialsProps) => ReactNode,
);
const countedDials = (props: DialsProps) => {
  drawn.dials += 1;
  return drawDials(props);
};
// oxlint-disable-next-line effect/noModuleMocks -- the dials' draws are counted on the real bar, so the dials are wrapped; the wrapper draws the real ones, memoized as they are, and test:slow runs this file alone.
mock.module('./Dials', () => ({
  ...DialsModule,
  Dials: Option.match(memoized, { onNone: () => countedDials, onSome: () => memo(countedDials) }),
}));
type PlacementProps = ComponentProps<typeof PlacementModule.PlacementDial>;
const realPlacement = PlacementModule.PlacementDial as unknown as {
  readonly type?: (props: PlacementProps) => ReactNode;
};
const memoizedPlacement = Option.fromNullishOr(realPlacement.type);
const drawPlacement = Option.getOrElse(
  memoizedPlacement,
  () => realPlacement as unknown as (props: PlacementProps) => ReactNode,
);
const countedPlacement = (props: PlacementProps) => {
  drawn.placement++;
  return drawPlacement(props);
};
// oxlint-disable-next-line effect/noModuleMocks -- count the real memoized sheet dial's draws in this isolated redraw process.
mock.module('./PlacementDial', () => ({
  PlacementDial: Option.match(memoizedPlacement, {
    onNone: () => countedPlacement,
    onSome: () => memo(countedPlacement),
  }),
}));
// oxlint-disable-next-line effect/noModuleMocks -- a chord text's draws are counted by the hook it alone calls; the wrapper calls the real hook, and test:slow runs this file alone.
mock.module('~/reader/ChordSheet', () => ({
  ...Sheet,
  useChordTap: () => {
    drawn.chords += 1;
    return tap();
  },
}));

const mount = (sheet = false) => {
  const hymn = Option.getOrThrow(hymnAt('100'));
  const reader = readerOn(new Map([['chords', 'true']]));
  const played = fakeDevice();
  const player = playerOn(played.layer, Duration.millis(1));
  const registry = AtomRegistry.make();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <RegistryContext value={registry}>
        <ChordReaderContext value={reader}>
          <PlayerContext value={Option.some(player)}>
            <View>
              <Shown hymn={hymn} />
              <HymnPage hymn={hymn} reader={reader} />
              <PageBar track={hymn} />
            </View>
            <PlayerBar />
            {sheet && <FullPlayer />}
          </PlayerContext>
        </ChordReaderContext>
      </RegistryContext>,
    ),
  );
  const get = (selector: string) =>
    Option.getOrThrow(Option.fromNullishOr(host.querySelector(selector)));
  const at = (seconds: number) =>
    act(() =>
      Effect.runPromise(
        AtomRegistry.toStream(registry, player.state).pipe(
          Stream.filter((state) => Player.$is('Playing')(state) && state.at === seconds),
          Stream.runHead,
          Effect.asVoid,
          Effect.timeout(Duration.seconds(2)),
        ),
      ),
    );
  return {
    get,
    device: played.device,
    reader,
    registry,
    at,
    play: () => act(() => registry.set(player.send, Command.Start({ track: hymn }))),
    sections: () => host.querySelectorAll('[role="group"][aria-label]').length,
    chordTexts: () => host.querySelectorAll('[data-testid^="chord-"]').length,
    detent: (label: string) => {
      Object.assign(drawn, { sections: 0, lines: 0, chords: 0, dials: 0 });
      perform(get(`[role="slider"][aria-label="${label}"]`), 'increment');
      return { ...drawn };
    },
    [Symbol.dispose]: () => {
      act(() => root.unmount());
      host.remove();
      registry.dispose();
    },
  };
};

describe('a detent of the key or the capo dial', () => {
  it('draws the page’s chord texts again, each once, and no section, line or syllable', () => {
    using page = mount();
    expect(drawn.sections).toBe(page.sections());
    expect(drawn.lines).toBeGreaterThan(10);
    expect(drawn.chords).toBe(page.chordTexts());
    act(() =>
      page
        .get('[role="button"][aria-label="Key"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })),
    );
    const texts = page.chordTexts();
    expect(texts).toBeGreaterThan(50);
    for (const label of ['Key', 'Key', 'Capo', 'Capo', 'Key'])
      expect(page.detent(label)).toMatchObject({ sections: 0, lines: 0, chords: texts });
  });
});

it('placement changes with chords off draw no sections, lines or syllables again', () => {
  using page = mount();
  act(() => page.registry.set(page.reader.chords, false));
  for (const mode of ['simpler', 'file', 'beat'] as const) {
    Object.assign(drawn, { sections: 0, lines: 0, chords: 0 });
    act(() => page.registry.set(page.reader.placementFor(100), mode));
    expect(drawn).toMatchObject({ sections: 0, lines: 0, chords: 0 });
  }
});

it('held sheet ticks update position without drawing its placement dial', () =>
  Effect.runPromise(
    Effect.gen(function* () {
      using page = mount(true);
      page.play();
      page.device.now = { state: 'playing', positionMs: 1_000, durationMs: 151_000 };
      yield* Effect.promise(() => page.at(1));
      expect(drawn.placement).toBeGreaterThan(0);
      for (const seconds of [2, 3, 4]) {
        drawn.placement = 0;
        page.device.now = { state: 'playing', positionMs: seconds * 1_000, durationMs: 151_000 };
        yield* Effect.promise(() => page.at(seconds));
        expect(page.get('[aria-label="Position"]').getAttribute('aria-valuetext')).toBe(
          `0:0${seconds} of 2:31`,
        );
        expect(drawn.placement).toBe(0);
      }
    }),
  ));

describe('a playback tick with the dials open (pagerperf P4)', () => {
  it('draws the bar again and the dials not at all', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        using page = mount();
        page.play();
        page.device.now = { state: 'playing', positionMs: 1_000, durationMs: 151_000 };
        yield* Effect.promise(() => page.at(1));
        act(() =>
          page
            .get('[role="button"][aria-label="Key"]')
            .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })),
        );
        expect(drawn.dials).toBeGreaterThan(0);
        for (const seconds of [2, 3, 4]) {
          drawn.dials = 0;
          page.device.now = { state: 'playing', positionMs: seconds * 1_000, durationMs: 151_000 };
          yield* Effect.promise(() => page.at(seconds));
          expect(
            page.get('[role="slider"][aria-label="Seek"]').getAttribute('aria-valuetext'),
          ).toBe(`0:0${seconds} of 2:31`);
          expect(drawn.dials).toBe(0);
        }
      }),
    ));
});
