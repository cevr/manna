/**
 * The Read tab's screens write every measure of a `style` as a token too.
 * `src/look/measures.test.ts` reads a node's attributes (`gap=8`); a style's
 * rows are written `gap = "space.s8"`, which it does not read, so this test
 * reads them in `pm-hs-read`'s files by the same rule.
 */

import { describe, expect, it } from 'bun:test';
import { measureLiterals } from '@manna/exact-kit/look/testing';

import { readContracts } from '../../tools/look';

const FILES = [
  'features/chooser.contract',
  'features/goto.contract',
  'features/read.contract',
  'features/find.contract',
  'features/garden.contract',
  'features/text.contract',
];

/** Each row of a `style` block in `contract`, written as an attribute (`gap="space.s8"`). */
const styleRows = (contract: string): ReadonlyArray<string> =>
  [...contract.matchAll(/^style \w+\n((?:[ \t]+[^\n]*\n?)*)/gmu)].flatMap(([, body = '']) =>
    [...body.matchAll(/^\s+([-\w]+) = (.+)$/gmu)].map(([, name, value]) => ` ${name}=${value}`),
  );

const literalsOf = (contract: string) => measureLiterals(styleRows(contract).join('\n'));

const contracts = readContracts();

describe("the Read tab's styles write their measures as tokens", () => {
  for (const path of FILES)
    it(`${path}'s styles name tokens only`, () => {
      expect(literalsOf(contracts.get(path) ?? '')).toEqual([]);
    });

  it('finds a measure planted in a style', () => {
    const planted = (contracts.get('features/read.contract') ?? '').replace(
      'min-height = "size.target"',
      'min-height = 44',
    );
    expect(literalsOf(planted)).toEqual(['min-height=44']);
  });
});
