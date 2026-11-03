/**
 * The core-import guard's reader. The app reads `@manna/core` through
 * `@manna/core/bible` only: any other core module would bring Bun-only code
 * into the phone's bundle, and the corpus (`@manna/core/assets/*`) is read
 * only when the app is bundled, by `vite/passage.ts`.
 *
 * It parses a source (oxc-parser, by the file's extension) and judges each
 * module specifier by its decoded value, the name the bundler resolves:
 * the string literal or the template with no `${}` that a static `import …
 * from`, an `export … from`, an `import()`, a `require()`, TypeScript's
 * `import … = require()` or an `import()` type names. A core asset's name
 * in any such string counts too, in an import or out of one. A comment, or
 * a string that names no module, is not read.
 */

import { Option, Predicate } from 'effect';
import { type Argument, parseSync, Visitor } from 'oxc-parser';

/** The one core module the app may name. */
const ALLOWED = '@manna/core/bible';

const CORE = '@manna/core';
const ASSETS = '@manna/core/assets/';

/** A finding: the line it stands on, and the module or asset it names, or why the source does not parse. */
export interface CoreRead {
  readonly line: number;
  readonly name: string;
}

/** A string literal's value, or a template's with no `${}`, as the language decodes it. */
const staticValue = (node: Argument): Option.Option<string> => {
  if (node.type === 'Literal' && Predicate.isString(node.value)) return Option.some(node.value);
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0)
    return Option.fromNullishOr(node.quasis[0]?.value.cooked);
  return Option.none();
};

const isBanned = (name: string) =>
  (name === CORE || name.startsWith(`${CORE}/`)) && name !== ALLOWED;

/** Each `@manna/core` module `source` names other than `@manna/core/bible`, and each core asset it names, once a place, in order. */
export const coreReads = (file: string, source: string): ReadonlyArray<CoreRead> => {
  const parsed = parseSync(file, source, { sourceType: 'module' });
  const found: Array<{ readonly at: number; readonly name: string }> = [];
  const specifier = (node: Argument) => {
    for (const name of Option.toArray(staticValue(node)))
      if (isBanned(name)) found.push({ at: node.start, name });
  };
  const string = (node: Argument) => {
    for (const name of Option.toArray(staticValue(node)))
      if (name.startsWith(ASSETS)) found.push({ at: node.start, name });
  };
  new Visitor({
    ImportDeclaration: (node) => specifier(node.source),
    ExportAllDeclaration: (node) => specifier(node.source),
    ExportNamedDeclaration: (node) => {
      for (const source of Option.toArray(Option.fromNullOr(node.source))) specifier(source);
    },
    ImportExpression: (node) => specifier(node.source),
    CallExpression: (node) => {
      const [first] = node.arguments;
      if (node.callee.type === 'Identifier' && node.callee.name === 'require' && first)
        specifier(first);
    },
    TSExternalModuleReference: (node) => specifier(node.expression),
    TSImportType: (node) => specifier(node.source),
    Literal: string,
    TemplateLiteral: string,
  }).visit(parsed.program);
  const unparsed = parsed.errors.map((error) => ({
    at: error.labels[0]?.start ?? 0,
    name: `does not parse: ${error.message}`,
  }));
  return [
    ...new Map([...found, ...unparsed].map((read) => [`${read.at} ${read.name}`, read])).values(),
  ]
    .toSorted((a, b) => a.at - b.at)
    .map(({ at, name }) => ({ line: source.slice(0, at).split('\n').length, name }));
};
