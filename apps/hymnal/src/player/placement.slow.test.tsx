import { RegistryContext } from '@effect/atom-react';
import { placements, type Placement } from '@manna/hymnal/placement';
import * as Chord from '@manna/hymnal/chord';
import { expect, test } from 'bun:test';
import { it } from 'effect-bun-test';
import { Duration, Effect, Option, Stream } from 'effect';
import * as Atom from 'effect/reactivity/Atom';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { hymnAt } from '~/hymns/hymns';
import { chordBook, sectionsOf } from '~/hymns/chords';
import { styled } from '~/hymns/simple';
import { HymnPage } from '~/reader/HymnPage';
import { Shown } from '~/reader/screen';
import { readerOn } from '~/test/reader';
import { fakeDevice } from '~/test/device';
import { gestureOf } from '~/test/gesture';
import { perform, propsWith } from '~/test/props';
import { params } from '~/test/one';
import { holdAnimations, landAnimations } from '~/test/reanimated';
import { readChords, readPlaybackHymns } from '../../vite/chords';
import { readPlacementPatches } from '@manna/hymnal/playback/build';
import { ChordReaderContext } from './Dials';
import { FullPlayer } from './FullPlayer';
import { PlayerContext } from './context';
import { Command, Player, playerOn } from './player';

test('all bundled placements match their numeric sidecars without changing box counts', () => {
  const variants = readPlacementPatches(readPlaybackHymns());
  const book = chordBook(readChords());
  const numbers = (chords: readonly Chord.Chord[]) =>
    chords.flatMap((c) => [c.root, Chord.Quality.literals.indexOf(c.quality), c.bass ?? -1]);
  let checked = 0,
    changed = 0;
  for (let n = 1; n <= 695; n++) {
    const base = Option.getOrThrow(book.of(n));
    const baseParts = [...base.stanzas, ...Option.toArray(base.refrain)];
    for (const mode of ['file', 'simpler'] as const) {
      const actual = Option.getOrThrow(book.of(n, mode));
      const actualParts = [...actual.stanzas, ...Option.toArray(actual.refrain)];
      const patches = variants.get(n)?.[mode] ?? [];
      const targets = new Map(patches.map(([p, l, k, chords]) => [`${p}:${l}:${k}`, chords]));
      changed += patches.length;
      expect(actualParts.length).toBe(baseParts.length);
      baseParts.forEach((part, p) => {
        if (part._tag === 'Plain') {
          expect(actualParts[p]?._tag).toBe('Plain');
          return;
        }
        const got = actualParts[p];
        expect(got?._tag).toBe('Sung');
        if (got?._tag !== 'Sung') return;
        expect(got.lines.map((line) => line.map((word) => word.length))).toEqual(
          part.lines.map((line) => line.map((word) => word.length)),
        );
        part.lines.forEach((line, l) =>
          line.flat().forEach((box, k) => {
            const replacement = targets.get(`${p}:${l}:${k}`);
            let expected = numbers(box.chords);
            if (replacement)
              expected = replacement
                .toSorted((a, b) => a[3] - b[3])
                .flatMap(([root, quality, bass]) => [root, quality, bass]);
            expect(numbers(got.lines[l]?.flat()[k]?.chords ?? [])).toEqual(expected);
            checked++;
          }),
        );
      });
    }
  }
  expect(checked).toBeGreaterThan(200000);
  expect(changed).toBeGreaterThan(0);
});

test('placement serializes every global, override and hymn combination and rejects corrupt legacy values', () => {
  let checked = 0;
  for (const global of placements.map((p) => p.value)) {
    for (const own of ['inherit', 'beat', 'simpler', 'file'] as const) {
      const device = new Map<string, string>();
      const first = readerOn(device),
        registry = AtomRegistry.make();
      registry.set(first.placement, global);
      for (let n = 1; n <= 695; n++) registry.set(first.placementFor(n), own);
      registry.dispose();
      const again = readerOn(device),
        reopened = AtomRegistry.make();
      expect(reopened.get(again.placement)).toBe(global);
      for (let n = 1; n <= 695; n++) {
        expect(reopened.get(again.placementFor(n))).toBe(own);
        checked++;
      }
      reopened.dispose();
    }
  }
  expect(checked).toBe(8340);
  for (const value of ['"old"', 'true', '0', 'not json']) {
    const reader = readerOn(
      new Map([
        ['chords.placement', value],
        ['chords.placement.388', value],
      ]),
    );
    const registry = AtomRegistry.make();
    expect(registry.get(reader.placement)).toBe('beat');
    expect(registry.get(reader.placementFor(388))).toBe('inherit');
    registry.dispose();
  }
});

const mount = (number: number, controlled = true) => {
  const hymn = Option.getOrThrow(hymnAt(String(number)));
  const reader = readerOn(new Map([['chords', 'true']]));
  const registry = AtomRegistry.make();
  const fake = fakeDevice();
  const player = playerOn(fake.layer, Duration.millis(1));
  const state = Atom.make<Player>(Player.Idle());
  let shown = player;
  if (controlled) shown = { ...player, state };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  params['hymn'] = String(number);
  act(() =>
    root.render(
      <RegistryContext value={registry}>
        <ChordReaderContext value={reader}>
          <PlayerContext value={Option.some(shown)}>
            <Shown hymn={hymn} />
            <HymnPage hymn={hymn} reader={reader} />
            <FullPlayer />
          </PlayerContext>
        </ChordReaderContext>
      </RegistryContext>,
    ),
  );
  let sends = 0;
  const unsub = registry.subscribe(player.send, () => {
    sends++;
  });
  const get = (selector: string) =>
    Option.getOrThrow(Option.fromNullishOr(host.querySelector<HTMLElement>(selector)));
  const choose = (mode: Placement) => {
    act(() => registry.set(reader.placementFor(number), 'beat'));
    const index = placements.findIndex((p) => p.value === mode);
    for (let k = 0; k < index; k++)
      perform(get('[aria-label="Chord placement"][role="slider"]'), 'increment');
  };
  const anchors = () =>
    [...host.querySelectorAll('[data-testid^="chord-"]')].map((node) => [
      node.getAttribute('data-testid'),
      node.getAttribute('aria-label'),
    ]);
  const expected = (mode: Placement) => {
    const chords = styled(
      Option.getOrThrow(reader.book.of(number, mode)),
      registry.get(reader.style),
    );
    return sectionsOf(hymn, chords).flatMap((section, p) => {
      if (section._tag === 'Words') return [];
      return section.lines.flatMap((line, l) =>
        line.flat().flatMap((box, k) => {
          if (box.chords.length === 0) return [];
          return [
            [
              `chord-${p + 1}-${l + 1}-${k + 1}`,
              box.chords.map((c) => Chord.format(c, chords.key)).join(' '),
            ],
          ];
        }),
      );
    });
  };
  return {
    hymn,
    reader,
    registry,
    player,
    state,
    fake: fake.device,
    host,
    get,
    choose,
    anchors,
    expected,
    trace: () => [
      sends,
      fake.device.played.length,
      fake.device.sought.length,
      fake.device.stopped,
      fake.device.announced.length,
    ],
    [Symbol.dispose]: () => {
      unsub();
      act(() => root.unmount());
      host.remove();
      registry.dispose();
      delete params['hymn'];
    },
  };
};

test('placement updates real reader anchors in every player state without playback commands', () => {
  for (const number of [373, 388]) {
    using page = mount(number);
    const track = page.hymn,
      length = Option.some(180);
    const states = [
      Player.Idle(),
      Player.Loading({ track }),
      Player.Playing({ track, at: 24, length }),
      Player.Buffering({ track, at: 24, length, retry: false }),
      Player.Paused({ track, at: 24, length }),
      Player.Ended({ track, length }),
      Player.Stopped({ track, at: Option.some(24) }),
      Player.Failed({ track, offline: true, at: Option.some(24) }),
    ];
    for (const state of states) {
      act(() => page.registry.set(page.state, state));
      const before = page.trace();
      for (const style of ['simple', 'advanced'] as const) {
        act(() => page.registry.set(page.reader.style, style));
        for (const mode of placements.map((p) => p.value)) {
          page.choose(mode);
          expect(page.anchors().length).toBeGreaterThan(0);
          // Numeric IDs and chord names only: a failure cannot print hymn words.
          expect(page.anchors()).toEqual(page.expected(mode));
          expect(page.host.querySelectorAll('[data-testid^="held-"]').length).toBe(0);
          expect(page.registry.get(page.state) === state).toBe(true);
          expect(page.trace()).toEqual(before);
        }
      }
    }
  }
});

test('Use global clears a hymn override, follows later defaults, and retires a fling owner', () => {
  using page = mount(388);
  page.choose('file');
  expect(page.registry.get(page.reader.placementFor(373))).toBe('inherit');
  holdAnimations();
  using _held = { [Symbol.dispose]: () => act(() => landAnimations()) };
  const old = gestureOf('dial-placement-pan');
  const owed = propsWith(page.get('[role="slider"][aria-label="Chord placement"]'), 'onTurn')[
    'onTurn'
  ] as (n: number) => void;
  act(() => {
    old.onBegin?.({ x: 0 });
    old.onActivate?.({ x: 0 });
    old.onUpdate?.({ x: -52, translationX: 52 });
    old.onDeactivate?.({ x: -52, velocityX: 2000, canceled: false });
  });
  act(() => page.get('[aria-label="Use global chord placement"]').click());
  // This is the retired recognizer, as a late worklet/RN detent would be.
  act(() => old.onUpdate?.({ x: -104, translationX: 104 }));
  act(() => owed(2));
  expect(page.registry.get(page.reader.placementFor(388))).toBe('inherit');
  act(() => page.registry.set(page.reader.placement, 'simpler'));
  expect(
    page.get('[role="slider"][aria-label="Chord placement"]').getAttribute('aria-valuetext'),
  ).toBe('Simpler');
  expect(page.anchors()).toEqual(page.expected('simpler'));
  act(() => page.registry.set(page.reader.placementFor(388), 'file'));
  act(() => page.registry.set(page.reader.placement, 'beat'));
  expect(page.anchors()).toEqual(page.expected('file'));
});

it.effect('public Start and advancing device place survive in-play placement changes', () =>
  Effect.gen(function* () {
    using page = mount(388, false);
    yield* Effect.promise(() =>
      act(() =>
        Effect.runPromise(
          Effect.gen(function* () {
            page.registry.set(page.player.send, Command.Start({ track: page.hymn }));
            yield* page.fake.reads(1).pipe(Effect.timeout('2 seconds'));
            page.fake.now = { state: 'playing', positionMs: 1000, durationMs: 180000 };
            yield* AtomRegistry.toStream(page.registry, page.player.state).pipe(
              Stream.filter(Player.$is('Playing')),
              Stream.runHead,
              Effect.timeout('2 seconds'),
            );
          }),
        ),
      ),
    );
    const before = page.trace();
    for (const mode of placements.map((p) => p.value)) page.choose(mode);
    expect(page.trace()).toEqual(before);
    yield* Effect.promise(() =>
      act(() =>
        Effect.runPromise(
          Effect.gen(function* () {
            page.fake.now = { state: 'playing', positionMs: 24000, durationMs: 180000 };
            yield* AtomRegistry.toStream(page.registry, page.player.state).pipe(
              Stream.filter((s) => Player.$is('Playing')(s) && s.at === 24),
              Stream.runHead,
              Effect.timeout('2 seconds'),
            );
          }),
        ),
      ),
    );
    expect(page.trace()).toEqual(before);
  }),
);
