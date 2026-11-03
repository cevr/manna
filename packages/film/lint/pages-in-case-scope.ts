import { Effect, Option } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import { type Bindings, bindings, memberName, type Module } from './nodes.ts';

const MESSAGE =
  "a scope made by hand in a browser test: a step that fails before it is closed keeps its page open, and the process's next touching case dies. Open the page in the case's scope, or in Scope.fork(yield* Effect.scope) to close it early.";

const isEffect: Module = (from) => from === 'effect';
const isScope: Module = (from) => from === 'effect/Scope';

const isScopeModule = (b: Bindings, node: ESTree.Node) =>
  b.readsImport(node, isEffect, 'Scope') || b.importsAs(node, isScope, '*');

const makesScope = (b: Bindings, call: ESTree.CallExpression): boolean => {
  const callee = call.callee;
  return (
    callee.type === 'MemberExpression' &&
    Option.contains(memberName(callee), 'make') &&
    isScopeModule(b, callee.object)
  );
};

export const pagesInCaseScope = Rule.define({
  name: 'pages-in-case-scope',
  meta: Rule.meta({
    type: 'problem',
    description:
      "A browser test opens its pages in the case's scope or a child of it, so a failing step still gives the page back.",
  }),
  create: function* () {
    const context = yield* RuleContext;
    const b = yield* bindings;
    return Visitor.on('CallExpression', (node) =>
      Effect.asVoid(
        Effect.when(
          context.report(Diagnostic.make({ node, message: MESSAGE })),
          Effect.succeed(makesScope(b, node)),
        ),
      ),
    );
  },
});
