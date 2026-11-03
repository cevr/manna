import * as BunServices from '@effect/platform-bun/BunServices';
import { Glob } from 'bun';
import { Effect, FileSystem } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import { itemsOf, markdownBeats, parse, selects } from './items.ts';

/** `selector`'s items of `lines` as the file `file`: each item's first line, last line and text. */
const read = (
  selector: Parameters<typeof itemsOf>[0],
  file: string,
  lines: ReadonlyArray<string>,
) =>
  itemsOf(selector, parse(file, lines.join('\n'))).map((item) => [item.line, item.end, item.text]);

/** `selector`'s keys of `lines` as the file `file`. */
const keys = (
  selector: Parameters<typeof itemsOf>[0],
  file: string,
  lines: ReadonlyArray<string>,
) => itemsOf(selector, parse(file, lines.join('\n'))).map((item) => item.key);

describe('the judged keys', () => {
  it.effect(
    'fold what a formatter changes: an indent, a wrap, a space, a quote mark, a number spelt',
    () =>
      Effect.sync(() => {
        const kept = keys('functions', 'src/a.ts', [
          '/** Joins the two. */',
          'const join = (a: string, b: string) => {',
          '  return [a, b].join("-");',
          '};',
        ]);
        expect(
          keys('functions', 'src/a.ts', [
            '  /**',
            '   * Joins the two.',
            '   */',
            '  const join = ( a: string,',
            '      b: string ) => { return [ a,b ].join( "-" ); };',
          ]),
        ).toEqual(kept);
        expect(keys('functions', 'src/a.ts', ["const f = () => 'a b' + 0x10;"])).toEqual(
          keys('functions', 'src/a.ts', ['const f = () => "a b" + 16;']),
        );
        const doc = keys('comments', 'src/b.ts', ['/** One line,', ' * then another. */']);
        expect(doc).toEqual(['One line, then another.']);
        expect(
          keys('comments', 'src/b.ts', ['  /**', '   * One line, then', '   * another.', '   */']),
        ).toEqual(doc);
      }),
  );

  it.effect(
    "keep a literal's text as written: a string, a template's text, a pattern, JSX text",
    () =>
      Effect.sync(() => {
        const pairs: ReadonlyArray<readonly [string, string, string]> = [
          ['src/a.ts', 'const f = () => "a - b";', 'const f = () => "a-b";'],
          ['src/a.ts', "const f = () => 'a  b';", "const f = () => 'a b';"],
          [
            'src/a.ts',
            'const f = (x: string) => `${x} - b`;',
            'const f = (x: string) => `${x}-b`;',
          ],
          [
            'src/a.ts',
            'const f = (x: string) => /a \\d/.test(x);',
            'const f = (x: string) => /a\\d/.test(x);',
          ],
          ['src/a.tsx', 'const f = () => <p>a - b</p>;', 'const f = () => <p>a-b</p>;'],
          [
            'src/a.ts',
            'function f(a: number, b: number) { return a + ++b; }',
            'function f(a: number, b: number) { return a++ + b; }',
          ],
          [
            'src/a.ts',
            'function f(a: number) { return a; }',
            'function f(a: number) { return\na; }',
          ],
          ['src/a.ts', 'const f = () => String.raw`\\u0061`;', 'const f = () => String.raw`a`;'],
        ];
        for (const [file, one, other] of pairs)
          expect(keys('functions', file, [one])).not.toEqual(keys('functions', file, [other]));
        expect(keys('comments', 'src/b.ts', ['/** a - b */'])).not.toEqual(
          keys('comments', 'src/b.ts', ['/** a-b */']),
        );
      }),
  );
});

describe('the judged selectors', () => {
  it.effect('commentedCode takes a comment first on its line with the node under it, whole', () =>
    Effect.sync(() => {
      expect(
        read('commentedCode', 'src/a.ts', [
          '// The header, apart.',
          '',
          '/** Doubles `n`. */',
          'export const double = (n: number) =>',
          '  n * 2;',
          'const c = 1; // after code',
          '// The last line.',
        ]),
      ).toEqual([
        [
          3,
          5,
          'Comment:\nDoubles `n`.\n\nCode it sits on:\nexport const double = (n: number) =>\n  n * 2;',
        ],
      ]);
    }),
  );

  it.effect('testCases takes each case with a name and a function, with the imports', () =>
    Effect.sync(() => {
      const lines = [
        "import { expect, it } from 'effect-bun-test';",
        "import { double } from './double.ts';",
        "describe('double', () => {",
        "  it.effect('doubles', () => Effect.sync(() => expect(double(2)).toBe(4)));",
        '  it(name, () => {});',
        '});',
      ];
      expect(read('testCases', 'src/double.test.ts', lines)).toEqual([
        [
          4,
          4,
          `Imports:\n${lines[0]}\n${lines[1]}\n\nTest:\nit.effect('doubles', () => Effect.sync(() => expect(double(2)).toBe(4)))`,
        ],
      ]);
    }),
  );

  it.effect(
    'functions takes each named function with its comment, and those inside one too long',
    () =>
      Effect.sync(() => {
        const long = Array.from({ length: 120 }, (_, i) => `  const v${i} = ${i};`);
        expect(
          read('functions', 'src/f.ts', [
            '/** One. */',
            'export function one() {',
            '  const inner = () => 1;',
            '  return inner();',
            '}',
            "const two = Effect.fn('two')(function* () {});",
            'function long() {',
            '  const inside = () => 2;',
            ...long,
            '}',
          ]),
        ).toEqual([
          [
            2,
            5,
            '/** One. */\nexport function one() {\n  const inner = () => 1;\n  return inner();\n}',
          ],
          [6, 6, "const two = Effect.fn('two')(function* () {})"],
          [8, 8, '  const inside = () => 2'],
        ]);
      }),
  );

  it.effect("scriptBeats takes each beat's say and picture, a template's source whole", () =>
    Effect.sync(() => {
      expect(
        read('scriptBeats', 'apps/animations/src/films/f/script.ts', [
          'export const beats = [',
          "  { id: 'cold', say: 'In the beginning.', picture: `A page. ${CARDS}`, mark: 'x' },",
          '];',
        ]),
      ).toEqual([
        [2, 2, 'say: In the beginning.'],
        [2, 2, 'picture: A page. ${CARDS}'],
      ]);
    }),
  );

  it.effect('testCases takes a layered case and an each case by their root name', () =>
    Effect.sync(() => {
      const lines = [
        "import { it, test } from 'effect-bun-test';",
        "it.effect.layer(Live)('reads the layer', () => Effect.void);",
        "test.each([1, 2])('takes %d', (n) => expect(n).toBeGreaterThan(0));",
        "describe.each([1])('a group %d', () => {});",
      ];
      expect(read('testCases', 'src/a.test.ts', lines).map(([line]) => line)).toEqual([2, 3]);
    }),
  );

  it.effect("markdownBeats takes a beat's say and picture paragraphs, never its cite", () =>
    Effect.sync(() => {
      const items = markdownBeats(
        [
          '## Beat 1 · hook',
          '',
          '**say:** {a}A baby drinks milk. {/} {b}And nobody minds.',
          '**cite:** Hebrews 5:12; E. G. White, Education, 13',
          '**picture:** STORY: a courtyard,',
          'lanterns strung.',
          '',
          '**Say:** Second.',
        ].join('\n'),
      );
      expect(items.map((item) => [item.line, item.end, item.text])).toEqual([
        [3, 3, 'say: {a}A baby drinks milk. {/} {b}And nobody minds.'],
        [5, 6, 'picture: STORY: a courtyard, lanterns strung.'],
        [8, 8, 'say: Second.'],
      ]);
    }),
  );

  it.effect("markdownBeats reads every series script's beats: none is a form it cannot read", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const series = new URL('../../../../apps/animations/series/', import.meta.url).pathname;
      const scripts = [...new Glob('*/scripts/*.md').scanSync({ cwd: series })];
      expect(scripts.length).toBeGreaterThan(0);
      const unread: Array<string> = [];
      for (const script of scripts) {
        const says = markdownBeats(yield* fs.readFileString(`${series}${script}`)).filter((item) =>
          item.text.startsWith('say: '),
        );
        if (says.length === 0) unread.push(script);
      }
      expect(unread).toEqual([]);
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect("markdownBeats takes each row's Say and Picture, by their headers", () =>
    Effect.sync(() => {
      const items = markdownBeats(
        [
          '# A talk',
          '| # | Spoken (owner, to lens) | On screen / B-roll | Source note |',
          '| - | - | - | - |',
          '| 1 · Hook | He said, "Rest." | A lakeshore | DA 360.2 |',
          '| 2 | A breath. |  | Mark 6 |',
        ].join('\n'),
      );
      expect(items.map((item) => [item.line, item.text])).toEqual([
        [4, 'say: He said, "Rest."'],
        [4, 'picture: A lakeshore'],
        [5, 'say: A breath.'],
      ]);
    }),
  );

  it.effect('each reads only the files it is for', () =>
    Effect.sync(() => {
      expect(selects('testCases', 'src/a.test.ts')).toBe(true);
      expect(selects('testCases', 'src/a.ts')).toBe(false);
      expect(selects('functions', 'src/a.test.ts')).toBe(false);
      expect(selects('functions', 'src/fixtures/a.ts')).toBe(false);
      expect(selects('functions', 'src/a.ts')).toBe(true);
      expect(selects('scriptBeats', 'apps/animations/src/films/f/v2/script.ts')).toBe(true);
      expect(selects('scriptBeats', 'apps/animations/series/health/scripts/01-a.md')).toBe(true);
      expect(selects('scriptBeats', 'apps/animations/series/health/README.md')).toBe(false);
      expect(selects('comments', 'apps/animations/series/health/scripts/01-a.md')).toBe(false);
    }),
  );
});
