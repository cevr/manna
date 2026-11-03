import { Effect } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';

const MESSAGE =
  'a Chrome spawned past openView: open it through openView (packages/film/src/tools/chrome.ts), which mutes its audio whatever flags the caller asks for.';

const reads = (node: ESTree.MemberExpression, name: string): boolean => {
  if (node.computed) return node.property.type === 'Literal' && node.property.value === name;
  return node.property.type === 'Identifier' && node.property.name === name;
};

const isBun = (node: ESTree.Node): boolean =>
  (node.type === 'Identifier' && node.name === 'Bun') ||
  (node.type === 'MemberExpression' &&
    node.object.type === 'Identifier' &&
    node.object.name === 'globalThis' &&
    reads(node, 'Bun'));

const spawnsWebView = (node: ESTree.NewExpression) =>
  node.callee.type === 'MemberExpression' &&
  reads(node.callee, 'WebView') &&
  isBun(node.callee.object);

export const webviewThroughChrome = Rule.define({
  name: 'webview-through-chrome',
  meta: Rule.meta({
    type: 'problem',
    description:
      'A Chrome is spawned by openView alone (src/tools/chrome.ts), which mutes its audio: no other file builds a Bun.WebView.',
  }),
  create: function* () {
    const context = yield* RuleContext;
    return Visitor.on('NewExpression', (node) =>
      Effect.asVoid(
        Effect.when(
          context.report(Diagnostic.make({ node, message: MESSAGE })),
          Effect.succeed(spawnsWebView(node)),
        ),
      ),
    );
  },
});
