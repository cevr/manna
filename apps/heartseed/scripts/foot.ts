/* oxlint-disable effect/noNodeBuiltinImport, effect/noNullish -- the rules read the app's sources as paths and text, synchronously, and an absent parser node or a value no source spells is nullish. */

/**
 * Home's foot as the screen draws it: every test id and every label of the
 * nodes `src/field/screen.tsx` puts in its scroll view after the furrows,
 * read from the sources through each component they render, so a node
 * added under the lists is in the foot with no list to keep.
 */

import { dirname, join } from 'node:path';
import type { Source } from '@manna/sim/check';
import { Predicate } from 'effect';
import {
  type Expression,
  type Function as FunctionNode,
  type ArrowFunctionExpression,
  type JSXElement,
  type JSXOpeningElement,
  type Node,
  parseSync,
  type Program,
  visitorKeys,
} from 'oxc-parser';

/** Home's foot: test ids as spelled, labels folded. */
export interface Foot {
  readonly ids: ReadonlySet<string>;
  readonly labels: ReadonlySet<string>;
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

/** One module of the app: its constants, its functions, what it imports and what it passes on, by name. */
interface Module {
  readonly path: string;
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

const readDeclaration = (module: Module, node: Node | null) => {
  if (node?.type === 'FunctionDeclaration' && node.id !== null)
    module.functions.set(node.id.name, node);
  if (node?.type !== 'VariableDeclaration') return;
  for (const each of node.declarations) {
    if (each.id.type !== 'Identifier' || each.init === null) continue;
    const init = each.init;
    if (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')
      module.functions.set(each.id.name, init);
    else module.consts.set(each.id.name, init);
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
  if (top.type === 'ExportNamedDeclaration') readDeclaration(module, top.declaration);
  else if (isNode(top)) readDeclaration(module, top);
};

const readModule = (path: string, text: string): Module => {
  const module: Module = {
    path,
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

/** Where a walk stands: its module, and the values its names hold (a component's props, a map's item). */
interface Scope {
  readonly modules: Modules;
  readonly module: Module;
  readonly env: ReadonlyMap<string, Value>;
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
  const binding = bindingOf(scope.modules, scope.module, name);
  if (binding?.kind !== 'const') return undefined;
  return valueOf({ ...scope, module: binding.module, env: new Map() }, binding.node);
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

/** The props an element passes: each attribute's value where the sources spell it. */
const propsOf = (scope: Scope, opening: JSXOpeningElement) => {
  const props = new Map<string, Value>();
  for (const attribute of opening.attributes) {
    if (attribute.type !== 'JSXAttribute' || attribute.value === null) continue;
    let value: Node = attribute.value;
    if (value.type === 'JSXExpressionContainer') value = value.expression;
    const got = valueOf(scope, value);
    if (got !== undefined && attribute.name.type === 'JSXIdentifier')
      props.set(attribute.name.name, got);
  }
  return props;
};

/** A component's props as its first parameter destructures them, by local name. */
const paramsOf = (fn: Component, props: ReadonlyMap<string, Value>) => {
  const env = new Map<string, Value>();
  const [first] = fn.params;
  if (first?.type !== 'ObjectPattern') return env;
  for (const property of first.properties) {
    if (property.type !== 'Property' || property.key.type !== 'Identifier') continue;
    let local = property.key.name;
    if (property.value.type === 'Identifier') local = property.value.name;
    const value = props.get(property.key.name);
    if (value !== undefined) env.set(local, value);
  }
  return env;
};

/** The foot gathered so far, and the component calls already walked. */
interface Gathered {
  readonly ids: Set<string>;
  readonly labels: Set<string>;
  readonly walked: Set<string>;
}

const addLabel = (into: Gathered, value: Value | undefined) => {
  if (!Predicate.isString(value)) return;
  const label = value.trim();
  if (label !== '') into.labels.add(label.toLowerCase());
};

const nameOfElement = (opening: JSXOpeningElement) => {
  if (opening.name.type === 'JSXIdentifier') return opening.name.name;
  return '';
};

/** An element: a component the sources declare is walked with the props it passes, once per props; any other names what its attributes say. */
const element = (scope: Scope, node: JSXElement, into: Gathered) => {
  const name = nameOfElement(node.openingElement);
  const props = propsOf(scope, node.openingElement);
  const binding = /^[A-Z]/u.test(name) && bindingOf(scope.modules, scope.module, name);
  if (binding && binding.kind === 'function') {
    const env = paramsOf(binding.node, props);
    const key = `${binding.module.path}#${name}#${[...env].map(([k, v]) => `${k}=${String(v)}`).join('&')}`;
    if (into.walked.has(key) || binding.node.body === null) return;
    into.walked.add(key);
    gather({ ...scope, module: binding.module, env }, binding.node.body, into);
    return;
  }
  for (const [prop, value] of props) {
    if (ID_ATTRIBUTES.has(prop) && Predicate.isString(value)) into.ids.add(value);
    if (LABEL_ATTRIBUTES.has(prop)) addLabel(into, value);
  }
};

/** A `.map` over a constant array: its callback's body walked once per item, the item bound to its parameter. */
const mapped = (scope: Scope, node: Extract<Node, { type: 'CallExpression' }>, into: Gathered) => {
  const [fn] = node.arguments;
  if (node.callee.type !== 'MemberExpression' || fn?.type !== 'ArrowFunctionExpression') return;
  if (node.callee.computed || node.callee.property.name !== 'map') return;
  const items = valueOf(scope, node.callee.object);
  const [param] = fn.params;
  if (!Array.isArray(items) || param?.type !== 'Identifier') return;
  for (const item of items)
    gather({ ...scope, env: new Map([...scope.env, [param.name, item]]) }, fn.body, into);
};

/**
 * Gathers every id and label `node` draws in `scope`: a host element's
 * `testID` and label, a text child, a child the sources spell as a string,
 * each component the sources declare through its own body, and a `.map`
 * over a constant array once per item.
 */
const gather = (scope: Scope, node: Node, into: Gathered): void => {
  if (node.type === 'JSXAttribute') {
    const value = node.value;
    if (value?.type === 'JSXExpressionContainer') gather(scope, value.expression, into);
    else if (value !== null && value.type !== 'Literal') gather(scope, value, into);
    return;
  }
  if (node.type === 'JSXText') addLabel(into, node.value);
  if (node.type === 'JSXExpressionContainer') addLabel(into, valueOf(scope, node.expression));
  if (node.type === 'JSXElement') element(scope, node, into);
  if (node.type === 'CallExpression') mapped(scope, node, into);
  for (const child of childrenOf(node)) gather(scope, child, into);
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
 * draws in its `ScrollView` after the child that holds `<Furrows>`; none
 * when the screen, its scroll view or its furrows are gone.
 */
export const footOf = (sources: ReadonlyArray<Source>): Foot => {
  const modules = modulesOf(sources);
  const into: Gathered = { ids: new Set(), labels: new Set(), walked: new Set() };
  const screen = modules.at(SCREEN);
  const fn = screen?.functions.get(SCREEN_FUNCTION);
  const scroll = fn && elementIn(fn, 'ScrollView');
  if (screen === undefined || scroll === undefined) return into;
  const after = scroll.children.findIndex((child) => elementIn(child, AFTER) !== undefined);
  if (after < 0) return into;
  for (const child of scroll.children.slice(after + 1))
    gather({ modules, module: screen, env: new Map() }, child, into);
  return { ids: into.ids, labels: into.labels };
};
