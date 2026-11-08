import { Effect, Option, Predicate } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';

const MESSAGE =
  'a Chrome launched past openView: open it through openView (packages/film/src/tools/chrome.ts), which launches one Chrome per process on puppeteer-core, mutes it and removes its profile, whatever flags the caller asks for.';

/** The package only `tools/chrome.ts` launches Chrome with. */
const PUPPETEER = 'puppeteer-core';

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

/** Whether a module source is `puppeteer-core` or one of its paths, written as a string. */
const namesPuppeteer = (source: ESTree.Node): boolean =>
  source.type === 'Literal' &&
  Predicate.isString(source.value) &&
  (source.value === PUPPETEER || source.value.startsWith(`${PUPPETEER}/`));

/** Whether a call is `require` of `puppeteer-core`. */
const requiresPuppeteer = (node: ESTree.CallExpression): boolean =>
  node.callee.type === 'Identifier' &&
  node.callee.name === 'require' &&
  Option.exists(Option.fromUndefinedOr(node.arguments[0]), namesPuppeteer);

export const chromeThroughOpenView = Rule.define({
  name: 'chrome-through-open-view',
  meta: Rule.meta({
    type: 'problem',
    description:
      'A Chrome is launched by openView alone (src/tools/chrome.ts), which mutes it and removes its profile: no other file builds a Bun.WebView or imports puppeteer-core.',
  }),
  create: function* () {
    const context = yield* RuleContext;
    const refuse = (node: ESTree.Node, refused: boolean) =>
      Effect.asVoid(
        Effect.when(
          context.report(Diagnostic.make({ node, message: MESSAGE })),
          Effect.succeed(refused),
        ),
      );
    return Visitor.merge(
      Visitor.merge(
        Visitor.on('NewExpression', (node) => refuse(node, spawnsWebView(node))),
        Visitor.on('CallExpression', (node) => refuse(node, requiresPuppeteer(node))),
      ),
      Visitor.merge(
        Visitor.on('ImportDeclaration', (node) => refuse(node, namesPuppeteer(node.source))),
        Visitor.on('ImportExpression', (node) => refuse(node, namesPuppeteer(node.source))),
      ),
    );
  },
});
