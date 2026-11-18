/* oxlint-disable effect/noNullish -- a Bun test in an Exact app's folder imports no effect (docs/exact.md), so a header with no line above it is plain `undefined`. */

/**
 * A list's section header is drawn in the muted role on every host, as
 * iOS draws a plain list's headers and the current app draws its topics:
 * each `text` under a `section`'s `header` in the list's Contract files
 * names `-exact-secondary-label` (the brand's `muted`), with no host
 * condition, so the web draws it so too. The home list heads its groups
 * with a row of its own (`ListHeader`, the current app's topic row, which
 * UIKit's one-text header cannot draw), its name in `muted`. The reader is tried against a
 * planted header first, so one that finds no header cannot pass; that no
 * file writes a colour literal is `look/literal.test.ts`.
 */

import { describe, expect, it } from 'bun:test';

import { appFile } from '../look/design.testing.ts';

const FILES = [
  'features/list.contract',
  'features/recent.contract',
  'features/favourites.contract',
  'features/find.contract',
];

const MUTED = 'color="-exact-secondary-label"';

const indent = (line: string) => line.length - line.trimStart().length;

/** Each `text` line under a section's `header`, with its number. */
const headerTexts = (text: string): Array<string> => {
  const lines = text.split('\n');
  const found: Array<string> = [];
  lines.forEach((line, at) => {
    if (line.trim() !== 'header') return;
    const depth = indent(line);
    const above = lines
      .slice(0, at)
      .toReversed()
      .find((each) => each.trim() !== '' && indent(each) < depth);
    if (above === undefined || !/^\s*section\b/u.test(above)) return;
    for (const below of lines.slice(at + 1)) {
      if (below.trim() === '') continue;
      if (indent(below) <= depth) break;
      if (/^\s*text\b/u.test(below)) found.push(`${at + 1}: ${below.trim()}`);
    }
  });
  return found;
};

describe('section headers are drawn in the muted role', () => {
  it('finds a planted header, muted or not', () => {
    const planted = [
      'list id="l"',
      '  section',
      '    header',
      '      text s.name testId="x"',
      '    text "row"',
    ].join('\n');
    expect(headerTexts(planted)).toEqual(['3: text s.name testId="x"']);
    expect(headerTexts(planted.replace('text s.name', `text s.name ${MUTED}`))).toHaveLength(1);
    expect(headerTexts('header\n  text "Hymns" role="heading"')).toEqual([]);
  });

  it('the home list heads each group with its own header row, its name muted', () => {
    const list = appFile('features/list.contract');
    const headed = list.match(/^\s*ListHeader\(.*\n\s*for (?:r in s\.rows|n in g\.numbers)\b/gmu);
    expect(headed?.map((line) => line.trim().split('(')[0])).toEqual(['ListHeader', 'ListHeader']);
    const row = list.slice(list.indexOf('component ListHeader'));
    const name = /^\s*text name .*$/mu.exec(row)?.[0] ?? '';
    expect(name).toContain('color="muted"');
  });

  for (const file of FILES)
    it(`${file}: every section header names the muted role`, () => {
      expect(headerTexts(appFile(file)).filter((line) => !line.includes(MUTED))).toEqual([]);
    });
});
