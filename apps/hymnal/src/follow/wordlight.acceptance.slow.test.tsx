/**
 * wordlight acceptance (page): on hymn 11's page, drawn by react-native-web
 * under happy-dom, with chords on (the owner's view) and off, the player at
 * stanza 1's second line (line index 1) lights one syllable in the accent,
 * the one the score sings then, and mutes the rest of the line, with no
 * whole-line tint; as the place moves through the line the light moves on.
 *
 * The page hears the player through its state alone, so a writable atom
 * stands in for the player's state (as `follow.slow.test.tsx` does). The
 * oracle reads the compiled timing through the tempo map, never the
 * bundled encoding.
 *
 * Run from `apps/hymnal` with `--preload ./src/test/setup.ts`, the file
 * placed at `src/follow/wordlight.acceptance.slow.test.tsx`.
 */

import { describe, expect, it } from 'bun:test';
import * as Timing from '@manna/hymnal/timing';
import { RegistryContext } from '@effect/atom-react';
import { Array as Arr, Duration, Match, Option } from 'effect';
import * as Atom from 'effect/reactivity/Atom';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { readPlaybackHymns } from '../../vite/chords';
import { hymnAt } from '~/hymns/hymns';
import { PlayerContext } from '~/player/context';
import { Player, playerOn } from '~/player/player';
import { HymnPage } from '~/reader/HymnPage';
import { fakeDevice } from '~/test/device';
import { readerOn } from '~/test/reader';

const ACCENT = 'var(--accent)';
const MUTED = 'var(--muted)';
const SOFT = 'var(--soft)';

/** Line 1 of hymn 11 as the score lays it: its span and its syllables' times, in ms. */
const owners = () => {
  const hymn = Option.getOrThrow(Arr.findFirst(readPlaybackHymns(), (one) => one.number === 11));
  const timing = Option.getOrThrow(Option.fromUndefinedOr(hymn.timing));
  const seconds = Timing.secondsAt(timing);
  const ms = (time: number) => Math.round(seconds(time) * 1000);
  const line = Option.getOrThrow(Arr.get(timing.lines, 1));
  return {
    start: ms(line.start),
    until: ms(line.until),
    noteTimed: line.played && !line.even && line.syllables.length > 0,
    times: line.syllables.map(ms),
  };
};

/** The syllable sung at `t` on a line with these times: the last at or before it, `-1` before the first. */
const sungAt = (times: ReadonlyArray<number>, t: number) =>
  Option.getOrElse(
    Arr.findLastIndex(times, (time) => time <= t),
    () => -1,
  );

/** Hymn 11's page over a player whose state the test sets; it unmounts when the `using` ends. */
const mount = (chords: boolean) => {
  const hymn = Option.getOrThrow(hymnAt('11'));
  const track = { number: 11, title: hymn.title };
  const state = Atom.make<Player>(Player.Idle());
  const player = { ...playerOn(fakeDevice().layer, Duration.millis(1)), state };
  const registry = AtomRegistry.make();
  const device = new Map<string, string>();
  if (chords) device.set('chords', 'true');
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <RegistryContext value={registry}>
        <PlayerContext value={Option.some(player)}>
          <HymnPage hymn={hymn} reader={readerOn(device)} />
        </PlayerContext>
      </RegistryContext>,
    ),
  );
  const lines = () => [...host.querySelectorAll<HTMLElement>('[data-testid="line"]')];
  lines().forEach((line, k) =>
    Object.assign(line, {
      measureLayout: (_to: HTMLElement, done: (x: number, y: number) => void) =>
        done(0, 1000 + 100 * k),
    }),
  );
  /** The player plays at `ms` into the hymn. */
  const at = (ms: number) => {
    const told = { track, at: ms / 1000, length: Option.none<number>() };
    act(() => registry.set(state, Player.Playing(told)));
  };
  const selected = () =>
    lines().flatMap((line, k) =>
      Arr.filter([k], () => line.getAttribute('aria-selected') === 'true'),
    );
  /** Each syllable of line `k`: its colour and its ground. */
  const syllables = (k: number) =>
    Option.match(Arr.get(lines(), k), {
      onNone: () => [],
      onSome: (line) =>
        [...line.querySelectorAll<HTMLElement>('[data-testid^="syllable-"]')].map((el) => ({
          color: el.style.color,
          ground: el.style.backgroundColor,
        })),
    });
  return {
    at,
    selected,
    syllables,
    [Symbol.dispose]: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
};

describe('wordlight: hymn 11 lights its sung word as it is sung', () => {
  for (const chords of [true, false])
    it(`with chords ${Match.value(chords).pipe(
      Match.when(true, () => 'on'),
      Match.orElse(() => 'off'),
    )}, the player at stanza 1's second line lights the score's syllable in the accent, the rest muted, untinted`, () => {
      const line = owners();
      expect(line.noteTimed).toBe(true);
      expect(line.start).toBeLessThanOrEqual(27_000);
      expect(line.until).toBeGreaterThan(27_000);
      using page = mount(chords);
      const steps = [27_000, ...line.times.filter((t) => t >= line.start && t < line.until)];
      const lit = new Set<number>();
      for (const ms of steps) {
        page.at(ms);
        expect(page.selected()).toEqual([1]);
        const sung = sungAt(line.times, ms);
        lit.add(sung);
        const got = page.syllables(1);
        expect(got.length).toBe(line.times.length);
        expect(got.map(({ color }) => color)).toEqual(
          line.times.map((_, s) =>
            Match.value(s === sung).pipe(
              Match.when(true, () => ACCENT),
              Match.orElse(() => MUTED),
            ),
          ),
        );
        expect(got.filter(({ ground }) => ground === SOFT)).toEqual([]);
      }
      expect(lit.size).toBeGreaterThan(1);
    });
});
