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

/**
 * A process start whose command names a browser: a spawner's argument (its
 * command list or string, never its options object) holding a browser's
 * name or flag as text (`'Google Chrome for Testing'`, `'--headless=new'`,
 * `` `--remote-debugging-port=${port}` ``) or a value or call named for one
 * (`chromePath()`, `CHROME`), and Bun's shell (`` $`…` ``) doing the same.
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
    return Visitor.merge(
      Visitor.on('CallExpression', (node) =>
        Effect.suspend(() => {
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
