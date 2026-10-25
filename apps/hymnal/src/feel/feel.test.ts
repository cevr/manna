/**
 * The Feel over fake ports: each cue's body, over every cue the app tells
 * (each key, fret, size and topic place written out), with `Sounds and
 * haptics` on and off; the silent switch as iOS has it (a fake OS that
 * drops system sounds while silent); the player's device never reached;
 * and the ticks' 30 ms floor over generated timed sequences.
 */

import { describe, expect, it } from 'bun:test';

import { SIZES } from '~/reader/reading';

import { fakeDevice } from '../test/device';
import type { Haptic, SoundName } from './body';
import type { Cue, PlainCue } from './cue';
import { feelOver } from './feel';

/** A body as the ports were told it. */
type Call = readonly ['haptic', Haptic] | readonly ['sound', SoundName];

const selection: Haptic = { _tag: 'selection' };
const impact = (style: 'light' | 'medium' | 'soft' | 'rigid'): Haptic => ({
  _tag: 'impact',
  style,
});

/** Each plain cue's row of the table (spec Decided 8): its haptic and its sound. */
const plainRows: ReadonlyArray<readonly [PlainCue, Haptic, SoundName]> = [
  ['wall', impact('rigid'), 'thud'],
  ['reset', impact('medium'), 'land'],
  ['chords-on', impact('light'), 'switch-on'],
  ['chords-off', impact('light'), 'switch-off'],
  ['play', impact('light'), 'switch-on'],
  ['pause', impact('light'), 'switch-off'],
  ['switch-on', impact('light'), 'switch-on'],
  ['switch-off', impact('light'), 'switch-off'],
  ['favourite-on', { _tag: 'notification', type: 'success' }, 'chime-up'],
  ['favourite-off', impact('light'), 'chime-down'],
  ['press', selection, 'press'],
  ['choose', selection, 'press'],
  ['sheet-open', impact('light'), 'press'],
  ['seek-grab', selection, 'press'],
  ['seek-tick', selection, 'tick'],
  ['seek-release', impact('soft'), 'wood'],
];

const KEYS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;
const FRETS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;
const PLACES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19] as const;

/** Every cue of the table and the one body it is given. */
const table: ReadonlyArray<readonly [Cue, Haptic, SoundName]> = [
  ...plainRows.map(([name, haptic, sound]) => [{ _tag: name }, haptic, sound] as const),
  ...KEYS.map((at) => [{ _tag: 'detent', dial: 'key', at }, selection, `key-${at}`] as const),
  ...FRETS.map((at) => [{ _tag: 'detent', dial: 'capo', at }, selection, 'wood'] as const),
  ...SIZES.map((_, at) => [{ _tag: 'detent', dial: 'size', at }, selection, 'wood'] as const),
  ...PLACES.map(
    (place) => [{ _tag: 'section', place }, impact('light'), `section-${place % 10}`] as const,
  ),
];

/** A Feel over recording ports; the clock moves a whole second each read, so no tick is held back. */
const recorded = (on: () => boolean, silent = () => false) => {
  const felt: Array<Call> = [];
  const heard: Array<Call> = [];
  const asked: Array<Call> = [];
  let clock = 0;
  const tell = feelOver({
    haptics: { play: (haptic) => void felt.push(['haptic', haptic]) },
    sound: {
      // The fake OS: a system sound asked for while silent is not heard.
      play: (sound) => {
        asked.push(['sound', sound]);
        if (!silent()) heard.push(['sound', sound]);
      },
    },
    on,
    now: () => (clock += 1000),
  });
  return { tell, felt, heard, asked };
};

describe('the table of bodies', () => {
  it('holds every cue the app tells: each key, fret, size and topic place', () => {
    expect(table).toHaveLength(plainRows.length + 12 + 12 + SIZES.length + PLACES.length);
  });

  it('gives each cue its row’s haptic and its row’s sound, once, while the switch is on', () => {
    for (const [cue, haptic, sound] of table) {
      const feel = recorded(() => true);
      feel.tell(cue);
      expect({ cue, felt: feel.felt, heard: feel.heard }).toEqual({
        cue,
        felt: [['haptic', haptic]],
        heard: [['sound', sound]],
      });
    }
  });

  it('gives no port any call while the switch is off', () => {
    const feel = recorded(() => false);
    for (const [cue] of table) feel.tell(cue);
    expect([...feel.felt, ...feel.asked]).toEqual([]);
  });

  it('reads the switch as each cue comes', () => {
    let on = true;
    const feel = recorded(() => on);
    feel.tell({ _tag: 'press' });
    on = false;
    feel.tell({ _tag: 'press' });
    on = true;
    feel.tell({ _tag: 'press' });
    expect(feel.felt).toHaveLength(2);
    expect(feel.asked).toHaveLength(2);
  });
});

describe('the silent switch, as iOS has it', () => {
  it('hears a cue’s sound only with the switch on and the phone not silent, and feels it whenever the switch is on', () => {
    for (const [cue, haptic, sound] of table)
      for (const on of [true, false])
        for (const silent of [true, false]) {
          const feel = recorded(
            () => on,
            () => silent,
          );
          feel.tell(cue);
          expect({ cue, on, silent, felt: feel.felt, heard: feel.heard }).toEqual({
            cue,
            on,
            silent,
            felt: (on && [['haptic', haptic]]) || [],
            heard: (on && !silent && [['sound', sound]]) || [],
          });
        }
  });
});

/** Numbers in [0, 1), seeded (mulberry32), so a failing sequence comes back. */
const seeded = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const pick = <A>(random: () => number, from: ReadonlyArray<A>): A =>
  from[Math.floor(random() * from.length)] ?? (from[0] as A);

describe('the player’s device', () => {
  it('is reached by no cue: any sequence told adds no call to it', () => {
    const { device } = fakeDevice();
    const asked = () => ({
      played: [...device.played],
      sought: [...device.sought],
      announced: [...device.announced],
      stopped: device.stopped,
      now: device.now,
    });
    const before = asked();
    const cues = table.map(([cue]) => cue);
    for (let seed = 1; seed <= 20; seed += 1) {
      const random = seeded(seed);
      const feel = recorded(() => random() < 0.8);
      for (let k = 0; k < 50; k += 1) feel.tell(pick(random, cues));
    }
    expect(asked()).toEqual(before);
  });
});

describe('the ticks’ floor', () => {
  const ticks: ReadonlyArray<Cue> = [
    { _tag: 'detent', dial: 'key', at: 3 },
    { _tag: 'detent', dial: 'capo', at: 2 },
    { _tag: 'seek-tick' },
  ];
  const others: ReadonlyArray<Cue> = table
    .map(([cue]) => cue)
    .filter((cue) => cue._tag !== 'detent' && cue._tag !== 'seek-tick');

  it('plays ticks no closer than 30 ms, always plays one after a 30 ms gap, and always plays every other cue', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const random = seeded(seed);
      let clock = 0;
      const felt: Array<readonly [number, Cue]> = [];
      let told: Cue = { _tag: 'press' };
      const tell = feelOver({
        haptics: { play: () => void felt.push([clock, told]) },
        sound: { play: () => {} },
        on: () => true,
        now: () => clock,
      });
      let lastTick = Number.NEGATIVE_INFINITY;
      let othersTold = 0;
      const missed: Array<string> = [];
      for (let k = 0; k < 60; k += 1) {
        clock += Math.floor(random() * 50);
        told = (random() < 0.7 && pick(random, ticks)) || pick(random, others);
        const before = felt.length;
        tell(told);
        const isTick = told._tag === 'detent' || told._tag === 'seek-tick';
        if (!isTick) {
          othersTold += 1;
          if (felt.length !== before + 1) missed.push(`${seed}:${k} ${told._tag}`);
        } else if (clock - lastTick >= 30 && felt.length !== before + 1)
          missed.push(`${seed}:${k} tick after ${clock - lastTick} ms`);
        if (isTick) lastTick = clock;
      }
      const tickTimes = felt.filter(([, cue]) => cue._tag === 'detent' || cue._tag === 'seek-tick');
      const close = tickTimes.filter(([at], i) => i > 0 && at - (tickTimes[i - 1]?.[0] ?? 0) < 30);
      expect({ seed, missed, close }).toEqual({ seed, missed: [], close: [] });
      expect(felt.length - tickTimes.length).toBe(othersTold);
    }
  });
});
