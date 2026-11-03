import { Effect, Option } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import { memberName } from './nodes.ts';

const MESSAGE =
  'a focus moved from script past focusFor: call focusFor(el, input) (packages/film/src/lab/focus.ts) with the input that asked, so the ring shows iff a key did.';

const reads = (node: ESTree.Node, name: string): boolean =>
  node.type === 'MemberExpression' && Option.contains(memberName(node), name);

const INDIRECT = ['call', 'apply', 'bind'];

const movesFocus = (call: ESTree.CallExpression): boolean => {
  const callee = call.callee;
  if (callee.type !== 'MemberExpression') return false;
  if (reads(callee, 'focus')) return true;
  return INDIRECT.some((name) => reads(callee, name)) && reads(callee.object, 'focus');
};

export const focusThroughFocusFor = Rule.define({
  name: 'focus-through-focus-for',
  meta: Rule.meta({
    type: 'problem',
    description:
      'A focus moved from script in the lab goes through focusFor, which shows the ring iff a key asked.',
  }),
  create: function* () {
    const context = yield* RuleContext;
    return Visitor.on('CallExpression', (node) =>
      Effect.asVoid(
        Effect.when(
          context.report(Diagnostic.make({ node, message: MESSAGE })),
          Effect.succeed(movesFocus(node)),
        ),
      ),
    );
  },
});
