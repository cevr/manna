/* oxlint-disable effect/noNullish -- a reader of the find box's rows in features/find.contract, under Bun. */

/**
 * The find box draws as One's `TextInput` (src/home/FindBar.tsx): its caret
 * in the blue UIKit draws it in (One leaves the tint the system's), and UIKit's
 * clear button (`clearButtonMode="while-editing"`) only while the box holds
 * the focus and has words, a press there keeping the focus, in UIKit's
 * colour and at its measured size (find.none's reference: a 17 pt disk
 * 6 pt before the `#`). The reader is tried on planted rows first, so a
 * reader that reads nothing cannot pass.
 */

import { describe, expect, test } from 'bun:test';

import { appFile } from '../look/design.testing.ts';

/** The rows of the node whose rows hold `testId="id"`: its first line and each continuation, with its children. */
const nodeOf = (text: string, id: string): string => {
  const lines = text.split('\n');
  const at = lines.findIndex((line) => line.includes(`testId="${id}"`));
  if (at < 0) return '';
  const indent = (line: string) => line.length - line.trimStart().length;
  const head = lines
    .slice(0, at + 1)
    .findLastIndex((line) => /^\s+(input|button|row|column)\b/u.test(line));
  const rows = [lines[head] ?? ''];
  for (const line of lines.slice(head + 1)) {
    if (line.trim() !== '' && indent(line) <= indent(lines[head] ?? '')) break;
    rows.push(line);
  }
  return rows.join('\n');
};

/** The line just over the node of `id`: the condition it is drawn under. */
const guardOf = (text: string, id: string): string => {
  const lines = text.split('\n');
  const head = nodeOf(text, id).split('\n')[0] ?? '';
  return (lines[lines.indexOf(head) - 1] ?? '').trim();
};

const contract = appFile('features/find.contract');
const forma = appFile('app.forma');

describe('the reader', () => {
  const planted = [
    '      if on and words != ""',
    '        button press=clear',
    '          color="x" testId="c"',
    '          image "symbol:y"',
    '      input caret-color="ink"',
    '        testId="s"',
  ].join('\n');

  test('reads a planted node, its children and its guard, and nothing for a missing id', () => {
    expect(nodeOf(planted, 'c')).toContain('image "symbol:y"');
    expect(nodeOf(planted, 'c')).not.toContain('caret-color');
    expect(nodeOf(planted, 's')).toContain('caret-color="ink"');
    expect(guardOf(planted, 'c')).toBe('if on and words != ""');
    expect(nodeOf(planted, 'none')).toBe('');
  });
});

describe('the find box', () => {
  test('its caret is the blue UIKit draws One’s in', () => {
    expect(nodeOf(contract, 'search')).toContain('caret-color="fieldCaret"');
    expect(forma).toMatch(/^ {2}fieldCaret = light-dark\(#426bf2, #426bf2\)$/mu);
  });

  test('the clear button stands only while the box has the focus and words, and keeps the focus', () => {
    const clear = nodeOf(contract, 'find-clear');
    expect(guardOf(contract, 'find-clear')).toBe('if findBoxFocused and findText != ""');
    expect(nodeOf(contract, 'search')).toContain('focus=findBoxIn blur=findBoxOut');
    expect(clear).toContain('press=findTyped("")');
    expect(clear).toContain('pointerdown=findClearKeep');
    expect(clear).not.toContain('tabindex');
    expect(contract).toMatch(/action findClearKeep\(e: PointerEvent\)\n\s+preventDefault\(\)/u);
  });

  test('the clear button is UIKit’s: its glyph, colour, size and place, in a 44-point target', () => {
    const clear = nodeOf(contract, 'find-clear');
    expect(clear).toContain('width="size.target" height="size.target"');
    expect(clear).toContain('padding-right="space.s6"');
    expect(clear).toContain('justify-content="flex-end"');
    expect(clear).toContain('color="fieldClear"');
    expect(clear).toContain(
      'image "symbol:icon.find-clear" width="size.clear" height="size.clear"',
    );
    expect(forma).toMatch(/^ {2}size\.clear: length = 17px$/mu);
    expect(forma).toMatch(/^ {2}space\.s6: length = 6px$/mu);
    expect(forma).toMatch(/^ {2}icon\.find-clear = icon\(svg "icons\/find-clear\.svg"\)$/mu);
    expect(appFile('assets/icons/find-clear.svg')).toContain('viewBox="0 0 17 17"');
  });
});
