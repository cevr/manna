import { Effect, Option, Predicate } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import { ancestors, type Bindings, bindings, isFilmTime, memberName, property } from './nodes.ts';

const MAX_OFFSET = 1;

const isNumber =
  (b: Bindings) =>
  (n: ESTree.Node): boolean =>
    Option.isSome(b.numberOf(n));

const CLOCKS: ReadonlySet<string> = new Set(['t', 'T']);

const isTime =
  (b: Bindings) =>
  (n: ESTree.Node): boolean =>
    Option.exists(b.framePart(n), (part) => CLOCKS.has(part));

const isAnchor = (n: ESTree.Node): boolean =>
  (n.type === 'MemberExpression' &&
    Option.exists(memberName(n), (name) => name === 'start' || name === 'end' || name === 'dur')) ||
  (n.type === 'CallExpression' &&
    n.callee.type === 'MemberExpression' &&
    Option.contains(memberName(n.callee), 'mark'));

const terms = (n: ESTree.Node): ReadonlyArray<ESTree.Node> => {
  if (n.type === 'ParenthesizedExpression') return terms(n.expression);
  if (n.type === 'BinaryExpression' && (n.operator === '+' || n.operator === '-'))
    return [...terms(n.left), ...terms(n.right)];
  return [n];
};

const clockOffset = (b: Bindings, n: ESTree.Node): boolean => {
  const all = terms(n);
  return all.some(isTime(b)) && all.some(isNumber(b));
};

const within = (n: ESTree.Node, p: (x: ESTree.Node) => boolean): boolean => {
  if (p(n)) return true;
  if (n.type === 'BinaryExpression') return within(n.left, p) || within(n.right, p);
  if (n.type === 'UnaryExpression') return within(n.argument, p);
  if (n.type === 'ParenthesizedExpression') return within(n.expression, p);
  return false;
};

const literalOffset = (b: Bindings, n: ESTree.Node): boolean =>
  n.type === 'BinaryExpression' &&
  (n.operator === '+' || n.operator === '-') &&
  (isNumber(b)(n.left) ||
    isNumber(b)(n.right) ||
    literalOffset(b, n.left) ||
    literalOffset(b, n.right));

const scaledByLiteral = (b: Bindings, n: ESTree.Node): Option.Option<ESTree.Node> => {
  if (n.type !== 'BinaryExpression' || (n.operator !== '/' && n.operator !== '*'))
    return Option.none();
  if (isNumber(b)(n.right)) return Option.some(n.left);
  if (isNumber(b)(n.left)) return Option.some(n.right);
  return Option.none();
};

const handTimedCall = (b: Bindings, n: ESTree.CallExpression): Option.Option<string> =>
  Option.flatMap(
    Option.filter(Option.fromUndefinedOr(n.arguments[0]), (a) => a.type !== 'SpreadElement'),
    (first) => handTimedArgs(b, n, first),
  );

const handTimedArgs = (
  b: Bindings,
  n: ESTree.CallExpression,
  first: ESTree.Node,
): Option.Option<string> => {
  const rest = n.arguments.slice(1);
  if (b.callsImport(n, isFilmTime, 'clamp') && n.arguments.length === 1)
    return Option.map(
      Option.filter(scaledByLiteral(b, first), (x) => within(x, isTime(b))),
      () => 'clamp over a literal length',
    );
  if (b.callsImport(n, isFilmTime, 'progress') && isTime(b)(first))
    return Option.map(
      Option.liftPredicate(rest.slice(0, 2), (times) =>
        times.some((x) => x.type !== 'SpreadElement' && (isNumber(b)(x) || literalOffset(b, x))),
      ),
      () => 'progress with a literal start or length',
    );
  if (b.callsImport(n, isFilmTime, 'keys') && isTime(b)(first))
    return Option.some('keys on the scene clock');
  return Option.none();
};

const handTimedRate = (b: Bindings, n: ESTree.Node): boolean =>
  n.type === 'BinaryExpression' &&
  n.operator === '/' &&
  Option.exists(
    scaledByLiteral(b, n),
    (x) => within(x, isTime(b)) && (within(x, isAnchor) || clockOffset(b, x)),
  );

const COMPARE: ReadonlySet<string> = new Set(['<', '<=', '>', '>=']);

const isSecond = (b: Bindings, n: ESTree.Node): boolean =>
  Option.exists(b.numberOf(n), (v) => v !== 0);

const comparedToSecond = (b: Bindings, n: ESTree.BinaryExpression): boolean =>
  COMPARE.has(n.operator) &&
  ((within(n.left, isTime(b)) && isSecond(b, n.right)) ||
    (within(n.right, isTime(b)) && isSecond(b, n.left)));

const reportedAbove = (b: Bindings, n: ESTree.Node): boolean =>
  ancestors(n).some(
    (a) =>
      (a.type === 'CallExpression' && Option.isSome(handTimedCall(b, a))) ||
      (a.type === 'BinaryExpression' && handTimedRate(b, a)),
  );

const stringOf = (p: ESTree.ObjectProperty): Option.Option<string> => {
  if (p.value.type === 'Literal' && Predicate.isString(p.value.value))
    return Option.some(p.value.value);
  return Option.none();
};

const far =
  (b: Bindings) =>
  (p: ESTree.ObjectProperty): boolean =>
    Option.exists(b.numberOf(p.value), (v) => Math.abs(v) > MAX_OFFSET);

const farOffset = (
  b: Bindings,
  n: ESTree.ObjectExpression,
): Option.Option<ESTree.ObjectProperty> => {
  const anchored =
    Option.isSome(Option.flatMap(property(n, 'mark'), stringOf)) ||
    Option.exists(
      Option.flatMap(property(n, 'at'), stringOf),
      (s) => s === 'start' || s === 'speech',
    );
  if (!anchored) return Option.none();
  return Option.filter(property(n, 'offset'), far(b));
};

const untilVoiceEnd = (p: ESTree.ObjectProperty): boolean =>
  p.value.type === 'ObjectExpression' &&
  Option.contains(Option.flatMap(property(p.value, 'at'), stringOf), 'speechEnd');

const farUntilOffset = (
  b: Bindings,
  n: ESTree.ObjectExpression,
): Option.Option<ESTree.ObjectProperty> =>
  Option.flatMap(
    Option.filter(property(n, 'until'), (until) => !untilVoiceEnd(until)),
    () => Option.filter(property(n, 'untilOffset'), far(b)),
  );

const advice =
  "a hand-timed second. Declare a cue in the drawing's timeline and read f.at / f.keys / f.stagger / f.cue, anchored to a mark, a word ({ mark, word }), another cue or the voice's end.";

export const noHandTimedSeconds = Rule.define({
  name: 'no-hand-timed-seconds',
  meta: Rule.meta({
    type: 'problem',
    description:
      'A time in a film is a cue or a mark: a literal second in a draw, or a span offset over 1 s from its mark, is one the lab cannot reach, sound cannot follow and a re-take leaves behind.',
  }),
  create: function* () {
    const context = yield* RuleContext;
    const b = yield* bindings;
    const report = (node: ESTree.Node, what: string) =>
      context.report(Diagnostic.make({ node, message: `${what}: ${advice}` }));
    return Visitor.merge(
      Visitor.on('CallExpression', (node) =>
        Option.match(handTimedCall(b, node), {
          onNone: () => Effect.void,
          onSome: (what) => report(node, what),
        }),
      ),
      Visitor.on('BinaryExpression', (node) => {
        if (comparedToSecond(b, node))
          return report(node, 'the clock compared with a literal second');
        if (handTimedRate(b, node) && !reportedAbove(b, node))
          return report(node, 'a progress over a literal length');
        if (node.operator !== '+' && node.operator !== '-') return Effect.void;
        if (
          node.parent.type === 'BinaryExpression' &&
          (node.parent.operator === '+' || node.parent.operator === '-')
        )
          return Effect.void;
        if (
          !literalOffset(b, node) ||
          !(within(node, isAnchor) || clockOffset(b, node)) ||
          reportedAbove(b, node)
        )
          return Effect.void;
        return report(node, 'a literal offset from a cue edge or mark');
      }),
      Visitor.on('ObjectExpression', (node) =>
        Effect.andThen(
          Option.match(farOffset(b, node), {
            onNone: () => Effect.void,
            onSome: (offset) =>
              report(offset, `an offset over ${MAX_OFFSET} s from its mark or scene landmark`),
          }),
          Option.match(farUntilOffset(b, node), {
            onNone: () => Effect.void,
            onSome: (offset) =>
              report(offset, `an untilOffset over ${MAX_OFFSET} s from its until point`),
          }),
        ),
      ),
    );
  },
});
