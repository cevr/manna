import { Effect, Option, Predicate } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import { type Bindings, bindings, isFilmTime, memberName, type NumberOf } from './nodes.ts';

const NOISE = 1e-4;

const MILLISECOND = 1e-3;

const MESSAGE =
  'a nudge written beside a time: put the time on its grid through packages/film/src/core/time.ts (frameAtOrAfter, frameAtOrBefore, onTheMs, heardAtOrAfter, justBefore), or judge two times one with CLOCK_EPSILON, so one owner rounds every time.';

const isNudge = (node: ESTree.Node) =>
  node.type === 'Literal' && Predicate.isNumber(node.value) && node.value > 0 && node.value < NOISE;

const folded = (
  numberOf: NumberOf,
  node: ESTree.BinaryExpression,
  op: (x: number, y: number) => number,
): Option.Option<number> =>
  Option.map(Option.all([valueOf(numberOf, node.left), valueOf(numberOf, node.right)]), ([a, b]) =>
    op(a, b),
  );

const valueOf = (numberOf: NumberOf, node: ESTree.Node): Option.Option<number> => {
  if (node.type === 'BinaryExpression' && node.operator === '/')
    return folded(numberOf, node, (x, y) => x / y);
  if (node.type === 'BinaryExpression' && node.operator === '*')
    return folded(numberOf, node, (x, y) => x * y);
  if (node.type === 'ParenthesizedExpression') return valueOf(numberOf, node.expression);
  if (node.type === 'UnaryExpression' && node.operator === '-')
    return Option.map(valueOf(numberOf, node.argument), (v) => -v);
  if (node.type === 'UnaryExpression' && node.operator === '+')
    return valueOf(numberOf, node.argument);
  if (node.type === 'Literal' && Predicate.isNumber(node.value)) return Option.some(node.value);
  if (node.type === 'Identifier') return Option.filter(numberOf(node), (v) => Math.abs(v) >= NOISE);
  return Option.none();
};

const holdsNudge = (node: ESTree.Node): boolean => {
  if (isNudge(node)) return true;
  if (node.type === 'ParenthesizedExpression') return holdsNudge(node.expression);
  if (node.type === 'UnaryExpression') return holdsNudge(node.argument);
  if (node.type === 'BinaryExpression') return holdsNudge(node.left) || holdsNudge(node.right);
  return false;
};

const isStep = (numberOf: NumberOf, node: ESTree.Node): boolean => {
  if (holdsNudge(node)) return false;
  return Option.exists(
    valueOf(numberOf, node),
    (v) => Math.abs(v) > 0 && Math.abs(v) <= MILLISECOND,
  );
};

const stepsByHand = (numberOf: NumberOf, node: ESTree.BinaryExpression): boolean => {
  if (node.operator !== '+' && node.operator !== '-') return false;
  if (node.operator === '-') return isStep(numberOf, node.right);
  return isStep(numberOf, node.right) || isStep(numberOf, node.left);
};

const isEpsilon = (b: Bindings, node: ESTree.Node) =>
  b.readsImport(node, isFilmTime, 'CLOCK_EPSILON');

const nudgedByEpsilon = (b: Bindings, node: ESTree.Node): boolean => {
  if (node.type === 'ParenthesizedExpression') return nudgedByEpsilon(b, node.expression);
  if (node.type === 'UnaryExpression') return nudgedByEpsilon(b, node.argument);
  if (node.type !== 'BinaryExpression') return false;
  if (
    (node.operator === '+' || node.operator === '-') &&
    (isEpsilon(b, node.left) || isEpsilon(b, node.right))
  )
    return true;
  return nudgedByEpsilon(b, node.left) || nudgedByEpsilon(b, node.right);
};

const ROUNDINGS: ReadonlyArray<string> = ['ceil', 'floor', 'round', 'trunc'];

const roundsWithEpsilon = (b: Bindings, call: ESTree.CallExpression) => {
  const { callee } = call;
  if (callee.type !== 'MemberExpression' || !b.isGlobal(callee.object, 'Math')) return false;
  if (!Option.exists(memberName(callee), (n) => ROUNDINGS.includes(n))) return false;
  return Option.exists(Option.fromUndefinedOr(call.arguments[0]), (first) =>
    nudgedByEpsilon(b, first),
  );
};

export const oneClockEpsilon = Rule.define({
  name: 'one-clock-epsilon',
  meta: Rule.meta({
    type: 'problem',
    description:
      'A time is put on its grid, and two times judged one, through core/time.ts alone: no nudge written beside a time.',
  }),
  create: function* () {
    const context = yield* RuleContext;
    const b = yield* bindings;
    const { numberOf } = b;
    const report = (node: ESTree.Node, when: boolean) =>
      Effect.asVoid(
        Effect.when(
          context.report(Diagnostic.make({ node, message: MESSAGE })),
          Effect.succeed(when),
        ),
      );
    return Visitor.merge(
      Visitor.on('Literal', (node) => report(node, isNudge(node))),
      Visitor.merge(
        Visitor.on('BinaryExpression', (node) => report(node, stepsByHand(numberOf, node))),
        Visitor.on('CallExpression', (node) => report(node, roundsWithEpsilon(b, node))),
      ),
    );
  },
});
