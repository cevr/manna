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

/** The names a node gives what it holds, or reads it by: a binding, a key, an assignment's target, an environment variable. */
const namesAt = (node: ESTree.Node): ReadonlyArray<string> => {
  if (node.type === 'VariableDeclarator') return Option.toArray(nameOf(node.id));
  if (node.type === 'Property' || node.type === 'PropertyDefinition')
    return Option.toArray(nameOf(node.key));
  if (node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression')
    return Option.toArray(nameOf(node.left.property));
  if (node.type === 'AssignmentExpression') return Option.toArray(nameOf(node.left));
  if (node.type === 'FunctionDeclaration')
    return Option.toArray(Option.flatMap(Option.fromNullishOr(node.id), nameOf));
  if (node.type === 'MemberExpression') return Option.toArray(nameOf(node.property));
  if (node.type === 'CallExpression')
    return node.arguments.flatMap((argument) => Option.toArray(nameOf(argument)));
  return [];
};

/** The expressions an expression is made of, as far as a seed's name can hide in them. */
const partsOf = (node: ESTree.Node): ReadonlyArray<ESTree.Node> => {
  if (node.type === 'MemberExpression') return [node.object, node.property];
  if (node.type === 'CallExpression' || node.type === 'NewExpression')
    return [node.callee, ...node.arguments];
  if (node.type === 'LogicalExpression' || node.type === 'BinaryExpression')
    return [node.left, node.right];
  if (node.type === 'ConditionalExpression') return [node.test, node.consequent, node.alternate];
  if (node.type === 'TemplateLiteral') return node.expressions;
  if (
    node.type === 'UnaryExpression' ||
    node.type === 'AwaitExpression' ||
    node.type === 'SpreadElement'
  )
    return [node.argument];
  if (
    node.type === 'TSNonNullExpression' ||
    node.type === 'TSAsExpression' ||
    node.type === 'TSSatisfiesExpression' ||
    node.type === 'ParenthesizedExpression' ||
    node.type === 'ChainExpression'
  )
    return [node.expression];
  return [];
};

/**
 * Whether an expression reads a seed by name anywhere in it:
 * `Number(process.env['HYMNAL_ROWS_SEED'])`, `parseInt(Bun.env.X_SEED ?? '', 10)`,
 * `Config.Int('TEST_BUDGET_SEED')`, a binding named `seed`.
 */
const seedIn = (node: ESTree.Node): boolean =>
  (node.type === 'Identifier' && saysSeed(node.name)) ||
  namesAt(node).some(saysSeed) ||
  partsOf(node).some(seedIn);

/**
 * Whether `at` is the fallback of a choice made on a seed read by name: the
 * right of `??` or `||` whose left reads one, or a branch of `?:` whose test
 * or other branch reads one.
 */
const fallsBackFrom = (parent: ESTree.Node, at: ESTree.Node) => {
  if (parent.type === 'LogicalExpression') return parent.right === at && seedIn(parent.left);
  if (parent.type !== 'ConditionalExpression' || parent.test === at) return false;
  return [parent.test, parent.consequent, parent.alternate]
    .filter((part) => part !== at)
    .some(seedIn);
};

/** Whether a read is a seed's: a name around it says seed, or it is the fallback of a seed read by name, however wrapped. */
const isSeed = (read: ESTree.Node) => {
  let at: ESTree.Node = read;
  while (at.type !== 'Program') {
    const parent: ESTree.Node = at.parent;
    if (namesAt(parent).some(saysSeed) || fallsBackFrom(parent, at)) return true;
    at = parent;
  }
  return false;
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
