/**
 * The natural voice source against its own model, over seeded histories of
 * one source: speaks of one-, two- and three-chunk texts, of a phrase long
 * enough to break mid-phrase, of one with no end mark and of a text no
 * plan takes, each naming a system voice and a natural voice drawn from
 * `VOICES` or from names that miss one (another voice, a case, a pack path,
 * a trailing space, a name the reader sees); stop, pause and resume; a load
 * answered ok or with a failure; the module call held longest, a chunk's
 * prosody or its render, answered ok (a prosody's curve with a final rise
 * or a fall, and unvoiced points; a render's audible span anywhere in the
 * audio, or none), with a failure, or malformed (a prosody's id with no
 * frame, a frame list short or long, NaN, a fraction, its curve a point
 * short or over, a point NaN or infinite; a render's frames off, the audio
 * a frame off, a span outside the audio or not whole); a refused play; the module's
 * events for the held utterance (and for one a failure let go of) and for
 * any other; a listener subscribed in a child of the source's scope, and
 * that child closed; and a reload (the scope closed, a new source,
 * utterance ids from 1 again). After every step the module's calls, the
 * events each listener heard and each speak's state (pending, succeeded,
 * failed) equal the model's, the source holds one module subscription, and
 * a listener whose scope closed, or a closed source's, hears nothing more.
 * The model, the generator and the per-step check live in
 * `test/natural-voice.ts`.
 *
 * The texts are made-up words over a lexicon written there, planned with
 * `planOf` (hslexicon's rule); the model computes each word's start sample
 * and a prosody's and a render's fit itself, and falls a curve with
 * `fallOf`, whose rule `fall.property.test.ts` holds.
 *
 * It catches a source that loads a voice other than the speak's natural
 * voice (a fixed one, the first it was given, the system voice, a name with
 * no `.bin`), runs a prosody at a speed other than its voice's, renders
 * on a curve other than the fallen one (`fallOf`) for a chunk that ends a
 * phrase or the reading, or other than Prosody's own inside a phrase,
 * renders on a prosody that does not fit its chunk, reads a name
 * not in `VOICES` (or reads it as a default), refuses one before its stop,
 * or loads a list other than `FILES`; and one that forwards another utterance's event, keeps a
 * reading past a terminal event or a failure, keeps a listener past its
 * scope, plays or renders after a stop, marks the
 * wrong chunk last, fails a later chunk silently or a first one as success,
 * skips the stop that starts a speak or a build, reads only the first
 * chunk, trusts a render whose audio is not its frames long or whose span
 * lies outside it, plays a chunk uncut, cut without its 20 ms margin, with
 * its starts unmoved or unclamped, or without its rest, or holds a
 * replaced speak until its module call answers. It misses the native
 * module's own timing: the module here answers when the history says.
 */

import { describe, expect, it } from 'bun:test';
import { Effect, Layer, Option } from 'effect';

import {
  census,
  chunksOf,
  FLOORS,
  HISTORIES,
  histories,
  LEXICON,
  LONG_PHRASE,
  makeModule,
  random,
  RANGES,
  SEED,
  STEPS,
  TEXTS,
  UNMARKED,
  type Range,
} from '../test/natural-voice';
import { VoiceSource } from '../voice';
import { naturalVoiceSource } from './voice';

const RANGE = RANGES[0];

describe('the natural voice source', () => {
  it('plans the test texts in one, two and three chunks, a long phrase in two, an unmarked one with no rest, and refuses the last', () => {
    expect(
      TEXTS.map((text) =>
        Option.getOrElse(
          Option.map(chunksOf(text), (each) => each.length),
          () => 0,
        ),
      ),
    ).toEqual([1, 2, 2, 3, 3, 2, 1, 0]);
    expect(Option.getOrThrow(chunksOf(LONG_PHRASE))[0]?.rest).toBe(0);
    expect(Option.getOrThrow(chunksOf(UNMARKED))[0]?.rest).toBe(0);
  });

  it('offers no voices of its own: the voice passed to speak names the natural voice', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const source = yield* VoiceSource;
        expect(yield* source.voices).toEqual([]);
      }).pipe(
        Effect.provide(
          Layer.provide(
            naturalVoiceSource(() => LEXICON),
            makeModule().layer,
          ),
        ),
      ),
    ));

  it('counts every history exactly once in whole, non-empty ranges inside the total, whatever their order', () => {
    const next = random(81_203);
    const whole = (limit: number) => Math.floor(next() * limit);
    const count = (ranges: ReadonlyArray<Range>, total: number) => {
      if (!Number.isInteger(total) || total < 0) return false;
      if (
        ranges.some(
          ({ from, count }) =>
            !Number.isInteger(from) ||
            !Number.isInteger(count) ||
            from < 0 ||
            count < 1 ||
            from + count > total,
        )
      )
        return false;
      for (let index = 0; index < total; index++) {
        if (ranges.filter(({ from, count }) => index >= from && index < from + count).length !== 1)
          return false;
      }
      return true;
    };
    const reached = {
      middleGap: 0,
      endGap: 0,
      overlap: 0,
      duplicate: 0,
      pastTotal: 0,
      empty: 0,
      notWhole: 0,
      badTotal: 0,
    };
    const check = (ranges: ReadonlyArray<Range>, total: number) => {
      expect(
        census(ranges, total).length === 0,
        `${ranges.map(({ from, count }) => `${from}+${count}`).join(',')}; total=${total}`,
      ).toBe(count(ranges, total));
    };
    const checkFault = (
      ranges: ReadonlyArray<Range>,
      total: number,
      fault: keyof typeof reached,
    ) => {
      expect(count(ranges, total), fault).toBe(false);
      reached[fault]++;
      check(ranges, total);
    };
    const nearPartitions = (partition: ReadonlyArray<Range>, total: number) => {
      checkFault(partition, total + 0.5, 'badTotal');
      const selected = whole(partition.length);
      for (const range of partition.slice(selected, selected + 1)) {
        const rest = partition.filter((_, index) => index !== selected);
        const end = range.from + range.count;
        if (range.from > 0 && end < total) checkFault(rest, total, 'middleGap');
        if (end === total) checkFault(rest, total, 'endGap');
        if (range.count > 1) check([...rest, { ...range, count: range.count - 1 }], total);
        check([...rest, { ...range, from: range.from + 1 }], total);
        check([...rest, { ...range, count: 0 }], total);
        checkFault([...partition, { from: total, count: 0 }], total, 'empty');
        if (range.count >= 3)
          checkFault(
            [
              ...rest,
              { from: range.from + 1.5, count: range.count - 1.5 },
              { from: range.from, count: 1.5 },
            ],
            total,
            'notWhole',
          );
        checkFault([...partition, range], total, 'duplicate');
        const extended = [...rest, { ...range, count: range.count + 1 }];
        if (end < total) checkFault(extended, total, 'overlap');
        else checkFault(extended, total, 'pastTotal');
      }
    };
    for (let trial = 0; trial < 800; trial++) {
      const total = whole(25);
      const partition: Array<Range> = [];
      for (let from = 0; from < total;) {
        const count = 1 + whole(total - from);
        partition.splice(whole(partition.length + 1), 0, { from, count });
        from += count;
      }
      const values = [-3, -1, 0, 0.5, 1, total, total + 1, Number.NaN, Infinity];
      const value = () =>
        Option.getOrElse(Option.fromUndefinedOr(values[whole(values.length)]), () => Number.NaN);
      const arbitrary = Array.from({ length: whole(9) }, () => ({ from: value(), count: value() }));
      for (const ranges of [partition, [...partition, ...partition], arbitrary]) {
        for (const size of [total, value()]) {
          check(ranges, size);
        }
      }
      nearPartitions(partition, total);
    }
    for (const [fault, reachedCount] of Object.entries(reached)) {
      expect(reachedCount, fault).toBeGreaterThanOrEqual(1);
    }
    expect(census(RANGES, HISTORIES)).toEqual([]);
    expect([SEED, HISTORIES, STEPS]).toEqual([52_031, 300, 72]);
    for (const key of Object.keys(FLOORS) as ReadonlyArray<keyof typeof FLOORS>) {
      for (const range of RANGES) {
        expect(Number.isInteger(range.floors[key]) && range.floors[key] >= 1, key).toBe(true);
      }
      expect(
        RANGES.reduce((sum, range) => sum + range.floors[key], 0),
        key,
      ).toBeGreaterThanOrEqual(FLOORS[key]);
    }
  });

  it(`equals its model over the first 150 seeded histories of ${STEPS} steps`, () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const run = yield* histories(RANGE);
        expect([run.seeds[0], run.seeds.at(-1), run.seeds.length, new Set(run.seeds).size]).toEqual(
          [52_031, 52_180, 150, 150],
        );
        for (const key of Object.keys(RANGE.floors) as ReadonlyArray<keyof typeof RANGE.floors>) {
          expect(run.totals[key], key).toBeGreaterThanOrEqual(RANGE.floors[key]);
        }
      }),
    ));
});
