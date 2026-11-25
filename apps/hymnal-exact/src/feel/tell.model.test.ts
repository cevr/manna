/* oxlint-disable effect/noTernary, effect/noNullish -- a Bun test that runs generated cue histories through the current app's Feel and a model of the port's. */

/**
 * The port's Feel gives the bodies the current hymnal's does (`feelOver`,
 * `feel/feel.ts`) for the same run of cues. The port's rules are
 * `features/feel.contract`'s `feelGive`, restated here as `portFeel` row
 * for row from the port's table (`FEEL_ROWS`); `feel.test.contract` checks
 * the contract itself in the app. Over generated runs:
 *
 * - any cues at any gaps, the switch turned at random: the same haptics
 *   and the same sounds at the same times (a tick's floor, a sound dropped
 *   over a ringing one, nothing while off);
 * - a sound cued before the current voice has loaded: the current app
 *   drops it and the port plays it (Exact reads every declared sound at
 *   its first voice, docs/reference.md "Sound"): the one difference,
 *   named here; the haptics, and every sound after the load, are the same;
 * - the count-in at generated tempos and bars, its beats told as
 *   `features/tempo.contract` tells them (the first as the count starts,
 *   each later one at the first frame within `AHEAD` of its beat, its sound
 *   scheduled at the beat): each beat's sound starts on the current app's
 *   beat, and its haptic at most one frame before it.
 */

import { describe, expect, test } from 'bun:test';

import type { Haptic } from '@manna/hymnal-app/feel/body';
import type { Cue, DialName, PlainCue } from '@manna/hymnal-app/feel/cues';
import { feelOver } from '@manna/hymnal-app/feel/feel';

import { below, pick, type Random, seeded } from '../test/random.ts';
import { FEEL_ROWS, soundPath } from './cues.ts';

/** A body given: what played, and when on the runner's clock. */
interface Given {
  readonly kind: 'haptic' | 'sound';
  readonly what: string;
  readonly at: number;
}

/** One cue told: the cue, its time, the time its sound is due (0 for now), and whether the switch is on. */
interface Told {
  readonly cue: Cue;
  readonly now: number;
  readonly due: number;
  readonly on: boolean;
}

/** A cue's name in the port's table. */
const nameOf = (cue: Cue): string => {
  if (cue._tag === 'detent') return `detent-${cue.dial}`;
  if (cue._tag === 'beat') return cue.accent ? 'beat-accent' : 'beat';
  return cue._tag;
};

/** The pitch class or place a cue carries, as the port passes it (`at`). */
const atOf = (cue: Cue): number => {
  if (cue._tag === 'detent') return cue.at;
  if (cue._tag === 'section') return cue.place;
  return 0;
};

const exactName = (haptic: Haptic): string => {
  if (haptic._tag === 'impact') return `impact-${haptic.style}`;
  if (haptic._tag === 'notification') return haptic.type;
  return haptic._tag;
};

const mod = (n: number, by: number) => ((n % by) + by) % by;

/** The port's `feelTell`/`feelTellAt` and `feelGive`, as `features/feel.contract` writes them. */
const portFeel = (run: ReadonlyArray<Told>): ReadonlyArray<Given> => {
  let tickAt = -1000000;
  let quietAt = -1000000;
  return run.flatMap(({ cue, now, due, on }) => {
    const row = FEEL_ROWS.find((each) => each.cue === nameOf(cue));
    if (!on || row === undefined) return [];
    const start = Math.max(now, due);
    const felt = row.floor === 0 || now - tickAt >= row.floor;
    const i = row.sounds.length === 0 ? 0 : mod(Math.round(atOf(cue)), row.sounds.length);
    const src = row.sounds[i] ?? '';
    const heard = src !== '' && start >= quietAt;
    const given: Array<Given> = [];
    if (felt) given.push({ kind: 'haptic', what: row.haptic, at: now });
    if (felt && row.floor > 0) tickAt = now;
    if (heard) {
      given.push({ kind: 'sound', what: src, at: start });
      quietAt = start + (row.lengths[i] ?? 0);
    }
    return given;
  });
};

/** The current app's Feel over the same run, its voice loaded from `loadedAt` on. */
const currentFeel = (
  run: ReadonlyArray<Told>,
  loadedAt = Number.NEGATIVE_INFINITY,
): ReadonlyArray<Given> => {
  const given: Array<Given> = [];
  const clock = { now: 0, on: true };
  const tell = feelOver({
    haptics: {
      play: (haptic) => given.push({ kind: 'haptic', what: exactName(haptic), at: clock.now }),
    },
    sound: {
      play: (sound) => {
        if (clock.now >= loadedAt)
          given.push({ kind: 'sound', what: soundPath(sound), at: clock.now });
      },
    },
    on: () => clock.on,
    now: () => clock.now,
  });
  for (const { cue, now, on } of run) {
    clock.now = now;
    clock.on = on;
    tell(cue);
  }
  return given;
};

const PLAIN: ReadonlyArray<PlainCue> = [
  'wall',
  'reset',
  'chords-on',
  'chords-off',
  'play',
  'pause',
  'switch-on',
  'switch-off',
  'favourite-on',
  'favourite-off',
  'press',
  'choose',
  'tab',
  'zoom-out',
  'zoom-in',
  'sheet-open',
  'seek-grab',
  'seek-tick',
  'seek-release',
  'rail-tick',
];
const DIALS: ReadonlyArray<DialName> = [
  'key',
  'capo',
  'size',
  'tempo',
  'placement',
  'hundreds',
  'tens',
  'ones',
];

/** A cue as a run draws it: ticks and detents most, so the floor and the ringing sound are met. */
const cueOf = (random: Random): Cue => {
  const roll = below(random, 10);
  if (roll < 5) return { _tag: 'detent', dial: pick(random, DIALS), at: below(random, 40) - 10 };
  if (roll < 6) return { _tag: 'beat', accent: below(random, 2) === 0 };
  if (roll < 7) return { _tag: 'section', place: below(random, 9) };
  return { _tag: pick(random, PLAIN) };
};

/** A run of `length` cues at gaps of 0 to 150 ms, the switch turned now and then when `turning`. */
const runOf = (random: Random, length: number, turning: boolean): ReadonlyArray<Told> => {
  let now = below(random, 1000);
  let on = true;
  return Array.from({ length }, () => {
    now += pick(random, [0, 1, 5, 12, 16, 29, 30, 31, 45, 60, 111, 112, 113, 150]) + random();
    if (turning && below(random, 12) === 0) on = !on;
    return { cue: cueOf(random), now, due: 0, on };
  });
};

const SEEDS = Array.from({ length: 200 }, (_, n) => n + 1);

describe('the port’s Feel gives the current app’s bodies', () => {
  test('for any run of cues, the switch turned at random: the same haptics and sounds at the same times', () => {
    let sounds = 0;
    let dropped = 0;
    for (const seed of SEEDS) {
      const run = runOf(seeded(seed), 60, true);
      const port = portFeel(run);
      expect({ seed, port }).toEqual({ seed, port: currentFeel(run) });
      sounds += port.filter((g) => g.kind === 'sound').length;
      dropped += run.filter((t) => t.on).length - port.filter((g) => g.kind === 'haptic').length;
    }
    expect(sounds).toBeGreaterThan(0);
    expect(dropped).toBeGreaterThan(0);
  });

  test('a sound cued before the current voice has loaded: the current app drops it, the port plays it; all else the same', () => {
    let early = 0;
    for (const seed of SEEDS) {
      const random = seeded(seed);
      const run = runOf(random, 40, false);
      const loadedAt = (run[below(random, run.length)]?.now ?? 0) + 0.5;
      const port = portFeel(run);
      const current = currentFeel(run, loadedAt);
      const late = (g: Given) => g.kind === 'haptic' || g.at >= loadedAt;
      expect({ seed, port: port.filter(late) }).toEqual({ seed, port: [...current] });
      early += port.filter((g) => !late(g)).length;
    }
    expect(early).toBeGreaterThan(0);
  });
});

/** A frame's length at 60 Hz, and how far ahead of its beat the port tells a beat (`playerFrameAhead`). */
const FRAME = 1000 / 60;
const AHEAD = 17;

describe('the count-in', () => {
  test('at any tempo and bar: each beat’s sound starts on the current app’s beat, its haptic at most a frame before', () => {
    for (const seed of SEEDS) {
      const random = seeded(seed);
      const bpm = 40 + below(random, 181);
      const beats = 2 + below(random, 5);
      const beatMs = 60000 / bpm;
      const start = 1000 + random() * 1000;
      const phase = random() * FRAME;
      const beatAt = (k: number) => start + k * beatMs;
      const current = currentFeel(
        Array.from({ length: beats }, (_, k) => ({
          cue: { _tag: 'beat', accent: k === 0 } as const,
          now: beatAt(k),
          due: 0,
          on: true,
        })),
      );
      const told: Array<Told> = [
        { cue: { _tag: 'beat', accent: true }, now: start, due: 0, on: true },
      ];
      for (let k = 1; k < beats; k++) {
        const frames = Math.ceil((beatAt(k) - AHEAD - start - phase) / FRAME);
        const at = start + phase + Math.max(0, frames) * FRAME;
        told.push({ cue: { _tag: 'beat', accent: false }, now: at, due: beatAt(k), on: true });
      }
      const port = portFeel(told);
      const kind = (given: ReadonlyArray<Given>, k: 'haptic' | 'sound') =>
        given.filter((g) => g.kind === k);
      expect({ seed, sounds: kind(port, 'sound') }).toEqual({
        seed,
        sounds: kind(current, 'sound'),
      });
      const haptics = kind(port, 'haptic');
      expect(haptics.map((g) => g.what)).toEqual(kind(current, 'haptic').map((g) => g.what));
      for (const [k, haptic] of haptics.entries()) {
        const early = beatAt(k) - haptic.at;
        expect({ seed, k, within: early >= 0 && early <= AHEAD }).toEqual({
          seed,
          k,
          within: true,
        });
      }
      expect(haptics.length).toBe(beats);
    }
  });
});
