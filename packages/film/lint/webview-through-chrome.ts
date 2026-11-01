// `film/webview-through-chrome`: every Chrome the film tools and their
// browser tests spawn is silent. It is spawned by `src/tools/chrome.ts` alone
// (`openView`), which adds `--mute-audio` and `--disable-audio-output` to
// whatever flags the caller asks for. So the rule refuses `new Bun.WebView(…)`
// (and `new globalThis.Bun.WebView(…)`) in every other file. Reading a
// `Bun.WebView` member, such as `Bun.WebView.closeAll()`, spawns nothing and
// passes.
//
// The rule is lint, not a unit test, so that oxlint reads every file of the
// package on every gate: a unit test that swept the package would read the
// files of the other test parts, whose edits do not rerun its cached part.

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

/** Whether a member expression reads `name` off its object, as `.name` or `['name']`. */
const reads = (node: ESTree.MemberExpression, name: string): boolean => {
  if (node.computed) return node.property.type === 'Literal' && node.property.value === name;
  return node.property.type === 'Identifier' && node.property.name === name;
};

/** Whether a node is `Bun` or `globalThis.Bun`. */
const isBun = (node: ESTree.Node): boolean =>
  (node.type === 'Identifier' && node.name === 'Bun') ||
  (node.type === 'MemberExpression' &&
    node.object.type === 'Identifier' &&
    node.object.name === 'globalThis' &&
    reads(node, 'Bun'));

/** Whether a `new` builds a `Bun.WebView`. */
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
