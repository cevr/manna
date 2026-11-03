import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';
import bundled from 'virtual:hymnal-timing';

import { timelineOf, type FirstTempo } from '../follow/timeline';
import * as Count from './countin';
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
const DRAWS = 40;
const RATES = 4;
const NEAR = 1e-6;

const near = (a: number, b: number) => Math.abs(a - b) <= NEAR * Math.max(1, Math.abs(b));

const oracleBeats = (numerator: number, denominator: number): number => {
  if (numerator > 3 && numerator % 3 === 0 && denominator >= 2) return numerator / 3;
  return numerator;
};

const barMs = (tempo: FirstTempo) =>
  (tempo.numerator * (4 / tempo.denominator) * tempo.microsPerQuarter) / 1000;

const countInWrong = (tempo: FirstTempo): ReadonlyArray<string> => {
  const said = `${tempo.numerator}/${tempo.denominator} at ${tempo.microsPerQuarter}`;
  const got = Count.countInOf(tempo);
  const beats = oracleBeats(tempo.numerator, tempo.denominator);
  const beatMs = (Tempo.beatOf(tempo).quarters * tempo.microsPerQuarter) / 1000;
  const wrong: Array<string> = [];
  if (!Number.isInteger(got.beats) || got.beats < 1) wrong.push(`${said}: ${got.beats} beats`);
  if (got.beats !== beats) wrong.push(`${said}: ${got.beats} beats, not ${beats}`);
  if (!near(got.beatMs, beatMs)) wrong.push(`${said}: a beat of ${got.beatMs} ms, not ${beatMs}`);
  if (!near(got.beats * got.beatMs, barMs(tempo)))
    wrong.push(`${said}: ${got.beats} × ${got.beatMs} ms is not one bar (${barMs(tempo)} ms)`);
  if (!near(Tempo.bpmOf(tempo) * got.beatMs, 60000))
    wrong.push(`${said}: the read-out's ${Tempo.bpmOf(tempo)} bpm is not a beat of ${got.beatMs}`);
  return wrong;
};

const timesWrong = (countIn: Count.CountIn, rate: number, said: string): ReadonlyArray<string> => {
  const got = Count.beatTimes(countIn, rate);
  const expected = Array.from({ length: countIn.beats + 1 }, (_, k) => (k * countIn.beatMs) / rate);
  if (got.length !== expected.length)
    return [`${said} at ${rate}: ${got.length} times, not ${expected.length}`];
  return expected.flatMap((at, k) => {
    const time = got[k] ?? Number.NaN;
    if (near(time, at)) return [];
    return [`${said} at ${rate}: time ${k} at ${time} ms, not ${at}`];
  });
};

const DENOMINATORS = [1, 2, 4, 8, 16];

const domain = (): ReadonlyArray<FirstTempo> => {
  const draw = seeded(SEED);
  const tempos: Array<FirstTempo> = [];
  for (let numerator = 1; numerator <= 16; numerator++)
    for (const denominator of DENOMINATORS)
      for (let k = 0; k < DRAWS; k++)
        tempos.push({
          numerator,
          denominator,
          microsPerQuarter: Math.round(150000 + 2850000 * draw()),
        });
  return tempos;
};

const hymns = bundled.map(([number, encoded]) => ({
  number,
  tempo: Option.getOrThrow(timelineOf(encoded)).tempo,
}));

const tempoOf = new Map(hymns.map((hymn) => [hymn.number, hymn.tempo]));

const tempoAt = (number: number): FirstTempo =>
  Option.getOrThrow(Option.fromUndefinedOr(tempoOf.get(number)));

describe('the count-in of a tempo', () => {
  it('is one bar in the meter’s whole beats, for numerators 1 to 16 over 1, 2, 4, 8, 16 at generated quarter lengths', () => {
    const tempos = domain();
    const wrong = tempos.flatMap(countInWrong);
    expect({ checked: tempos.length, wrong: wrong.slice(0, 8) }).toEqual({
      checked: 80 * DRAWS,
      wrong: [],
    });
  });

  it('is one bar in the meter’s whole beats for every hymn of the bundle', () => {
    const wrong = hymns.flatMap((hymn) =>
      countInWrong(hymn.tempo).map((w) => `${hymn.number} ${w}`),
    );
    expect({ hymns: hymns.length, wrong: wrong.slice(0, 8) }).toEqual({ hymns: 695, wrong: [] });
  });

  it('counts 430 hymns in 4, 179 in 3, 85 in 2 and 1 in 1', () => {
    const counted = new Map<number, number>();
    for (const hymn of hymns) {
      const { beats } = Count.countInOf(hymn.tempo);
      counted.set(beats, (counted.get(beats) ?? 0) + 1);
    }
    expect([...counted].toSorted(([a], [b]) => b - a)).toEqual([
      [4, 430],
      [3, 179],
      [2, 85],
      [1, 1],
    ]);
  });

  it.each([
    { number: 78, meter: '3/4', beats: 3, beatMs: 1000 },
    { number: 116, meter: '4/4', beats: 4, beatMs: 1090.909 },
    { number: 33, meter: '6/8', beats: 2, beatMs: 1111.11 },
    { number: 131, meter: '1/2', beats: 1, beatMs: 1185.77 },
  ])('hymn $number in $meter counts in $beats beats of $beatMs ms', (example) => {
    const tempo = tempoAt(example.number);
    const countIn = Count.countInOf(tempo);
    expect({
      number: example.number,
      meter: `${tempo.numerator}/${tempo.denominator}`,
      beats: countIn.beats,
      beatMs: Math.round(countIn.beatMs * 1000) / 1000,
    }).toEqual(example);
  });
});

describe('the beats’ times', () => {
  it('fall at k × beatMs / rate, the first sung line one beat after the last, for every hymn at every stop of the dial', () => {
    let checked = 0;
    const wrong = hymns.flatMap((hymn) =>
      Tempo.STOPS.flatMap((stop) => {
        checked += 1;
        return timesWrong(Count.countInOf(hymn.tempo), Tempo.rateOf(stop), `${hymn.number}`);
      }),
    );
    expect({ checked, wrong: wrong.slice(0, 8) }).toEqual({ checked: 695 * 21, wrong: [] });
  });

  it('fall at k × beatMs / rate for generated rates from 0.25 to 2', () => {
    const draw = seeded(SEED + 1);
    const wrong = hymns.flatMap((hymn) =>
      Array.from({ length: RATES }, () => 0.25 + 1.75 * draw()).flatMap((rate) =>
        timesWrong(Count.countInOf(hymn.tempo), rate, `${hymn.number}`),
      ),
    );
    expect(wrong.slice(0, 8)).toEqual([]);
  });

  it('give hymn 78 at 50 %, 100 % and 150 % its three beats, then its first sung line', () => {
    const countIn = Count.countInOf(tempoAt(78));
    const at = (stop: number) =>
      Count.beatTimes(countIn, Tempo.rateOf(stop)).map((ms) => Math.round(ms * 1000) / 1000);
    expect([at(50), at(100), at(150)]).toEqual([
      [0, 2000, 4000, 6000],
      [0, 1000, 2000, 3000],
      [0, 666.667, 1333.333, 2000],
    ]);
  });

  it('give hymn 131 one beat, then its first sung line one beat later', () => {
    const countIn = Count.countInOf(tempoAt(131));
    const times = Count.beatTimes(countIn, 1).map((ms) => Math.round(ms * 1000) / 1000);
    expect(times).toEqual([0, 1185.77]);
  });
});
