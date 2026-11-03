import { Effect, Option } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import { definitionOf, importsAs, keyName, memberName, unwrapped } from './nodes.ts';

const URL_STATE = '@manna/url-state';

const HOST_MODULE = /(?:^|\/)browser\/host\.ts$/u;

const MESSAGE =
  "a history move chosen here: a place's field declares its policy (Place.history, @manna/url-state), and the address bar is written through addressOn (packages/film/src/browser/host.ts).";

type Held = 'location' | 'bar' | 'urlState';

const REFUSED: Readonly<Record<Held, ReadonlyArray<string>>> = {
  location: ['push', 'replace', 'back', 'forward', 'go'],
  bar: ['back', 'forward'],
  urlState: ['navigate'],
};

const MOVES: ReadonlySet<string> = new Set(Object.values(REFUSED).flat());

type Reads<A> = Effect.Effect<A, never, RuleContext>;

type Holds = Reads<Option.Option<Held>>;

const no: Reads<boolean> = Effect.succeed(false);

const some = (answers: ReadonlyArray<Reads<boolean>>): Reads<boolean> =>
  Effect.map(Effect.all(answers), (all) => all.some((a) => a));

const first = (answers: ReadonlyArray<Holds>): Holds =>
  Effect.map(Effect.all(answers), (all) => Option.firstSomeOf(all));

const holds = (held: Held, yes: Reads<boolean>): Holds =>
  Effect.map(yes, (y) => Option.liftPredicate(held, () => y));

const isUrlState = (from: string) => from === URL_STATE;

const readsUrlState = (node: ESTree.Node, name: string): Reads<boolean> => {
  if (node.type === 'Identifier') return importsAs(node, isUrlState, name);
  if (node.type !== 'MemberExpression' || !Option.contains(memberName(node), name)) return no;
  return importsAs(node.object, isUrlState, '*');
};

const isUrlStateTag = (n: ESTree.Node): Reads<boolean> => {
  if (n.type !== 'MemberExpression' || !Option.contains(memberName(n), 'UrlState')) return no;
  return readsUrlState(unwrapped(n.object), 'UrlState');
};

const serviceNamed = (node: ESTree.Node): Holds => {
  const n = unwrapped(node);
  return first([
    holds('location', readsUrlState(n, 'Location')),
    holds('urlState', isUrlStateTag(n)),
  ]);
};

const serviceEffect = (node: ESTree.Node): Holds => {
  const n = unwrapped(node);
  if (
    n.type === 'CallExpression' &&
    n.callee.type === 'MemberExpression' &&
    Option.contains(memberName(n.callee), 'asEffect')
  )
    return serviceNamed(n.callee.object);
  return serviceNamed(n);
};

const yieldsService = (node: ESTree.Node): Holds => {
  if (node.type !== 'YieldExpression' || !node.delegate || !node.argument)
    return Effect.succeedNone;
  return serviceEffect(node.argument);
};

const isContext = (node: ESTree.Node): Reads<boolean> =>
  some([
    importsAs(node, (from) => from === 'effect', 'Context'),
    importsAs(node, (from) => from === 'effect/Context', '*'),
  ]);

const takenFromContext = (node: ESTree.Node): Holds => {
  if (node.type !== 'CallExpression' || node.callee.type !== 'MemberExpression')
    return Effect.succeedNone;
  if (!Option.exists(memberName(node.callee), (m) => m === 'get' || m === 'getUnsafe'))
    return Effect.succeedNone;
  const key = node.arguments[1];
  if (!key) return Effect.succeedNone;
  return Effect.flatMap(isContext(unwrapped(node.callee.object)), (context) => {
    if (!context) return Effect.succeedNone;
    return serviceNamed(key);
  });
};

const makesBar = (node: ESTree.Node): Reads<boolean> => {
  if (node.type !== 'CallExpression') return no;
  return importsAs(unwrapped(node.callee), (from) => HOST_MODULE.test(from), 'addressOn');
};

const usedOn = (callee: ESTree.Node): Holds => {
  if (
    callee.type !== 'MemberExpression' ||
    !Option.exists(memberName(callee), (m) => m === 'use' || m === 'useSync')
  )
    return Effect.succeedNone;
  return serviceNamed(callee.object);
};

const pipedOn = (call: ESTree.Node): Holds => {
  const piped = call.parent;
  if (
    piped?.type !== 'CallExpression' ||
    !piped.arguments.some((a) => a === call) ||
    piped.callee.type !== 'MemberExpression' ||
    !Option.contains(memberName(piped.callee), 'pipe')
  )
    return Effect.succeedNone;
  return serviceEffect(piped.callee.object);
};

const givenService = (fn: ESTree.Node): Holds => {
  const call = fn.parent;
  if (call?.type !== 'CallExpression' || !call.arguments.some((a) => a === fn))
    return Effect.succeedNone;
  const beside = call.arguments.filter((a) => a !== fn).map(serviceEffect);
  return first([usedOn(call.callee), ...beside, pipedOn(call)]);
};

const isParameter = (fn: ESTree.Node, param: ESTree.Node) =>
  (fn.type === 'ArrowFunctionExpression' || fn.type === 'FunctionExpression') &&
  fn.params.some((p) => p === param);

const givenAsParameter = (fn: ESTree.Node, param: ESTree.Node): Holds => {
  if (!isParameter(fn, param)) return Effect.succeedNone;
  return givenService(fn);
};

const heldBy = (receiver: ESTree.Node): Holds => {
  const value = unwrapped(receiver);
  return Effect.flatMap(
    first([yieldsService(value), takenFromContext(value)]),
    Option.match({
      onSome: (service): Holds => Effect.succeedSome(service),
      onNone: () => heldByBarOrBinding(value),
    }),
  );
};

const heldByBarOrBinding = (value: ESTree.Node): Holds =>
  Effect.flatMap(makesBar(value), (bar) => {
    if (bar) return Effect.succeedSome<Held>('bar');
    if (value.type !== 'Identifier') return Effect.succeedNone;
    return Effect.flatMap(definitionOf(value), (def) => {
      if (Option.isNone(def)) return Effect.succeedNone;
      const { type, node, name } = def.value;
      if (type === 'Parameter') return givenAsParameter(node, name);
      if (node.type !== 'VariableDeclarator' || node.id.type !== 'Identifier' || !node.init)
        return Effect.succeedNone;
      return heldBy(node.init);
    });
  });

const destructured = (pattern: ESTree.ObjectPattern): Holds => {
  const owner = pattern.parent;
  if (owner.type === 'VariableDeclarator' && owner.id === pattern && owner.init)
    return heldBy(owner.init);
  return givenAsParameter(owner, pattern);
};

const refusedOn = (held: Holds, name: string): Reads<boolean> =>
  Effect.map(held, (h) => Option.exists(h, (on) => REFUSED[on].includes(name)));

export const historyThroughHost = Rule.define({
  name: 'history-through-host',
  meta: Rule.meta({
    type: 'problem',
    description:
      "A page never chooses a history move: a place's field declares its policy, and the address bar is written in browser/host.ts alone.",
  }),
  create: function* () {
    const context = yield* RuleContext;
    const report = (node: ESTree.Node, chooses: Reads<boolean>) =>
      Effect.flatMap(chooses, (yes) =>
        Effect.asVoid(
          Effect.when(
            context.report(Diagnostic.make({ node, message: MESSAGE })),
            Effect.succeed(yes),
          ),
        ),
      );
    return Visitor.merge(
      Visitor.on('MemberExpression', (member) =>
        Option.match(
          Option.filter(memberName(member), (name) => MOVES.has(name)),
          {
            onNone: () => Effect.void,
            onSome: (name) => report(member, refusedOn(heldBy(member.object), name)),
          },
        ),
      ),
      Visitor.on('ObjectPattern', (pattern) =>
        Effect.forEach(
          pattern.properties.flatMap((p) =>
            Option.toArray(
              Option.map(
                Option.filter(keyName(p), (name) => MOVES.has(name)),
                (name) => [p, name] as const,
              ),
            ),
          ),
          ([p, name]) => report(p, refusedOn(destructured(pattern), name)),
          { discard: true },
        ),
      ),
    );
  },
});
