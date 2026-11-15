/* oxlint-disable effect/noNodeBuiltinImport, effect/noNullish -- the rules read the app's sources as paths and text, synchronously, and an absent parser node or a value no source spells is nullish. */

/**
 * Home's foot as the screen draws it: every test id and every label of the
 * nodes `src/field/screen.tsx` puts in its scroll view after the furrows,
 * read from the sources through each component they render, so a node
 * added under the lists is in the foot with no list to keep. What it
 * cannot read there it names (`unread`), so a form it does not know fails
 * loudly instead of leaving the foot short.
 */

import { dirname, join } from 'node:path';
import type { Source } from '@manna/sim/check';
import { Predicate } from 'effect';
import {
  type ArrowFunctionExpression,
  type Expression,
  type Function as FunctionNode,
  type JSXElement,
  type JSXFragment,
  type JSXOpeningElement,
  type Node,
  parseSync,
  type Program,
  visitorKeys,
} from 'oxc-parser';

/** Home's foot: test ids as spelled, labels folded, and each piece under the lists it could not read, as `<file>: <source>`. */
export interface Foot {
  readonly ids: ReadonlySet<string>;
  readonly labels: ReadonlySet<string>;
  readonly unread: ReadonlyArray<string>;
}

/** The screen whose scroll view holds the foot, its function, and the element its foot follows. */
const SCREEN = 'src/field/screen.tsx';
const SCREEN_FUNCTION = 'FieldScreen';
const AFTER = 'Furrows';

/** The attributes whose string names a node: its test id, and its label. */
const ID_ATTRIBUTES: ReadonlySet<string> = new Set(['testID']);
const LABEL_ATTRIBUTES: ReadonlySet<string> = new Set(['aria-label', 'accessibilityLabel']);

/** A value a source spells as a constant: a string, a number, an array or an object of them. */
type Value = string | number | ReadonlyArray<Value> | ReadonlyMap<string, Value>;

type Component = FunctionNode | ArrowFunctionExpression;

/** One module of the app: its text, its constants, its functions, what it imports and what it passes on, by name. */
interface Module {
  readonly path: string;
  readonly text: string;
  readonly consts: Map<string, Expression>;
  readonly functions: Map<string, Component>;
  readonly imports: Map<string, { readonly from: string; readonly name: string }>;
  readonly reexports: Array<{ readonly from: string; readonly names: ReadonlySet<string> | 'all' }>;
}

const isNode = (value: unknown): value is Node =>
  Predicate.hasProperty(value, 'type') && Predicate.isString(value.type);

/** A node's child nodes, by the parser's own keys. */
const childrenOf = (node: Node): ReadonlyArray<Node> =>
  (visitorKeys[node.type] ?? []).flatMap((key) => {
    const value: unknown = Reflect.get(node, key);
    if (Array.isArray(value)) return value.filter(isNode);
    if (isNode(value)) return [value];
    return [];
  });

/** A module export's name, whatever node spells it. */
const exportName = (node: Node): string => {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'Literal' && Predicate.isString(node.value)) return node.value;
  return '';
};

/** Each `const <name> = <init>` of `node`, a function by its name in `functions`, any other in `consts`. */
const readDeclaration = (
  consts: Map<string, Expression>,
  functions: Map<string, Component>,
  node: Node | null,
) => {
  if (node?.type === 'FunctionDeclaration' && node.id !== null) functions.set(node.id.name, node);
  if (node?.type !== 'VariableDeclaration') return;
  for (const each of node.declarations) {
    if (each.id.type !== 'Identifier' || each.init === null) continue;
    const init = each.init;
    if (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')
      functions.set(each.id.name, init);
    else consts.set(each.id.name, init);
  }
};

const readStatement = (module: Module, top: Program['body'][number]) => {
  if (top.type === 'ImportDeclaration')
    for (const each of top.specifiers)
      if (each.type === 'ImportSpecifier')
        module.imports.set(each.local.name, {
          from: top.source.value,
          name: exportName(each.imported),
        });
  if (top.type === 'ExportAllDeclaration')
    module.reexports.push({ from: top.source.value, names: 'all' });
  if (top.type === 'ExportNamedDeclaration' && top.source !== null)
    module.reexports.push({
      from: top.source.value,
      names: new Set(top.specifiers.map((each) => exportName(each.exported))),
    });
  if (top.type === 'ExportNamedDeclaration')
    readDeclaration(module.consts, module.functions, top.declaration);
  else if (isNode(top)) readDeclaration(module.consts, module.functions, top);
};

const readModule = (path: string, text: string): Module => {
  const module: Module = {
    path,
    text,
    consts: new Map(),
    functions: new Map(),
    imports: new Map(),
    reexports: [],
  };
  for (const top of parseSync(path, text, { sourceType: 'module' }).program.body)
    readStatement(module, top);
  return module;
};

/** The app's modules by path, each parsed when first asked for, and a module's import resolved to one. */
interface Modules {
  readonly at: (path: string) => Module | undefined;
  readonly resolve: (from: Module, specifier: string) => Module | undefined;
}

const modulesOf = (sources: ReadonlyArray<Source>): Modules => {
  const texts = new Map(sources);
  const parsed = new Map<string, Module>();
  const at = (path: string) => {
    const text = texts.get(path);
    if (parsed.has(path) || text === undefined) return parsed.get(path);
    const module = readModule(path, text);
    parsed.set(path, module);
    return module;
  };
  const resolve = (from: Module, specifier: string) => {
    if (!specifier.startsWith('.')) return undefined;
    const base = join(dirname(from.path), specifier);
    const path = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find(
      (one) => texts.has(one),
    );
    if (path === undefined) return undefined;
    return at(path);
  };
  return { at, resolve };
};

/** What a name is in a module: a constant's expression or a function, with the module that declares it. */
type Binding =
  | { readonly kind: 'const'; readonly module: Module; readonly node: Expression }
  | { readonly kind: 'function'; readonly module: Module; readonly node: Component };

const passedOn = (modules: Modules, module: Module, name: string, seen: ReadonlySet<string>) => {
  for (const reexport of module.reexports) {
    if (reexport.names !== 'all' && !reexport.names.has(name)) continue;
    const target = modules.resolve(module, reexport.from);
    const found = target && bindingOf(modules, target, name, seen);
    if (found !== undefined) return found;
  }
  return undefined;
};

const bindingOf = (
  modules: Modules,
  module: Module,
  name: string,
  seen: ReadonlySet<string> = new Set(),
): Binding | undefined => {
  const key = `${module.path}#${name}`;
  if (seen.has(key)) return undefined;
  const next = new Set([...seen, key]);
  const fn = module.functions.get(name);
  if (fn !== undefined) return { kind: 'function', module, node: fn };
  const init = module.consts.get(name);
  if (init !== undefined) return { kind: 'const', module, node: init };
  const imported = module.imports.get(name);
  if (imported === undefined) return passedOn(modules, module, name, next);
  const target = modules.resolve(module, imported.from);
  if (target === undefined) return undefined;
  return bindingOf(modules, target, imported.name, next);
};

/** What a prop renders when its component draws it: the caller's expression (or children), drawn in the caller's scope. */
type Deferred = (into: Gathered) => void;

/**
 * Where a walk stands: its module, the values its names hold (a
 * component's props, a map's item), the props it can only draw
 * (`deferred`: a node passed in, its children), the consts of the
 * function body it is in, and the props its component takes that this
 * call does not pass (`absent`).
 */
interface Scope {
  readonly modules: Modules;
  readonly module: Module;
  readonly env: ReadonlyMap<string, Value>;
  readonly deferred: ReadonlyMap<string, Deferred>;
  readonly locals: ReadonlyMap<string, Expression>;
  readonly absent: ReadonlySet<string>;
}

/** The foot gathered so far, what could not be read, and the component calls already walked. */
interface Gathered {
  readonly ids: Set<string>;
  readonly labels: Set<string>;
  readonly unread: Array<string>;
  readonly walked: Set<string>;
}

const isScalar = (value: Value | undefined): value is string | number =>
  Predicate.isString(value) || Predicate.isNumber(value);

const templateOf = (scope: Scope, node: Extract<Expression, { type: 'TemplateLiteral' }>) => {
  const holes = node.expressions.map((each) => valueOf(scope, each));
  if (!holes.every(isScalar)) return undefined;
  return node.quasis.map((quasi, at) => `${quasi.value.cooked ?? ''}${holes[at] ?? ''}`).join('');
};

const namedOf = (scope: Scope, name: string): Value | undefined => {
  if (scope.env.has(name)) return scope.env.get(name);
  const local = scope.locals.get(name);
  if (local !== undefined) return valueOf({ ...scope, locals: new Map() }, local);
  const binding = bindingOf(scope.modules, scope.module, name);
  if (binding?.kind !== 'const') return undefined;
  return valueOf(
    {
      ...scope,
      module: binding.module,
      env: new Map(),
      deferred: new Map(),
      locals: new Map(),
      absent: new Set(),
    },
    binding.node,
  );
};

const arrayOf = (scope: Scope, node: Extract<Expression, { type: 'ArrayExpression' }>) => {
  const items: Array<Value> = [];
  for (const each of node.elements) {
    if (each === null || each.type === 'SpreadElement') return undefined;
    const item = valueOf(scope, each);
    if (item === undefined) return undefined;
    items.push(item);
  }
  return items;
};

const objectOf = (scope: Scope, node: Extract<Expression, { type: 'ObjectExpression' }>) => {
  const out = new Map<string, Value>();
  for (const property of node.properties) {
    if (property.type !== 'Property') return undefined;
    let key: Value | undefined = valueOf(scope, property.key);
    if (property.key.type === 'Identifier') key = property.key.name;
    const value = valueOf(scope, property.value);
    if (!isScalar(key) || value === undefined) return undefined;
    out.set(String(key), value);
  }
  return out;
};

const memberOf = (scope: Scope, node: Extract<Expression, { type: 'MemberExpression' }>) => {
  const object = valueOf(scope, node.object);
  let key: Value | undefined;
  if (node.computed) key = valueOf(scope, node.property);
  else if (node.property.type === 'Identifier') key = node.property.name;
  if (!isScalar(key)) return undefined;
  if (object instanceof Map) return object.get(String(key));
  if (Array.isArray(object)) return object.at(Number(key));
  return undefined;
};

/** The constant `node` spells in `scope`, through its names, templates, arrays, objects and members; none for anything else. */
const valueOf = (scope: Scope, node: Node): Value | undefined => {
  switch (node.type) {
    case 'Literal':
      if (Predicate.isString(node.value) || Predicate.isNumber(node.value)) return node.value;
      return undefined;
    case 'TemplateLiteral':
      return templateOf(scope, node);
    case 'Identifier':
      return namedOf(scope, node.name);
    case 'ArrayExpression':
      return arrayOf(scope, node);
    case 'ObjectExpression':
      return objectOf(scope, node);
    case 'MemberExpression':
      return memberOf(scope, node);
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
    case 'ParenthesizedExpression':
      return valueOf(scope, node.expression);
    default:
      return undefined;
  }
};

const addLabel = (into: Gathered, value: Value | undefined) => {
  if (!Predicate.isString(value)) return;
  const label = value.trim();
  if (label !== '') into.labels.add(label.toLowerCase());
};

/** `node` as its source spells it, on one line, after its file. */
const unreadAt = (scope: Scope, node: Node, into: Gathered) => {
  const text = scope.module.text.slice(node.start, node.end).replace(/\s+/gu, ' ');
  into.unread.push(`${scope.module.path}: ${text}`);
};

const nameOfElement = (opening: JSXOpeningElement) => {
  if (opening.name.type === 'JSXIdentifier') return opening.name.name;
  return '';
};

/** The props an element passes: each attribute's value where the sources spell it, else what it would draw. */
const propsOf = (scope: Scope, node: JSXElement) => {
  const values = new Map<string, Value>();
  const deferred = new Map<string, Deferred>();
  for (const attribute of node.openingElement.attributes) {
    if (attribute.type !== 'JSXAttribute' || attribute.name.type !== 'JSXIdentifier') continue;
    const name = attribute.name.name;
    let value: Node | null = attribute.value;
    if (value?.type === 'JSXExpressionContainer') value = value.expression;
    if (value === null) continue;
    const got = valueOf(scope, value);
    const drawn = value;
    if (got !== undefined) values.set(name, got);
    else deferred.set(name, (into) => rendered(scope, drawn, into));
  }
  if (node.children.length > 0)
    deferred.set('children', (into) => {
      for (const child of node.children) child_(scope, child, into);
    });
  return { values, deferred };
};

/** The consts a function body declares at its top, by name. */
const localsOf = (fn: Component) => {
  const consts = new Map<string, Expression>();
  if (fn.body?.type !== 'BlockStatement') return consts;
  for (const statement of fn.body.body) readDeclaration(consts, new Map(), statement);
  return consts;
};

/** What a component's body hands back: each `return`'s argument, outside the functions it declares; an arrow's own expression. */
const returnsOf = (fn: Component): ReadonlyArray<Node> => {
  if (fn.body === null) return [];
  if (fn.body.type !== 'BlockStatement') return [fn.body];
  const out: Array<Node> = [];
  const visit = (node: Node) => {
    if (node.type === 'ReturnStatement' && node.argument !== null) out.push(node.argument);
    if (
      node.type === 'ArrowFunctionExpression' ||
      node.type === 'FunctionExpression' ||
      node.type === 'FunctionDeclaration'
    )
      return;
    for (const child of childrenOf(node)) visit(child);
  };
  for (const statement of fn.body.body) visit(statement);
  return out;
};

/** A component's props as its first parameter takes them: destructured by local name, or whole under its name. */
const paramsOf = (fn: Component, values: ReadonlyMap<string, Value>) => {
  const env = new Map<string, Value>();
  const names = new Map<string, string>();
  const [first] = fn.params;
  if (first?.type === 'Identifier') env.set(first.name, values);
  if (first?.type !== 'ObjectPattern') return { env, names };
  for (const property of first.properties) {
    if (property.type !== 'Property' || property.key.type !== 'Identifier') continue;
    let local = property.key.name;
    if (property.value.type === 'Identifier') local = property.value.name;
    names.set(property.key.name, local);
    const value = values.get(property.key.name);
    if (value !== undefined) env.set(local, value);
  }
  return { env, names };
};

/** A component the sources declare, drawn with the props this call passes, once per props. */
const component = (
  scope: Scope,
  node: JSXElement,
  binding: { readonly module: Module; readonly node: Component },
  into: Gathered,
) => {
  const name = nameOfElement(node.openingElement);
  const props = propsOf(scope, node);
  const { env, names } = paramsOf(binding.node, props.values);
  const deferred = new Map<string, Deferred>();
  for (const [prop, draw] of props.deferred) deferred.set(names.get(prop) ?? prop, draw);
  const absent = new Set(
    [...names].flatMap(([prop, local]) => {
      if (props.values.has(prop) || props.deferred.has(prop)) return [];
      return [local];
    }),
  );
  const key = `${binding.module.path}#${name}#${node.start}#${[...env].map(([k, v]) => `${k}=${String(v)}`).join('&')}`;
  if (into.walked.has(key)) return;
  into.walked.add(key);
  const inner: Scope = {
    modules: scope.modules,
    module: binding.module,
    env,
    deferred,
    locals: localsOf(binding.node),
    absent,
  };
  for (const each of returnsOf(binding.node)) rendered(inner, each, into);
};

/** A host element (a lower-case name, or one a package exports): what its attributes name. */
const host = (scope: Scope, node: JSXElement, into: Gathered) => {
  for (const attribute of node.openingElement.attributes) {
    if (attribute.type !== 'JSXAttribute' || attribute.name.type !== 'JSXIdentifier') continue;
    const prop = attribute.name.name;
    const names = ID_ATTRIBUTES.has(prop) || LABEL_ATTRIBUTES.has(prop);
    let expression: Node | null = attribute.value;
    if (expression?.type === 'JSXExpressionContainer') expression = expression.expression;
    if (!names || expression === null) continue;
    const value = valueOf(scope, expression);
    const absent = expression.type === 'Identifier' && scope.absent.has(expression.name);
    if (!Predicate.isString(value) && !absent) unreadAt(scope, attribute, into);
    if (ID_ATTRIBUTES.has(prop) && Predicate.isString(value)) into.ids.add(value);
    if (LABEL_ATTRIBUTES.has(prop)) addLabel(into, value);
  }
};

/** An element: a component the sources declare is drawn through its body, a host names its attributes and draws its children; any other is unread. */
const element = (scope: Scope, node: JSXElement, into: Gathered) => {
  const name = nameOfElement(node.openingElement);
  const binding = bindingOf(scope.modules, scope.module, name);
  if (binding?.kind === 'function') return component(scope, node, binding, into);
  const from = scope.module.imports.get(name)?.from ?? '';
  const isHost = /^[a-z]/u.test(name) || (from !== '' && !from.startsWith('.'));
  if (!isHost) return unreadAt(scope, node.openingElement, into);
  host(scope, node, into);
  for (const child of node.children) child_(scope, child, into);
};

/** A child of an element: its text, an element or fragment, or what its expression draws. */
const child_ = (scope: Scope, node: Node, into: Gathered): void => {
  if (node.type === 'JSXText') return addLabel(into, node.value);
  if (node.type === 'JSXExpressionContainer') {
    if (node.expression.type === 'JSXEmptyExpression') return;
    return rendered(scope, node.expression, into);
  }
  if (node.type === 'JSXElement') return element(scope, node, into);
  if (node.type === 'JSXFragment') return fragment(scope, node, into);
  unreadAt(scope, node, into);
};

const fragment = (scope: Scope, node: JSXFragment, into: Gathered) => {
  for (const child of node.children) child_(scope, child, into);
};

/** A `.map` over a constant array: its callback drawn once per item, the item bound to its parameter; false when it is no such call. */
const mapped = (scope: Scope, node: Extract<Node, { type: 'CallExpression' }>, into: Gathered) => {
  const [fn] = node.arguments;
  if (node.callee.type !== 'MemberExpression' || fn?.type !== 'ArrowFunctionExpression')
    return false;
  if (node.callee.computed || node.callee.property.name !== 'map') return false;
  const items = valueOf(scope, node.callee.object);
  const [param] = fn.params;
  if (!Array.isArray(items) || param?.type !== 'Identifier') return false;
  for (const item of items) {
    const inner: Scope = {
      ...scope,
      env: new Map([...scope.env, [param.name, item]]),
      locals: new Map([...scope.locals, ...localsOf(fn)]),
    };
    for (const each of returnsOf(fn)) rendered(inner, each, into);
  }
  return true;
};

/** An `Option.match(value, { onNone, onSome })`: each case's callback drawn, its parameter unknown; false when it is no such call. */
const matched = (scope: Scope, node: Extract<Node, { type: 'CallExpression' }>, into: Gathered) => {
  const { callee } = node;
  const [, cases] = node.arguments;
  if (callee.type !== 'MemberExpression' || callee.computed || cases?.type !== 'ObjectExpression')
    return false;
  if (callee.object.type !== 'Identifier' || callee.object.name !== 'Option') return false;
  if (callee.property.name !== 'match') return false;
  for (const each of cases.properties) {
    if (each.type !== 'Property') continue;
    const fn = each.value;
    if (fn.type !== 'ArrowFunctionExpression' && fn.type !== 'FunctionExpression')
      unreadAt(scope, fn, into);
    else for (const drawn of returnsOf(fn)) rendered(scope, drawn, into);
  }
  return true;
};

/** A name drawn: a prop passed as a node, a const of the body, else a value the sources spell; unread when none. */
const drawnName = (scope: Scope, node: Extract<Node, { type: 'Identifier' }>, into: Gathered) => {
  const draw = scope.deferred.get(node.name);
  if (draw !== undefined) return draw(into);
  const local = scope.locals.get(node.name);
  if (local !== undefined && valueOf(scope, local) === undefined)
    return rendered(
      { ...scope, locals: new Map([...scope.locals].filter(([name]) => name !== node.name)) },
      local,
      into,
    );
  const value = valueOf(scope, node);
  if (value === undefined) return unreadAt(scope, node, into);
  addLabel(into, value);
};

/**
 * What an expression draws: an element or fragment, either side a
 * condition may draw, a `.map` over a constant array, a name, or a value
 * the sources spell (a string is a label; a number, a boolean or null
 * draws no node). Anything else is unread.
 */
const rendered = (scope: Scope, node: Node, into: Gathered): void => {
  switch (node.type) {
    case 'JSXElement':
      return element(scope, node, into);
    case 'JSXFragment':
      return fragment(scope, node, into);
    case 'LogicalExpression':
      if (node.operator !== '&&') rendered(scope, node.left, into);
      return rendered(scope, node.right, into);
    case 'ConditionalExpression':
      rendered(scope, node.consequent, into);
      return rendered(scope, node.alternate, into);
    case 'ParenthesizedExpression':
      return rendered(scope, node.expression, into);
    case 'Identifier':
      return drawnName(scope, node, into);
    case 'CallExpression':
      if (!mapped(scope, node, into) && !matched(scope, node, into)) unreadAt(scope, node, into);
      return;
    case 'Literal':
      if (!Predicate.isString(node.value)) return;
      return addLabel(into, node.value);
    default: {
      const value = valueOf(scope, node);
      if (value === undefined) return unreadAt(scope, node, into);
      addLabel(into, value);
    }
  }
};

/** The first element named `name` in `node`, depth first. */
const elementIn = (node: Node, name: string): JSXElement | undefined => {
  if (node.type === 'JSXElement' && nameOfElement(node.openingElement) === name) return node;
  for (const child of childrenOf(node)) {
    const found = elementIn(child, name);
    if (found !== undefined) return found;
  }
  return undefined;
};

/**
 * Home's foot over `sources`: every id and label of what `FieldScreen`
 * draws in its `ScrollView` after the child that holds `<Furrows>`, and
 * each piece there it cannot read; one unread entry naming what is gone
 * when the screen, its scroll view or its furrows are.
 */
export const footOf = (sources: ReadonlyArray<Source>): Foot => {
  const modules = modulesOf(sources);
  const into: Gathered = { ids: new Set(), labels: new Set(), unread: [], walked: new Set() };
  const screen = modules.at(SCREEN);
  const fn = screen?.functions.get(SCREEN_FUNCTION);
  const scroll = fn && elementIn(fn, 'ScrollView');
  const after = (scroll?.children ?? []).findIndex(
    (child) => elementIn(child, AFTER) !== undefined,
  );
  if (screen === undefined || fn === undefined || scroll === undefined || after < 0)
    return { ...into, unread: [`${SCREEN}: no ${SCREEN_FUNCTION} ScrollView holding <${AFTER}>`] };
  const scope: Scope = {
    modules,
    module: screen,
    env: new Map(),
    deferred: new Map(),
    locals: localsOf(fn),
    absent: new Set(),
  };
  for (const child of scroll.children.slice(after + 1)) child_(scope, child, into);
  return { ids: into.ids, labels: into.labels, unread: into.unread };
};
