import { Effect, Option, Predicate } from 'effect';
import { Diagnostic, type ESTree, Rule, RuleContext } from 'oxlint-plugin-effect/rule-bindings';
import { memberName } from './nodes.ts';

const FOLLOW =
  "name the key as bound now: hubKeys' titled or text (packages/film/src/lab/command/changes.ts)";

const KEY_IN_BRACKETS =
  /\((?:[⌘⇧⌥⌃←→↑↓][^()]*|(?:Esc|Space|Enter|Tab|Home|End)|(?:Ctrl|Shift|Alt)\+[^()]*|[^\s()])\)/u;

const written = (node: ESTree.Node): Option.Option<string> => {
  if (node.type === 'Literal' && Predicate.isString(node.value)) return Option.some(node.value);
  if (node.type === 'TemplateLiteral')
    return Option.some(node.quasis.map((q) => q.value.cooked ?? q.value.raw).join(' '));
  if (node.type === 'JSXExpressionContainer') return written(node.expression);
  return Option.none();
};

const namesAKey = (node: ESTree.Node): boolean =>
  Option.exists(written(node), (text) => KEY_IN_BRACKETS.test(text));

const readsKeymap = (call: ESTree.CallExpression): boolean =>
  call.callee.type === 'MemberExpression' && Option.contains(memberName(call.callee), 'keysOf');

const titleAttr = (attr: ESTree.JSXAttribute): boolean =>
  attr.name.type === 'JSXIdentifier' &&
  attr.name.name === 'title' &&
  Option.exists(Option.fromNullishOr(attr.value), namesAKey);

const titleSet = (assign: ESTree.AssignmentExpression): boolean =>
  assign.left.type === 'MemberExpression' &&
  Option.contains(memberName(assign.left), 'title') &&
  namesAKey(assign.right);

const READ_ONCE = 'keysOf reads the keymap once, so a command registered after it reads as unbound';
const WRITTEN = 'a title written with its key';

export const keysNamedAsBound = Rule.define({
  name: 'keys-named-as-bound',
  meta: Rule.meta({
    type: 'problem',
    description:
      "A control's title names its command's key as bound now, never written or read once.",
  }),
  create: function* () {
    const context = yield* RuleContext;
    const reportIf = <N extends ESTree.Node>(node: N, refused: (n: N) => boolean, what: string) =>
      Option.match(Option.liftPredicate(node, refused), {
        onNone: () => Effect.void,
        onSome: (n) => context.report(Diagnostic.make({ node: n, message: `${what}: ${FOLLOW}.` })),
      });
    return {
      CallExpression: (call: ESTree.CallExpression) => reportIf(call, readsKeymap, READ_ONCE),
      JSXAttribute: (attr: ESTree.JSXAttribute) => reportIf(attr, titleAttr, WRITTEN),
      AssignmentExpression: (assign: ESTree.AssignmentExpression) =>
        reportIf(assign, titleSet, WRITTEN),
    };
  },
});
