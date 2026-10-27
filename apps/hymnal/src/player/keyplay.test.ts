import { expect, it } from 'bun:test';
import { Option } from 'effect';

import * as Proof from './proof';

it('keeps the proved place when a replaced session reports failure or a loading zero', () => {
  const proof = { ...Proof.none, place: Option.some(20_250) };
  expect(Proof.replacementAt(proof, Option.some({ state: 'failed', positionMs: 0 }))).toBe(20_250);
  expect(Proof.replacementAt(proof, Option.some({ state: 'idle', positionMs: 0 }))).toBe(20_250);
  expect(Proof.replacementAt(proof, Option.some({ state: 'loading', positionMs: 0 }))).toBe(20_250);
  expect(Proof.replacementAt(proof, Option.none())).toBe(20_250);
});

it('keeps a pending backward seek and takes current forward motion for replacement', () => {
  const proof = { ...Proof.none, place: Option.some(20_250) };
  const sought = Proof.acted(proof, 1000, Option.some(5000));
  expect(Proof.replacementAt(sought, Option.some({ state: 'playing', positionMs: 21_000 }))).toBe(
    5000,
  );
  expect(Proof.replacementAt(proof, Option.some({ state: 'playing', positionMs: 21_000 }))).toBe(
    21_000,
  );
});
