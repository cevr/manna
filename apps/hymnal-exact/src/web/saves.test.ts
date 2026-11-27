/**
 * drive-web's network oracle (`tools/web/saves.ts`) over generated request
 * lists: a rested hymn page gives exactly one request for its printed key,
 * and a second same-key save in one rest, a save before the rest, a wrong
 * key, a background bucket request after Play and another origin's
 * request are each refused, while the audible stream after Play and one
 * save per rest are admitted, in any order and among the local server's
 * requests.
 */

import { describe, expect, test } from 'bun:test';

import { type Asked, oneSave, savesByRest, unaskedOf } from '../../tools/web/saves.ts';
import { below, pick, type Random, seeded } from '../test/random.ts';

const ORIGIN = 'http://127.0.0.1:8766';
const BUCKET = 'https://hymns.cvr.im';
const printed = (hymn: number) => `${BUCKET}/audio/1/${hymn}-C.mp3`;
const SEEDS = 200;

const local = (random: Random): Asked => ({
  url: `${ORIGIN}/${pick(random, ['', 'hymns/2', 'app.js', 'modules/chords/2.js'])}`,
  type: pick(random, ['document', 'script', 'fetch']),
  afterPlay: below(random, 2) === 0,
  rest: 0,
  at: below(random, 10_000),
});
const save = (hymn: number, rest: number, afterPlay = false): Asked => ({
  url: printed(hymn),
  type: 'fetch',
  afterPlay,
  rest,
  at: rest * 1000,
});
const stream = (hymn: number, rest: number): Asked => ({
  url: printed(hymn),
  type: 'media',
  afterPlay: true,
  rest,
  at: 20_000,
});

/** `asked` among some of the local server's requests, in an order `random` draws. */
const mixed = (random: Random, asked: ReadonlyArray<Asked>): ReadonlyArray<Asked> => {
  const all = [...asked, ...Array.from({ length: below(random, 6) }, () => local(random))];
  return all
    .map((each) => ({ each, key: random() }))
    .toSorted((a, b) => a.key - b.key)
    .map(({ each }) => each);
};

/** The oracle's verdict on `asked`, drawn `SEEDS` times among local requests in every order drawn. */
const verdicts = (asked: (random: Random) => ReadonlyArray<Asked>) =>
  Array.from({ length: SEEDS }, (_, seed) => {
    const random = seeded(seed);
    return unaskedOf(mixed(random, asked(random)), ORIGIN, BUCKET).length;
  });

describe("drive-web's save oracle", () => {
  test('one rested save of the printed key is admitted, and the rest check passes', () => {
    for (let seed = 0; seed < SEEDS; seed++) {
      const random = seeded(seed);
      const hymn = 1 + below(random, 695);
      expect(oneSave([save(hymn, 1)], printed(hymn))).toBe(true);
      expect(unaskedOf(mixed(random, [save(hymn, 1)]), ORIGIN, BUCKET)).toEqual([]);
    }
  });

  test('two same-key rested saves in one rest are refused', () => {
    for (let seed = 0; seed < SEEDS; seed++) {
      const random = seeded(seed);
      const hymn = 1 + below(random, 695);
      const twice = [save(hymn, 1), save(hymn, 1, below(random, 2) === 0)];
      expect(oneSave(twice, printed(hymn))).toBe(false);
      expect(savesByRest(twice).get(1)).toBe(2);
      expect(unaskedOf(mixed(random, twice), ORIGIN, BUCKET)).toHaveLength(1);
    }
  });

  test('a save made before its rest is refused', () => {
    const early: Asked = { ...save(1, 1), rest: 0 };
    expect(oneSave([early], printed(1))).toBe(false);
    expect(verdicts(() => [early]).every((count) => count === 1)).toBe(true);
  });

  test("a wrong key's request is refused", () => {
    for (let seed = 0; seed < SEEDS; seed++) {
      const random = seeded(seed);
      const hymn = 1 + below(random, 694);
      expect(oneSave([save(hymn + 1, 1)], printed(hymn))).toBe(false);
      expect(
        unaskedOf([{ ...save(hymn, 1), url: `${BUCKET}/other.mp3`, rest: 0 }], ORIGIN, BUCKET),
      ).toHaveLength(1);
    }
  });

  test("another origin's request is refused, after Play too", () => {
    const foreign = (random: Random): Asked => ({
      ...stream(1, 0),
      url: pick(random, ['https://other.invalid/fixture.mp3', `${BUCKET}.evil/audio/1-C.mp3`]),
      type: pick(random, ['media', 'fetch']),
    });
    expect(verdicts((random) => [foreign(random)]).every((count) => count === 1)).toBe(true);
  });

  test('the audible stream after Play is kept apart from background requests after Play', () => {
    expect(verdicts(() => [save(2, 1), stream(2, 1), stream(2, 1), stream(2, 0)])).toEqual(
      Array.from({ length: SEEDS }, () => 0),
    );
    const background: Asked = { ...stream(2, 0), type: 'fetch' };
    expect(verdicts(() => [save(2, 1), background]).every((count) => count === 1)).toBe(true);
    expect(verdicts(() => [{ ...stream(2, 0), afterPlay: false }]).every((n) => n === 1)).toBe(
      true,
    );
    expect(savesByRest([save(2, 1), stream(2, 1)]).get(1)).toBe(1);
  });

  test('a save in each of two rests is admitted, one each', () => {
    expect(verdicts(() => [save(1, 1), save(2, 2), save(1, 3, true)])).toEqual(
      Array.from({ length: SEEDS }, () => 0),
    );
  });
});
