import { Effect, Option } from 'effect';
import { Diagnostic, type ESTree, Rule, RuleContext } from 'oxlint-plugin-effect/rule-bindings';
import { ancestors, type Bindings, bindings, collect, memberName, type Module } from './nodes.ts';

const isGestures: Module = (from) => /(?:^|\/)fixtures\/gestures(?:\.[jt]s)?$/u.test(from);

const rootOf = (n: ESTree.Node): Option.Option<ESTree.Node> => {
  if (n.type === 'Identifier') return Option.some(n);
  if (n.type === 'MemberExpression') return rootOf(n.object);
  if (n.type === 'CallExpression') return rootOf(n.callee);
  return Option.none();
};

const isFunction = (n: ESTree.Node) =>
  n.type === 'ArrowFunctionExpression' || n.type === 'FunctionExpression';

const isSerialTest = (b: Bindings, n: ESTree.Node) => {
  if (n.type !== 'CallExpression' || n.callee.type !== 'MemberExpression') return false;
  if (!Option.contains(memberName(n.callee), 'serial')) return false;
  const on = n.callee.object;
  if (b.isRunner(on, 'test')) return true;
  return on.type === 'MemberExpression' && !on.computed && b.isRunner(on.object, 'it');
};

const isTest = (b: Bindings, n: ESTree.Node) =>
  n.type === 'CallExpression' &&
  Option.exists(rootOf(n.callee), (root) => b.isRunner(root, 'it') || b.isRunner(root, 'test')) &&
  n.arguments.some(isFunction);

const isFinger = (n: ESTree.Node) =>
  n.type === 'Identifier' &&
  n.name === 'finger' &&
  n.parent.type === 'MemberExpression' &&
  n.parent.property === n &&
  !n.parent.computed;

const isGesture = (b: Bindings, n: ESTree.Node) => {
  if (n.type !== 'Identifier') return false;
  const p = n.parent;
  if (p.type === 'MemberExpression' && p.property === n && !p.computed)
    return b.readsImport(p, isGestures, 'touch');
  return isUse(n) && b.importsAs(n, isGestures, 'touch');
};

const fingerTakenApart = (n: ESTree.Node): Option.Option<Option.Option<ESTree.Node>> => {
  if (n.type !== 'Identifier' || n.name !== 'finger') return Option.none();
  const p = n.parent;
  if (p.type !== 'Property' || p.key !== n || p.computed) return Option.none();
  if (p.parent.type !== 'ObjectPattern') return Option.none();
  return Option.some(boundName(p.value));
};

const boundName = (b: ESTree.Node): Option.Option<ESTree.Node> => {
  if (b.type === 'Identifier') return Option.some(b);
  if (b.type === 'AssignmentPattern') return boundName(b.left);
  return Option.none();
};

const isUse = (n: ESTree.Node) =>
  Option.exists(Option.fromUndefinedOr(ancestors(n).at(0)), (p) => usedIn(n, p));

const usedIn = (n: ESTree.Node, p: ESTree.Node) => {
  if (p.type === 'MemberExpression') return p.object === n || p.computed;
  if (p.type === 'Property' && p.parent.type === 'ObjectPattern') return p.computed && p.key === n;
  if (p.type === 'Property') return p.value === n || p.computed;
  if (p.type === 'VariableDeclarator') return p.init === n;
  return !(
    p.type === 'ImportSpecifier' ||
    p.type === 'ImportDefaultSpecifier' ||
    p.type === 'ImportNamespaceSpecifier' ||
    p.type === 'FunctionDeclaration' ||
    p.type === 'MethodDefinition' ||
    p.type === 'PropertyDefinition'
  );
};

type Host =
  | { readonly _tag: 'Serial' }
  | { readonly _tag: 'Test' }
  | { readonly _tag: 'Declared'; readonly binding: ESTree.Node }
  | { readonly _tag: 'Loose' };

const hostOf = (b: Bindings, n: ESTree.Node): Host => {
  const up = ancestors(n);
  if (up.some((a) => isSerialTest(b, a))) return { _tag: 'Serial' };
  let deferred = false;
  for (const a of up) {
    if (isTest(b, a)) return { _tag: 'Test' };
    if (a.type === 'VariableDeclarator' && a.id.type === 'Identifier' && deferred)
      return { _tag: 'Declared', binding: a.id };
    if (a.type === 'FunctionDeclaration')
      return Option.match(Option.fromNullOr(a.id), {
        onNone: (): Host => ({ _tag: 'Loose' }),
        onSome: (id): Host => ({ _tag: 'Declared', binding: id }),
      });
    if (isFunction(a)) deferred = true;
  }
  return { _tag: 'Loose' };
};

interface Seen {
  readonly node: ESTree.Node;
  readonly used: Option.Option<ESTree.Node>;
  readonly host: Exclude<Host, { readonly _tag: 'Serial' }>;
}

const seen =
  (b: Bindings) =>
  (n: ESTree.Node): Option.Option<Seen> => {
    if (n.type !== 'Identifier') return Option.none();
    const takenApart = fingerTakenApart(n);
    const declares = Option.flatten(takenApart);
    const touch = isFinger(n) || isGesture(b, n) || Option.isSome(takenApart);
    const used = Option.map(
      Option.filter(b.definitionOf(n), () => !touch && isUse(n)),
      (def) => def.name,
    );
    if (!touch && Option.isNone(used)) return Option.none();
    const host = Option.match(declares, {
      onNone: () => hostOf(b, n),
      onSome: (binding): Host => ({ _tag: 'Declared', binding }),
    });
    if (host._tag === 'Serial') return Option.none();
    return Option.some({ node: n, used, host });
  };

const touches = (s: Seen, touching: ReadonlySet<ESTree.Node>) =>
  Option.match(s.used, { onNone: () => true, onSome: (binding) => touching.has(binding) });

const touchingBindings = (all: ReadonlyArray<Seen>) => {
  const touching = new Set<ESTree.Node>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const s of all)
      if (s.host._tag === 'Declared' && !touching.has(s.host.binding) && touches(s, touching)) {
        touching.add(s.host.binding);
        grew = true;
      }
  }
  return touching;
};

const MESSAGE =
  "a touch outside test.serial: while one tab's touches are under way Chrome drops, or lands as a bare click, the touches the file's other cases send their own tabs at the same time. Run this case alone: test.serial, or a runner's .serial form (it.live.serial).";

export const touchesSerial = Rule.define({
  name: 'touches-serial',
  meta: Rule.meta({
    type: 'problem',
    description:
      "A test that sends touches runs alone: Chrome drops a sibling tab's touches, or lands them as bare clicks, while a tab's are under way.",
  }),
  create: function* () {
    const context = yield* RuleContext;
    const b = yield* bindings;
    return collect('Identifier', seen(b), (all) => {
      const touching = touchingBindings(all);
      return Effect.forEach(
        all.filter((s) => s.host._tag !== 'Declared' && touches(s, touching)),
        (s) => context.report(Diagnostic.make({ node: s.node, message: MESSAGE })),
        { discard: true },
      );
    });
  },
});
