import { Effect, Option } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import { ancestors, type Bindings, bindings, memberName, type Module } from './nodes.ts';

const MESSAGE =
  "a fixture the file's cases share, made on first use: the case that asks first builds it inside its time limit, and which case pays moves with their order. Build it as the file loads (const x = await Effect.runPromise(…)), or make it in each case.";

const RUNTIME_MESSAGE =
  "a runtime the file's cases share, made as the file loads: it builds its layer on its first run, inside the time limit of the case that runs on it first. Build what the cases need as the file loads (Layer.buildWithScope into a scope the suite closes), or make the runtime in each case.";

const isEffect: Module = (from) => from === 'effect';
const isEffectModule: Module = (from) => from === 'effect/Effect';
const isRuntimeModule: Module = (from) => from === 'effect/ManagedRuntime';

const makesRuntime = (b: Bindings, call: ESTree.CallExpression) =>
  b.callsImport(call, isRuntimeModule, 'make') ||
  (call.callee.type === 'MemberExpression' &&
    Option.contains(memberName(call.callee), 'make') &&
    b.importsAs(call.callee.object, isEffect, 'ManagedRuntime'));

const heldByName = (call: ESTree.CallExpression) =>
  Option.exists(
    Option.fromNullishOr(call.parent),
    (parent) => parent.type === 'VariableDeclarator' && parent.init === call,
  );

const MEMOS = ['cached', 'cachedWithTTL', 'cachedInvalidateWithTTL'];

const memoNamed = (b: Bindings, node: ESTree.Node): Option.Option<string> => {
  if (node.type === 'MemberExpression')
    return Option.filter(
      memberName(node),
      (name) =>
        MEMOS.includes(name) &&
        (b.importsAs(node.object, isEffect, 'Effect') ||
          b.importsAs(node.object, isEffectModule, '*')),
    );
  return Option.fromNullishOr(MEMOS.find((name) => b.importsAs(node, isEffectModule, name)));
};

const isFunctionModule: Module = (from) => from === 'effect/Function';

const isEffectFunction = (b: Bindings, callee: ESTree.Node, name: string) =>
  b.importsAs(callee, isEffect, name) || b.importsAs(callee, isFunctionModule, name);

const isPipe = (b: Bindings, call: ESTree.CallExpression) =>
  (call.callee.type === 'MemberExpression' && Option.contains(memberName(call.callee), 'pipe')) ||
  isEffectFunction(b, call.callee, 'pipe');

const DEPTH = 4;

const isMaker = (b: Bindings, node: ESTree.Node, depth = 0): boolean => {
  if (depth > DEPTH) return false;
  if (Option.isSome(memoNamed(b, node))) return true;
  if (node.type === 'CallExpression') {
    if (Option.exists(memoNamed(b, node.callee), (name) => name !== 'cached'))
      return node.arguments.length === 1;
    return (
      isEffectFunction(b, node.callee, 'flow') &&
      node.arguments.some((step) => isMaker(b, step, depth + 1))
    );
  }
  if (node.type !== 'Identifier') return false;
  return Option.exists(
    b.definitionOf(node),
    ({ node: declared }) =>
      declared.type === 'VariableDeclarator' &&
      Option.exists(Option.fromNullishOr(declared.init), (init) => isMaker(b, init, depth + 1)),
  );
};

const makesMemo = (b: Bindings, call: ESTree.CallExpression) =>
  Option.match(memoNamed(b, call.callee), {
    onSome: (name) => call.arguments.length >= 1 + Number(name !== 'cached'),
    onNone: () => call.arguments.length >= 1 && isMaker(b, call.callee),
  });

const memosPiped = (b: Bindings, call: ESTree.CallExpression) => {
  if (!isPipe(b, call)) return [];
  if (call.callee.type === 'MemberExpression')
    return call.arguments.filter((step) => isMaker(b, step));
  return call.arguments.slice(1).filter((step) => isMaker(b, step));
};

const rootOf = (n: ESTree.Node): Option.Option<ESTree.Node> => {
  if (n.type === 'Identifier') return Option.some(n);
  if (n.type === 'MemberExpression') return rootOf(n.object);
  if (n.type === 'CallExpression') return rootOf(n.callee);
  return Option.none();
};

const isFunction = (n: ESTree.Node) =>
  n.type === 'ArrowFunctionExpression' ||
  n.type === 'FunctionExpression' ||
  n.type === 'FunctionDeclaration';

const isDescribeBody = (b: Bindings, fn: ESTree.Node) =>
  Option.exists(
    Option.fromNullishOr(fn.parent),
    (call) =>
      call.type === 'CallExpression' &&
      call.arguments.some((argument) => argument === fn) &&
      Option.exists(rootOf(call.callee), (root) => b.isRunner(root, 'describe')),
  );

const runsAtLoad = (b: Bindings, call: ESTree.Node) =>
  ancestors(call).every((n) => !isFunction(n) || isDescribeBody(b, n));

export const noLazyTestFixture = Rule.define({
  name: 'no-lazy-test-fixture',
  meta: Rule.meta({
    type: 'problem',
    description:
      "A test file builds a fixture its cases share as it loads, never on the first case's ask, inside that case's time limit.",
  }),
  create: function* () {
    const context = yield* RuleContext;
    const b = yield* bindings;
    return Visitor.on('CallExpression', (node) =>
      Effect.asVoid(
        Effect.when(
          Effect.forEach(
            [
              ...[node]
                .filter((call) => makesMemo(b, call))
                .map((made) => ({ made, message: MESSAGE })),
              ...memosPiped(b, node).map((made) => ({ made, message: MESSAGE })),
              ...[node]
                .filter((call) => makesRuntime(b, call) && heldByName(call))
                .map((made) => ({ made, message: RUNTIME_MESSAGE })),
            ],
            ({ made, message }) => context.report(Diagnostic.make({ node: made, message })),
            { discard: true },
          ),
          Effect.sync(() => runsAtLoad(b, node)),
        ),
      ),
    );
  },
});
