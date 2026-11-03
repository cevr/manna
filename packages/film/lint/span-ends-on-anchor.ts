import { Effect, Option, Predicate } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import { bindings, type NumberOf, property } from './nodes.ts';

const SAME = 1e-9;

const endsByHand = (
  numberOf: NumberOf,
  n: ESTree.ObjectExpression,
): Option.Option<ESTree.ObjectProperty> => {
  if (Option.isSome(property(n, 'ends'))) return Option.none();
  const dur = Option.flatMap(property(n, 'dur'), (p) => numberOf(p.value));
  return Option.filter(property(n, 'offset'), (p) =>
    Option.exists(Option.all([numberOf(p.value), dur]), ([o, d]) => d > 0 && o === -d),
  );
};

const stringOf = (n: ESTree.Node): Option.Option<string> => {
  if (n.type === 'Literal' && Predicate.isString(n.value)) return Option.some(n.value);
  return Option.none();
};

const offsetOf = (numberOf: NumberOf, n: ESTree.ObjectExpression): Option.Option<number> =>
  Option.match(property(n, 'offset'), {
    onNone: () => Option.some(0),
    onSome: (p) => numberOf(p.value),
  });

const siblingDur = (
  numberOf: NumberOf,
  span: ESTree.ObjectExpression,
  name: string,
): Option.Option<number> => {
  const entry = span.parent;
  if (entry.type !== 'Property' || entry.parent.type !== 'ObjectExpression') return Option.none();
  return Option.flatMap(property(entry.parent, name), (p) => {
    if (p.value.type !== 'ObjectExpression') return Option.none();
    return Option.flatMap(property(p.value, 'dur'), (d) => numberOf(d.value));
  });
};

const endsWithParent = (
  numberOf: NumberOf,
  n: ESTree.ObjectExpression,
): Option.Option<ESTree.ObjectProperty> => {
  if (Option.isSome(property(n, 'ends')) || Option.isSome(property(n, 'until')))
    return Option.none();
  const parent = Option.flatMap(property(n, 'with'), (p) => stringOf(p.value));
  const length = Option.flatMap(parent, (name) => siblingDur(numberOf, n, name));
  return Option.filter(property(n, 'dur'), (p) =>
    Option.exists(
      Option.all([offsetOf(numberOf, n), numberOf(p.value), length]),
      ([a, b, d]) => d > 0 && Math.abs(a + b - d) < SAME,
    ),
  );
};

export const spanEndsOnAnchor = Rule.define({
  name: 'span-ends-on-anchor',
  meta: Rule.meta({
    type: 'problem',
    description:
      'A span that ends on its anchor, or on the end of the cue it runs with, says so (`ends: true`, `until: { cue }`): its length is written once, so a dur edit or a drag keeps the landing.',
  }),
  create: function* () {
    const context = yield* RuleContext;
    const { numberOf } = yield* bindings;
    const report = (found: Option.Option<ESTree.Node>, message: string) =>
      Option.match(found, {
        onNone: () => Effect.void,
        onSome: (node) => context.report(Diagnostic.make({ node, message })),
      });
    return Visitor.on('ObjectExpression', (node) =>
      Effect.andThen(
        report(
          endsByHand(numberOf, node),
          'a span that ends on its anchor writes its length twice (offset: -d, dur: d): drop the offset and add `ends: true`, so a dur edit keeps the landing.',
        ),
        report(
          endsWithParent(numberOf, node),
          "a part that ends on its parent's end only because its offset and dur add up to the parent's dur: write `{ after: parent, dur, ends: true }` (keeps its length) or `{ with: parent, until: { cue: parent } }` (keeps its start), so a drag of the parent carries it.",
        ),
      ),
    );
  },
});
