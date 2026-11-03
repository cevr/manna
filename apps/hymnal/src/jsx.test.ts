/* oxlint-disable effect/noGlobals, effect/noNodeBuiltinImport -- the test reads the app's own source files from disk, synchronously, outside any Effect. */

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

const TYPED_ELEMENT = /(?:^|[^\w$.)\]])<([A-Za-z_$][\w$.]*)</gm;

const typedElements = (source: string) =>
  [...source.matchAll(TYPED_ELEMENT)].map((match) => ({
    line: source.slice(0, match.index).split('\n').length,
    opens: `<${match[1]}<`,
  }));

const ROOT = `${import.meta.dir}/..`;

describe('the app’s JSX', () => {
  it('opens no element with type arguments, in src or app', () => {
    const files = ['src', 'app'].flatMap((folder) => [
      ...new Bun.Glob(`${folder}/**/*.tsx`).scanSync(ROOT),
    ]);
    expect(files.length).toBeGreaterThan(50);
    const found = files.flatMap((file) =>
      typedElements(readFileSync(`${ROOT}/${file}`, 'utf8')).map(
        (at) => `${file}:${at.line} ${at.opens}`,
      ),
    );
    expect(found).toEqual([]);
  });

  it('finds an element with type arguments, and passes nested type arguments', () => {
    const source = [
      'const rows: ReadonlyArray<Row<Hymn>> = [];',
      'const sum = words.reduce<Array<number>>((all, w) => all, []);',
      'type T = Readonly<Record<string, Array<number>>>;',
      'return (',
      '  <View>',
      '    <DialView<CapoStop>',
      '      key="capo"',
      '    />',
      '    {on && <List<Hymn> rows={rows} />}',
      '  </View>',
      ');',
    ].join('\n');
    expect(typedElements(source)).toEqual([
      { line: 6, opens: '<DialView<' },
      { line: 9, opens: '<List<' },
    ]);
  });
});
