import { describe, expect, test } from 'bun:test';
import { reviewFileUrl } from '../core/api.ts';
import { Selection, citeOf, selectionText } from './selection.ts';

const { Words, Version, Beat, File, Mark } = Selection.cases;

describe('a selection', () => {
  test('cites a file as itself, and anything else as the page it is on', () => {
    const here = '/asks/a1?still=board-open.breath';
    expect(citeOf(File.make({ ref: 'out/f/a b.mp4' }), here)).toBe(reviewFileUrl('out/f/a b.mp4'));
    for (const s of [
      Words.make({ scene: 'law', from: 0, to: 1 }),
      Mark.make({ scene: 'law', name: 'x' }),
    ])
      expect(citeOf(s, here)).toBe(here);
  });

  test('reads as a person names it', () => {
    expect(selectionText(Beat.make({ beat: 'cold' }))).toBe('beat cold');
    expect(selectionText(Version.make({ folder: 'r', point: 'cold', version: 'b' }))).toBe(
      'option b of cold',
    );
  });
});
