/**
 * The Feel over fake ports: each cue's body, over every cue the app tells
 * (each key, fret, size and topic place written out), with `Sounds and
 * haptics` on and off; the silent switch as iOS has it (a fake OS that
 * drops system sounds while silent); the player's device never reached;
 * the ticks' 30 ms floor over generated timed sequences; and the sounds'
 * gap, where no sound starts before the last one's file has ended.
 */

import { describe, expect, it } from 'bun:test';
import { Option, Predicate } from 'effect';

import { SIZES } from '~/reader/reading';

import { fakeDevice } from '../test/device';
import type { Haptic, SoundName } from './body';
import type { Cue, DialName, PlainCue } from './cue';
import { feelOver } from './feel';
import { RECIPES, soundLength } from './voice';

/** A body as the ports were told it. */
type Call = readonly ['haptic', Haptic] | readonly ['sound', SoundName];

const selection: Haptic = { _tag: 'selection' };
const impact = (style: 'light' | 'medium' | 'soft' | 'rigid'): Haptic => ({
  _tag: 'impact',
  style,
});

/** Each plain cue's row of the table: its haptic. No plain cue is heard. */
const plainRows: ReadonlyArray<readonly [PlainCue, Haptic]> = [
  ['wall', impact('rigid')],
  ['reset', impact('medium')],
  ['chords-on', impact('light')],
  ['chords-off', impact('light')],
  ['play', impact('light')],
  ['pause', impact('light')],
  ['switch-on', impact('light')],
  ['switch-off', impact('light')],
  ['favourite-on', { _tag: 'notification', type: 'success' }],
  ['favourite-off', impact('light')],
  ['press', selection],
  ['choose', selection],
  ['tab', selection],
  ['sheet-open', impact('light')],
  ['seek-grab', selection],
  ['seek-tick', selection],
  ['seek-release', impact('soft')],
];

const KEYS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;
const FRETS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;
const PLACES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19] as const;

const heardAs = (sound: SoundName) => Option.some(sound);
const unheard = Option.none<SoundName>();

/** Every cue of the table and the one body it is given. */
const table: ReadonlyArray<readonly [Cue, Haptic, Option.Option<SoundName>]> = [
  ...plainRows.map(([name, haptic]) => [{ _tag: name }, haptic, unheard] as const),
  ...KEYS.map(
    (at) => [{ _tag: 'detent', dial: 'key', at }, selection, heardAs(`key-${at}`)] as const,
  ),
  ...FRETS.map(
    (at) => [{ _tag: 'detent', dial: 'capo', at }, selection, heardAs('thock')] as const,
  ),
  ...SIZES.map(
    (_, at) => [{ _tag: 'detent', dial: 'size', at }, selection, heardAs('thock')] as const,
  ),
  ...PLACES.map((place) => [{ _tag: 'section', place }, impact('light'), unheard] as const),
];

/** A Feel over recording ports; the clock moves a whole second each read, so no tick or sound is held back. */
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

const soundCalls = (sound: Option.Option<SoundName>): ReadonlyArray<Call> =>
  Option.toArray(sound).map((name): Call => ['sound', name]);

describe('the table of bodies', () => {
  it('holds every cue the app tells: each key, fret, size and topic place', () => {
    expect(table).toHaveLength(plainRows.length + 12 + 12 + SIZES.length + PLACES.length);
  });

  it('gives each cue its row’s haptic once, and only a dial’s detent its sound, while the switch is on', () => {
    for (const [cue, haptic, sound] of table) {
      const feel = recorded(() => true);
      feel.tell(cue);
      expect({ cue, felt: feel.felt, heard: feel.heard }).toEqual({
        cue,
        felt: [['haptic', haptic]],
        heard: [...soundCalls(sound)],
      });
    }
  });

  it('names only sounds the voice holds', () => {
    const held = new Set(RECIPES.map(([name]) => name));
    const named = table.flatMap(([, , sound]) => Option.toArray(sound));
    expect(named.filter((name) => !held.has(name))).toEqual([]);
    expect(new Set(named)).toEqual(held);
  });

  it('gives no port any call while the switch is off', () => {
    const feel = recorded(() => false);
    for (const [cue] of table) feel.tell(cue);
    expect([...feel.felt, ...feel.asked]).toEqual([]);
  });

  it('reads the switch as each cue comes', () => {
    let on = true;
    const feel = recorded(() => on);
    const detent: Cue = { _tag: 'detent', dial: 'capo', at: 1 };
    feel.tell(detent);
    on = false;
    feel.tell(detent);
    on = true;
    feel.tell(detent);
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
            heard: (on && !silent && [...soundCalls(sound)]) || [],
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
  const tickLike = Predicate.or(Predicate.isTagged('detent'), Predicate.isTagged('seek-tick'));
  const others: ReadonlyArray<Cue> = table.map(([cue]) => cue).filter((cue) => !tickLike(cue));

  it('feels ticks no closer than 30 ms, always feels one after a 30 ms gap, and always feels every other cue', () => {
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
        const isTick = tickLike(told);
        if (!isTick) {
          othersTold += 1;
          if (felt.length !== before + 1) missed.push(`${seed}:${k} ${told._tag}`);
        } else if (clock - lastTick >= 30 && felt.length !== before + 1)
          missed.push(`${seed}:${k} tick after ${clock - lastTick} ms`);
        if (isTick && felt.length === before + 1) lastTick = clock;
      }
      const tickTimes = felt.filter(([, cue]) => tickLike(cue));
      const close = tickTimes.filter(([at], i) => i > 0 && at - (tickTimes[i - 1]?.[0] ?? 0) < 30);
      expect({ seed, missed, close }).toEqual({ seed, missed: [], close: [] });
      expect(felt.length - tickTimes.length).toBe(othersTold);
    }
  });
});

describe('the sounds’ gap', () => {
  const dials: ReadonlyArray<DialName> = ['key', 'capo', 'size'];

  it('starts a sound only once the last one has ended, and always once it has, over generated flings', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const random = seeded(seed);
      // Lengths the port gives, so the rule is read apart from the voice's own.
      const lengths = new Map(
        RECIPES.map(([name]) => [name, 20 + Math.floor(random() * 300)] as const),
      );
      const length = (sound: SoundName) => lengths.get(sound) ?? 0;
      let clock = 0;
      const heard: Array<readonly [number, SoundName]> = [];
      const tell = feelOver({
        haptics: { play: () => {} },
        sound: { play: (sound) => void heard.push([clock, sound]), length },
        on: () => true,
        now: () => clock,
      });
      const dial = pick(random, dials);
      const faults: Array<string> = [];
      let quietAt = Number.NEGATIVE_INFINITY;
      for (let k = 0; k < 80; k += 1) {
        clock += (random() < 0.5 && Math.floor(random() * 20)) || Math.floor(random() * 400);
        const before = heard.length;
        tell({ _tag: 'detent', dial, at: Math.floor(random() * 12) });
        const played = heard.length === before + 1;
        if (clock >= quietAt && !played)
          faults.push(`${k}: none at ${clock}, quiet since ${quietAt}`);
        if (clock < quietAt && played)
          faults.push(`${k}: one at ${clock}, over one until ${quietAt}`);
        const last = heard.at(-1);
        if (played && last) quietAt = clock + length(last[1]);
      }
      expect({ seed, faults }).toEqual({ seed, faults: [] });
    }
  });

  it('reads the voice’s own lengths when the port gives none', () => {
    let clock = 0;
    const heard: Array<number> = [];
    const tell = feelOver({
      haptics: { play: () => {} },
      sound: { play: () => void heard.push(clock) },
      on: () => true,
      now: () => clock,
    });
    const thock = soundLength('thock');
    tell({ _tag: 'detent', dial: 'capo', at: 1 });
    clock = thock - 1;
    tell({ _tag: 'detent', dial: 'capo', at: 2 });
    clock = thock;
    tell({ _tag: 'detent', dial: 'capo', at: 3 });
    expect(heard).toEqual([0, thock]);
  });
});
