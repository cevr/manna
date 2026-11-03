import { Effect, Option } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import { type Bindings, bindings, isFilmTime, memberName } from './nodes.ts';

const bare = (n: ESTree.Node): ESTree.Node => {
  if (n.type === 'ParenthesizedExpression') return bare(n.expression);
  return n;
};

const shifted = (b: Bindings, n: ESTree.Node): boolean =>
  n.type === 'BinaryExpression' &&
  n.operator === '-' &&
  Option.isSome(b.numberOf(n.right)) &&
  b.readsCue(bare(n.left));

const scaled = (b: Bindings, n: ESTree.Node): boolean => {
  if (n.type !== 'BinaryExpression') return false;
  const left = bare(n.left);
  const right = bare(n.right);
  if (n.operator === '*' && Option.isSome(b.numberOf(left))) return b.readsCue(right);
  if ((n.operator === '*' || n.operator === '/') && Option.isSome(b.numberOf(right)))
    return b.readsCue(left) || shifted(b, left);
  return false;
};

const remapped = (b: Bindings, n: ESTree.Node): boolean => {
  const e = bare(n);
  if (e.type === 'BinaryExpression' && (e.operator === '+' || e.operator === '-')) {
    if (Option.isSome(b.numberOf(e.right))) return scaled(b, bare(e.left));
    if (e.operator === '+' && Option.isSome(b.numberOf(e.left))) return scaled(b, bare(e.right));
  }
  return scaled(b, e);
};

const STEP = [0.02, 0.98] as const;

const COMPARES: ReadonlySet<string> = new Set(['<', '<=', '>', '>=']);

const inside = (b: Bindings, n: ESTree.Node) =>
  Option.exists(b.numberOf(n), (k) => k > STEP[0] && k < STEP[1]);

const stepped = (b: Bindings, n: ESTree.BinaryExpression): boolean => {
  if (!COMPARES.has(n.operator)) return false;
  const left = bare(n.left);
  const right = bare(n.right);
  if (inside(b, right)) return b.readsCue(left);
  if (inside(b, left)) return b.readsCue(right);
  return false;
};

const WHOLE = 1e-6;

const isTail = (b: Bindings, n: ESTree.Node): boolean => {
  const e = bare(n);
  if (e.type !== 'BinaryExpression' || (e.operator !== '/' && e.operator !== '*')) return false;
  const left = bare(e.left);
  if (left.type !== 'BinaryExpression' || left.operator !== '-') return false;
  const operator = e.operator;
  return Option.exists(Option.all([b.numberOf(left.right), b.numberOf(bare(e.right))]), ([a, k]) =>
    restIsWhole(operator, a, k),
  );
};

const restIsWhole = (operator: '/' | '*', a: number, k: number): boolean => {
  if (operator === '/') return Math.abs(1 - a - k) < WHOLE;
  return Math.abs((1 - a) * k - 1) < WHOLE;
};

const partMessage = (b: Bindings, e: ESTree.Node): string => {
  if (isTail(b, e))
    return "a cue's last part split by a fraction written in the draw: declare it as its own cue that lands on the cue's end ({ after: cue, dur, ends: true }) and read it with f.at, so a drag of the cue carries it.";
  return 'a cue split by a fraction written in the draw: declare the part as its own cue ({ with: cue, dur }, or { after: cue, dur, ends: true } for its last part) and read it with f.at, where the lab can reach it.';
};

const argument = (n: ESTree.CallExpression, i: number): Option.Option<ESTree.Node> =>
  Option.filter(Option.fromUndefinedOr(n.arguments[i]), (a) => a.type !== 'SpreadElement');

const capped = (b: Bindings, n: ESTree.CallExpression): Option.Option<ESTree.Node> => {
  const isOne = (x: ESTree.Node) => Option.contains(b.numberOf(x), 1);
  const callee = n.callee;
  const isMin =
    callee.type === 'MemberExpression' &&
    b.isGlobal(callee.object, 'Math') &&
    Option.contains(memberName(callee), 'min');
  if (!isMin || n.arguments.length !== 2) return Option.none();
  const [first, second] = [argument(n, 0), argument(n, 1)];
  if (Option.exists(first, isOne)) return second;
  if (Option.exists(second, isOne)) return first;
  return Option.none();
};

const clamped = (b: Bindings, n: ESTree.CallExpression): Option.Option<ESTree.Node> => {
  if (b.callsImport(n, isFilmTime, 'clamp')) return argument(n, 0);
  return capped(b, n);
};

export const noCueRemap = Rule.define({
  name: 'no-cue-remap',
  meta: Rule.meta({
    type: 'problem',
    description:
      'A part of a cue is a cue of its own: clamp(f.at(cue) * k) splits it by a fraction the lab cannot reach.',
  }),
  create: function* () {
    const context = yield* RuleContext;
    const b = yield* bindings;
    const report = (node: ESTree.Node, message: string, when: boolean) =>
      Effect.asVoid(
        Effect.when(context.report(Diagnostic.make({ node, message })), Effect.succeed(when)),
      );
    return Visitor.merge(
      Visitor.on('CallExpression', (node) =>
        Option.match(clamped(b, node), {
          onNone: () => Effect.void,
          onSome: (e) => report(node, partMessage(b, e), remapped(b, e)),
        }),
      ),
      Visitor.on('BinaryExpression', (node) =>
        report(
          node,
          "a step part way through a cue, written in the draw: declare the instant as its own cue ({ with: cue, offset, dur: 0 }) and read f.at(instant) > 0, where the lab can reach it and a sound can follow it; an instant the drawing's own shape makes is read from that shape (Math.cos(f.at('flip') * Math.PI) < 0).",
          stepped(b, node),
        ),
      ),
    );
  },
});
