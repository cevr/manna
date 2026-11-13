import { Effect, Option, Predicate } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';

const MESSAGE =
  "a test's seed read from the clock or a random source: a cached test task's green then says nothing about the seed that ran, and a red one cannot be run again. Default the seed to a constant (Number(process.env['X_SEED'] ?? 20261112)), name X_SEED in the env of the workspace turbo.json's task, and print the seed with each failure.";

/** The clock and random sources, as `object.member`: called (`Date.now()`) or, for an Effect, read (`Clock.currentTimeMillis`). */
const SOURCES = new Set([
  'Date.now',
  'Math.random',
  'performance.now',
  'process.hrtime',
  'crypto.randomUUID',
  'crypto.getRandomValues',
  'Clock.currentTimeMillis',
  'Clock.currentTimeNanos',
]);

/** The calls a value passes through unchanged in kind: a conversion, a rounding, an Effect made from it. */
const WRAPPERS = new Set([
  'Number',
  'String',
  'BigInt',
  'parseInt',
  'parseFloat',
  'Number.parseInt',
  'Number.parseFloat',
  'Effect.gen',
  'Effect.sync',
  'Effect.succeed',
]);

/** The binary operators whose value is made from both operands: arithmetic and bits, never a comparison. */
const ARITHMETIC = new Set(['+', '-', '*', '/', '%', '**', '|', '&', '^', '<<', '>>', '>>>']);

/** The unary operators whose value is made from their operand: never `!`, `typeof`, `void` or `delete`. */
const SIGNS = new Set(['+', '-', '~']);

/** The comparisons a `?:`'s test may make of a seed read: `R === undefined`, `Number(R) > 0`. */
const COMPARISONS = new Set(['===', '!==', '==', '!=', '<', '>', '<=', '>=']);

/** The nodes that are functions, which a `return` hands its value to. */
const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

/** The nodes that hand on their one `expression` as it is: parentheses, a type assertion, `!`, an optional chain. */
const TRANSPARENT = new Set([
  'ParenthesizedExpression',
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
  'ChainExpression',
]);

/** The name a node spells: an identifier, or a string literal written as one (`'WHEEL_SEED'`, never `'a seed'`). */
const nameOf = (node: ESTree.Node): Option.Option<string> => {
  if (node.type === 'Identifier') return Option.some(node.name);
  if (node.type === 'Literal' && Predicate.isString(node.value))
    return Option.some(node.value).pipe(Option.filter((value) => /^[A-Za-z_$][\w$]*$/.test(value)));
  return Option.none();
};

/** The name a member or key is read under: `.seed`, `['X_SEED']`, never a computed name (`table[seed]`). */
const keyOf = (key: ESTree.Node, computed: boolean): Option.Option<string> =>
  nameOf(key).pipe(Option.filter(() => !computed || key.type !== 'Identifier'));

/** A name, or `object.member` for a member read off a name: `Number`, `Date.now`, `Math.floor`, `process.hrtime`. */
const dotted = (node: ESTree.Node): Option.Option<string> => {
  if (node.type === 'Identifier') return Option.some(node.name);
  if (node.type !== 'MemberExpression' || node.object.type !== 'Identifier') return Option.none();
  const object = node.object.name;
  return Option.map(keyOf(node.property, node.computed), (member) => `${object}.${member}`);
};

/** Whether a name holds the word seed or seeds: `seed`, `WHEEL_SEED`, `motionSeed`, `seedRows`, never `heartseed` or `seeded`. */
const saysSeed = (name: string) =>
  name
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z\d]+/)
    .some((word) => /^seeds?$/i.test(word));

/** Whether a key or binding's name says seed. */
const named = (node: ESTree.Node, computed = false) =>
  Option.exists(keyOf(node, computed), saysSeed);

/** Whether a call's callee passes its arguments' value on: a conversion, any `Math.*`, an Effect constructor. */
const wraps = (callee: ESTree.Node) =>
  Option.exists(dotted(callee), (name) => WRAPPERS.has(name) || name.startsWith('Math.'));

/**
 * Whether `child` is in a result position of `parent`: `parent`'s value is
 * made from `child`'s, so a clock read there is still the clock's. The
 * result positions are the expression itself through parentheses, type
 * assertions, `await` and `yield`; either side of `??` or `||`; a `?:`'s
 * branch; a sign (`+`, `-`, `~`); either side of arithmetic; a template's
 * expression; a conversion's, a `Math.*`'s or an Effect constructor's
 * argument; a call's callee (`Date.now()`, `(() => S)()`); the object of a
 * member or method (`Date.now().toString()`, `process.hrtime()[1]`); and a
 * function's expression body or `return`. `&&`, a comparison, a `?:`'s
 * test, `!`, `typeof`, any other call's or `new`'s argument, an array, an
 * object and a statement are not.
 */
const resultOf = (parent: ESTree.Node, child: ESTree.Node): boolean => {
  if (TRANSPARENT.has(parent.type)) return true;
  switch (parent.type) {
    case 'AwaitExpression':
    case 'YieldExpression':
      return parent.argument === child;
    case 'LogicalExpression':
      return parent.operator !== '&&';
    case 'ConditionalExpression':
      return parent.test !== child;
    case 'UnaryExpression':
      return SIGNS.has(parent.operator);
    case 'BinaryExpression':
      return ARITHMETIC.has(parent.operator);
    case 'TemplateLiteral':
      return true;
    case 'MemberExpression':
      return parent.object === child;
    case 'CallExpression':
      return parent.callee === child || wraps(parent.callee);
    case 'ArrowFunctionExpression':
      return parent.body === child;
    default:
      return false;
  }
};

/** The function a node lies in, nearest first. */
const enclosingFunction = (node: ESTree.Node): Option.Option<ESTree.Node> => {
  let at: ESTree.Node = node;
  while (at.type !== 'Program') {
    at = at.parent;
    if (FUNCTIONS.has(at.type)) return Option.some(at);
  }
  return Option.none();
};

/** The node `at`'s value is a result of, if any: its parent in a result position, or, from a `return`, its function. */
const resultAbove = (at: ESTree.Node): Option.Option<ESTree.Node> => {
  if (at.type === 'Program') return Option.none();
  const parent: ESTree.Node = at.parent;
  if (parent.type === 'ReturnStatement') return enclosingFunction(parent);
  return Option.some(parent).pipe(Option.filter((p) => resultOf(p, at)));
};

/**
 * Whether an expression reads a seed by name: a name that says seed
 * (`seed`, `HYMNAL_PROBE_SEED`), a member under one (`process.env['X_SEED']`,
 * `Bun.env.X_SEED`, `options.seed`), or such a read taken through a
 * conversion, a method (`R?.trim()`), `!`, a type assertion, a sign or the
 * left of `??`/`||`. A seed used as a key or an argument (`table[seed]`,
 * `map.get(seed)`) is no read of it.
 */
const seedRead = (node: ESTree.Node): boolean => {
  switch (node.type) {
    case 'Identifier':
      return saysSeed(node.name);
    case 'ParenthesizedExpression':
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
    case 'TSNonNullExpression':
    case 'TSTypeAssertion':
    case 'ChainExpression':
      return seedRead(node.expression);
    case 'MemberExpression':
      return named(node.property, node.computed) || seedRead(node.object);
    case 'CallExpression':
      if (wraps(node.callee)) return node.arguments.some(seedRead);
      return node.callee.type === 'MemberExpression' && seedRead(node.callee);
    case 'AwaitExpression':
      return seedRead(node.argument);
    case 'LogicalExpression':
      return node.operator !== '&&' && seedRead(node.left);
    case 'UnaryExpression':
      return SIGNS.has(node.operator) && seedRead(node.argument);
    default:
      return false;
  }
};

/** Whether a `?:`'s test asks for a seed read: `R`, `!R`, `R === undefined`, `Number(R) > 0`. */
const asksForSeed = (test: ESTree.Node) => {
  if (test.type === 'UnaryExpression' && test.operator === '!') return seedRead(test.argument);
  if (test.type === 'BinaryExpression' && COMPARISONS.has(test.operator))
    return seedRead(test.left) || seedRead(test.right);
  return seedRead(test);
};

/**
 * Whether `parent` holds `at` as a seed's value: a seed binding's
 * initializer or default (a variable, a parameter, a constructor's
 * parameter property, a destructured property or element), a seed key's
 * value (an object's property, a class field), or the right side of an
 * assignment (`=`, `||=`, `??=`) to a seed name or a seed member.
 */
const heldAsSeed = (parent: ESTree.Node, at: ESTree.Node) => {
  switch (parent.type) {
    case 'VariableDeclarator':
      return parent.init === at && named(parent.id);
    case 'AssignmentPattern': {
      if (parent.right !== at) return false;
      const holder: ESTree.Node = parent.parent;
      return (
        named(parent.left) ||
        (holder.type === 'Property' &&
          holder.value === parent &&
          named(holder.key, holder.computed))
      );
    }
    case 'Property':
    case 'PropertyDefinition':
      return parent.value === at && named(parent.key, parent.computed);
    case 'AssignmentExpression':
      return (
        parent.right === at &&
        (named(parent.left) ||
          (parent.left.type === 'MemberExpression' &&
            named(parent.left.property, parent.left.computed)))
      );
    default:
      return false;
  }
};

/**
 * Whether `at` stands in for a seed read by name, whatever holds the whole:
 * the right of `??` or `||` whose left reads a seed
 * (`Number(process.env['X_SEED']) || S`), or a `?:`'s branch whose test asks
 * for a seed read and whose other branch is one (`R ? Number(R) : S`).
 */
const fallsBackFrom = (parent: ESTree.Node, at: ESTree.Node) => {
  if (parent.type === 'LogicalExpression')
    return parent.operator !== '&&' && parent.right === at && seedRead(parent.left);
  if (parent.type !== 'ConditionalExpression' || parent.test === at) return false;
  return (
    asksForSeed(parent.test) &&
    [parent.consequent, parent.alternate].some((branch) => branch !== at && seedRead(branch))
  );
};

/**
 * Whether a clock or random read is a seed's. The read climbs through
 * result positions alone (`resultOf`), and at each step it is a seed's when
 * - the node above holds it as a seed binding's value (`heldAsSeed`):
 *   `const seed = Math.floor(Math.random() * n)`, `function draw(seed =
 *   Date.now())`, `{ seed: performance.now() }`, `wheelSeed ||= Date.now()`;
 * - or it stands in for a seed read by name (`fallsBackFrom`):
 *   `Number(process.env['X_SEED']) || Date.now()`.
 * A clock read outside a result position (a comparison, `&&`, a `?:`'s
 * test, a timing or log call's argument, a property body's statements) is
 * no seed's, nor is one whose `??`/`||` left side only uses a seed as a key
 * or an argument (`map.get(seed) ?? performance.now()`), nor one held by a
 * name that does not say seed. A function declaration's name, a callback
 * (`Array.from(…, () => Math.random())`), a helper (`?? now()`) and a
 * renamed binding (`{ X_SEED: raw }`) are not followed.
 */
const isSeed = (read: ESTree.Node) => {
  let at: ESTree.Node = read;
  for (;;) {
    if (at.type === 'Program') return false;
    const parent: ESTree.Node = at.parent;
    if (heldAsSeed(parent, at) || fallsBackFrom(parent, at)) return true;
    const next = resultAbove(at);
    if (Option.isNone(next)) return false;
    at = next.value;
  }
};

/** Whether a node is a clock or random source: a source member (`Date.now`, called as the callee it is), or `new Date()`. */
const isClock = (node: ESTree.Node) => {
  if (node.type === 'NewExpression')
    return Option.contains(nameOf(node.callee), 'Date') && node.arguments.length === 0;
  return (
    node.type === 'MemberExpression' && Option.exists(dotted(node), (name) => SOURCES.has(name))
  );
};

export const seedFromClock = Rule.define({
  name: 'seed-from-clock',
  meta: Rule.meta({
    type: 'problem',
    description:
      "A test's seed is a constant by default, overridden by a named environment variable, never the clock's or a random source's.",
  }),
  create: function* () {
    const context = yield* RuleContext;
    const check = (node: ESTree.Node) =>
      Effect.suspend(() => {
        if (!isClock(node) || !isSeed(node)) return Effect.void;
        return context.report(Diagnostic.make({ node, message: MESSAGE }));
      });
    return Visitor.merge(Visitor.on('MemberExpression', check), Visitor.on('NewExpression', check));
  },
});
