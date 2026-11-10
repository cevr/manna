/**
 * The source rule's reader: which lines of a test, a test helper or a tool
 * read the host's clock. It parses a source (oxc-parser, by the file's
 * extension) and judges syntax only, never following a value through a call
 * or an import. A fault is `host` (`Date.now`, `new Date()`, `Date()`, each
 * also through `globalThis`, `window`, `global` or `self`, and
 * `DateTime.nowUnsafe`), `refused` (any other use of `Date` than a fixed
 * `new Date(…)`, `Date.UTC`, `Date.parse`, `instanceof Date` or a type, and
 * a file that does not parse), `monotonic` (`performance`, `process.hrtime`,
 * `Bun.nanoseconds`, a monotonic read of anything but `Clock`), `held` (a
 * calendar read of anything but `Clock`, and `clockWith`) or `unprovided`
 * (`Effect.run*` given a clock read as its direct argument). Comments,
 * strings, templates' text, JSX text and property keys are not read. A fault
 * inside one of the three named boundaries, of a kind that boundary holds, is
 * that boundary's own.
 */

import { Predicate } from 'effect';
import { parseSync } from 'oxc-parser';

/** What a fault reads: the host's calendar, a use the rule cannot place, monotonic time, a held clock, or a clock read run with no clock given. */
export type Kind = 'host' | 'refused' | 'monotonic' | 'held' | 'unprovided';

/** A fault: the line it stands on and its kind. */
export interface Fault {
  readonly line: number;
  readonly kind: Kind;
}

/** A named boundary: faults of `kinds` inside the top-level declaration `within` of `file` are its own. */
interface Boundary {
  readonly file: string;
  readonly within: string;
  readonly kinds: ReadonlyArray<Kind>;
}

/** The three places a test may hold the host's clock: the deadline's monotonic time, the default clock kept for its sleeps, and the preload's count of its asks. */
export const BOUNDARIES: ReadonlyArray<Boundary> = [
  { file: 'src/test/elapsed.ts', within: 'deadline', kinds: ['monotonic'] },
  { file: 'src/test/clock.ts', within: 'hostClock', kinds: ['held', 'monotonic'] },
  { file: 'src/test/setup.ts', within: 'hostAsked', kinds: ['held'] },
];

/** Whether the package's `file` is in the rule's domain: a `.ts` or `.tsx` test, a helper under `src/test/` or a tool under `scripts/`, `vite/` or `infra/`, and no declaration file. */
export const inDomain = (file: string) =>
  /\.tsx?$/u.test(file) &&
  !file.endsWith('.d.ts') &&
  (/\.test\.tsx?$/u.test(file) || /^(?:src\/test|scripts|vite|infra)\//u.test(file));

/** A node of the parsed tree, by the fields the rule reads. */
interface Node {
  readonly type: string;
  readonly start: number;
  readonly name?: unknown;
  readonly computed?: unknown;
  readonly object?: unknown;
  readonly property?: unknown;
  readonly value?: unknown;
  readonly callee?: unknown;
  readonly arguments?: unknown;
  readonly operator?: unknown;
  readonly right?: unknown;
  readonly key?: unknown;
  readonly shorthand?: unknown;
  readonly id?: unknown;
  readonly declaration?: unknown;
  readonly declarations?: unknown;
}

const isNode = (value: unknown): value is Node =>
  Predicate.hasProperty(value, 'type') &&
  Predicate.isString(value.type) &&
  Predicate.hasProperty(value, 'start');

const GLOBALS = new Set(['globalThis', 'window', 'global', 'self']);
const FIXED = new Set(['UTC', 'parse']);
const CALENDAR_READS = new Set([
  'currentTimeMillis',
  'currentTimeNanos',
  'currentTimeMillisUnsafe',
  'currentTimeNanosUnsafe',
]);
const MONOTONIC_READS = new Set(['monotonicTimeNanos', 'monotonicTimeNanosUnsafe']);
const CLOCK_RUNS = new Set([...CALENDAR_READS, ...MONOTONIC_READS]);

/** The key positions of a declaration or literal, where a name is a key and no read. */
const KEYED = new Set([
  'Property',
  'PropertyDefinition',
  'MethodDefinition',
  'AccessorProperty',
  'TSPropertySignature',
  'TSMethodSignature',
  'TSAbstractPropertyDefinition',
  'TSAbstractMethodDefinition',
  'TSEnumMember',
]);

/** The TypeScript nodes whose child is a value, not a type. */
const TS_VALUES = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
  'TSInstantiationExpression',
  'TSEnumDeclaration',
  'TSModuleDeclaration',
  'TSExportAssignment',
  'TSImportEqualsDeclaration',
]);

const NONE: ReadonlyArray<Kind> = [];

/** A field's nodes: the items of an array, or the field itself. */
const nodesOf = (field: Node[keyof Node]): ReadonlyArray<Node> => [field].flat().filter(isNode);

const isIdentifier = (node: unknown): node is Node & { readonly name: string } =>
  isNode(node) && node.type === 'Identifier' && Predicate.isString(node.name);

const isNamed = (node: unknown, name: string): node is Node & { readonly name: string } =>
  isIdentifier(node) && node.name === name;

const isMember = (node: unknown): node is Node => isNode(node) && node.type === 'MemberExpression';

/** The name a member expression reads: its plain property, or the string literal it is indexed by; empty when neither. */
const memberName = (node: Node): string => {
  const { property } = node;
  if (node.computed === false && isIdentifier(property)) return property.name;
  if (node.computed === true && isNode(property) && Predicate.isString(property.value))
    return property.value;
  return '';
};

/** Whether `node` is a name standing as a key or in a type, where it reads nothing. */
const isKeyOrType = (node: Node, parent: Node) => {
  if (parent.type === 'MemberExpression')
    return parent.property === node && parent.computed === false;
  if (KEYED.has(parent.type))
    return parent.key === node && parent.computed !== true && parent.shorthand !== true;
  return parent.type.startsWith('TS') && !TS_VALUES.has(parent.type);
};

/** The fault of the use `parent` makes of the global `Date`, reached as `node`: none for a fixed date, `Date.UTC`, `Date.parse` or `instanceof Date`. */
const dateUse = (node: Node, parent: Node): ReadonlyArray<Kind> => {
  if (parent.type === 'NewExpression' && parent.callee === node) {
    const args = nodesOf(parent.arguments);
    if (args.length === 0) return ['host'];
    if (args.some((arg) => arg.type === 'SpreadElement')) return ['refused'];
    return NONE;
  }
  if (parent.type === 'CallExpression' && parent.callee === node) return ['host'];
  if (isMember(parent) && parent.object === node) {
    if (parent.computed === true) return ['refused'];
    if (memberName(parent) === 'now') return ['host'];
    if (FIXED.has(memberName(parent))) return NONE;
    return ['refused'];
  }
  if (
    parent.type === 'BinaryExpression' &&
    parent.operator === 'instanceof' &&
    parent.right === node
  )
    return NONE;
  return ['refused'];
};

/** The fault of a name read as a value. */
const nameUse = (node: Node & { readonly name: string }, parent: Node): ReadonlyArray<Kind> => {
  if (isKeyOrType(node, parent)) return NONE;
  if (node.name === 'Date') return dateUse(node, parent);
  if (node.name === 'performance') return ['monotonic'];
  if (node.name === 'clockWith') return ['held'];
  return NONE;
};

/** The fault of a member expression, by its object and the name it reads. */
const memberUse = (node: Node, parent: Node): ReadonlyArray<Kind> => {
  const name = memberName(node);
  const { object } = node;
  const isClock = isNamed(object, 'Clock');
  if (isIdentifier(object) && GLOBALS.has(object.name) && name === 'Date')
    return dateUse(node, parent);
  if (isIdentifier(object) && GLOBALS.has(object.name) && name === 'performance')
    return ['monotonic'];
  if (name === 'hrtime' && isNamed(object, 'process')) return ['monotonic'];
  if (name === 'nanoseconds' && isNamed(object, 'Bun')) return ['monotonic'];
  if (CALENDAR_READS.has(name) && !isClock) return ['held'];
  if (MONOTONIC_READS.has(name) && !isClock) return ['monotonic'];
  if (name === 'clockWith') return ['held'];
  if (name === 'nowUnsafe' && isNamed(object, 'DateTime')) return ['host'];
  return NONE;
};

/** Whether a call runs a clock read, given as its direct argument, with `Effect.run*`. */
const isUnprovided = (node: Node) => {
  if (node.type !== 'CallExpression' || !isMember(node.callee)) return false;
  const run = memberName(node.callee);
  const [first] = nodesOf(node.arguments);
  if (!/^run[A-Z]/u.test(run) || !isNamed(node.callee.object, 'Effect') || !isMember(first))
    return false;
  const read = memberName(first);
  return (
    (isNamed(first.object, 'Clock') && CLOCK_RUNS.has(read)) ||
    (isNamed(first.object, 'DateTime') && read.startsWith('now'))
  );
};

/** The fault `node` is, read under `parent`. */
const readsOf = (node: Node, parent: Node): ReadonlyArray<Kind> => {
  if (isIdentifier(node)) return nameUse(node, parent);
  if (isMember(node)) return memberUse(node, parent);
  if (isUnprovided(node)) return ['unprovided'];
  return NONE;
};

/** The name a top-level statement declares: a variable's (its first), a function's or a class's; empty when it declares none. */
const declared = (statement: Node): string => {
  const [inner = statement] = nodesOf(statement.declaration);
  const [first = inner] = nodesOf(inner.declarations);
  if (isIdentifier(first.id)) return first.id.name;
  return '';
};

/** Each fault of `text`, the source of the package's file `path`, in source order. */
export const hostReads = (text: string, path: string): ReadonlyArray<Fault> => {
  const parsed = parseSync(path, text);
  const lineOf = (at: number) => text.slice(0, at).split('\n').length;
  if (parsed.errors.length > 0)
    return parsed.errors.map((error) => {
      const [at = 0] = error.labels.map((label) => label.start);
      return { line: lineOf(at), kind: 'refused' };
    });
  const own = BOUNDARIES.filter((boundary) => boundary.file === path);
  const found: Array<{ readonly at: number; readonly kind: Kind }> = [];
  const visit = (node: Node, parent: Node, within: string) => {
    for (const kind of readsOf(node, parent))
      if (!own.some((each) => each.within === within && each.kinds.includes(kind)))
        found.push({ at: node.start, kind });
    for (const [field, value] of Object.entries(node))
      if (field !== 'key' || node.type !== 'Property' || node.shorthand !== true)
        for (const child of nodesOf(value)) visit(child, node, within);
  };
  for (const statement of nodesOf(parsed.program.body))
    visit(statement, statement, declared(statement));
  return found.toSorted((a, b) => a.at - b.at).map(({ at, kind }) => ({ line: lineOf(at), kind }));
};

/** Whether `within` names a top-level declaration of `text`, so a boundary's name points at a real declaration. */
export const declares = (text: string, path: string, within: string) =>
  nodesOf(parseSync(path, text).program.body).some((statement) => declared(statement) === within);
