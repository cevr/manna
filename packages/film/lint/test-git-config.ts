import { Array as Arr, Effect, Option, Predicate } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import { memberName } from './nodes.ts';

const MESSAGE =
  "a git config written in a test file: run a test repository's git with TEST_GIT (packages/scripts/src/testing.ts) ahead of its arguments, which also turns git's automatic maintenance off, whose lock file breaks the folder's delete.";

const textOf = (n: ESTree.ArrayExpression['elements'][number]): Option.Option<string> => {
  if (n?.type === 'Literal' && Predicate.isString(n.value)) return Option.some(n.value);
  return Option.none();
};

const isSetting = (value: string) => /^[A-Za-z][\w-]*(\.[\w-]+)+=/.test(value);

const saysGit = (name: string) => /git/i.test(name);

const calleeName = (callee: ESTree.Node): Option.Option<string> => {
  if (callee.type === 'Identifier') return Option.some(callee.name);
  if (callee.type === 'MemberExpression') return memberName(callee);
  return Option.none();
};

const isGitArguments = (array: ESTree.ArrayExpression) => {
  if (Option.contains(Option.flatMap(Arr.head(array.elements), textOf), 'git')) return true;
  const parent = array.parent;
  if (parent.type === 'CallExpression')
    return (
      Option.exists(calleeName(parent.callee), saysGit) ||
      parent.arguments.some((argument) => Option.contains(textOf(argument), 'git'))
    );
  if (parent.type === 'VariableDeclarator')
    return parent.id.type === 'Identifier' && saysGit(parent.id.name);
  return false;
};

const settingsIn = (array: ESTree.ArrayExpression): ReadonlyArray<ESTree.Node> =>
  array.elements.flatMap((element, i) =>
    Option.toArray(
      Option.filter(
        Option.fromNullishOr(element),
        () =>
          Option.contains(textOf(element), '-c') &&
          Option.exists(Option.flatMap(Arr.get(array.elements, i + 1), textOf), isSetting),
      ),
    ),
  );

const spreadsIn = (array: ESTree.ArrayExpression): ReadonlyArray<string> =>
  array.elements.flatMap((element) =>
    Option.toArray(
      Option.flatMap(Option.fromNullishOr(element), (e) => {
        if (e.type === 'SpreadElement' && e.argument.type === 'Identifier')
          return Option.some(e.argument.name);
        return Option.none();
      }),
    ),
  );

const nameOf = (array: ESTree.ArrayExpression): Option.Option<string> => {
  const parent = array.parent;
  if (parent.type === 'VariableDeclarator' && parent.id.type === 'Identifier')
    return Option.some(parent.id.name);
  return Option.none();
};

export const testGitConfig = Rule.define({
  name: 'test-git-config',
  meta: Rule.meta({
    type: 'problem',
    description:
      "A test repository's git runs with the shared TEST_GIT config, never one written in the test file.",
  }),
  create: function* () {
    const context = yield* RuleContext;
    const report = (flags: ReadonlyArray<ESTree.Node>) =>
      Effect.forEach(
        flags,
        (flag) => context.report(Diagnostic.make({ node: flag, message: MESSAGE })),
        { discard: true },
      );
    const held: Array<{ readonly name: string; readonly flags: ReadonlyArray<ESTree.Node> }> = [];
    const spread = new Set<string>();
    return Visitor.merge(
      Visitor.on('ArrayExpression', (node) =>
        Effect.suspend(() => {
          const flags = settingsIn(node);
          if (!isGitArguments(node)) {
            if (flags.length > 0) Option.map(nameOf(node), (name) => held.push({ name, flags }));
            return Effect.void;
          }
          spreadsIn(node).forEach((name) => spread.add(name));
          return report(flags);
        }),
      ),
      Visitor.onExit('Program', () =>
        Effect.suspend(() =>
          report(held.filter(({ name }) => spread.has(name)).flatMap(({ flags }) => flags)),
        ),
      ),
    );
  },
});
