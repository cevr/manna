import { describe, expect, it } from 'bun:test';
import { Result } from 'effect';
import { parse } from '../../core/narration.ts';
import { lineRows } from './line.ts';

/** `say` as `parse` reads it for beat `one`. */
const parsed = (say: string) => Result.getOrThrow(parse('one', say));

/** `say` read and laid out as beat `one` from offset `at`. */
const laid = (say: string, at = 0) => lineRows('one', parsed(say), at);

describe('a line laid out', () => {
  it('keeps each mark by the word it stands before, and each word at its offset', () => {
    const line = laid('The ball {rise}rises, then it {fall}falls.', 10);
    expect(line.marks).toEqual({ rise: 2, fall: 5 });
    expect(line.rows.map((r) => [r.text, r.from])).toEqual([
      ['The', 10],
      ['ball', 14],
      ['rises,', 19],
      ['then', 26],
      ['it', 31],
      ['falls.', 34],
    ]);
  });
});
