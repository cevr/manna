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

/** The clock and random reads a seed must not take, as `object.member`. */
const READS = new Set([
  'Date.now',
  'Math.random',
  'performance.now',
  'crypto.randomUUID',
  'crypto.getRandomValues',
  'Clock.currentTimeMillis',
  'Clock.currentTimeNanos',
]);

/** The binary operators whose value is made from their operands: arithmetic and bits, never a comparison, whose value is a boolean. */
const ARITHMETIC = new Set(['+', '-', '*', '/', '%', '**', '|', '&', '^', '<<', '>>', '>>>']);

/** The unary operators whose value is made from their operand: never `!`, `typeof`, `void` or `delete`. */
const SIGNS = new Set(['+', '-', '~']);

/** The comparisons a test makes of a variable's presence: `R === undefined`, `R !== ''`. */
const EQUALITY = new Set(['===', '!==', '==', '!=']);

/** The nodes that are functions, which a `return` hands its value to. */
const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

/** The name a node spells: an identifier, or a string literal written as one (`'WHEEL_SEED'`, never `'a seed'`). */
const nameOf = (node: ESTree.Node): Option.Option<string> => {
  if (node.type === 'Identifier') return Option.some(node.name);
  if (node.type === 'Literal' && Predicate.isString(node.value))
    return Option.some(node.value).pipe(Option.filter((value) => /^[A-Za-z_$][\w$]*$/.test(value)));
  return Option.none();
};

/** `object.member` for a member read off a name: `Date.now`, `process.env.X`, `process.env['X']`. */
const dotted = (node: ESTree.MemberExpression): Option.Option<string> =>
  Option.flatMap(nameOf(node.object), (object) =>
    Option.map(nameOf(node.property), (member) => `${object}.${member}`),
  );

/** Whether a name holds the word seed or seeds: `seed`, `WHEEL_SEED`, `motionSeed`, never `heartseed` or `seeded`. */
const saysSeed = (name: string) =>
  name
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z\d]+/)
    .some((word) => /^seeds?$/i.test(word));

/** Whether a node's name says seed. */
const named = (node: ESTree.Node) => Option.exists(nameOf(node), saysSeed);

/** The operands an operator's value is made from: a call's callee and arguments, `??`/`||`/`&&`, arithmetic, `?:`'s branches, a sign. */
const operandsOf = (node: ESTree.Node): ReadonlyArray<ESTree.Node> => {
  if (node.type === 'MemberExpression') return [node.object];
  if (node.type === 'CallExpression' || node.type === 'NewExpression')
    return [node.callee, ...node.arguments];
  if (node.type === 'LogicalExpression') return [node.left, node.right];
  if (node.type === 'BinaryExpression')
    return [node.left, node.right].filter(() => ARITHMETIC.has(node.operator));
  if (node.type === 'ConditionalExpression') return [node.consequent, node.alternate];
  if (node.type === 'UnaryExpression')
    return [node.argument].filter(() => SIGNS.has(node.operator));
  if (node.type === 'TemplateLiteral') return node.expressions;
  return [];
};

/** The values a holder hands on: a wrapper's, an array's, an object's, a property's, an arrow's expression body. */
const heldOf = (node: ESTree.Node): ReadonlyArray<ESTree.Node> => {
  if (
    node.type === 'TSNonNullExpression' ||
    node.type === 'TSAsExpression' ||
    node.type === 'TSSatisfiesExpression' ||
    node.type === 'ParenthesizedExpression' ||
    node.type === 'ChainExpression'
  )
    return [node.expression];
  if (node.type === 'AwaitExpression' || node.type === 'SpreadElement') return [node.argument];
  if (node.type === 'YieldExpression') return Option.toArray(Option.fromNullishOr(node.argument));
  if (node.type === 'ArrayExpression')
    return node.elements.flatMap((element) => Option.toArray(Option.fromNullishOr(element)));
  if (node.type === 'ObjectExpression') return node.properties;
  if (node.type === 'Property') return [node.value];
  if (node.type === 'ArrowFunctionExpression' && node.body.type !== 'BlockStatement')
    return [node.body];
  return [];
};

/**
 * The children a node's value is made from: what flows into it. A clock
 * read flows up through these alone, so a comparison (`now() < 5_000`), a
 * `!`, a `?:`'s test, a statement or a function's body other than its
 * `return` stops it.
 */
const valueParts = (node: ESTree.Node): ReadonlyArray<ESTree.Node> => [
  ...operandsOf(node),
  ...heldOf(node),
];

/**
 * Whether an expression is a seed read by name: a name that says seed
 * (`seed`, `process.env['X_SEED']`, `Bun.env.X_SEED`, `Config.Int('X_SEED')`'s
 * literal), or a value made from one (`Number(R)`, `parseInt(R ?? '', 10)`,
 * `R?.trim()`, `` `${R}` ``).
 */
const seedRead = (node: ESTree.Node): boolean =>
  named(node) ||
  (node.type === 'MemberExpression' && named(node.property)) ||
  valueParts(node).some(seedRead);

/** Whether a `?:`'s test asks for a seed's presence: `R`, `!R`, `R === undefined`, `R !== ''`. */
const checksSeed = (test: ESTree.Node) => {
  if (test.type === 'UnaryExpression' && test.operator === '!') return seedRead(test.argument);
  if (test.type === 'BinaryExpression' && EQUALITY.has(test.operator))
    return seedRead(test.left) || seedRead(test.right);
  return seedRead(test);
};

/**
 * Whether `at` is the fallback of a seed read by name: the right of `??` or
 * `||` whose left is one, or a branch of a `?:` whose test asks for one and
 * whose other branch is one (`R ? Number(R) : S`).
 */
const fallsBackFrom = (parent: ESTree.Node, at: ESTree.Node) => {
  if (parent.type === 'LogicalExpression')
    return parent.operator !== '&&' && parent.right === at && seedRead(parent.left);
  if (parent.type !== 'ConditionalExpression' || parent.test === at) return false;
  return (
    checksSeed(parent.test) &&
    [parent.consequent, parent.alternate].some((branch) => branch !== at && seedRead(branch))
  );
};

/** Whether `parent` holds `at` under a name that says seed: a binding's value, an assignment's, a key's. */
const heldAsSeed = (parent: ESTree.Node, at: ESTree.Node) => {
  if (parent.type === 'VariableDeclarator') return parent.init === at && named(parent.id);
  if (parent.type === 'AssignmentExpression' && parent.right === at)
    return (
      named(parent.left) || (parent.left.type === 'MemberExpression' && named(parent.left.property))
    );
  if (parent.type === 'Property' || parent.type === 'PropertyDefinition')
    return parent.value === at && named(parent.key);
  return false;
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

/** Where `at`'s value goes: the node made from it, or, from a `return`, its function. */
const flowsTo = (at: ESTree.Node): Option.Option<ESTree.Node> => {
  if (at.type === 'Program') return Option.none();
  const parent: ESTree.Node = at.parent;
  if (parent.type === 'ReturnStatement' && parent.argument === at) return enclosingFunction(parent);
  return Option.some(parent).pipe(Option.filter((p) => valueParts(p).includes(at)));
};

/**
 * Whether a clock or random read is a seed's. The seed's value is what the
 * read flows into (`valueParts`, and a `return` into its function), and the
 * read is a seed's when that value is either
 * - held under a name that says seed: a binding, an assignment's target, a
 *   key, or a function so named (`const seed = Math.floor(Math.random() * n)`);
 * - or the fallback of a seed read by name (`fallsBackFrom`):
 *   `Number(process.env['X_SEED']) || Date.now()`, `R ? Number(R) : Date.now()`.
 * A read beside a seed that does not flow into it (`console.log(seed,
 * Date.now())`, `seed > 0 && performance.now() < 5_000`, a timing inside a
 * property's body) is no seed's.
 */
const isSeed = (read: ESTree.Node) => {
  let at: ESTree.Node = read;
  for (;;) {
    if (
      (at.type === 'FunctionDeclaration' || at.type === 'FunctionExpression') &&
      Option.exists(Option.fromNullishOr(at.id), named)
    )
      return true;
    if (at.type === 'Program') return false;
    const parent: ESTree.Node = at.parent;
    if (heldAsSeed(parent, at) || fallsBackFrom(parent, at)) return true;
    const next = flowsTo(at);
    if (Option.isNone(next)) return false;
    at = next.value;
  }
};

/** Whether a node reads the clock or a random source: `Date.now`, `Math.random`, `Clock.currentTimeMillis`, `new Date()`. */
const readsClock = (node: ESTree.Node) => {
  if (node.type === 'MemberExpression')
    return Option.exists(dotted(node), (name) => READS.has(name));
  if (node.type === 'NewExpression')
    return Option.contains(nameOf(node.callee), 'Date') && node.arguments.length === 0;
  return false;
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
        if (!readsClock(node) || !isSeed(node)) return Effect.void;
        return context.report(Diagnostic.make({ node, message: MESSAGE }));
      });
    return Visitor.merge(Visitor.on('MemberExpression', check), Visitor.on('NewExpression', check));
  },
});
