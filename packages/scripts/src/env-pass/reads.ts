import { Config, Option, Predicate } from 'effect';
import { type Node, Visitor, parseSync } from 'oxc-parser';

/** A name a variable can have: what `process.env.<name>` reads. */
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Whether a node is the environment itself: `process.env`, `Bun.env` or `import.meta.env`. */
const isEnv = (node: Node) => {
  if (node.type !== 'MemberExpression' || node.computed || node.property.name !== 'env')
    return false;
  const { object } = node;
  if (object.type === 'MetaProperty') return object.meta.name === 'import';
  return object.type === 'Identifier' && (object.name === 'process' || object.name === 'Bun');
};

/** A key as written: a name, a string literal, or a template with nothing put in it. */
const keyOf = (key: Node, computed: boolean): Option.Option<string> => {
  if (!computed && key.type === 'Identifier') return Option.some(key.name);
  if (key.type === 'Literal' && Predicate.isString(key.value)) return Option.some(key.value);
  if (key.type === 'TemplateLiteral' && key.expressions.length === 0)
    return Option.fromNullishOr(key.quasis[0]?.value.cooked);
  return Option.none();
};

/** The variable a member of the environment names (`process.env.X`, `Bun.env['X']`); none for any other node. */
const memberName = (node: Node): Option.Option<string> => {
  if (node.type !== 'MemberExpression' || !isEnv(node.object)) return Option.none();
  return Option.filter(keyOf(node.property, node.computed), (name) => NAME.test(name));
};

/** The parameters of a constructor of `Config` that name the variable it reads. */
const NAME_PARAMETERS = new Set(['name', 'path', 'pathOrOptions']);

/** A function's parameters as its source declares them, each its bare name. */
const parametersOf = (source: string) =>
  (/^[^(]*\(([^)]*)\)/.exec(source)?.[1] ?? '')
    .split(',')
    .map((parameter) => parameter.trim().replace(/[\s=].*$/s, ''))
    .filter((parameter) => parameter !== '');

/**
 * Each constructor the installed `effect/Config` exports that reads a
 * variable by a name it is given, and the place of that name among its
 * arguments: the function's parameter `name`, `path` or `pathOrOptions`
 * (`Config.Int('X')`, `Config.Literal('a', 'X')`, `Config.schema(codec,
 * 'X')`). Read from the package itself, so a constructor effect adds is
 * read the day it is installed.
 */
const CONFIG_NAME_AT: Readonly<Record<string, number>> = Object.fromEntries(
  Object.entries(Config).flatMap(([key, value]) => {
    if (!Predicate.isFunction(value)) return [];
    const at = parametersOf(Function.prototype.toString.call(value)).findIndex((parameter) =>
      NAME_PARAMETERS.has(parameter),
    );
    if (at < 0) return [];
    return [[key, at] as const];
  }),
);

/** The variable an Effect `Config` constructor reads (`CONFIG_NAME_AT`), given as a literal name. */
const configName = (node: Node): Option.Option<string> => {
  if (node.type !== 'CallExpression') return Option.none();
  const { callee } = node;
  if (
    callee.type !== 'MemberExpression' ||
    callee.computed ||
    callee.object.type !== 'Identifier' ||
    callee.object.name !== 'Config' ||
    !Object.hasOwn(CONFIG_NAME_AT, callee.property.name)
  )
    return Option.none();
  return Option.fromUndefinedOr(node.arguments[CONFIG_NAME_AT[callee.property.name] ?? 0]).pipe(
    Option.filter((given) => given.type !== 'SpreadElement'),
    Option.flatMap((given) => keyOf(given, true)),
    Option.filter((name) => NAME.test(name)),
  );
};

/** A cheap first look: a file that holds none of these words reads no variable `envReads` finds. */
const MAY_READ = /\benv\b|\bConfig\./;

/**
 * The variables a file reads from the environment its process was started
 * with: each it reads by `process.env`, `Bun.env` or `import.meta.env` (a
 * member, or a key of a pattern destructured from it) or by an Effect
 * `Config` constructor, less each it sets or deletes itself (a test that
 * saves a variable before it sets it reads none from outside). Sorted, each
 * once; none for a file that does not parse. A name built at run time, or
 * read in a string or a comment, is none of them.
 */
export const envReads = (file: string, text: string): ReadonlyArray<string> => {
  if (!MAY_READ.test(text)) return [];
  const parsed = parseSync(file, text);
  if (parsed.errors.length > 0) return [];
  const read = new Set<string>();
  const own = new Set<string>();
  new Visitor({
    MemberExpression: (node) => {
      Option.map(memberName(node), (name) => read.add(name));
    },
    CallExpression: (node) => {
      Option.map(configName(node), (name) => read.add(name));
    },
    VariableDeclarator: (node) => {
      if (node.id.type !== 'ObjectPattern' || !Option.exists(Option.fromNullOr(node.init), isEnv))
        return;
      for (const property of node.id.properties) {
        if (property.type === 'RestElement') continue;
        Option.map(
          Option.filter(keyOf(property.key, property.computed), (name) => NAME.test(name)),
          (name) => read.add(name),
        );
      }
    },
    AssignmentExpression: (node) => {
      Option.map(memberName(node.left), (name) => own.add(name));
    },
    UnaryExpression: (node) => {
      if (node.operator === 'delete')
        Option.map(memberName(node.argument), (name) => own.add(name));
    },
  }).visit(parsed.program);
  return [...read].filter((name) => !own.has(name)).toSorted();
};

/**
 * A module's static and literal dynamic imports and re-exports, by a scan
 * of its text: `import … from 'x'`, `import 'x'`, `export … from 'x'`,
 * `import('x')`; `import type` and `export type` load nothing and are
 * skipped. A scan, not a parse (the AST of every module of the repo costs
 * the gate seconds): an import written inside a string is taken too, which
 * can only add a module to follow.
 */
const IMPORT =
  /\b(?:import|export)\s+(?!type\b)(?:[\w*{}\s,$]+?\s+from\s+)?['"]([^'"\n]+)['"]|\bimport\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g;

/** The specifiers a module imports (`IMPORT`), each once, in order. */
export const importsOf = (text: string): ReadonlyArray<string> => [
  ...new Set(
    Array.from(text.matchAll(IMPORT), ([, statics, dynamic]) => statics ?? dynamic ?? '').filter(
      (specifier) => specifier !== '',
    ),
  ),
];
