/* oxlint-disable effect/noNodeBuiltinImport -- the test reads the app's own contracts, by path under Bun. */

/**
 * A node a contract names by an `id` (a scroll's target, a mark a measure
 * or `elementFromPoint` reads) is never authored zero wide or zero tall:
 * iOS never reports a node of no size as laid out, so a scroll to it goes
 * nowhere (sweep-8 B1, About this hymn's topic landing at the top).
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';

const ZERO = /(?:^|\s)(?:width|height)=(?:0|"0px")(?:\s|$)/u;
const NAMED = /(?:^|\s)id=/u;

const app = new URL('../', import.meta.url);
const contracts = [
  'app.contract',
  ...readdirSync(new URL('features/', app), 'utf8')
    .filter((name) => name.endsWith('.contract'))
    .map((name) => `features/${name}`),
];

describe('the contracts’ named nodes', () => {
  test('no node with an id is authored zero wide or zero tall', () => {
    expect(contracts.length).toBeGreaterThan(10);
    const zero = contracts.flatMap((path) =>
      readFileSync(new URL(path, app), 'utf8')
        .split('\n')
        .map((line, at) => ({ line, where: `${path}:${at + 1}` }))
        .filter(({ line }) => NAMED.test(line) && ZERO.test(line))
        .map(({ where }) => where),
    );
    expect(zero).toEqual([]);
  });
});
