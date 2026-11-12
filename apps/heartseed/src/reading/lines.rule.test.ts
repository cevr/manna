/* oxlint-disable effect/noGlobals -- a frame-rule table: it builds happy-dom nodes by hand in the document the rule reads. */

/**
 * The lines' clause of the root's frame rule (`src/test/root-rule.ts`,
 * hspiece L3), one offending frame per clause: a break outside a verse
 * view, a break holding text, a break with a role, a break in a verse of 20
 * words or fewer (plain, read aloud and under a cue), and a line text
 * outside `passage`; and no fault for a lined verse in each drawing. Frames
 * hold made-up words alone.
 */

import { describe, expect, it } from 'bun:test';

import { rootFaults } from '../test/root-rule';

const tagged = (id: string, words = '') => {
  const node = document.createElement('div');
  node.setAttribute('data-testid', id);
  node.textContent = words;
  return node;
};

/** `count` made-up words from `from`, one space apart. */
const madeUp = (count: number, from = 0) =>
  Array.from({ length: count }, (_, index) => `w${from + index}`).join(' ');

/** A view tagged `id` (none when empty) holding `nodes`. */
const viewOf = (id: string, nodes: readonly Element[]) => {
  const node = document.createElement('div');
  if (id !== '') node.setAttribute('data-testid', id);
  node.append(...nodes);
  return node;
};

/** A word view of `count` words with a break before word `at`. */
const wordsWithBreak = (id: string, count: number, at: number) => {
  const words = Array.from({ length: count }, (_, index) => tagged(`word-${index}`, `w${index}`));
  const view = viewOf(id, words);
  words[at]?.before(tagged(`break-${at}`));
  return view;
};

/** A plain verse of two lines, `first` and `rest` words, with the break between. */
const plainLines = (first: number, rest: number) =>
  viewOf('passage', [
    tagged('line-0', madeUp(first)),
    tagged(`break-${first}`),
    tagged('line-1', madeUp(rest, first)),
  ]);

/** The rule's faults on a frame of Today holding `nodes`. */
const today = (nodes: readonly Element[]) => {
  const host = document.createElement('div');
  const heading = document.createElement('div');
  heading.setAttribute('role', 'heading');
  heading.setAttribute('aria-label', 'Today');
  heading.textContent = 'Today';
  host.append(heading, ...nodes);
  document.body.append(host);
  const faults = rootFaults(host, 'read').toSorted();
  host.remove();
  return faults;
};

describe('the lines’ clause (hspiece)', () => {
  it('names each break and line out of its place, and nothing for a lined verse in each of its drawings', () => {
    const bare = today([]);
    const lines = (nodes: readonly Element[]) =>
      today(nodes).filter((fault) => !bare.includes(fault));
    expect(lines([plainLines(10, 15)])).toEqual([]);
    expect(lines([wordsWithBreak('reading', 25, 10)])).toEqual([]);
    expect(lines([wordsWithBreak('', 25, 10)])).toEqual([]);
    expect(lines([plainLines(8, 12)])).toEqual(['break-8 in a verse of 20 words']);
    expect(lines([wordsWithBreak('reading', 20, 10)])).toEqual(['break-10 in a verse of 20 words']);
    expect(lines([wordsWithBreak('', 12, 6)])).toEqual(['break-6 in a verse of 12 words']);
    expect(lines([viewOf('', [tagged('break-3')])])).toEqual(['break-3 outside a verse']);
    const worded = wordsWithBreak('reading', 25, 10);
    worded.querySelector('[data-testid="break-10"]')?.append('w');
    expect(lines([worded])).toEqual(['break-10 holds text']);
    const roled = wordsWithBreak('reading', 25, 10);
    roled.querySelector('[data-testid="break-10"]')?.setAttribute('role', 'separator');
    expect(lines([roled])).toEqual(['break-10 has a role']);
    expect(lines([viewOf('reading', [tagged('line-0', madeUp(3))])])).toEqual([
      'line-0 outside passage',
    ]);
  });
});
