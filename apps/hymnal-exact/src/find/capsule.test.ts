/**
 * All at once, the port's own control (owner q148 and q164: "Inside the
 * search capsule, port only"), is a third control in the folded find
 * capsule, before Search and the `#`: a 44-point target as One's capsule
 * sizes its two (`HASH`, src/player/bar.ts; `styles.button`,
 * src/home/FindBar.tsx), with no disk of its own, named for VoiceOver as
 * One names its way to the tiles (`ALL_AT_ONCE`, src/home/Home.native.tsx).
 * The reader is tried on planted rows first, so a reader that reads nothing
 * cannot pass.
 */

import { describe, expect, test } from 'bun:test';

import { appFile, oneFile } from '../look/design.testing.ts';

const indentOf = (line: string) => line.length - line.trimStart().length;

/** The rows of the node whose rows hold `testId="id"`, from its head line through its children. */
const nodeOf = (text: string, id: string): ReadonlyArray<string> => {
  const lines = text.split('\n');
  const at = lines.findIndex((line) => line.includes(`testId="${id}"`));
  if (at < 0) return [];
  const head = lines
    .slice(0, at + 1)
    .findLastIndex((line) => /^\s+(input|button|row|column)\b/u.test(line));
  const rows = [lines[head] ?? ''];
  for (const line of lines.slice(head + 1)) {
    if (line.trim() !== '' && indentOf(line) <= indentOf(lines[head] ?? '')) break;
    rows.push(line);
  }
  return rows;
};

/** The head lines of the controls drawn directly in a node, in order, each with the `if` it stands under. */
const childControls = (rows: ReadonlyArray<string>): ReadonlyArray<string> =>
  rows
    .filter((line) => /^\s+(button|input|column|row|FindHash)\b/u.test(line))
    .filter((line) => indentOf(line) <= indentOf(rows[0] ?? '') + 4)
    .slice(1);

const contract = appFile('features/find.contract');

describe('the reader', () => {
  const planted = [
    '    row testId="cap"',
    '      if on',
    '        button press=a aria-label="A"',
    '          testId="a"',
    '          image "symbol:x"',
    '      button press=b testId="b"',
    '    button testId="out"',
  ].join('\n');

  test('reads a planted node with its children, and the controls drawn in it', () => {
    expect(nodeOf(planted, 'cap')).toHaveLength(6);
    expect(nodeOf(planted, 'a').join('\n')).toContain('image "symbol:x"');
    expect(childControls(nodeOf(planted, 'cap'))).toEqual([
      '        button press=a aria-label="A"',
      '      button press=b testId="b"',
    ]);
    expect(nodeOf(planted, 'none')).toEqual([]);
  });
});

describe('All at once in the capsule', () => {
  const capsule = nodeOf(contract, 'find-capsule');
  const tiles = nodeOf(contract, 'tiles-show').join('\n');

  test('it is the capsule’s first control, before Search and the `#`', () => {
    const controls = childControls(capsule);
    expect(controls[0]).toContain('press=findPress("tilesShow", 0)');
    expect(controls[1]).toContain('press=findSearchOn');
    expect(controls.at(-1)).toContain('FindHash(');
    expect(contract.split('testId="tiles-show"')).toHaveLength(2);
  });

  test('it stands only while the step offers it', () => {
    const at = capsule.findIndex((line) => line.includes('press=findPress("tilesShow", 0)'));
    expect(capsule[at - 1]?.trim()).toBe('if findShown.tilesControl');
  });

  test('it is a 44-point target as Search is, on the capsule’s glass with no disk of its own', () => {
    expect(appFile('app.forma')).toMatch(/^ {2}size\.target: length = 44px$/mu);
    expect(oneFile('src/player/bar.ts')).toMatch(/^export const HASH = 44;$/mu);
    expect(tiles).toContain('width="size.target" height="size.target" flex-shrink=0');
    expect(nodeOf(contract, 'find-search').join('\n')).toContain(
      'width="size.target" height="size.target" flex-shrink=0',
    );
    expect(tiles).not.toContain('background-color');
    expect(tiles).not.toContain('border-radius');
    expect(tiles).toContain('color="onGlass"');
    expect(tiles).toMatch(/:active\n\s+opacity = "opacity\.pressed"/u);
  });

  test('VoiceOver names it as One names its way to the tiles', () => {
    const one = /const ALL_AT_ONCE = \{ name: 'allAtOnce', label: '([^']+)' \}/u.exec(
      oneFile('src/home/Home.native.tsx'),
    );
    expect(one?.[1]).toBe('All at once');
    expect(tiles).toContain(`aria-label="${one?.[1]}"`);
  });
});
