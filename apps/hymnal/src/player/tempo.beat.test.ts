/* oxlint-disable effect/noTernary, effect/noNullish -- the acceptance oracle writes the beat, bpm and tap rules out as plain branches over plain numbers, apart from the product's code, so the two cannot share a mistake; a tap that sets nothing is read as null so a failure prints flat. */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';
import bundled from 'virtual:hymnal-timing';

import { readPlaybackHymns } from '../../vite/chords';
import { timelineOf } from '../follow/timeline';
import * as Tempo from './tempo';

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

const SEED = 20261102;
const DRAWS = 500;

const hymns = new Map(readPlaybackHymns().map((hymn) => [hymn.number, hymn]));
const encodedOf = new Map(bundled);

const compiledTempoOf = (number: number) => {
  const hymn = hymns.get(number);
  const timing = hymn?.timing;
  if (hymn === undefined || timing === undefined) return null;
  const change = timing.tempos.findLast(([at]) => at <= timing.intro);
  if (change === undefined) return null;
  return {
    microsPerQuarter: change[1],
    numerator: hymn.meter.numerator,
    denominator: hymn.meter.denominator,
  };
};

const timelineAt = (number: number) =>
  Option.getOrThrow(Option.flatMap(Option.fromUndefinedOr(encodedOf.get(number)), timelineOf));

describe('the first tempo the timing bundle carries', () => {
  it('is, for every hymn, the tempo in force at its intro and its meter', () => {
    const wrong = bundled
      .filter(([number, encoded]) => {
        const expected = compiledTempoOf(number);
        const decoded = Option.getOrNull(Option.map(timelineOf(encoded), (line) => line.tempo));
        return (
          expected === null ||
          decoded === null ||
          decoded.microsPerQuarter !== expected.microsPerQuarter ||
          decoded.numerator !== expected.numerator ||
          decoded.denominator !== expected.denominator
        );
      })
      .map(([number]) => number);
    expect({ hymns: bundled.length, wrong: wrong.length, firstWrong: wrong.slice(0, 8) }).toEqual({
      hymns: 695,
      wrong: 0,
      firstWrong: [],
    });
  });

  it.each([
    { number: 100, microsPerQuarter: 666666, meter: '3/4', beat: 'quarter note', bpm: 90 },
    { number: 101, microsPerQuarter: 833333, meter: '3/4', beat: 'quarter note', bpm: 72 },
    { number: 33, microsPerQuarter: 740740, meter: '6/8', beat: 'dotted quarter note', bpm: 54 },
    { number: 46, microsPerQuarter: 375000, meter: '3/2', beat: 'half note', bpm: 80 },
    { number: 69, microsPerQuarter: 444115, meter: '6/4', beat: 'dotted half note', bpm: 45 },
    { number: 76, microsPerQuarter: 750000, meter: '4/4', beat: 'quarter note', bpm: 80 },
  ])('hymn $number: $microsPerQuarter µs a quarter in $meter, a $beat at $bpm', (example) => {
    const { tempo } = timelineAt(example.number);
    expect({
      number: example.number,
      microsPerQuarter: tempo.microsPerQuarter,
      meter: `${tempo.numerator}/${tempo.denominator}`,
      beat: Tempo.beatOf(tempo).name,
      bpm: Tempo.bpmAt(Tempo.bpmOf(tempo), 100),
    }).toEqual(example);
  });
});

const NOTE = new Map([
  [1, 'whole note'],
  [2, 'half note'],
  [4, 'quarter note'],
  [8, 'eighth note'],
  [16, 'sixteenth note'],
]);

describe('the beat of a meter', () => {
  it('is the denominator’s note in a simple meter, the dotted note of three in a compound one, for numerators 1 to 16 over 1, 2, 4, 8, 16', () => {
    const wrong: Array<string> = [];
    let checked = 0;
    for (let numerator = 1; numerator <= 16; numerator++)
      for (const denominator of [1, 2, 4, 8, 16]) {
        const compound = numerator > 3 && numerator % 3 === 0 && denominator >= 2;
        const expected = compound
          ? { quarters: (3 * 4) / denominator, name: `dotted ${NOTE.get(denominator / 2)}` }
          : { quarters: 4 / denominator, name: NOTE.get(denominator) };
        const got = Tempo.beatOf({ numerator, denominator });
        checked += 1;
        if (got.quarters !== expected.quarters || got.name !== expected.name)
          wrong.push(`${numerator}/${denominator}: ${got.quarters} ${got.name}`);
      }
    expect({ checked, wrong }).toEqual({ checked: 80, wrong: [] });
  });

  it('reads the hymnal’s meters as a player counts them', () => {
    const beats = ['6/8', '9/8', '12/8', '6/4', '3/2', '2/2', '4/4', '3/4', '3/8', '6/1'].map(
      (meter) => {
        const [numerator = 0, denominator = 0] = meter.split('/').map(Number);
        const beat = Tempo.beatOf({ numerator, denominator });
        return `${meter} ${beat.quarters} ${beat.name}`;
      },
    );
    expect(beats).toEqual([
      '6/8 1.5 dotted quarter note',
      '9/8 1.5 dotted quarter note',
      '12/8 1.5 dotted quarter note',
      '6/4 3 dotted half note',
      '3/2 2 half note',
      '2/2 2 half note',
      '4/4 1 quarter note',
      '3/4 1 quarter note',
      '3/8 0.5 eighth note',
      '6/1 4 whole note',
    ]);
  });
});

const nearTie = (x: number) => Math.abs(x - Math.floor(x) - 0.5) < 1e-6;

describe('the bpm read-out', () => {
  it('is the hymn’s bpm at the stop, rounded, for every stop and bpm from 30 to 250', () => {
    const draw = seeded(SEED);
    const wrong: Array<string> = [];
    for (let k = 0; k < DRAWS; k++) {
      const bpm = 30 + 220 * draw();
      for (const stop of Tempo.STOPS) {
        const exact = (bpm * stop) / 100;
        if (nearTie(exact)) continue;
        const got = Tempo.bpmAt(bpm, stop);
        if (got !== Math.round(exact)) wrong.push(`${bpm} at ${stop}: ${got}`);
      }
    }
    expect(wrong.slice(0, 8)).toEqual([]);
  });

  it('reads hymn 100 at 90, 99 at 110 % and 95 at 105 %, and 80 bpm at 125 % as 100', () => {
    const hymn100 = Tempo.bpmOf(timelineAt(100).tempo);
    expect([
      Tempo.bpmAt(hymn100, 100),
      Tempo.bpmAt(hymn100, 110),
      Tempo.bpmAt(hymn100, 105),
      Tempo.bpmAt(80, 125),
    ]).toEqual([90, 99, 95, 100]);
  });
});

const tapsAt = (times: ReadonlyArray<number>, hymnBpm: number): Array<number | null> => {
  const set: Array<number | null> = [];
  let run: Tempo.TapRun = [];
  for (const at of times) {
    const tapped = Tempo.tap(run, at, hymnBpm);
    run = tapped.run;
    set.push(Option.getOrNull(tapped.tempo));
  }
  return set;
};

const timesFrom = (start: number, intervals: ReadonlyArray<number>): Array<number> => {
  const times = [start];
  for (const interval of intervals) times.push((times.at(-1) ?? start) + interval);
  return times;
};

const shown = (set: ReadonlyArray<number | null>) =>
  set.map((stop) => (stop === null ? '-' : String(stop))).join(' ');

const asked = (tappedBpm: number, hymnBpm: number) => (100 * tappedBpm) / hymnBpm;

const stopNear = (percent: number) => Math.min(150, Math.max(50, 5 * Math.round(percent / 5)));

describe('four taps on Tap', () => {
  it('set the stop nearest the tapped bpm over the hymn’s, held to 50 % to 150 %, and three set nothing', () => {
    const draw = seeded(SEED + 1);
    const wrong: Array<string> = [];
    let checked = 0;
    for (let k = 0; k < DRAWS; k++) {
      const hymnBpm = 30 + 220 * draw();
      const interval = 200 + Math.floor(2801 * draw());
      const start = Math.floor(100000 * draw());
      const percent = asked(60000 / interval, hymnBpm);
      if (nearTie(percent / 5)) continue;
      checked += 1;
      const got = tapsAt(timesFrom(start, [interval, interval, interval]), hymnBpm);
      const expected = [null, null, null, stopNear(percent)];
      if (shown(got) !== shown(expected))
        wrong.push(`bpm ${hymnBpm} every ${interval} ms from ${start}: ${shown(got)}`);
    }
    expect({ wrong: wrong.slice(0, 8), enough: checked > DRAWS * 0.9 }).toEqual({
      wrong: [],
      enough: true,
    });
  });

  it('600 ms apart set 125 % on an 80 bpm hymn (worship T3), and 110 % on hymn 100', () => {
    const hymn100 = Tempo.bpmOf(timelineAt(100).tempo);
    expect([
      tapsAt([0, 600, 1200, 1800], 80),
      tapsAt([0, 600, 1200, 1800], 90),
      tapsAt([0, 600, 1200, 1800], hymn100),
    ]).toEqual([
      [null, null, null, 125],
      [null, null, null, 110],
      [null, null, null, 110],
    ]);
  });

  it('run on over a 3000 ms pause and start over after a 3001 ms one, wherever it falls', () => {
    const draw = seeded(SEED + 2);
    const wrong: Array<string> = [];
    for (let k = 0; k < DRAWS; k++) {
      const hymnBpm = 30 + 220 * draw();
      const at = Math.floor(3 * draw());
      const start = Math.floor(100000 * draw());
      const pause = (gap: number) =>
        [600, 600, 600].map((interval, n) => (n === at ? gap : interval));
      const onPercent = asked(180000 / 4200, hymnBpm);
      const overPercent = asked(100, hymnBpm);
      if (nearTie(onPercent / 5) || nearTie(overPercent / 5)) continue;
      const on = tapsAt(timesFrom(start, pause(3000)), hymnBpm);
      const over = tapsAt(timesFrom(start, [...pause(3001), 600, 600, 600]), hymnBpm);
      const fresh = at + 1;
      const overExpected = over.map((_, n) => (n === fresh + 3 ? stopNear(overPercent) : null));
      if (shown(on) !== shown([null, null, null, stopNear(onPercent)]))
        wrong.push(`3000 ms before tap ${at + 2} at bpm ${hymnBpm}: ${shown(on)}`);
      if (shown(over.slice(0, fresh + 4)) !== shown(overExpected.slice(0, fresh + 4)))
        wrong.push(`3001 ms before tap ${at + 2} at bpm ${hymnBpm}: ${shown(over)}`);
    }
    expect(wrong.slice(0, 8)).toEqual([]);
  });

  it('start over on a tap at or before the last', () => {
    const draw = seeded(SEED + 3);
    const wrong: Array<string> = [];
    for (let k = 0; k < DRAWS; k++) {
      const hymnBpm = 30 + 220 * draw();
      const back = Math.floor(1201 * draw());
      const percent = asked(100, hymnBpm);
      if (nearTie(percent / 5)) continue;
      const back4 = 1200 - back;
      const got = tapsAt([0, 600, 1200, back4, back4 + 600, back4 + 1200, back4 + 1800], hymnBpm);
      const expected = [null, null, null, null, null, null, stopNear(percent)];
      if (shown(got) !== shown(expected))
        wrong.push(`a fourth tap ${back} ms before the third at bpm ${hymnBpm}: ${shown(got)}`);
    }
    expect(wrong.slice(0, 8)).toEqual([]);
  });

  it('read the last four from the fifth tap on', () => {
    const draw = seeded(SEED + 4);
    const wrong: Array<string> = [];
    for (let k = 0; k < DRAWS; k++) {
      const hymnBpm = 30 + 220 * draw();
      const intervals = [0, 1, 2, 3].map(() => 200 + Math.floor(2801 * draw()));
      const [first = 0, second = 0, third = 0, fourth = 0] = intervals;
      const fourthPercent = asked(180000 / (first + second + third), hymnBpm);
      const fifthPercent = asked(180000 / (second + third + fourth), hymnBpm);
      if (nearTie(fourthPercent / 5) || nearTie(fifthPercent / 5)) continue;
      const got = tapsAt(timesFrom(0, intervals), hymnBpm);
      const expected = [null, null, null, stopNear(fourthPercent), stopNear(fifthPercent)];
      if (shown(got) !== shown(expected))
        wrong.push(`intervals ${intervals.join(' ')} at bpm ${hymnBpm}: ${shown(got)}`);
    }
    expect(wrong.slice(0, 8)).toEqual([]);
  });
});
