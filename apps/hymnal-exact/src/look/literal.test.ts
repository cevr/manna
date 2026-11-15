/**
 * No Contract file writes a colour (A4): a colour is a brand role or a
 * platform role the brand sets, by name, so the brand alone says each
 * shade. The finder is tried against a planted literal of each kind first,
 * so a finder that finds nothing cannot pass.
 */

import { describe, expect, it } from 'bun:test';

import { appFile, contractFiles } from './design.testing.ts';

const COLOURS = [
  'aliceblue|antiquewhite|aqua|beige|black|blue|brown|crimson|cyan|fuchsia|gold|gray|grey|green',
  'indigo|ivory|lavender|lime|magenta|maroon|navy|olive|orange|pink|plum|purple|red|salmon',
  'silver|tan|teal|tomato|turquoise|violet|wheat|white|yellow|transparent',
].join('|');

const LITERAL = new RegExp(
  [
    '#[0-9a-f]{3,8}\\b',
    '\\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|light-dark|color-mix)\\(',
    `(?:color|background-color|border-color|accent-color|fill|stroke)="(?:${COLOURS})"`,
  ].join('|'),
  'iu',
);

/** Each line of `text` that writes a colour, with its number. */
const literals = (text: string) =>
  text
    .split('\n')
    .map((line, index) => `${index + 1}: ${line.trim()}`)
    .filter((line) => !/^\d+: \/\//u.test(line) && LITERAL.test(line));

describe('no Contract file writes a colour', () => {
  it('finds a planted one of each kind', () => {
    for (const planted of [
      '      text "x" color="#c8102e"',
      '      column background-color="rgb(0 0 0 / 0.5)"',
      '      text "x" color="light-dark(#fff, #000)"',
      '      row background-color="white"',
      '      text "x" color=(on ? "#abc" : "ink")',
    ])
      expect(literals(planted)).toHaveLength(1);
    expect(literals('      text "x" color="ink" background-color="-exact-background"')).toEqual([]);
  });

  for (const file of contractFiles())
    it(`${file} names its colours`, () => {
      expect(literals(appFile(file))).toEqual([]);
    });
});
