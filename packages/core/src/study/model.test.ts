/** The one Strong's decoder (should-fix 5).
 *
 *  `StrongsNumber` is the whole argument of `manna study strongs`.
 *
 *  The assertions below are the contract itself rather than a sample of it, and
 *  `packages/cli/test/commands/study.test.ts` runs the real command against the
 *  same inputs.
 */

import { describe, expect, test } from 'bun:test';
import { Schema } from 'effect';

import { StrongsNumber } from './model.js';

const decode = Schema.decodeUnknownExit(StrongsNumber);

const accepts = (input: string): string => {
  const outcome = decode(input);
  expect(outcome._tag).toBe('Success');
  if (outcome._tag !== 'Success') return '';
  return outcome.value;
};

const rejects = (input: string): void => {
  expect(decode(input)._tag).toBe('Failure');
};

describe('StrongsNumber', () => {
  test('accepts the corpus spelling unchanged', () => {
    expect(accepts('H8548')).toBe('H8548');
    expect(accepts('G1')).toBe('G1');
  });

  test('normalizes case rather than rejecting it', () => {
    expect(accepts('h8548')).toBe('H8548');
    expect(accepts('g1')).toBe('G1');
  });

  test('rejects a leading zero, which the corpus never stores', () => {
    rejects('H0001');
    rejects('h0001');
    rejects('G0001');
    rejects('H0');
  });

  test('rejects everything that is not a Strong’s number', () => {
    rejects('8548');
    rejects('X8548');
    rejects('H');
    rejects('H8548a');
    rejects(' H8548');
    rejects('H8548 ');
    rejects('');
  });

  test('encodes back to the stored spelling', () => {
    const encode = Schema.encodeUnknownExit(StrongsNumber);
    const outcome = encode('H8548');
    expect(outcome._tag).toBe('Success');
    if (outcome._tag !== 'Success') return;
    expect(outcome.value).toBe('H8548');
  });
});
