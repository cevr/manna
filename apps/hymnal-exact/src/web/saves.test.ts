/**
 * drive-web's network oracle (`tools/web/saves.ts`) over generated request
 * lists: a rested hymn page gives exactly one request for its printed key,
 * and a second same-key save in one rest, a save before the rest, a wrong
 * key, a background bucket request after Play and another origin's
 * request are each refused, while the stream of the hymn played and one
 * save per rest are admitted, in any order and among the local server's
 * requests.
 */

import { describe, expect, test } from 'bun:test';

import { keySet, recordingKey, setOf } from '@manna/hymnal/recordings';

import { type Asked, oneSave, savesByRest, unaskedOf } from '../../tools/web/saves.ts';
import { below, pick, type Random, seeded } from '../test/random.ts';

const ORIGIN = 'http://127.0.0.1:8766';
const BUCKET = 'https://hymns.cvr.im';
const printed = (hymn: number) => `${BUCKET}/audio/${setOf(hymn)}/${recordingKey(hymn)}`;
const SEEDS = 200;
const hymnOf = (random: Random) => 1 + below(random, 694);

const local = (random: Random): Asked => ({
  url: `${ORIGIN}/${pick(random, ['', 'hymns/2', 'app.js', 'modules/chords/2.js'])}`,
  hymn: below(random, 3),
  afterPlay: below(random, 2) === 0,
  rest: 0,
  at: below(random, 10_000),
});
/** A save of `hymn`'s printed key in rest `rest`, made before Play. */
const save = (hymn: number, rest: number): Asked => ({
  url: printed(hymn),
  hymn,
  afterPlay: false,
  rest,
  at: rest * 1000,
});
/** The player's request for `hymn`'s recording after Play, in the key `transpose` from the printed. */
const stream = (hymn: number, rest: number, transpose = 0): Asked => ({
  url: `${BUCKET}/audio/${keySet(setOf(hymn), transpose)}/${recordingKey(hymn)}`,
  hymn,
  afterPlay: true,
  rest,
  at: 20_000,
});

/** `asked` among some of the local server's requests, in an order `random` draws. */
const mixed = (random: Random, asked: ReadonlyArray<Asked>): ReadonlyArray<Asked> =>
  [...asked, ...Array.from({ length: below(random, 6) }, () => local(random))]
    .map((each) => ({ each, key: random() }))
    .toSorted((a, b) => a.key - b.key)
    .map(({ each }) => each);

/** How many requests the oracle refuses of `asked`, drawn `SEEDS` times among local requests in an order each draws. */
const verdicts = (asked: (random: Random) => ReadonlyArray<Asked>) =>
  Array.from({ length: SEEDS }, (_, seed) => {
    const random = seeded(seed);
    return unaskedOf(mixed(random, asked(random)), ORIGIN, BUCKET).length;
  });
const every = (count: number) => Array.from({ length: SEEDS }, () => count);

describe("drive-web's save oracle", () => {
  test('one rested save of the printed key is admitted, and the rest check passes', () => {
    for (let seed = 0; seed < SEEDS; seed++) {
      const random = seeded(seed);
      const hymn = hymnOf(random);
      expect(oneSave([save(hymn, 1)], printed(hymn), BUCKET)).toBe(true);
      expect(unaskedOf(mixed(random, [save(hymn, 1)]), ORIGIN, BUCKET)).toEqual([]);
    }
  });

  test('two same-key rested saves in one rest are refused', () => {
    for (let seed = 0; seed < SEEDS; seed++) {
      const random = seeded(seed);
      const hymn = hymnOf(random);
      const twice = [save(hymn, 1), { ...save(hymn, 1), at: 1000 + below(random, 5000) }];
      expect(oneSave(twice, printed(hymn), BUCKET)).toBe(false);
      expect(savesByRest(twice, BUCKET).get(1)).toBe(2);
      expect(unaskedOf(mixed(random, twice), ORIGIN, BUCKET)).toHaveLength(1);
    }
  });

  test('a save made before its rest is refused', () => {
    const early = (random: Random): Asked => ({ ...save(hymnOf(random), 1), rest: 0 });
    expect(oneSave([early(seeded(1))], printed(1), BUCKET)).toBe(false);
    expect(verdicts((random) => [early(random)])).toEqual(every(1));
  });

  test("a wrong key's request is refused", () => {
    for (let seed = 0; seed < SEEDS; seed++) {
      const random = seeded(seed);
      const hymn = hymnOf(random);
      expect(oneSave([save(hymn + 1, 1)], printed(hymn), BUCKET)).toBe(false);
      const other: Asked = { ...save(hymn, 0), url: `${BUCKET}/other.mp3` };
      expect(unaskedOf([other], ORIGIN, BUCKET)).toHaveLength(1);
    }
  });

  test("another origin's request is refused, after Play too", () => {
    const foreign = (random: Random): Asked => {
      const hymn = hymnOf(random);
      return {
        ...stream(hymn, 0),
        url: pick(random, [
          `https://other.invalid/audio/${recordingKey(hymn)}`,
          `${BUCKET}.evil/audio/${setOf(hymn)}/${recordingKey(hymn)}`,
        ]),
      };
    };
    expect(verdicts((random) => [foreign(random)])).toEqual(every(1));
  });

  test('the stream of the hymn played is kept apart from background requests after Play', () => {
    const played = (random: Random) => {
      const hymn = hymnOf(random);
      return [save(hymn, 1), stream(hymn, 1), stream(hymn, 0), stream(hymn, 0, 2), stream(hymn, 2)];
    };
    expect(verdicts(played)).toEqual(every(0));
    const background = (random: Random): Asked => {
      const hymn = hymnOf(random);
      return {
        ...stream(hymn, 0),
        url: pick(random, [printed(hymn + 1), `${BUCKET}/audio/indexes.json`, `${BUCKET}/x`]),
      };
    };
    expect(verdicts((random) => [background(random)])).toEqual(every(1));
    expect(verdicts((random) => [{ ...stream(hymnOf(random), 0), afterPlay: false }])).toEqual(
      every(1),
    );
    expect(savesByRest([save(2, 1), stream(2, 1)], BUCKET).get(1)).toBe(1);
  });

  test('a save in each of two rests is admitted, one each', () => {
    expect(verdicts(() => [save(1, 1), save(2, 2), save(1, 3)])).toEqual(every(0));
  });
});
