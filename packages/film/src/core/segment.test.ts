import { describe, expect, test } from 'bun:test';
import { Option, Schema } from 'effect';
import { ActName } from './address-schema.ts';
import { boardNamed } from './board.ts';
import { RenderVariantName } from './catalogue.ts';
import { FootageName } from './footage.ts';
import { Segment, isSegment } from './segment.ts';
import { soundEntry } from './sfx.ts';

const NOT_SEGMENTS = ['', '.', '..', '__proto__', 'constructor', 'prototype', 'a/b', 'a\\b', '/'];

describe('Segment', () => {
  test.each(NOT_SEGMENTS)('%p is no segment', (name) => {
    expect(isSegment(name)).toBe(false);
    expect(Option.isNone(Schema.decodeOption(Segment)(name))).toBe(true);
  });

  test('a plain name is one', () => {
    expect(Schema.decodeOption(Segment)('cold open')).toEqual(
      Option.some(Segment.make('cold open')),
    );
  });

  test.each([
    ['a board name', (name: string) => boardNamed(name)],
    ['an act', (name: string) => Schema.decodeOption(ActName)(name)],
    ['a footage name', Schema.decodeOption(FootageName)],
    ['a render variant', Schema.decodeOption(RenderVariantName)],
  ] as const)('%s is never constructor, prototype or __proto__', (_, decode) => {
    for (const name of ['constructor', 'prototype', '__proto__'])
      expect(Option.isNone(decode(name))).toBe(true);
  });

  test("a sound named constructor reads no entry off the library's prototype", () => {
    expect(Option.isNone(soundEntry({}, 'constructor'))).toBe(true);
  });
});
