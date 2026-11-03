import { Effect, Option, Predicate, Schema } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import { definitionOf, isGlobal, memberName, type Named } from './nodes.ts';

const URL = "use @manna/url-state's Location";
const KEYS = 'use Keys.listen (packages/film/src/browser/keys.ts)';
const DRAG = 'use Pointer.press (packages/film/src/browser/pointer.ts)';

const THROUGH: ReadonlyMap<string, string> = new Map([
  ['popstate', URL],
  ['hashchange', URL],
  ['keydown', KEYS],
  ['keyup', KEYS],
  ['pointermove', DRAG],
  ['pointerup', DRAG],
  ['pointercancel', DRAG],
  ['lostpointercapture', DRAG],
]);

const ENDS_A_PRESS = new Set(['pointerup', 'pointercancel', 'lostpointercapture']);

const CAPTURES = new Set(['setPointerCapture', 'releasePointerCapture']);

const HOSTS = new Set(['window', 'document', 'globalThis', 'self']);

const HOPS = new Set([
  'window',
  'self',
  'globalThis',
  'top',
  'parent',
  'frames',
  'document',
  'body',
  'documentElement',
]);

const Options = Schema.UndefinedOr(
  Schema.Struct({ allow: Schema.optionalKey(Schema.Array(Schema.String)) }),
);

type Events = Option.Option<ReadonlyArray<string>>;

const receiverText = (node: ESTree.Node): string => {
  if (node.type === 'Identifier') return node.name;
  if (node.type !== 'MemberExpression') return 'an element';
  return Option.match(memberName(node), {
    onNone: () => 'an element',
    onSome: (name) => `${receiverText(node.object)}.${name}`,
  });
};

const whoOf = (receiver: Option.Option<ESTree.Node>) => (name: string) =>
  Option.match(receiver, {
    onNone: () => name,
    onSome: (r) => `${receiverText(r)}.${name}`,
  });

const binding = (id: Named) =>
  Effect.map(
    definitionOf(id),
    Option.map((def) => def.node),
  );

const constInit = (node: ESTree.Node): Option.Option<ESTree.Node> => {
  if (node.type !== 'VariableDeclarator' || node.parent.type !== 'VariableDeclaration')
    return Option.none();
  if (node.parent.kind !== 'const') return Option.none();
  return Option.fromNullOr(node.init);
};

const writtenString = (node: ESTree.Node): Option.Option<string> => {
  if (node.type === 'Literal' && Predicate.isString(node.value)) return Option.some(node.value);
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0)
    return Option.fromNullishOr(node.quasis[0]?.value.cooked);
  return Option.none();
};

const stringsOf = (node: ESTree.Node): Events => {
  if (node.type !== 'ArrayExpression') return Option.none();
  const out: Array<string> = [];
  for (const element of node.elements) {
    const text = Option.flatMap(Option.fromNullOr(element), writtenString);
    if (Option.isNone(text)) return Option.none();
    out.push(text.value);
  }
  return Option.some(out);
};

const loopedOver = (declarator: ESTree.Node): Option.Option<Events> =>
  Option.flatMap(Option.fromNullOr(declarator.parent), (declaration) =>
    Option.flatMap(Option.fromNullOr(declaration.parent), (loop) => {
      if (loop.type !== 'ForOfStatement' || loop.left !== declaration) return Option.none();
      return Option.some(stringsOf(loop.right));
    }),
  );

const eventsNamed = (node: ESTree.Node): Effect.Effect<Events, never, RuleContext> => {
  const written = writtenString(node);
  if (Option.isSome(written)) return Effect.succeedSome([written.value]);
  if (node.type !== 'Identifier') return Effect.succeedNone;
  return Effect.flatMap(binding(node), (declarator) =>
    Option.match(declarator, {
      onNone: () => Effect.succeedNone,
      onSome: (d) =>
        Option.match(loopedOver(d), {
          onSome: Effect.succeed,
          onNone: () =>
            Option.match(constInit(d), {
              onNone: () => Effect.succeedNone,
              onSome: eventsNamed,
            }),
        }),
    }),
  );
};

const isHost = (node: ESTree.Node): Effect.Effect<boolean, never, RuleContext> => {
  if (node.type === 'ChainExpression') return isHost(node.expression);
  if (node.type === 'MemberExpression')
    return Option.match(memberName(node), {
      onNone: () => Effect.succeed(false),
      onSome: (name) => {
        if (name === 'defaultView') return Effect.succeed(true);
        if (!HOPS.has(name)) return Effect.succeed(false);
        return isHost(node.object);
      },
    });
  if (node.type !== 'Identifier') return Effect.succeed(false);
  return Effect.flatMap(binding(node), (declarator) =>
    Option.match(declarator, {
      onNone: () => Effect.succeed(HOSTS.has(node.name)),
      onSome: (d) =>
        Option.match(constInit(d), { onNone: () => Effect.succeed(false), onSome: isHost }),
    }),
  );
};

const onHost = (receiver: Option.Option<ESTree.Node>) =>
  Option.match(receiver, { onNone: () => Effect.succeed(true), onSome: isHost });

interface Listening {
  readonly receiver: Option.Option<ESTree.Node>;
  readonly events: Effect.Effect<Events, never, RuleContext>;
  readonly spelled: (event: string) => string;
  readonly unread: string;
}

const listenRefusal = (listening: Listening, allowed: ReadonlySet<string>) =>
  Effect.gen(function* () {
    const host = yield* onHost(listening.receiver);
    const events = yield* listening.events;
    if (Option.isNone(events)) {
      if (!host) return Option.none<string>();
      return Option.some(
        `${listening.unread} hears the host with an event this rule cannot read, so it may be one an adapter owns: write the event out, and hear navigation, keys and drags through Location, Keys or Pointer.`,
      );
    }
    const refused = events.value.filter(
      (event) => !allowed.has(event) && THROUGH.has(event) && (host || ENDS_A_PRESS.has(event)),
    );
    return Option.flatMap(Option.fromUndefinedOr(refused[0]), (event) =>
      Option.map(Option.fromUndefinedOr(THROUGH.get(event)), (advice) => {
        if (host) return `${listening.spelled(event)} hears the host directly: ${advice}.`;
        return `${listening.spelled(event)} ends a press outside its owner: ${advice}.`;
      }),
    );
  });

const borrowed = (callee: ESTree.MemberExpression): Option.Option<string> => {
  if (!Option.exists(memberName(callee), (m) => m === 'call' || m === 'apply'))
    return Option.none();
  if (callee.object.type !== 'MemberExpression') return Option.none();
  return memberName(callee.object);
};

interface Called {
  readonly method: string;
  readonly receiver: Option.Option<ESTree.Node>;
  readonly first: Option.Option<ESTree.Node>;
}

const applied = (node: Option.Option<ESTree.Node>): Option.Option<ESTree.Node> =>
  Option.flatMap(node, (array) => {
    if (array.type !== 'ArrayExpression') return Option.none();
    return Option.fromNullishOr(array.elements[0]);
  });

const calledAs = (call: ESTree.CallExpression): Option.Option<Called> => {
  const callee = call.callee;
  const args = call.arguments;
  if (callee.type === 'Identifier')
    return Option.some({
      method: callee.name,
      receiver: Option.none(),
      first: Option.fromUndefinedOr(args[0]),
    });
  if (callee.type !== 'MemberExpression') return Option.none();
  return Option.match(borrowed(callee), {
    onNone: () =>
      Option.map(memberName(callee), (method): Called => ({
        method,
        receiver: Option.some(callee.object),
        first: Option.fromUndefinedOr(args[0]),
      })),
    onSome: (method) => {
      if (Option.contains(memberName(callee), 'apply'))
        return Option.some({
          method,
          receiver: Option.fromUndefinedOr(args[0]),
          first: applied(Option.fromUndefinedOr(args[1])),
        });
      return Option.some({
        method,
        receiver: Option.fromUndefinedOr(args[0]),
        first: Option.fromUndefinedOr(args[1]),
      });
    },
  });
};

const callRefusal = (call: ESTree.CallExpression, allowed: ReadonlySet<string>) =>
  Effect.gen(function* () {
    const called = calledAs(call);
    if (Option.isNone(called)) return Option.none<string>();
    const { method, receiver, first } = called.value;
    const who = whoOf(receiver);
    if (CAPTURES.has(method) && Option.isSome(receiver))
      return Option.some(`${who(method)} holds a press outside its owner: ${DRAG}.`);
    if (method !== 'addEventListener') return Option.none<string>();
    if (Option.isNone(receiver) && !(yield* isGlobal(call.callee, method)))
      return Option.none<string>();
    return yield* listenRefusal(
      {
        receiver,
        events: Option.match(first, {
          onNone: () => Effect.succeedNone,
          onSome: eventsNamed,
        }),
        spelled: (event) => `${who('addEventListener')}('${event}')`,
        unread: who('addEventListener'),
      },
      allowed,
    );
  });

const assignedName = (left: ESTree.Node): Option.Option<string> => {
  if (left.type === 'Identifier') return Option.some(left.name);
  if (left.type === 'MemberExpression') return memberName(left);
  return Option.none();
};

const targetOf = (left: ESTree.Node): Option.Option<ESTree.Node> => {
  if (left.type === 'MemberExpression') return Option.some(left.object);
  return Option.none();
};

const handlerRefusal = (assign: ESTree.AssignmentExpression, allowed: ReadonlySet<string>) =>
  Effect.gen(function* () {
    const left = assign.left;
    const event = Option.flatMap(assignedName(left), (n) =>
      Option.fromNullishOr(/^on([a-z]+)$/.exec(n)?.[1]),
    );
    if (Option.isNone(event) || !THROUGH.has(event.value)) return Option.none<string>();
    if (left.type === 'Identifier' && !(yield* isGlobal(left, left.name)))
      return Option.none<string>();
    const receiver = targetOf(left);
    const who = whoOf(receiver);
    return yield* listenRefusal(
      {
        receiver,
        events: Effect.succeedSome([event.value]),
        spelled: (e) => who(`on${e}`),
        unread: who(`on${event.value}`),
      },
      allowed,
    );
  });

const jsxEvent = (name: ESTree.JSXAttribute['name']): Option.Option<string> => {
  if (name.type === 'JSXNamespacedName')
    return Option.liftPredicate(name.name.name, () => name.namespace.name === 'on');
  return Option.fromNullishOr(/^on([A-Za-z]+)$/.exec(name.name)?.[1]);
};

const jsxRefusal = (attr: ESTree.JSXAttribute, allowed: ReadonlySet<string>) =>
  Option.map(
    Option.filter(
      Option.map(jsxEvent(attr.name), (e) => e.toLowerCase()),
      (event) => ENDS_A_PRESS.has(event) && !allowed.has(event),
    ),
    (event) => `a JSX handler for '${event}' ends a press outside its owner: ${DRAG}.`,
  );

export const hostEventsThroughAdapter = Rule.define({
  name: 'host-events-through-adapter',
  meta: Rule.meta({
    type: 'problem',
    description:
      'A page hears navigation, key and drag events through its adapter (Location, Keys, Pointer), never by its own listener on the window or the document, and a press is held and ended by Pointer.press alone.',
    schema: [
      {
        type: 'object',
        properties: { allow: { type: 'array', items: { type: 'string' } } },
        additionalProperties: false,
      },
    ],
  }),
  options: Options,
  create: function* (options) {
    const context = yield* RuleContext;
    const allowed = new Set(options?.allow ?? []);
    const report = (node: ESTree.Node) => (refusal: Option.Option<string>) =>
      Option.match(refusal, {
        onNone: () => Effect.void,
        onSome: (message) => context.report(Diagnostic.make({ node, message })),
      });
    return Visitor.merge(
      Visitor.on('CallExpression', (call) =>
        Effect.flatMap(callRefusal(call, allowed), report(call)),
      ),
      Visitor.on('AssignmentExpression', (assign) =>
        Effect.flatMap(handlerRefusal(assign, allowed), report(assign)),
      ),
      Visitor.on('JSXAttribute', (attr) => report(attr)(jsxRefusal(attr, allowed))),
    );
  },
});
