import * as BunServices from '@effect/platform-bun/BunServices';
import { Array as Arr, Effect, FileSystem, Option, Path, Schema } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import { readPlayback } from '../scripts/playback.js';
import { Hymn, PER_BEAT, type Timing, sung } from './hymn.js';
import { Playback } from './playback.js';
import { secondsAt } from './timing.js';

const test = it.scopedLive.layer(BunServices.layer);

const pad = (n: number) => String(n).padStart(3, '0');

const decodeHymn = Schema.decodeUnknownEffect(Schema.fromJsonString(Hymn));
const decodePlayback = Schema.decodeUnknownEffect(Schema.fromJsonString(Playback));

const readData = (...parts: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return yield* fs.readFileString(path.join(import.meta.dir, '..', 'data', ...parts));
  });

const playbackHymns = Effect.gen(function* () {
  const hymns = yield* Effect.forEach(Arr.range(1, 695), (n) =>
    readData('sdah-1985', `${pad(n)}.json`).pipe(Effect.flatMap(decodeHymn)),
  );
  return readPlayback(hymns);
});

const unplayedOf = (hymn: Hymn) => {
  const lines = sung(hymn);
  const firstStanza = lines.findIndex((line) => line.verse !== 'refrain');
  return Option.match(
    Option.filter(
      Option.fromUndefinedOr(hymn.timing),
      (timing) => timing.lines.length === lines.length,
    ),
    {
      onNone: () => ({ faults: [-1], excused: [] }),
      onSome: (timing) => {
        const unplayed = timing.lines.flatMap((line, i) => [i].filter(() => !line.played));
        const inIntro = (i: number) =>
          i < firstStanza &&
          Option.exists(Arr.get(lines, i), (line) => line.verse === 'refrain') &&
          Option.exists(Arr.get(timing.lines, i), (line) => line.until <= timing.intro);
        return {
          faults: unplayed.filter((i) => !inIntro(i)),
          excused: unplayed.filter(inIntro),
        };
      },
    },
  );
};

const PASS = 2304;
const PASS_SECONDS = 15.945102;

const passProblems = (timing: Timing, firsts: ReadonlyArray<number>): ReadonlyArray<string> => {
  const seconds = secondsAt(timing);
  const starts = firsts.map((i) =>
    Option.match(Arr.get(timing.lines, i), { onNone: () => -1, onSome: (line) => line.start }),
  );
  const bounds = [...starts, timing.end];
  return [
    ...['perBeat'].filter(() => timing.perBeat !== PER_BEAT),
    ...['lines'].filter(() => timing.lines.length !== 7),
    ...timing.lines.flatMap((line, i) => [`line ${i} unplayed`].filter(() => !line.played)),
    ...['intro'].filter(() => timing.intro !== 0),
    ...['end'].filter(() => timing.end !== 6 * PASS),
    ...starts.flatMap((start, k) =>
      [`stanza ${k + 1} starts at ${start}`].filter(() => start !== k * PASS),
    ),
    ...starts.flatMap((start, k) => {
      const next = Option.getOrElse(Arr.get(bounds, k + 1), () => -1);
      const pass = seconds(next) - seconds(start);
      return [`stanza ${k + 1} lasts ${pass.toFixed(6)} s`].filter(
        () => Math.abs(pass - PASS_SECONDS) > 0.001,
      );
    }),
    ...['last line until'].filter(() =>
      Option.exists(Arr.last(timing.lines), (line) => line.until !== timing.end),
    ),
    ...['total seconds'].filter(() => Math.abs(seconds(timing.end) - 6 * PASS_SECONDS) > 0.001),
  ];
};

describe('the committed timing', () => {
  test('plays every line of every hymn but a refrain sung before any stanza, inside the intro', () =>
    Effect.gen(function* () {
      const faults: Array<string> = [];
      const excused: Array<number> = [];
      for (const hymn of yield* playbackHymns) {
        const { faults: lines, excused: refrains } = unplayedOf(hymn);
        faults.push(...lines.map((i) => `${hymn.number}:${i}`));
        excused.push(...[hymn.number].filter(() => refrains.length > 0));
      }
      expect(excused).toEqual([93, 121, 133, 172, 349, 362, 475]);
      expect(faults).toEqual([]);
    }));

  test("sings 663's one verse once for each of its six stanzas, in its corpus file and its sidecar", () =>
    Effect.gen(function* () {
      const hymn = yield* readData('sdah-1985', '663.json').pipe(Effect.flatMap(decodeHymn));
      const sidecar = yield* readData('playback', '663.json').pipe(Effect.flatMap(decodePlayback));
      const lines = sung(hymn);
      const firsts = Arr.range(1, 6).map((k) => lines.findIndex((line) => line.verse === k));
      expect(firsts).toEqual([0, 2, 3, 4, 5, 6]);
      expect(hymn.verses).toEqual({ text: 6, midi: 1, exact: false });
      expect(sidecar.verses).toEqual({ text: 6, midi: 1, exact: false });
      const corpusTiming = Option.fromUndefinedOr(hymn.timing);
      expect(Option.isSome(corpusTiming)).toBe(true);
      expect(
        Option.match(corpusTiming, {
          onNone: () => ['no timing'],
          onSome: (timing) => passProblems(timing, firsts),
        }),
      ).toEqual([]);
      expect(passProblems(sidecar.timing, firsts)).toEqual([]);
    }));
});
