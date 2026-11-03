import { Effect, Option } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import { type Bindings, bindings, memberName } from './nodes.ts';

const isEvaluate = (call: ESTree.CallExpression): boolean => {
  const callee = call.callee;
  if (callee.type === 'Identifier') return callee.name === 'evaluate';
  return callee.type === 'MemberExpression' && Option.contains(memberName(callee), 'evaluate');
};

const isExpect = (b: Bindings, call: ESTree.CallExpression): boolean =>
  b.isRunner(call.callee, 'expect');

const isMatcher = (b: Bindings, call: ESTree.CallExpression): boolean => {
  let at: ESTree.Node = call.callee;
  while (at.type === 'MemberExpression') at = at.object;
  return at.type === 'CallExpression' && isExpect(b, at);
};

const PASSES_ON = new Set([
  'YieldExpression',
  'AwaitExpression',
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'ParenthesizedExpression',
]);

const HOLDS = new Set(['Property', 'SpreadElement', 'ObjectExpression', 'ArrayExpression']);

const DERIVES = new Set([
  'BinaryExpression',
  'UnaryExpression',
  'LogicalExpression',
  'ConditionalExpression',
  'TemplateLiteral',
]);

type Asserted = Effect.Effect<boolean, never, RuleContext>;

const anyOf = (checks: ReadonlyArray<Asserted>): Asserted =>
  Effect.map(Effect.all(checks), (answers) => answers.some(Boolean));

const callOf = (id: ESTree.Node): ReadonlyArray<ESTree.Node> =>
  Option.toArray(
    Option.filter(
      Option.fromNullishOr(id.parent),
      (up) => up.type === 'CallExpression' && up.callee === id,
    ),
  );

const readsOf = (
  declarator: ESTree.VariableDeclarator,
  seen: ReadonlySet<ESTree.Node>,
  helper: boolean,
): Asserted =>
  Effect.flatMap(bindings, (b) => {
    if (seen.has(declarator)) return Effect.succeed(false);
    const next = new Set([...seen, declarator]);
    const reads = b.readsOf(declarator).flatMap((id) => {
      if (helper) return callOf(id);
      return [id];
    });
    return anyOf(reads.map((read) => asserted(read, next)));
  });

const arrowAnswers = (
  n: ESTree.Node,
  up: ESTree.ArrowFunctionExpression,
  seen: ReadonlySet<ESTree.Node>,
): Asserted => {
  if (up.body !== n) return Effect.succeed(false);
  if (up.parent.type === 'CallExpression') return asserted(up, seen);
  if (up.parent.type === 'VariableDeclarator' && up.parent.init === up)
    return readsOf(up.parent, seen, true);
  return Effect.succeed(false);
};

const callTakes = (
  n: ESTree.Node,
  up: ESTree.CallExpression,
  seen: ReadonlySet<ESTree.Node>,
): Asserted => {
  if (up.callee === n) return asserted(up, seen);
  if (!up.arguments.some((a) => a === n)) return Effect.succeed(false);
  return Effect.flatMap(bindings, (b) => {
    if (isExpect(b, up) || isMatcher(b, up)) return Effect.succeed(true);
    return asserted(up, seen);
  });
};

const asserted = (n: ESTree.Node, seen: ReadonlySet<ESTree.Node>): Asserted => {
  if (n.type === 'Program') return Effect.succeed(false);
  const up = n.parent;
  if (PASSES_ON.has(up.type) || HOLDS.has(up.type) || DERIVES.has(up.type))
    return asserted(up, seen);
  if (up.type === 'MemberExpression' && up.object === n) return asserted(up, seen);
  if (up.type === 'ArrowFunctionExpression') return arrowAnswers(n, up, seen);
  if (up.type === 'VariableDeclarator' && up.init === n) return readsOf(up, seen, false);
  if (up.type === 'CallExpression') return callTakes(n, up, seen);
  return Effect.succeed(false);
};

const refused = (call: ESTree.CallExpression) => {
  if (!isEvaluate(call)) return Effect.succeedNone;
  return Effect.map(asserted(call, new Set()), (yes) =>
    Option.filter(Option.some('evaluate'), () => yes),
  );
};

export const noReadOnce = Rule.define({
  name: 'no-read-once',
  meta: Rule.meta({
    type: 'problem',
    description:
      'A lab browser test waits for the value it asserts (fixtures/settled.ts); a one-shot read of the page takes whatever was drawn at that instant.',
  }),
  create: function* () {
    const context = yield* RuleContext;
    return Visitor.on('CallExpression', (node) =>
      Effect.flatMap(refused(node), (found) =>
        Option.match(found, {
          onNone: () => Effect.void,
          onSome: (name) =>
            context.report(
              Diagnostic.make({
                node,
                message: `${name} reads the page once, whatever it had drawn at that instant: wait for the value instead (textIs, textHas, countIs, evaluates or until in lab/fixtures/settled.ts).`,
              }),
            ),
        }),
      ),
    );
  },
});
