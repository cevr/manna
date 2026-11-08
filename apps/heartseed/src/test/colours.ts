/**
 * The colour guard's reader. Every colour a Heartseed screen, icon or
 * manifest paints comes from `src/theme.ts`, so no other product file holds
 * a colour value.
 *
 * It parses a source (oxc-parser, by the file's extension) and asks React
 * Native 0.88's own colour normalizer, the one the native renderer uses, of
 * each string value: a string literal, a JSX attribute's string, or a
 * template with no `${}`. A property's key (unless computed), an import's
 * source, a literal type, a comment and JSX text are not values, and are
 * not read. `transparent` paints nothing, and passes.
 */

import { Predicate } from 'effect';
import { parseSync, Visitor } from 'oxc-parser';

/**
 * React Native 0.88's normalizer, resolved through `react-native`'s own
 * package: under the test preload `react-native` is react-native-web, whose
 * older normalizer misses the space syntax `rgb(R G B / A)` that 0.88 paints.
 */
const normalizeColor: (colour: string) => unknown =
  // oxlint-disable-next-line effect/noDynamicImports -- the normalizer is react-native's own dependency, which the app does not declare, so only a path resolved from react-native's package reaches it
  require(
    Bun.resolveSync(
      '@react-native/normalize-colors',
      Bun.resolveSync('react-native/package.json', import.meta.dir),
    ),
  );

/** The folders under the app's root that hold product code. */
const ROOTS: ReadonlyArray<string> = ['src', 'app', 'vite', 'scripts', 'infra'];

/**
 * Whether the guard reads `file`, a path from the app's root: a `.ts` or
 * `.tsx` file under `src`, `app`, `vite`, `scripts` or `infra`, or at the
 * root, less tests, declarations, rigs (`src/test/`), dev probes
 * (`app/probe/`), prototypes (any segment that starts `prototype`) and the
 * theme itself.
 */
export const guarded = (file: string): boolean => {
  const segments = file.split('/');
  const name = segments.at(-1) ?? '';
  return (
    /\.tsx?$/u.test(name) &&
    !name.endsWith('.d.ts') &&
    !/\.test\.tsx?$/u.test(name) &&
    (segments.length === 1 || ROOTS.includes(segments[0] ?? '')) &&
    !file.startsWith('src/test/') &&
    !file.startsWith('app/probe/') &&
    !segments.some((segment) => segment.startsWith('prototype')) &&
    file !== 'src/theme.ts'
  );
};

/** The normalizer answers a colour's packed number, or nothing for a string it does not read. */
const isColour = (value: string) =>
  value !== 'transparent' && Predicate.isNumber(normalizeColor(value));

/**
 * `"<line> <value>"` for each string value of `text` that React Native reads
 * as a colour, `transparent` excepted, in source order; and `"<line> does
 * not parse: <why>"` for a source the parser refuses, so a broken file never
 * passes unread.
 */
export const coloursIn = (file: string, text: string): ReadonlyArray<string> => {
  const parsed = parseSync(file, text, { sourceType: 'module' });
  const found: Array<{ readonly at: number; readonly what: string }> = [];
  const skip = new Set<object>();
  const take = (node: { readonly start: number }, value: string) => {
    if (!skip.has(node) && isColour(value)) found.push({ at: node.start, what: value });
  };
  new Visitor({
    Property: (node) => {
      if (!node.computed) skip.add(node.key);
    },
    ImportDeclaration: (node) => {
      skip.add(node.source);
    },
    TSLiteralType: (node) => {
      skip.add(node.literal);
    },
    Literal: (node) => {
      if (Predicate.isString(node.value)) take(node, node.value);
    },
    TemplateLiteral: (node) => {
      if (node.expressions.length === 0) take(node, node.quasis[0]?.value.cooked ?? '');
    },
  }).visit(parsed.program);
  const unparsed = parsed.errors.map((error) => ({
    at: error.labels[0]?.start ?? 0,
    what: `does not parse: ${error.message}`,
  }));
  return [...found, ...unparsed]
    .toSorted((a, b) => a.at - b.at)
    .map(({ at, what }) => `${text.slice(0, at).split('\n').length} ${what}`);
};
