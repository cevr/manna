import { Effect, Option, Predicate } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import { type Bindings, bindings, type Module } from './nodes.ts';

const isLock: Module = (from) => /(?:^|\/)manifest-lock-bun(?:\.[jt]s)?$/u.test(from);

const LOCK_NAME = /(?:^|\/)\.[^/]*\.lock$/u;

const MESSAGE =
  "a manifest's lock file named outside its lock: SQLite alone opens it (packages/film/src/tools/manifest-lock-bun.ts), since closing any other handle on it lets go of the process's lock.";

const buildsLockName = (node: ESTree.TemplateLiteral) =>
  LOCK_NAME.test(
    node.quasis
      .map((q) => Option.getOrElse(Option.fromNullishOr(q.value.cooked), () => q.value.raw))
      .join('x'),
  );

const namesLock = (b: Bindings, node: ESTree.Node): boolean => {
  if (node.type === 'Literal') return Predicate.isString(node.value) && LOCK_NAME.test(node.value);
  if (node.type === 'TemplateLiteral') return buildsLockName(node);
  return b.callsImport(node, isLock, 'lockFile');
};

export const lockThroughSqlite = Rule.define({
  name: 'lock-through-sqlite',
  meta: Rule.meta({
    type: 'problem',
    description:
      "A manifest's lock file is opened by SQLite alone (tools/manifest-lock-bun.ts): closing any other handle on it lets go of the process's lock.",
  }),
  create: function* () {
    const context = yield* RuleContext;
    const b = yield* bindings;
    const report = (node: ESTree.Node) =>
      Effect.asVoid(
        Effect.when(
          context.report(Diagnostic.make({ node, message: MESSAGE })),
          Effect.succeed(namesLock(b, node)),
        ),
      );
    return Visitor.merge(
      Visitor.on('Literal', report),
      Visitor.merge(Visitor.on('TemplateLiteral', report), Visitor.on('CallExpression', report)),
    );
  },
});
