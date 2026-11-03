import { Effect, Result } from 'effect';
import { Diagnostic, Rule, RuleContext, Visitor } from 'oxlint-plugin-effect/rule-bindings';
import { parseModule, unlocatable } from '../src/tools/scene-source.ts';

export const drawingLiteral = Rule.define({
  name: 'drawing-literal',
  meta: Rule.meta({
    type: 'problem',
    description:
      "A scene's timeline and knobs are object literals the lab can find: an exported module-level drawing({…}) with inline or same-file module const literals; a scene with a timeline goes through drawing().",
  }),
  create: function* () {
    const context = yield* RuleContext;
    const source = context.sourceCode.text;
    return Visitor.on('Program', () =>
      Result.match(parseModule(context.filename, source), {
        onFailure: () => Effect.void,
        onSuccess: (program) =>
          Effect.forEach(
            unlocatable(source, program),
            ({ start, end, reason }) =>
              context.report(Diagnostic.make({ node: { range: [start, end] }, message: reason })),
            { discard: true },
          ),
      }),
    );
  },
});
