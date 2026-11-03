import { Effect, Option, Predicate } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';

const SEAM = /^(?:\.{1,2}\/|@manna\/)(?:.*\/)?testing(?:\.[cm]?[jt]sx?)?$/u;

const MESSAGE =
  "a test seam imported by product code: a testing.ts module holds a package's test-only doubles and fixtures, so a shipped import never reaches one. Move what this file needs out of the seam, into the module it belongs to.";

const namesSeam = (source: ESTree.Node): boolean =>
  source.type === 'Literal' && Predicate.isString(source.value) && SEAM.test(source.value);

export const noTestSeam = Rule.define({
  name: 'no-test-seam',
  meta: Rule.meta({
    type: 'problem',
    description:
      "Product code never imports a test seam: a testing.ts module holds a package's test-only doubles.",
  }),
  create: function* () {
    const context = yield* RuleContext;
    const refuse = (node: ESTree.Node, source: Option.Option<ESTree.Node>) =>
      Effect.asVoid(
        Effect.when(
          context.report(Diagnostic.make({ node, message: MESSAGE })),
          Effect.succeed(Option.exists(source, namesSeam)),
        ),
      );
    return Visitor.merge(
      Visitor.merge(
        Visitor.on('ImportDeclaration', (node) => refuse(node, Option.some(node.source))),
        Visitor.on('ImportExpression', (node) => refuse(node, Option.some(node.source))),
      ),
      Visitor.merge(
        Visitor.on('ExportNamedDeclaration', (node) =>
          refuse(node, Option.fromNullOr(node.source)),
        ),
        Visitor.on('ExportAllDeclaration', (node) => refuse(node, Option.some(node.source))),
      ),
    );
  },
});
