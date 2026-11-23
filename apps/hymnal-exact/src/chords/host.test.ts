import { describe, expect, test } from 'bun:test';

import { withDataHost } from '@manna/exact-kit/data-host/testing';

import { book } from '../hymns/book.ts';
import { below, pick, seeded } from '../test/random.ts';
import { bundled } from './shipped.testing.ts';
import { chordsSources } from './sources.ts';

const sources = chordsSources(book, bundled);

const GRIP_TOKENS = ['Db_0', 'Fs_5m7-b', 'Bbm_0_7', '', 'C', 'Es_0', 'C_zz', 'G_0-1-2'] as const;

/** A route's hymn number as a reader or a stale link writes it. */
const route = (random: () => number): string =>
  pick(random, [`${1 + below(random, 695)}`, '0', '696', '007', '-1', '1.5', '', 'abc']);

describe("the chords' sources run where Exact runs them", () => {
  test('inside the data host, each answers generated arguments without throwing', () => {
    const random = seeded(43);
    withDataHost(() => {
      for (let run = 0; run < 40; run++) {
        const moves = pick(random, [
          [],
          ['100:2:1'],
          ['x', '5:9:0', '100:-5:11'],
          [`${below(random, 700)}:1:1`],
        ]);
        expect(() =>
          sources.chordsPage([route(random), below(random, 4) > 0, moves]),
        ).not.toThrow();
        expect(() => sources.chordsGrip([pick(random, GRIP_TOKENS)])).not.toThrow();
      }
    });
  });
});
