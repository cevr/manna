import { Effect, Option, Predicate } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';

/** The flags that keep a Chrome off the login keychain: a mock keychain and a plain password store. */
const KEYCHAIN_FLAGS = ['--use-mock-keychain', '--password-store=basic'];

const MESSAGE = `a Chrome launched with a DevTools port or pipe and no ${KEYCHAIN_FLAGS.join(' or no ')}: macOS asks the owner for a login keychain each run ("A keychain cannot be found"). Add both flags to the argument list, as Playwright's own launches do.`;

/** Whether a flag opens Chrome's DevTools protocol: `--remote-debugging-pipe`, `--remote-debugging-port…`. */
const opensDevtools = (flag: string) =>
  flag === '--remote-debugging-pipe' || flag.startsWith('--remote-debugging-port');

/** The text an element starts with: a string literal's value, or a template's first part. */
const headOf = (node: ESTree.Node): Option.Option<string> => {
  if (node.type === 'Literal' && Predicate.isString(node.value)) return Option.some(node.value);
  if (node.type === 'TemplateLiteral')
    return Option.fromNullishOr(node.quasis[0]).pipe(
      Option.flatMap((quasi) => Option.fromNullishOr(quasi.value.cooked)),
    );
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

/** The elements of the array literal a top-level `const name = [...]` of the program binds. */
const boundElements = (program: ESTree.Node, name: string): ReadonlyArray<ESTree.Node> => {
  if (program.type !== 'Program') return [];
  return program.body.flatMap((statement) =>
    Option.toArray(declared(statement)).flatMap((declaration) => {
      if (declaration.type !== 'VariableDeclaration') return [];
      return declaration.declarations.flatMap((declarator) => {
        if (declarator.id.type !== 'Identifier' || declarator.id.name !== name) return [];
        if (declarator.init?.type !== 'ArrayExpression') return [];
        return declarator.init.elements.filter(Predicate.isNotNullish);
      });
    }),
  );
};

/** The flags an array literal holds: its literals, and those of a spread `const` list of the same file. */
const flagsOf = (array: ESTree.ArrayExpression): ReadonlyArray<string> =>
  array.elements.filter(Predicate.isNotNullish).flatMap((element) => {
    if (element.type === 'SpreadElement' && element.argument.type === 'Identifier')
      return boundElements(programOf(array), element.argument.name).flatMap((bound) =>
        Option.toArray(headOf(bound)),
      );
    return Option.toArray(headOf(element));
  });

/**
 * An argument list that opens Chrome's DevTools protocol (`--remote-debugging-port…`,
 * `--remote-debugging-pipe`) holds both keychain flags, as literals or in a
 * `const` list of the same file it spreads.
 */
export const chromeMockKeychain = Rule.define({
  name: 'chrome-mock-keychain',
  meta: Rule.meta({
    type: 'problem',
    description:
      'Every Chrome argument list that opens the DevTools protocol passes --use-mock-keychain and --password-store=basic.',
  }),
  create: function* () {
    const context = yield* RuleContext;
    return Visitor.on('ArrayExpression', (node) =>
      Effect.suspend(() => {
        const flags = flagsOf(node);
        if (!flags.some(opensDevtools) || KEYCHAIN_FLAGS.every((flag) => flags.includes(flag)))
          return Effect.void;
        return context.report(Diagnostic.make({ node, message: MESSAGE }));
      }),
    );
  },
});
