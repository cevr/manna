/* oxlint-disable effect/noGlobals, effect/noNodeBuiltinImport -- the test reads the app's own source files from disk, synchronously, outside any Effect. */

/**
 * No JSX element in the app carries type arguments (`<List<Hymn> …>`). One's
 * dev server runs a source inspector over every `.tsx` it serves on the web,
 * and it writes its `data-one-source` attribute right after the element's
 * name, so an element with type arguments no longer parses: the dev server
 * renders no route, `/` included, though the iOS bundle and the web build
 * never run the inspector. A generic component's type comes from its props.
 *
 * The scan reads each `.tsx` under `src` and `app` as oxfmt writes it: type
 * arguments follow their name with no space, so a `<` opens an element when
 * the character before it is not a name's, a closing bracket or a dot.
 */

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

/** A JSX element opened with type arguments: `<Name<`, where the first `<` follows no name, bracket or dot. */
const TYPED_ELEMENT = /(?:^|[^\w$.)\]])<([A-Za-z_$][\w$.]*)</gm;

/** Each element with type arguments in `source`, by its line and its opening text. */
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
