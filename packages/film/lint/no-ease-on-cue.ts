import { Effect, Option } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import { type Bindings, bindings, isFilmTime, unwrapped } from './nodes.ts';

const easedArgument = (b: Bindings, n: ESTree.CallExpression): Option.Option<ESTree.Node> => {
  const callee = unwrapped(n.callee);
  if (
    callee.type !== 'MemberExpression' ||
    !b.readsImport(callee.object, isFilmTime, 'ease') ||
    n.arguments.length !== 1
  )
    return Option.none();
  return Option.filter(Option.fromUndefinedOr(n.arguments[0]), (a) => a.type !== 'SpreadElement');
};

export const noEaseOnCue = Rule.define({
  name: 'no-ease-on-cue',
  meta: Rule.meta({
    type: 'problem',
    description:
      "A cue's progress is eased once, by its span's ease: ease.X(f.at(cue)) curves it again where the lab's picker cannot reach.",
  }),
  create: function* () {
    const context = yield* RuleContext;
    const b = yield* bindings;
    return Visitor.on('CallExpression', (node) =>
      Effect.asVoid(
        Effect.when(
          context.report(
            Diagnostic.make({
              node,
              message:
                "a cue's progress eased a second time: f.at(cue) is already eased by the span's `ease`, which the lab sets. A camera push is a shotPath stop with pushInto; another curve is its own cue or f.keys.",
            }),
          ),
          Effect.succeed(Option.exists(easedArgument(b, node), b.readsCue)),
        ),
      ),
    );
  },
});
