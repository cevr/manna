import { Effect, Option, Predicate } from 'effect';
import { Diagnostic, type ESTree, Rule, RuleContext } from 'oxlint-plugin-effect/rule-bindings';
import {
  definitionOf,
  importsAs,
  isGlobal,
  memberName,
  type Named,
  staticName,
  unwrapped,
} from './nodes.ts';

const MESSAGE =
  "a boolean written as a string by hand: pressed(on) (packages/film/src/lab/pressed.ts) types it 'true' | 'false'.";

const BOOLEAN_STATES: ReadonlyArray<string> = [
  'aria-pressed',
  'aria-selected',
  'aria-checked',
  'aria-expanded',
  'aria-busy',
];

const COMPARISONS: ReadonlyArray<string> = [
  '===',
  '!==',
  '==',
  '!=',
  '<',
  '<=',
  '>',
  '>=',
  'in',
  'instanceof',
];

const SOLID = 'solid-js';

const SOLID_WRAPPERS: ReadonlyArray<string> = ['ParentProps', 'VoidProps', 'FlowProps'];

type Use = 'read' | 'called';

type Seen = ReadonlySet<ESTree.Node>;

type Reads<A = boolean> = Effect.Effect<A, never, RuleContext>;

const yes: Reads = Effect.succeed(true);
const no: Reads = Effect.succeed(false);

const some = (answers: ReadonlyArray<Reads>): Reads =>
  Effect.map(Effect.all(answers), (all) => all.some((a) => a));

const every = (answers: ReadonlyArray<Reads>): Reads =>
  Effect.map(Effect.all(answers), (all) => all.every((a) => a));

const isSolid = (node: ESTree.Node, name: string): Reads =>
  importsAs(node, (from) => from === SOLID, name);

const stringified = (call: ESTree.CallExpression): Reads<Option.Option<ESTree.Node>> => {
  const callee = call.callee;
  const first = Option.fromUndefinedOr(call.arguments[0]);
  if (callee.type !== 'MemberExpression')
    return Effect.map(isGlobal(callee, 'String'), (string) => Option.filter(first, () => string));
  if (Option.contains(memberName(callee), 'toString'))
    return Effect.succeed(Option.liftPredicate(callee.object, () => call.arguments.length === 0));
  if (!Option.contains(memberName(callee), 'stringify')) return Effect.succeedNone;
  return Effect.map(isGlobal(callee.object, 'JSON'), (json) => Option.filter(first, () => json));
};

const writtenByHand = (attr: ESTree.JSXAttribute): Reads<Option.Option<ESTree.Node>> => {
  if (attr.value?.type !== 'JSXExpressionContainer') return Effect.succeedNone;
  const value = attr.value.expression;
  if (value.type === 'CallExpression') return stringified(value);
  if (
    value.type === 'TemplateLiteral' &&
    value.expressions.length === 1 &&
    value.quasis.every((q) => q.value.raw === '')
  )
    return Effect.succeed(Option.fromUndefinedOr(value.expressions[0]));
  return Effect.succeedNone;
};

const isBooleanType = (t: ESTree.Node): boolean => {
  if (t.type === 'TSBooleanKeyword') return true;
  if (t.type === 'TSLiteralType')
    return t.literal.type === 'Literal' && Predicate.isBoolean(t.literal.value);
  if (t.type === 'TSTypePredicate') return !t.asserts;
  if (t.type === 'TSParenthesizedType') return isBooleanType(t.typeAnnotation);
  if (t.type === 'TSUnionType') return t.types.every(isBooleanType);
  return false;
};

const isBooleanReader = (t: ESTree.Node): Reads => {
  if (t.type === 'TSFunctionType')
    return Effect.succeed(isBooleanType(t.returnType.typeAnnotation));
  if (t.type === 'TSParenthesizedType') return isBooleanReader(t.typeAnnotation);
  if (t.type !== 'TSTypeReference') return no;
  if (!Option.exists(Option.fromNullishOr(t.typeArguments?.params[0]), isBooleanType)) return no;
  return isSolid(t.typeName, 'Accessor');
};

const typeGives = (t: ESTree.Node, use: Use): Reads => {
  if (use === 'read') return Effect.succeed(isBooleanType(t));
  return isBooleanReader(t);
};

const TYPE_DEPTH = 6;

type Arguments = ReadonlyMap<ESTree.Node, ESTree.Node>;

const given = (
  declaration: ESTree.Node,
  reference: ESTree.TSTypeReference,
  args: Arguments,
): Arguments => {
  if (
    declaration.type !== 'TSTypeAliasDeclaration' &&
    declaration.type !== 'TSInterfaceDeclaration'
  )
    return args;
  const params = declaration.typeParameters?.params ?? [];
  const written = reference.typeArguments?.params ?? [];
  const out = new Map(args);
  params.forEach((p, i) => Option.map(Option.fromUndefinedOr(written[i]), (w) => out.set(p, w)));
  return out;
};

const membersOf = (
  t: ESTree.Node,
  depth: number,
  args: Arguments,
): Reads<ReadonlyArray<ESTree.Node>> => {
  if (depth > TYPE_DEPTH) return Effect.succeed([]);
  if (t.type === 'TSTypeLiteral') return Effect.succeed(t.members);
  if (t.type === 'TSParenthesizedType') return membersOf(t.typeAnnotation, depth + 1, args);
  if (t.type === 'TSIntersectionType')
    return Effect.map(
      Effect.forEach(t.types, (x) => membersOf(x, depth + 1, args)),
      (all) => all.flat(),
    );
  if (t.type !== 'TSTypeReference' || t.typeName.type !== 'Identifier') return Effect.succeed([]);
  const reference = t;
  const name = t.typeName;
  const first = Option.fromNullishOr(t.typeArguments?.params[0]);
  const ofFirst = Option.match(first, {
    onNone: () => Effect.succeed<ReadonlyArray<ESTree.Node>>([]),
    onSome: (x) => membersOf(x, depth + 1, args),
  });
  return Effect.flatMap(definitionOf(name), (def) => {
    if (Option.isNone(def)) {
      if (name.name === 'Readonly') return ofFirst;
      return Effect.succeed([]);
    }
    const declaration = def.value.node;
    if (declaration.type === 'TSTypeParameter')
      return Option.match(Option.fromUndefinedOr(args.get(declaration)), {
        onNone: () => Effect.succeed([]),
        onSome: (arg) => membersOf(arg, depth + 1, args),
      });
    if (declaration.type === 'TSTypeAliasDeclaration')
      return membersOf(declaration.typeAnnotation, depth + 1, given(declaration, reference, args));
    if (declaration.type === 'TSInterfaceDeclaration') return Effect.succeed(declaration.body.body);
    return Effect.flatMap(
      Effect.forEach(SOLID_WRAPPERS, (w) => isSolid(name, w)),
      (wrappers): Reads<ReadonlyArray<ESTree.Node>> => {
        if (wrappers.some((w) => w)) return ofFirst;
        return Effect.succeed([]);
      },
    );
  });
};

const memberGives = (t: ESTree.Node, name: string, use: Use): Reads =>
  Effect.flatMap(membersOf(t, 0, new Map()), (members) =>
    some(
      members.map((m) => {
        if (m.type === 'TSMethodSignature')
          return Effect.succeed(
            use === 'called' &&
              !m.optional &&
              Option.contains(staticName(m.key, m.computed), name) &&
              Option.exists(Option.fromNullOr(m.returnType), (r) =>
                isBooleanType(r.typeAnnotation),
              ),
          );
        if (
          m.type !== 'TSPropertySignature' ||
          m.optional ||
          !Option.contains(staticName(m.key, m.computed), name)
        )
          return no;
        return Option.match(Option.fromNullOr(m.typeAnnotation), {
          onNone: () => no,
          onSome: (a) => typeGives(a.typeAnnotation, use),
        });
      }),
    ),
  );

const annotated = (name: ESTree.Node): Option.Option<ESTree.Node> => {
  if (name.type !== 'Identifier') return Option.none();
  return Option.map(Option.fromNullishOr(name.typeAnnotation), (a) => a.typeAnnotation);
};

const returnsBoolean = (fn: ESTree.Node, seen: Seen): Reads => {
  if (
    fn.type !== 'ArrowFunctionExpression' &&
    fn.type !== 'FunctionExpression' &&
    fn.type !== 'FunctionDeclaration'
  )
    return no;
  if (fn.returnType) return Effect.succeed(isBooleanType(fn.returnType.typeAnnotation));
  if (fn.type === 'ArrowFunctionExpression' && fn.expression) return isBoolean(fn.body, seen);
  return no;
};

const readerMade = (init: ESTree.Node, seen: Seen): Reads => {
  if (init.type !== 'CallExpression') return no;
  const callee = init.callee;
  return Effect.flatMap(
    Effect.all([isSolid(callee, 'createSignal'), isSolid(callee, 'createMemo')]),
    ([signal, memo]) => {
      if (!signal && !memo) return no;
      if (Option.exists(Option.fromNullishOr(init.typeArguments?.params[0]), isBooleanType))
        return yes;
      return Option.match(Option.fromUndefinedOr(init.arguments[0]), {
        onNone: () => no,
        onSome: (first) => {
          if (signal) return isBoolean(first, seen);
          return returnsBoolean(first, seen);
        },
      });
    },
  );
};

const constGives = (init: ESTree.Node, use: Use, seen: Seen): Reads => {
  if (use === 'read') return isBoolean(init, seen);
  return some([returnsBoolean(init, seen), readerMade(init, seen)]);
};

const bindingGives = (id: Named, use: Use, seen: Seen): Reads =>
  Effect.flatMap(definitionOf(id), (found) => {
    if (Option.isNone(found) || seen.has(found.value.node)) return no;
    const { type, node, name } = found.value;
    const next = new Set([...seen, node]);
    const typed = annotated(name);
    if (Option.isSome(typed)) return typeGives(typed.value, use);
    if (type === 'FunctionName') {
      if (use === 'read') return no;
      return returnsBoolean(node, next);
    }
    if (node.type !== 'VariableDeclarator' || !node.init) return no;
    if (node.parent.type !== 'VariableDeclaration' || node.parent.kind !== 'const') return no;
    if (node.id.type === 'ArrayPattern') {
      if (use === 'read' || node.id.elements[0] !== name) return no;
      return readerMade(node.init, next);
    }
    if (node.id.type !== 'Identifier') return no;
    return constGives(node.init, use, next);
  });

const memberGivesBoolean = (member: ESTree.MemberExpression, use: Use): Reads => {
  const object = unwrapped(member.object);
  if (object.type !== 'Identifier') return no;
  return Effect.flatMap(definitionOf(object), (found) =>
    Option.match(
      Option.all([Option.flatMap(found, (d) => annotated(d.name)), memberName(member)]),
      {
        onNone: () => no,
        onSome: ([type, name]) => memberGives(type, name, use),
      },
    ),
  );
};

const calledBoolean = (call: ESTree.CallExpression, seen: Seen): Reads => {
  const { callee } = call;
  if (callee.type === 'Identifier')
    return Effect.flatMap(isGlobal(callee, 'Boolean'), (global) => {
      if (global) return yes;
      return bindingGives(callee, 'called', seen);
    });
  if (callee.type !== 'MemberExpression') return no;
  return memberGivesBoolean(callee, 'called');
};

const isBoolean = (node: ESTree.Node, seen: Seen): Reads => {
  switch (node.type) {
    case 'ParenthesizedExpression':
    case 'TSNonNullExpression':
      return isBoolean(node.expression, seen);
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
    case 'TSTypeAssertion':
      if (isBooleanType(node.typeAnnotation)) return yes;
      return isBoolean(node.expression, seen);
    case 'Literal':
      return Effect.succeed(Predicate.isBoolean(node.value));
    case 'UnaryExpression':
      return Effect.succeed(node.operator === '!');
    case 'BinaryExpression':
      return Effect.succeed(COMPARISONS.includes(node.operator));
    case 'LogicalExpression':
      return every([isBoolean(node.left, seen), isBoolean(node.right, seen)]);
    case 'ConditionalExpression':
      return every([isBoolean(node.consequent, seen), isBoolean(node.alternate, seen)]);
    case 'Identifier':
      return bindingGives(node, 'read', seen);
    case 'MemberExpression':
      return memberGivesBoolean(node, 'read');
    case 'CallExpression':
      return calledBoolean(node, seen);
    default:
      return no;
  }
};

const writesBoolean = (attr: ESTree.JSXAttribute): Reads => {
  if (attr.name.type !== 'JSXIdentifier') return no;
  const name = attr.name.name;
  if (!BOOLEAN_STATES.includes(name) && name !== 'aria-current' && !name.startsWith('data-'))
    return no;
  return Effect.flatMap(writtenByHand(attr), (value) => {
    if (Option.isNone(value)) return no;
    if (BOOLEAN_STATES.includes(name)) return yes;
    return isBoolean(value.value, new Set());
  });
};

export const booleansThroughPressed = Rule.define({
  name: 'booleans-through-pressed',
  meta: Rule.meta({
    type: 'problem',
    description:
      'A boolean a control shows is written by pressed(on), never a template or String(…) by hand.',
  }),
  create: function* () {
    const context = yield* RuleContext;
    return {
      JSXAttribute: (attr: ESTree.JSXAttribute) =>
        Effect.flatMap(writesBoolean(attr), (writes) =>
          Effect.asVoid(
            Effect.when(
              context.report(Diagnostic.make({ node: attr, message: MESSAGE })),
              Effect.succeed(writes),
            ),
          ),
        ),
    };
  },
});
