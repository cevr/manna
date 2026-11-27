import { Effect, Option, Predicate } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';

const MESSAGE =
  'a process started on a browser (its binary, its path or its launch flags): no tool of ours starts Chrome, Chrome for Testing or Chromium itself (owner, 2026-11-23: "stop using chrome and use a real testing framework"). Drive the page through Playwright, which starts and stops its own browser (`chromium.launch`, `chromium.launchPersistentContext`), or through Exact\'s own verbs.';

/** The calls that start a process: Bun's, node's `child_process`' and execa's. */
const SPAWNERS = new Set([
  'spawn',
  'spawnSync',
  'exec',
  'execSync',
  'execFile',
  'execFileSync',
  'execa',
  'execaSync',
]);

/** Text that names a browser binary or a browser's launch flag. */
const BROWSER_TEXT = /chrom(?:e|ium)|msedge|firefox|webkit|--remote-debugging|--headless/iu;

/** A name a browser's path or launcher goes by: `chromePath`, `CHROME`, `browserBinary`. */
const BROWSER_NAME = /chrom|browser/iu;

/** The name a callee or a value goes by: an identifier's, or a member's property. */
const nameOf = (node: ESTree.Node): Option.Option<string> => {
  if (node.type === 'Identifier') return Option.some(node.name);
  if (node.type === 'MemberExpression' && node.property.type === 'Identifier')
    return Option.some(node.property.name);
  return Option.none();
};

/** The program a node lies in. */
const programOf = (node: ESTree.Node): ESTree.Node => {
  if (node.type === 'Program') return node;
  return programOf(node.parent);
};

/** The statement a top-level statement declares: an export's declaration, else itself. */
const declared = (statement: ESTree.Node): Option.Option<ESTree.Node> => {
  if (statement.type === 'ExportNamedDeclaration')
    return Option.fromNullishOr(statement.declaration);
  return Option.some(statement);
};

/** The value a top-level `const name = …` of the program binds, exported or not. */
const boundValue = (program: ESTree.Node, name: string): ReadonlyArray<ESTree.Node> => {
  if (program.type !== 'Program') return [];
  return program.body.flatMap((statement) =>
    Option.toArray(declared(statement)).flatMap((each) => {
      if (each.type !== 'VariableDeclaration') return [];
      return each.declarations.flatMap((declarator) => {
        if (declarator.id.type !== 'Identifier' || declarator.id.name !== name) return [];
        return Option.toArray(Option.fromNullishOr(declarator.init));
      });
    }),
  );
};

/** How many bindings deep a command's words are followed (`const flags = [...]`, spread into the command). */
const DEPTH = 3;

/** Whether one word of a command names a browser: by its text, its name, the name of the call that answers it, or the `const` it is bound to. */
const namesBrowser = (node: ESTree.Node, depth = DEPTH): boolean => {
  const word = (inner: ESTree.Node) => namesBrowser(inner, depth);
  if (node.type === 'Literal')
    return Predicate.isString(node.value) && BROWSER_TEXT.test(node.value);
  if (node.type === 'TemplateLiteral')
    return (
      node.quasis.some((quasi) => BROWSER_TEXT.test(quasi.value.cooked ?? quasi.value.raw)) ||
      node.expressions.some(word)
    );
  if (node.type === 'CallExpression') return word(node.callee);
  if (node.type === 'SpreadElement') return word(node.argument);
  if (node.type === 'BinaryExpression') return word(node.left) || word(node.right);
  if (node.type === 'ArrayExpression')
    return node.elements.filter(Predicate.isNotNullish).some(word);
  return Option.match(nameOf(node), {
    onNone: () => false,
    onSome: (name) =>
      BROWSER_NAME.test(name) ||
      (node.type === 'Identifier' &&
        depth > 0 &&
        boundValue(programOf(node), name).some((value) => namesBrowser(value, depth - 1))),
  });
};

/** Whether a call starts a process: its callee is a spawner by name (`Bun.spawn`, `spawn`, `cp.execFile`). */
const spawns = (call: ESTree.CallExpression) =>
  Option.match(nameOf(call.callee), {
    onNone: () => false,
    onSome: (name) => SPAWNERS.has(name),
  });

const DRIVER_MESSAGE =
  'a browser driver other than Playwright (Puppeteer, chrome-launcher, Selenium, WebdriverIO) starts its own Chrome: no tool of ours does (owner, 2026-11-23: "stop using chrome and use a real testing framework"). Drive the page through Playwright (`chromium.launch`, `chromium.launchPersistentContext`), or through Exact\'s own verbs.';

/** The packages that start or drive a browser of their own, Playwright aside. */
const DRIVERS = /^(?:puppeteer(?:-core)?|chrome-launcher|selenium-webdriver|webdriverio)(?:\/|$)/u;

/** The calls on a driver that start or reach a browser: Puppeteer's and chrome-launcher's `launch`, Puppeteer's `connect`, WebdriverIO's `remote`. */
const LAUNCHES = new Set(['launch', 'connect', 'remote']);

/** Whether `node` is a string naming a browser driver's package. */
const namesDriver = (node: ESTree.Node): boolean =>
  node.type === 'Literal' && Predicate.isString(node.value) && DRIVERS.test(node.value);

/** Whether `node` is a call of `createRequire` (`createRequire(import.meta.url)`, `module.createRequire(…)`). */
const makesRequire = (node: ESTree.Node): boolean =>
  node.type === 'CallExpression' &&
  Option.exists(nameOf(node.callee), (name) => name === 'createRequire');

/** Whether `callee` is a `require`: the global one, a `createRequire(…)` result called at once, or a top-level `const` bound to one. */
const isRequire = (callee: ESTree.Node): boolean => {
  if (makesRequire(callee)) return true;
  if (callee.type !== 'Identifier') return false;
  return callee.name === 'require' || boundValue(programOf(callee), callee.name).some(makesRequire);
};

/** Whether `node` is `require('<driver>')`, by any `require`. */
const requiresDriver = (node: ESTree.Node): boolean =>
  node.type === 'CallExpression' &&
  isRequire(node.callee) &&
  node.arguments.slice(0, 1).some(namesDriver);

/** Whether `node` yields a driver's module: `require('<driver>')`, `import('<driver>')`, either awaited, or its `.default`. */
const driverModule = (node: ESTree.Node): boolean => {
  if (node.type === 'AwaitExpression') return driverModule(node.argument);
  if (node.type === 'ParenthesizedExpression') return driverModule(node.expression);
  if (node.type === 'ImportExpression') return namesDriver(node.source);
  if (node.type === 'MemberExpression' && node.property.type === 'Identifier')
    return node.property.name === 'default' && driverModule(node.object);
  return requiresDriver(node);
};

/** The name an import specifier takes from its module: `*` for the default or the namespace. */
const importedName = (specifier: ESTree.Node): string => {
  if (specifier.type !== 'ImportSpecifier') return '*';
  if (specifier.imported.type === 'Identifier') return specifier.imported.name;
  return String(specifier.imported.value);
};

/** A statement's imports of a driver: each local name with the name it takes from the module. */
const importBindings = (statement: ESTree.Node): ReadonlyArray<readonly [string, string]> => {
  if (statement.type !== 'ImportDeclaration' || !namesDriver(statement.source)) return [];
  return statement.specifiers.map((specifier) => [specifier.local.name, importedName(specifier)]);
};

/** The names a destructuring pattern binds, each with the property it takes. */
const patternBindings = (pattern: ESTree.Node): ReadonlyArray<readonly [string, string]> => {
  if (pattern.type === 'Identifier') return [[pattern.name, '*']];
  if (pattern.type !== 'ObjectPattern') return [];
  return pattern.properties.flatMap((property) => {
    if (property.type !== 'Property') return [];
    if (property.key.type !== 'Identifier' || property.value.type !== 'Identifier') return [];
    return [[property.value.name, property.key.name] as const];
  });
};

/** A statement's `const … = require('<driver>')` or `await import('<driver>')` bindings. */
const requireBindings = (statement: ESTree.Node): ReadonlyArray<readonly [string, string]> =>
  Option.toArray(declared(statement)).flatMap((declaration) => {
    if (declaration.type !== 'VariableDeclaration') return [];
    return declaration.declarations.flatMap((declarator) =>
      Option.fromNullishOr(declarator.init).pipe(
        Option.filter(driverModule),
        Option.match({ onNone: () => [], onSome: () => patternBindings(declarator.id) }),
      ),
    );
  });

/** The program's names bound to a driver's module (`*`) or to one of its exports (that export's name), by local name. */
const driverBindings = (program: ESTree.Node): ReadonlyMap<string, string> => {
  if (program.type !== 'Program') return new Map();
  return new Map(
    program.body.flatMap((statement) => [
      ...importBindings(statement),
      ...requireBindings(statement),
    ]),
  );
};

/** Whether a call launches a driver's browser: a bound launch export called (`launch()`, `go()` for `{ launch as go }`), or a launch on the module or its binding (`puppeteer.launch()`, `(await import('puppeteer')).launch()`). */
const launchesDriver = (call: ESTree.CallExpression): boolean => {
  if (requiresDriver(call)) return true;
  const bound = driverBindings(programOf(call));
  const callee = call.callee;
  if (callee.type === 'Identifier') return LAUNCHES.has(bound.get(callee.name) ?? '');
  if (callee.type !== 'MemberExpression' || callee.property.type !== 'Identifier') return false;
  if (!LAUNCHES.has(callee.property.name)) return false;
  if (callee.object.type === 'Identifier') return bound.get(callee.object.name) === '*';
  return driverModule(callee.object);
};

/**
 * A process start whose command names a browser: a spawner's argument (its
 * command list or string, never its options object) holding a browser's
 * name or flag as text (`'Google Chrome for Testing'`, `'--headless=new'`,
 * `` `--remote-debugging-port=${port}` ``) or a value or call named for one
 * (`chromePath()`, `CHROME`), and Bun's shell (`` $`…` ``) doing the same.
 * A browser driver other than Playwright is refused whole: its import
 * (static, dynamic, `require` or a `createRequire(…)` result's), its
 * re-export (`export … from`, `export * from`) and every launch bound to
 * it, however named.
 */
export const noBrowserSpawn = Rule.define({
  name: 'no-browser-spawn',
  meta: Rule.meta({
    type: 'problem',
    description:
      'No process is started on a browser binary: pages are driven through Playwright, which starts its own browser.',
  }),
  create: function* () {
    const context = yield* RuleContext;
    const report = (node: ESTree.Node) =>
      context.report(Diagnostic.make({ node, message: MESSAGE }));
    const refuse = (node: ESTree.Node) =>
      context.report(Diagnostic.make({ node, message: DRIVER_MESSAGE }));
    return Visitor.merge(
      Visitor.on('ImportDeclaration', (node) =>
        Effect.suspend(() => {
          if (!namesDriver(node.source)) return Effect.void;
          return refuse(node);
        }),
      ),
      Visitor.on('ExportNamedDeclaration', (node) =>
        Effect.suspend(() => {
          if (!Option.exists(Option.fromNullishOr(node.source), namesDriver)) return Effect.void;
          return refuse(node);
        }),
      ),
      Visitor.on('ExportAllDeclaration', (node) =>
        Effect.suspend(() => {
          if (!namesDriver(node.source)) return Effect.void;
          return refuse(node);
        }),
      ),
      Visitor.on('ImportExpression', (node) =>
        Effect.suspend(() => {
          if (!namesDriver(node.source)) return Effect.void;
          return refuse(node);
        }),
      ),
      Visitor.on('CallExpression', (node) =>
        Effect.suspend(() => {
          if (launchesDriver(node)) return refuse(node);
          if (!spawns(node)) return Effect.void;
          const command = node.arguments.filter((argument) => argument.type !== 'ObjectExpression');
          if (!command.some((word) => namesBrowser(word))) return Effect.void;
          return report(node);
        }),
      ),
      Visitor.on('TaggedTemplateExpression', (node) =>
        Effect.suspend(() => {
          if (node.tag.type !== 'Identifier' || node.tag.name !== '$') return Effect.void;
          if (!namesBrowser(node.quasi)) return Effect.void;
          return report(node);
        }),
      ),
    );
  },
});
