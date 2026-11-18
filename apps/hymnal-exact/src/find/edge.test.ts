/* oxlint-disable effect/noTernary, effect/noNullish -- a reader of the drums panel's rows in features/find.contract, under Bun. */

/**
 * The drums panel's edge and lift are the web's alone (owner q134 asked
 * them back on the web; iOS drew the panel flat): `FindDrumsPanel`'s
 * `border*`, `box-shadow` and `outline` rows each draw only where its host
 * fact says web, the page that takes no picture into a share
 * (`exactPage().canSharePictures` false), and are `none` on iOS, where it
 * is true. The reader is tried against a planted panel of each wrong kind
 * first, so a reader that reads nothing cannot pass.
 */

import { describe, expect, test } from 'bun:test';

import { appFile } from '../look/design.testing.ts';

const EDGE = /^(?:border(?!.*radius)(?:-[a-z]+)*|box-shadow|outline)$/u;

/** The rows of `component name` in `text`, up to the next top-level line. */
const component = (text: string, name: string): string => {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line === `component ${name}`);
  if (start < 0) return '';
  const end = lines.findIndex((line, at) => at > start && /^\S/u.test(line));
  return lines.slice(start, end < 0 ? undefined : end).join('\n');
};

/** The name a `derive` gives to "no picture into a share" of a resource of `exactPage()`, or ''. */
const webFact = (block: string): string => {
  const page = /^\s+resource (\w+) = exactPage\(\)/mu.exec(block)?.[1];
  if (page === undefined) return '';
  return (
    new RegExp(`^\\s+derive (\\w+) = not ${page}\\.canSharePictures$`, 'mu').exec(block)?.[1] ?? ''
  );
};

/**
 * Each edge row of the node with `testId`, as the host draws it: on the web
 * (`web` true) or on iOS. A row conditional on the web fact takes its
 * branch; any other value is drawn on both hosts as written.
 */
const edgeOf = (block: string, testId: string, web: boolean) => {
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
  const fact = webFact(block);
  const drawn = new Map<string, string>();
  for (const [, name = '', value = ''] of rows
    .join(' ')
    .matchAll(/(?:^|\s)([a-z-]+)=("[^"]*"|\((?:"[^"]*"|[^()"])*\)|\S+)/gu)) {
    if (!EDGE.test(name)) continue;
    const branch = /^\((\w+) \? ("[^"]*") : ("[^"]*")\)$/u.exec(value);
    drawn.set(
      name,
      branch && branch[1] === fact && fact !== '' ? ((web ? branch[2] : branch[3]) ?? '') : value,
    );
  }
  return drawn;
};

const panel = (rows: string) =>
  [
    'component FindDrumsPanel',
    '  resource findDrumsPage = exactPage() as shape FindPage',
    '  derive findDrumsWeb = not findDrumsPage.canSharePictures',
    '  view',
    '    column max-width="100%"',
    `      background-color="panel" testId="drums-panel" ${rows}`,
    '      column gap=12',
  ].join('\n');

const flat = (drawn: ReadonlyMap<string, string>) =>
  [...drawn.values()].every((value) => value === '"none"');

describe('the drums panel’s edge and lift are the web’s alone', () => {
  test('a planted panel that draws either on iOS is found', () => {
    for (const rows of [
      'border="1px solid line"',
      'box-shadow="0 16px 48px shadow"',
      'border=(findDrumsWeb ? "1px solid line" : "1px solid edge")',
      'box-shadow=(findDrumsOther ? "0 16px 48px shadow" : "none")',
      'outline="1px solid line"',
    ])
      expect(flat(edgeOf(panel(rows), 'drums-panel', false))).toBe(false);
    expect(
      edgeOf(
        panel('border=(findDrumsWeb ? "1px solid line" : "none") box-shadow="none"'),
        'drums-panel',
        false,
      ),
    ).toEqual(
      new Map([
        ['border', '"none"'],
        ['box-shadow', '"none"'],
      ]),
    );
  });

  test('find.contract’s panel draws a `line` edge and a `shadow` lift on the web, neither on iOS', () => {
    const block = component(appFile('features/find.contract'), 'FindDrumsPanel');
    expect(webFact(block)).not.toBe('');
    const web = edgeOf(block, 'drums-panel', true);
    expect(web.get('border')).toBe('"1px solid line"');
    expect(web.get('box-shadow')).toContain('shadow 24%');
    const ios = edgeOf(block, 'drums-panel', false);
    expect([...ios.keys()].toSorted()).toEqual(['border', 'box-shadow']);
    expect(flat(ios)).toBe(true);
  });
});
