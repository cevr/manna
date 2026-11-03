import { Effect, Option, Predicate } from 'effect';
import {
  type Definition,
  type ESTree,
  filename,
  type OxlintSourceCode,
  type RuleContext,
  Scope,
  sourceCode,
  type Variable,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';

export const ancestors = (node: ESTree.Node): ReadonlyArray<ESTree.Node> => {
  const out: Array<ESTree.Node> = [];
  let at = node;
  while (at.type !== 'Program') {
    at = at.parent;
    out.push(at);
  }
  return out;
};

export const collect = <A>(
  type: string,
  extract: (node: ESTree.Node) => Option.Option<A>,
  analyze: (all: ReadonlyArray<A>) => Effect.Effect<void, never, RuleContext>,
) => {
  const all: Array<A> = [];
  return Visitor.merge(
    Visitor.on(type, (node) =>
      Effect.sync(() => {
        Option.map(extract(node), (kept) => all.push(kept));
      }),
    ),
    Visitor.onExit('Program', () => Effect.suspend(() => analyze(all))),
  );
};

export const staticName = (key: ESTree.Node, computed: boolean): Option.Option<string> => {
  if (!computed && key.type === 'Identifier') return Option.some(key.name);
  if (key.type === 'Literal' && Predicate.isString(key.value)) return Option.some(key.value);
  if (computed && key.type === 'TemplateLiteral' && key.expressions.length === 0)
    return Option.fromNullishOr(key.quasis[0]?.value.cooked);
  return Option.none();
};

export const memberName = (node: ESTree.MemberExpression): Option.Option<string> =>
  staticName(node.property, node.computed);

export const keyName = (node: ESTree.Node): Option.Option<string> => {
  if (node.type !== 'Property') return Option.none();
  return staticName(node.key, node.computed);
};

export const unwrapped = (node: ESTree.Node): ESTree.Node => {
  if (
    node.type === 'ParenthesizedExpression' ||
    node.type === 'TSAsExpression' ||
    node.type === 'TSSatisfiesExpression' ||
    node.type === 'TSNonNullExpression' ||
    node.type === 'TSTypeAssertion'
  )
    return unwrapped(node.expression);
  return node;
};

export type Named = ESTree.Node & { readonly name: string };

export type Module = (from: string) => boolean;

interface Source {
  readonly sourceCode: OxlintSourceCode;
  readonly file: string;
}

const resolvedFrom = (file: string, from: string): string => {
  if (!from.startsWith('./') && !from.startsWith('../')) return from;
  const folder = file.split('/').slice(0, -1);
  for (const piece of from.split('/')) {
    if (piece === '..') folder.pop();
    else if (piece !== '.') folder.push(piece);
  }
  return folder.join('/');
};

const definitionIn = (code: Source, id: Named): Option.Option<Definition> =>
  Option.flatMap(Scope.findVariableUp(code.sourceCode.getScope(id), id.name), (v: Variable) =>
    Option.fromUndefinedOr(v.defs[0]),
  );

interface Imported {
  readonly from: string;
  readonly name: string;
}

const importIn = (code: Source, id: Named): Option.Option<Imported> =>
  Option.flatMap(definitionIn(code, id), (def) => {
    const declaration = def.parent;
    if (def.type !== 'ImportBinding' || declaration?.type !== 'ImportDeclaration')
      return Option.none();
    const from = resolvedFrom(code.file, String(declaration.source.value));
    const s = def.node;
    if (s.type === 'ImportNamespaceSpecifier') return Option.some({ from, name: '*' });
    if (s.type === 'ImportDefaultSpecifier') return Option.some({ from, name: 'default' });
    if (s.type !== 'ImportSpecifier') return Option.none();
    return Option.map(staticName(s.imported, false), (name) => ({ from, name }));
  });

const importsAsIn = (code: Source, node: ESTree.Node, from: Module, name: string) => {
  if (node.type !== 'Identifier') return false;
  return Option.exists(importIn(code, node), (i) => from(i.from) && i.name === name);
};

const readsImportIn = (code: Source, node: ESTree.Node, from: Module, name: string) => {
  const n = unwrapped(node);
  if (n.type === 'Identifier') return importsAsIn(code, n, from, name);
  if (n.type !== 'MemberExpression' || !Option.contains(memberName(n), name)) return false;
  return importsAsIn(code, unwrapped(n.object), from, '*');
};

const callsImportIn = (code: Source, node: ESTree.Node, from: Module, name: string) =>
  node.type === 'CallExpression' && readsImportIn(code, node.callee, from, name);

const isGlobalIn = (code: Source, node: ESTree.Node, name: string) =>
  node.type === 'Identifier' && node.name === name && Option.isNone(definitionIn(code, node));

const isConst = (declarator: ESTree.Node): declarator is ESTree.VariableDeclarator =>
  declarator.type === 'VariableDeclarator' &&
  declarator.parent.type === 'VariableDeclaration' &&
  declarator.parent.kind === 'const';

const topLevelConst = (declarator: ESTree.Node): boolean => {
  if (!isConst(declarator)) return false;
  const owner = declarator.parent.parent;
  return (
    owner?.type === 'Program' ||
    (owner?.type === 'ExportNamedDeclaration' && owner.parent.type === 'Program')
  );
};

const topLevelValueIn = (code: Source, id: Named): Option.Option<ESTree.Node> =>
  Option.flatMap(definitionIn(code, id), (def) => {
    const node = def.node;
    if (def.type !== 'Variable' || node.type !== 'VariableDeclarator' || !node.init)
      return Option.none();
    if (node.id.type !== 'Identifier' || !topLevelConst(node)) return Option.none();
    return Option.some(unwrapped(node.init));
  });

const constValueIn = (code: Source, id: Named): Option.Option<ESTree.Node> =>
  Option.flatMap(definitionIn(code, id), (def) => {
    const node = def.node;
    if (def.type !== 'Variable' || !isConst(node) || !node.init) return Option.none();
    if (node.id.type !== 'Identifier') return Option.none();
    return Option.some(node.init);
  });

const signed = (
  n: ESTree.Node,
  read: (x: ESTree.Node) => Option.Option<number>,
): Option.Option<number> => {
  if (n.type !== 'UnaryExpression') return Option.none();
  if (n.operator === '-') return Option.map(read(n.argument), (v) => -v);
  if (n.operator === '+') return read(n.argument);
  return Option.none();
};

const writtenNumber = (n: ESTree.Node): Option.Option<number> => {
  if (n.type === 'Literal' && Predicate.isNumber(n.value)) return Option.some(n.value);
  return signed(n, writtenNumber);
};

export type NumberOf = (n: ESTree.Node) => Option.Option<number>;

export const isCanvas: Module = (from) =>
  from === '@manna/film/canvas' || /(?:^|\/)canvas\/(?:index|film)(?:\.[jt]s)?$/u.test(from);

const FRAME_TAKERS: ReadonlyArray<string> = ['draw', 'light'];

const ALIAS_DEPTH = 8;

const isFrameTypeIn = (code: Source, t: ESTree.Node, depth: number): boolean => {
  if (depth > ALIAS_DEPTH || t.type !== 'TSTypeReference') return false;
  const name = t.typeName;
  if (name.type === 'TSQualifiedName')
    return name.right.name === 'Frame' && importsAsIn(code, name.left, isCanvas, '*');
  if (name.type !== 'Identifier') return false;
  if (importsAsIn(code, name, isCanvas, 'Frame')) return true;
  return Option.exists(
    definitionIn(code, name),
    (def) =>
      def.node.type === 'TSTypeAliasDeclaration' &&
      isFrameTypeIn(code, def.node.typeAnnotation, depth + 1),
  );
};

const annotationOf = (param: ESTree.Node): Option.Option<ESTree.Node> => {
  if (param.type === 'AssignmentPattern') return annotationOf(param.left);
  if (param.type !== 'Identifier' && param.type !== 'ObjectPattern') return Option.none();
  return Option.map(Option.fromNullishOr(param.typeAnnotation), (a) => a.typeAnnotation);
};

const takesFrameOfDrawing = (code: Source, fn: ESTree.Node): boolean => {
  const property = fn.parent;
  if (property?.type !== 'Property' || property.value !== fn) return false;
  if (!Option.exists(keyName(property), (key) => FRAME_TAKERS.includes(key))) return false;
  const spec = property.parent;
  const call = spec.parent;
  return (
    call?.type === 'CallExpression' &&
    call.arguments[0] === spec &&
    callsImportIn(code, call, isCanvas, 'drawing')
  );
};

const isFrameParamIn = (code: Source, fn: ESTree.Node, param: ESTree.Node): boolean =>
  Option.match(annotationOf(param), {
    onSome: (t) => isFrameTypeIn(code, t, 0),
    onNone: () =>
      (fn.type === 'ArrowFunctionExpression' || fn.type === 'FunctionExpression') &&
      fn.params[0] === param &&
      takesFrameOfDrawing(code, fn),
  });

const paramHolding = (fn: ESTree.Node, bound: ESTree.Node): Option.Option<ESTree.Node> => {
  if (
    fn.type !== 'ArrowFunctionExpression' &&
    fn.type !== 'FunctionExpression' &&
    fn.type !== 'FunctionDeclaration'
  )
    return Option.none();
  return Option.fromUndefinedOr(
    fn.params.find((p) => p === bound || (p.type === 'AssignmentPattern' && p.left === bound)),
  );
};

const isFrameIn = (code: Source, node: ESTree.Node, depth: number): boolean => {
  const n = unwrapped(node);
  if (depth > ALIAS_DEPTH || n.type !== 'Identifier') return false;
  return Option.exists(definitionIn(code, n), (def) => {
    if (def.type === 'Parameter')
      return Option.exists(paramHolding(def.node, def.name), (p) =>
        isFrameParamIn(code, def.node, p),
      );
    return Option.exists(constValueIn(code, n), (init) => isFrameIn(code, init, depth + 1));
  });
};

const takenApart = (
  bound: ESTree.Node,
): Option.Option<{ readonly key: string; readonly pattern: ESTree.Node }> => {
  if (bound.parent?.type === 'AssignmentPattern' && bound.parent.left === bound)
    return takenApartAs(bound.parent);
  return takenApartAs(bound);
};

const takenApartAs = (
  holder: ESTree.Node,
): Option.Option<{ readonly key: string; readonly pattern: ESTree.Node }> => {
  const property = holder.parent;
  if (property?.type !== 'Property' || property.value !== holder) return Option.none();
  if (property.parent.type !== 'ObjectPattern') return Option.none();
  return Option.map(keyName(property), (key) => ({ key, pattern: property.parent }));
};

const framePartIn = (code: Source, node: ESTree.Node, depth: number): Option.Option<string> => {
  const n = unwrapped(node);
  if (depth > ALIAS_DEPTH) return Option.none();
  if (n.type === 'MemberExpression')
    return Option.filter(memberName(n), () => isFrameIn(code, n.object, 0));
  if (n.type !== 'Identifier') return Option.none();
  return Option.flatMap(definitionIn(code, n), (def) => {
    if (def.type === 'Parameter')
      return Option.flatMap(takenApart(def.name), ({ key, pattern }) =>
        Option.filter(Option.some(key), () =>
          Option.exists(paramHolding(def.node, pattern), (p) => isFrameParamIn(code, def.node, p)),
        ),
      );
    const declarator = def.node;
    if (def.type !== 'Variable' || !isConst(declarator) || !declarator.init) return Option.none();
    const init = declarator.init;
    if (declarator.id.type === 'Identifier') return framePartIn(code, init, depth + 1);
    return Option.flatMap(takenApart(def.name), ({ key, pattern }) =>
      Option.filter(Option.some(key), () => pattern === declarator.id && isFrameIn(code, init, 0)),
    );
  });
};

const isCueProgressIn = (code: Source, n: ESTree.Node): boolean =>
  n.type === 'CallExpression' && Option.contains(framePartIn(code, n.callee, 0), 'at');

const readsCueIn = (code: Source, x: ESTree.Node): boolean => {
  const n = unwrapped(x);
  if (isCueProgressIn(code, n)) return true;
  if (n.type !== 'Identifier') return false;
  return Option.exists(constValueIn(code, n), (init) => isCueProgressIn(code, unwrapped(init)));
};

const takenFromIn = (
  code: Source,
  id: Named,
): Option.Option<{ readonly key: string; readonly value: ESTree.Node }> =>
  Option.flatMap(definitionIn(code, id), (def) => {
    const declarator = def.node;
    if (def.type !== 'Variable' || !isConst(declarator) || !declarator.init) return Option.none();
    const value = declarator.init;
    return Option.flatMap(
      Option.filter(takenApart(def.name), ({ pattern }) => pattern === declarator.id),
      ({ key }) => Option.some({ key, value }),
    );
  });

const readsOfIn = (code: Source, node: ESTree.Node): ReadonlyArray<ESTree.Node> =>
  code.sourceCode
    .getDeclaredVariables(node)
    .flatMap((v) => v.references)
    .filter((ref) => ref.isRead())
    .map((ref): ESTree.Node => ref.identifier);

const isRunner: Module = (from) => from === 'bun:test' || from === 'effect-bun-test';

const runnerLocalsIn = (code: Source): ReadonlyMap<string, string> =>
  new Map(
    code.sourceCode.ast.body.flatMap((statement) => {
      if (statement.type !== 'ImportDeclaration') return [];
      if (!isRunner(resolvedFrom(code.file, String(statement.source.value)))) return [];
      return statement.specifiers.flatMap((specifier) => {
        if (specifier.type !== 'ImportSpecifier') return [];
        return Option.toArray(
          Option.map(staticName(specifier.imported, false), (name) => [specifier.local.name, name]),
        );
      });
    }),
  );

const once = <A>(make: () => A) => {
  let held: Option.Option<A> = Option.none();
  return (): A =>
    Option.getOrElse(held, () => {
      const made = make();
      held = Option.some(made);
      return made;
    });
};

const isRunnerIn = (
  code: Source,
  locals: () => ReadonlyMap<string, string>,
  node: ESTree.Node,
  name: string,
) =>
  node.type === 'Identifier' &&
  (node.name === name || locals().get(node.name) === name) &&
  (importsAsIn(code, node, isRunner, name) || isGlobalIn(code, node, name));

export interface Bindings {
  readonly definitionOf: (id: Named) => Option.Option<Definition>;
  readonly importOf: (node: ESTree.Node) => Option.Option<Imported>;
  readonly importsAs: (node: ESTree.Node, from: Module, name: string) => boolean;
  readonly readsImport: (node: ESTree.Node, from: Module, name: string) => boolean;
  readonly callsImport: (node: ESTree.Node, from: Module, name: string) => boolean;
  readonly isGlobal: (node: ESTree.Node, name: string) => boolean;
  readonly framePart: (node: ESTree.Node) => Option.Option<string>;
  readonly readsCue: (node: ESTree.Node) => boolean;
  readonly takenFrom: (
    id: Named,
  ) => Option.Option<{ readonly key: string; readonly value: ESTree.Node }>;
  readonly readsOf: (declaration: ESTree.Node) => ReadonlyArray<ESTree.Node>;
  readonly isRunner: (node: ESTree.Node, name: string) => boolean;
  readonly valueOf: (id: Named) => Option.Option<ESTree.Node>;
  readonly numberOf: NumberOf;
  readonly moduleOf: (from: string) => string;
}

const bindingsIn = (code: Source): Bindings => {
  const numberOf: NumberOf = (n) => {
    if (n.type === 'Literal' && Predicate.isNumber(n.value)) return Option.some(n.value);
    if (n.type === 'Identifier') return Option.flatMap(topLevelValueIn(code, n), writtenNumber);
    return signed(n, numberOf);
  };
  const runnerLocals = once(() => runnerLocalsIn(code));
  return {
    definitionOf: (id) => definitionIn(code, id),
    importOf: (node) =>
      Option.flatMap(
        Option.liftPredicate(node, (n): n is ESTree.IdentifierReference => n.type === 'Identifier'),
        (id) => importIn(code, id),
      ),
    importsAs: (node, from, name) => importsAsIn(code, node, from, name),
    readsImport: (node, from, name) => readsImportIn(code, node, from, name),
    callsImport: (node, from, name) => callsImportIn(code, node, from, name),
    isGlobal: (node, name) => isGlobalIn(code, node, name),
    framePart: (node) => framePartIn(code, node, 0),
    readsCue: (node) => readsCueIn(code, node),
    takenFrom: (id) => takenFromIn(code, id),
    readsOf: (declaration) => readsOfIn(code, declaration),
    isRunner: (node, name) => isRunnerIn(code, runnerLocals, node, name),
    valueOf: (id) => topLevelValueIn(code, id),
    numberOf,
    moduleOf: (from) => resolvedFrom(code.file, from),
  };
};

export const bindings: Effect.Effect<Bindings, never, RuleContext> = Effect.map(
  Effect.all([sourceCode, filename]),
  ([code, file]) => bindingsIn({ sourceCode: code, file: file.replaceAll('\\', '/') }),
);

export const definitionOf = (id: Named) => Effect.map(bindings, (b) => b.definitionOf(id));

export const importsAs = (node: ESTree.Node, from: Module, name: string) =>
  Effect.map(bindings, (b) => b.importsAs(node, from, name));

export const isGlobal = (node: ESTree.Node, name: string) =>
  Effect.map(bindings, (b) => b.isGlobal(node, name));

export const isFilmTime: Module = (from) =>
  from === '@manna/film/core' || /(?:^|\/)core\/(?:time|index)(?:\.[jt]s)?$/u.test(from);

export const property = (
  n: ESTree.ObjectExpression,
  key: string,
): Option.Option<ESTree.ObjectProperty> =>
  Option.fromUndefinedOr(
    n.properties.find(
      (p): p is ESTree.ObjectProperty =>
        p.type === 'Property' && !p.computed && p.key.type === 'Identifier' && p.key.name === key,
    ),
  );
