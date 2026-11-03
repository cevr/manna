import { Effect, Option, Predicate } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import { isGlobal, memberName } from './nodes.ts';

const MEDIA: ReadonlySet<string> = new Set(['audio', 'video']);

const MESSAGE =
  "a media element made by hand: play sound and pictures through the player's media module (packages/film/src/browser/media.ts), which owns what an element does a page cannot see.";

/** Whether a call makes a media element: `….createElement('audio')`. */
const createsMedia = (call: ESTree.CallExpression): boolean => {
  const [tag] = call.arguments;
  return (
    call.callee.type === 'MemberExpression' &&
    Option.contains(memberName(call.callee), 'createElement') &&
    tag?.type === 'Literal' &&
    Predicate.isString(tag.value) &&
    MEDIA.has(tag.value)
  );
};

export const mediaThroughPlayer = Rule.define({
  name: 'media-through-player',
  meta: Rule.meta({
    type: 'problem',
    description:
      "A page plays sound and pictures through the player's media module (browser/media.ts), never an <audio> or <video> of its own.",
  }),
  create: function* () {
    const context = yield* RuleContext;
    const report = (node: ESTree.Node, made: Effect.Effect<boolean>) =>
      Effect.asVoid(Effect.when(context.report(Diagnostic.make({ node, message: MESSAGE })), made));
    return Visitor.merge(
      Visitor.on('JSXOpeningElement', (element: ESTree.JSXOpeningElement) =>
        report(
          element,
          Effect.succeed(element.name.type === 'JSXIdentifier' && MEDIA.has(element.name.name)),
        ),
      ),
      Visitor.merge(
        Visitor.on('CallExpression', (call: ESTree.CallExpression) =>
          report(call, Effect.succeed(createsMedia(call))),
        ),
        Visitor.on('NewExpression', (made: ESTree.NewExpression) =>
          Effect.flatMap(isGlobal(made.callee, 'Audio'), (audio) =>
            report(made, Effect.succeed(audio)),
          ),
        ),
      ),
    );
  },
});
