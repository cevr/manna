// `film/media-in-process`: the film's media runs in-process (mediabunny, and
// FFmpeg's libraries through NodeAV), never FFmpeg's command-line tools. A
// string or a template whose text names either tool as a lower-case word
// (the bare name, a command line, a path) is the only way to start one as a
// process, so the rule refuses each one in the film package. A comment, a
// regular expression and a name such as `FFmpegError` are not such strings.
//
// The rule is lint, not a unit test, so that oxlint reads every file of the
// package on every gate: a unit test that swept the package would read the
// files of the other test parts, whose edits do not rerun its cached part.

import { Effect, Option, Predicate } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';

/** A tool's name as a word: the encoder or the prober. */
const NAMES_TOOL = /\b(?:ffmpeg|ffprobe)\b/u;

const MESSAGE =
  "a string names FFmpeg's command-line tool: the film reads and writes media in-process (mediabunny, and FFmpeg's libraries through NodeAV), never through a process.";

/** A template's text, with its holes left out. */
const templateText = (node: ESTree.TemplateLiteral) =>
  node.quasis
    .map((q) => Option.getOrElse(Option.fromNullishOr(q.value.cooked), () => q.value.raw))
    .join(' ');

/** Whether a node is a string or template naming a tool. */
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
