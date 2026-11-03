import { Effect, Option, Predicate } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';

const NAMES_TOOL = /\b(?:ffmpeg|ffprobe)\b/u;

const MESSAGE =
  "a string names FFmpeg's command-line tool: the film reads and writes media in-process (mediabunny, and FFmpeg's libraries through NodeAV), never through a process.";

const templateText = (node: ESTree.TemplateLiteral) =>
  node.quasis
    .map((q) => Option.getOrElse(Option.fromNullishOr(q.value.cooked), () => q.value.raw))
    .join(' ');

const namesTool = (node: ESTree.Node): boolean => {
  if (node.type === 'Literal') return Predicate.isString(node.value) && NAMES_TOOL.test(node.value);
  if (node.type === 'TemplateLiteral') return NAMES_TOOL.test(templateText(node));
  return false;
};

export const mediaInProcess = Rule.define({
  name: 'media-in-process',
  meta: Rule.meta({
    type: 'problem',
    description:
      "No film source names FFmpeg's command-line tools in a string: the film runs its media in-process.",
  }),
  create: function* () {
    const context = yield* RuleContext;
    const report = (node: ESTree.Node) =>
      Effect.asVoid(
        Effect.when(
          context.report(Diagnostic.make({ node, message: MESSAGE })),
          Effect.succeed(namesTool(node)),
        ),
      );
    return Visitor.merge(Visitor.on('Literal', report), Visitor.on('TemplateLiteral', report));
  },
});
