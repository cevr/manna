import { Effect, Option, Predicate } from 'effect';
import { Diagnostic, type ESTree, Rule, RuleContext } from 'oxlint-plugin-effect/rule-bindings';
import { type Bindings, bindings, memberName } from './nodes.ts';

const KEYS =
  'declare a command with its keys (packages/film/src/command/command.ts), registered with the page hub';
const MENU =
  'open a context menu through @manna/ui ContextMenu over the selection’s commands (packages/film/src/lab/command/)';

const EVENTS: ReadonlyMap<string, string> = new Map([
  ['keydown', KEYS],
  ['keyup', KEYS],
  ['keypress', KEYS],
  ['contextmenu', MENU],
]);

const HOSTS: ReadonlyArray<string> = ['window', 'document', 'globalThis', 'self'];

const isHost = (b: Bindings, target: ESTree.Node): boolean =>
  HOSTS.some((name) => b.isGlobal(target, name));

const attrName = (attr: ESTree.JSXAttribute): string => {
  if (attr.name.type === 'JSXNamespacedName')
    return `${attr.name.namespace.name}:${attr.name.name.name}`;
  return attr.name.name;
};

const handled = (attr: ESTree.JSXAttribute): Option.Option<string> => {
  const lower = attrName(attr).toLowerCase();
  return Option.liftPredicate(
    lower.replace(/^on:?/, ''),
    (event) => lower.startsWith('on') && EVENTS.has(event),
  );
};

const listened = (b: Bindings, call: ESTree.CallExpression): Option.Option<string> => {
  const callee = call.callee;
  const first = call.arguments.at(0);
  if (
    callee.type !== 'MemberExpression' ||
    !Option.contains(memberName(callee), 'addEventListener') ||
    first?.type !== 'Literal' ||
    !Predicate.isString(first.value) ||
    !EVENTS.has(first.value)
  )
    return Option.none();
  const onHost = isHost(b, callee.object);
  return Option.liftPredicate(first.value, (event) => !onHost || event === 'contextmenu');
};

const assigned = (b: Bindings, assign: ESTree.AssignmentExpression): Option.Option<string> => {
  const left = assign.left;
  if (left.type !== 'MemberExpression') return Option.none();
  const event = Option.flatMap(memberName(left), (name) =>
    Option.liftPredicate(name.replace(/^on/, ''), (e) => name.startsWith('on') && EVENTS.has(e)),
  );
  const onHost = isHost(b, left.object);
  return Option.filter(event, (e) => !onHost || e === 'contextmenu');
};

export const keysThroughKeymap = Rule.define({
  name: 'keys-through-keymap',
  meta: Rule.meta({
    type: 'problem',
    description:
      "A page's keys and context menus are its commands', never a key or contextmenu listener of its own.",
  }),
  create: function* () {
    const context = yield* RuleContext;
    const b = yield* bindings;
    const report = (node: ESTree.Node, event: string, form: string) =>
      context.report(
        Diagnostic.make({
          node,
          message: `${form} hears ${event} on its own: ${EVENTS.get(event) ?? KEYS}.`,
        }),
      );
    return {
      JSXAttribute: (attr: ESTree.JSXAttribute) =>
        Option.match(handled(attr), {
          onNone: () => Effect.void,
          onSome: (event) => report(attr, event, 'a JSX handler'),
        }),
      CallExpression: (call: ESTree.CallExpression) =>
        Option.match(listened(b, call), {
          onNone: () => Effect.void,
          onSome: (event) => report(call, event, 'addEventListener'),
        }),
      AssignmentExpression: (assign: ESTree.AssignmentExpression) =>
        Option.match(assigned(b, assign), {
          onNone: () => Effect.void,
          onSome: (event) => report(assign, event, 'a handler property'),
        }),
    };
  },
});
