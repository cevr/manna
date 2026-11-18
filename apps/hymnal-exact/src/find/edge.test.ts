/* oxlint-disable effect/noNullish, effect/noTernary -- a reader of the drums panel's rows in features/find.contract, under Bun. */

/**
 * The drums panel draws the current app's edge (src/player/DialPanel.tsx:
 * a line of `line.panel` in `edge`, round at half a stop and its padding)
 * on every host alike, as the current app draws it on iOS and the web: no
 * row of `FindDrumsPanel` branches on a host fact. The reader is tried
 * against planted panels first, so a reader that reads nothing cannot pass.
 */

import { describe, expect, test } from 'bun:test';

import { appFile } from '../look/design.testing.ts';

/** The rows of `component name` in `text`, up to the next top-level line. */
const component = (text: string, name: string): string => {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line === `component ${name}`);
  if (start < 0) return '';
  const end = lines.findIndex((line, at) => at > start && /^\S/u.test(line));
  return lines.slice(start, end < 0 ? undefined : end).join('\n');
};

/** The edge the node with `testId` draws: its border's width, style, colour and radius, as written. */
const edgeOf = (block: string, testId: string) => {
  const lines = block.split('\n');
  const at = lines.findIndex((line) => line.includes(`testId="${testId}"`));
  if (at < 0) return new Map<string, string>();
  const indent = (line: string) => line.length - line.trimStart().length;
  const node = lines.slice(0, at + 1).findLastIndex((line) => /^\s+column\b/u.test(line));
  const rows = [lines[node] ?? ''];
  for (const line of lines.slice(node + 1)) {
    if (indent(line) <= indent(lines[node] ?? '') || !/^\s+[a-z-]+=/u.test(line)) break;
    rows.push(line);
  }
  const drawn = new Map<string, string>();
  for (const [, name = '', value = ''] of rows
    .join(' ')
    .matchAll(/(?:^|\s)([a-z-]+)=("[^"]*"|`[^`]*`|\((?:"[^"]*"|[^()"])*\)|\S+)/gu))
    if (name.startsWith('border') || name === 'box-shadow') drawn.set(name, value);
  return drawn;
};

const ONES = new Map([
  ['border-width', '"line.panel"'],
  ['border-style', '"solid"'],
  ['border-color', '"edge"'],
  ['border-radius', '`${findPanelPlaces.detent / 2 + findPanelPlaces.pad}px`'],
]);

const panel = (rows: string) =>
  [
    'component FindDrumsPanel',
    '  view',
    `    column background-color="panel" testId="drums-panel" ${rows}`,
    '      row',
  ].join('\n');

describe('the drums panel draws the current app’s edge on every host', () => {
  test('a planted panel with another edge, or one by host, is found', () => {
    const planted = [
      'border-width="line.panel" border-style="solid" border-color="line" border-radius=`${findPanelPlaces.detent / 2 + findPanelPlaces.pad}px`',
      'border-width=(findDrumsWeb ? "line.panel" : "none") border-style="solid" border-color="edge" border-radius=`${findPanelPlaces.detent / 2 + findPanelPlaces.pad}px`',
      'border-style="solid" border-color="edge"',
    ];
    for (const rows of planted) expect(edgeOf(panel(rows), 'drums-panel')).not.toEqual(ONES);
  });

  test('find.contract’s panel draws a `line.panel` line in `edge`, round as the current app’s', () => {
    const block = component(appFile('features/find.contract'), 'FindDrumsPanel');
    expect(edgeOf(block, 'drums-panel')).toEqual(ONES);
    expect(block).not.toContain('canSharePictures');
  });
});
