import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import { reviewFileUrl } from '../core/api.ts';
import { Selection, citeOf, selectionText, wordsIn } from './selection.ts';

const { Words, Version, Beat, File, Mark } = Selection.cases;

describe('a selection', () => {
  test("reads a talk's words (`<a>-<b>`), first to last; anything else selects nothing", () => {
    expect(wordsIn('law', '3-4')).toEqual(
      Option.some(Words.make({ scene: 'law', from: 3, to: 4 })),
    );
    for (const bad of ['4-3', '3', 'a-b', '-1-2', ''])
      expect(wordsIn('law', bad)).toEqual(Option.none());
    expect(selectionText(Words.make({ scene: 'law', from: 3, to: 4 }))).toBe('words 3–4 of law');
    expect(selectionText(Words.make({ scene: 'law', from: 2, to: 2 }))).toBe('word 2 of law');
  });

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
