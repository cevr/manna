/* oxlint-disable effect/noTernary, effect/noNullish -- the generator and the oracle write the language's escape rules out as plain branches, apart from the reader's Option code, so the two cannot share a mistake. */

/**
 * The core-import guard judges each module specifier by its decoded value,
 * the name the bundler resolves, never by how the source spells it.
 *
 * The domain, walked whole for the plain spellings and drawn with a fixed
 * seed for the escaped ones: each module name (the allowed
 * `@manna/core/bible`; the banned `@manna/core`, `@manna/core/hymnal`,
 * `@manna/core/bible/service` and `@manna/core/assets/*`; and names outside
 * core) in each statement that names a module (`import … from`, `export …
 * from`, `import()`, `require()` and TypeScript's `import … = require()`),
 * between each delimiter the statement allows, with whitespace or a comment
 * around it, and spelled with escapes at any position: `\uXXXX`, `\u{…}`,
 * `\xXX`, an identity escape and a line continuation. A template is a
 * syntax error in a static `import … from`, so templates are drawn for the
 * calls only.
 *
 * The oracle decodes each spelling by the language's escape rules, written
 * out here apart from the parser the guard reads with, and the guard must
 * name exactly the banned decoded names.
 */

import { describe, expect, it } from 'bun:test';

import { coreReads } from './test/core-reads';

/** A seeded generator of numbers in [0, 1) (mulberry32). */
const seeded = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// oxlint-disable-next-line effect/noGlobals -- the run's seed comes from its shell, outside any Effect.
const SEED = Number(process.env['CORE_IMPORT_SEED'] ?? 20261103);
const DRAWN = 3000;

type Some<A> = readonly [A, ...ReadonlyArray<A>];

const pick = <A>(items: Some<A>, random: () => number): A =>
  items[Math.floor(random() * items.length)] ?? items[0];

/** The one core module the app may name. */
const ALLOWED = '@manna/core/bible';

/** The oracle's rule: `@manna/core` and every module below it, but `@manna/core/bible`. */
const banned = (name: string) =>
  (name === '@manna/core' || name.startsWith('@manna/core/')) && name !== ALLOWED;

/** The fixed module names: the allowed one, the banned ones, and names outside core. */
const MODULES: Some<string> = [
  ALLOWED,
  '@manna/core',
  '@manna/core/hymnal',
  '@manna/core/bible/service',
  '@manna/core/assets/kjv.json',
  'effect',
  '@manna/corelike',
  '@manna/hymnal/hymn',
];

/** A statement naming a module, around its literal; `templates` when a template literal may stand there. */
interface Form {
  readonly write: (literal: string) => string;
  readonly templates: boolean;
}

const FORMS: Some<Form> = [
  { write: (literal) => `import { a } from ${literal};`, templates: false },
  { write: (literal) => `import a from ${literal};`, templates: false },
  { write: (literal) => `import * as a from ${literal};`, templates: false },
  { write: (literal) => `import ${literal};`, templates: false },
  { write: (literal) => `import type { A } from ${literal};`, templates: false },
  { write: (literal) => `import a from ${literal} with { type: 'json' };`, templates: false },
  { write: (literal) => `export * from ${literal};`, templates: false },
  { write: (literal) => `export * as a from ${literal};`, templates: false },
  { write: (literal) => `export { a } from ${literal};`, templates: false },
  { write: (literal) => `export type { A } from ${literal};`, templates: false },
  { write: (literal) => `import a = require(${literal});`, templates: false },
  { write: (literal) => `const a = await import(${literal});`, templates: true },
  {
    write: (literal) => `const a = import(${literal}, { with: { type: 'json' } });`,
    templates: true,
  },
  { write: (literal) => `const a = require(${literal});`, templates: true },
];

const QUOTES: Some<string> = ["'", '"'];
const ANY_DELIMITER: Some<string> = ["'", '"', '`'];
const delimitersOf = (form: Form) => (form.templates ? ANY_DELIMITER : QUOTES);

/** What may stand around a literal: nothing, whitespace, or a comment that names a banned module. */
const GAPS: Some<string> = ['', ' ', '\n\t', "/* '@manna/core/hymnal' */ ", "// '@manna/core'\n"];

/** The characters an identity escape (`\m` for `m`) may not stand for: those whose escape means something else. */
const NOT_IDENTITY = new Set([...'bfnrtvxu0123456789']);

/** The line terminators a line continuation (a backslash before one) may end with. */
const LINE_ENDS: Some<string> = [
  '\n',
  '\r\n',
  '\r',
  String.fromCodePoint(0x2028),
  String.fromCodePoint(0x2029),
];

const hex = (code: number, width: number, upper: boolean) => {
  const digits = code.toString(16).padStart(width, '0');
  return upper ? digits.toUpperCase() : digits;
};

/** One character spelled by a drawn escape. */
const escaped = (char: string, random: () => number) => {
  const code = char.codePointAt(0) ?? 0;
  const upper = random() < 0.5;
  const ways: Some<() => string> = [
    () => `\\u${hex(code, 4, upper)}`,
    () => `\\u{${'0'.repeat(Math.floor(random() * 3))}${hex(code, 1, upper)}}`,
    () => `\\x${hex(code, 2, upper)}`,
    ...(NOT_IDENTITY.has(char) ? [] : [() => `\\${char}`]),
  ];
  return pick(ways, random)();
};

/** `name` spelled with escapes and line continuations at drawn positions, any of them, the first and the last too. */
const spell = (name: string, random: () => number) => {
  const rate = random();
  const continuation = () => (random() < rate / 3 ? `\\${pick(LINE_ENDS, random)}` : '');
  return [...name]
    .map((char) => `${continuation()}${random() < rate ? escaped(char, random) : char}`)
    .join('')
    .concat(continuation());
};

/**
 * The oracle's decoder: a string literal's or a template's body as the
 * language reads it, one escape at a time. A line continuation reads as
 * nothing, and an identity escape as its character.
 */
const decode = (body: string) =>
  body.replaceAll(
    /\\(?:u\{([0-9a-fA-F]+)\}|u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|(\r\n|[\n\r\p{Zl}\p{Zp}])|(.))/gsu,
    (_, braced?: string, four?: string, two?: string, line?: string, other?: string) =>
      [braced, four, two]
        .filter((digits) => digits !== undefined)
        .map((digits) => String.fromCodePoint(Number.parseInt(digits, 16)))
        .concat(line === undefined ? [] : [''], other === undefined ? [] : [other])
        .join(''),
  );

/** A generated source: one statement, the name it means, the body its literal spells, and the name the oracle decodes from that body. */
interface Case {
  readonly source: string;
  readonly name: string;
  readonly body: string;
  readonly decoded: string;
}

const caseOf = (form: Form, delimiter: string, name: string, body: string, gaps = ['', '']) => ({
  source: form.write(`${gaps[0]}${delimiter}${body}${delimiter}${gaps[1]}`),
  name,
  body,
  decoded: decode(body),
});

/** Each fixed name in each form, between each delimiter it allows, spelled plainly. */
const plain = MODULES.flatMap((name) =>
  FORMS.flatMap((form) =>
    delimitersOf(form).map((delimiter) => caseOf(form, delimiter, name, name)),
  ),
);

const ASSET_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789-_';

/** A core asset's name, drawn: `@manna/core/assets/` and a file name. */
const assetName = (random: () => number) => {
  const file = Array.from({ length: 1 + Math.floor(random() * 8) }, () =>
    ASSET_CHARS.charAt(Math.floor(random() * ASSET_CHARS.length)),
  ).join('');
  return `@manna/core/assets/${file}${pick(['.json', '.db', '', '/index.ts'], random)}`;
};

const draw = (random: () => number): Case => {
  const name = random() < 0.2 ? assetName(random) : pick(MODULES, random);
  const form = pick(FORMS, random);
  return caseOf(form, pick(delimitersOf(form), random), name, spell(name, random), [
    pick(GAPS, random),
    pick(GAPS, random),
  ]);
};

const drawn = Array.from(
  { length: DRAWN },
  (
    (random) => () =>
      draw(random)
  )(seeded(SEED)),
);

/** The cases whose found names differ from the banned decoded name, with what was found. */
const wrong = (cases: ReadonlyArray<Case>) =>
  cases.flatMap(({ source, decoded }) => {
    const expected = banned(decoded) ? [decoded] : [];
    const found = coreReads('case.ts', source).map((read) => read.name);
    return found.join('\n') === expected.join('\n') ? [] : [{ source, expected, found }];
  });

/** How many drawn bodies hold each kind of spelling, so a generator that stops reaching one is seen. */
const REACH: ReadonlyArray<readonly [string, RegExp]> = [
  ['\\uXXXX', /\\u[0-9a-fA-F]{4}/u],
  ['\\u{…}', /\\u\{/u],
  ['\\xXX', /\\x/u],
  ['identity escape', /\\[^ux\n\r\p{Zl}\p{Zp}]/u],
  ['line continuation', /\\[\n\r\p{Zl}\p{Zp}]/u],
  ['plain', /^[^\\]*$/u],
];

describe('the core-import guard, over spellings of module names', () => {
  it('draws every kind of spelling, and the oracle decodes each back to the name it spells', () => {
    const reach = REACH.map(([kind, pattern]) => ({
      kind,
      bodies: drawn.filter(({ body }) => pattern.test(body)).length,
    }));
    expect(reach.filter(({ bodies }) => bodies < DRAWN / 50)).toEqual([]);
    expect(drawn.filter(({ source }) => source.includes('`')).length).toBeGreaterThan(DRAWN / 50);
    expect(drawn.filter(({ name, decoded }) => name !== decoded)).toEqual([]);
  });

  it('names every banned module and passes the rest, in every form and delimiter, spelled plainly', () => {
    expect(plain).toHaveLength(MODULES.length * (FORMS.length * 2 + 3));
    expect(wrong(plain)).toEqual([]);
  });

  it(`names exactly the banned decoded names in ${DRAWN} escaped spellings (seed ${SEED})`, () => {
    const found = wrong(drawn);
    expect({ wrong: found.length, first: found.slice(0, 5) }).toEqual({ wrong: 0, first: [] });
  });

  it('names the spellings reviews found passing: a template (round 1), and an escaped name in quotes or a template (round 2)', () => {
    const passing = [
      'export const loadCore = () => import(`@manna/core/hymnal`);',
      "export const loadCore = () => import('@manna/core/\\u0068ymnal');",
      'export const loadCore = () => import(`@manna/core/\\u0068ymnal`);',
    ];
    expect(
      passing.map((source) => ({ source, found: coreReads('src/passage.ts', source) })),
    ).toEqual(
      passing.map((source) => ({ source, found: [{ line: 1, name: '@manna/core/hymnal' }] })),
    );
  });
});
