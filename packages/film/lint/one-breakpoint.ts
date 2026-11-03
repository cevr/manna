import { Effect, Predicate } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';

const LENGTH = String.raw`\d+(?:\.\d+)?(?:px|r?(?:em|ex|ch|cap|ic|lh)|[sld]?v(?:w|h|i|b|min|max)|cq(?:w|h|i|b|min|max)|cm|mm|q|in|pt|pc)`;

const WIDTH_THEN_VALUE = new RegExp(
  String.raw`\(\s*(?:(?:max-|min-)?width\s*:|width\s*(?:[<>]=?|=))\s*$`,
  'u',
);

const VALUE_THEN_WIDTH = new RegExp(String.raw`^[a-z]*\s*(?:[<>]=?|=)\s*width\b`, 'u');

const COMPARED = String.raw`(?:[<>]=?|=)`;

const WIDTH = new RegExp(
  [
    String.raw`\(\s*(?:max-|min-)?width\s*:\s*${LENGTH}\s*\)`,
    String.raw`\(\s*width\s*${COMPARED}\s*${LENGTH}\s*\)`,
    String.raw`\(\s*${LENGTH}\s*${COMPARED}\s*width(?:\s*${COMPARED}\s*${LENGTH})?\s*\)`,
  ].join('|'),
  'g',
);

const inSupports = (text: string, at: number) => {
  const before = text.slice(0, at);
  const clause = before.slice(Math.max(...['{', '}', ';'].map((c) => before.lastIndexOf(c))) + 1);
  return /@supports\b/u.test(clause);
};

const writesWidth = (text: string, lead: string) =>
  Array.from(text.matchAll(WIDTH)).some((m) => !inSupports(lead + text, lead.length + m.index));

const VALUE = '0';

const partText = (part: ESTree.TemplateElement) => part.value.cooked ?? part.value.raw;

const leadOf = (template: ESTree.TemplateLiteral, index: number) =>
  template.quasis
    .slice(0, index)
    .map((part) => partText(part) + VALUE)
    .join('');

const leadOfPart = (part: ESTree.TemplateElement) => {
  const template = part.parent;
  if (template.type !== 'TemplateLiteral') return '';
  return leadOf(template, template.quasis.indexOf(part));
};

const buildsWidth = (template: ESTree.TemplateLiteral) =>
  template.expressions.some((_, i) => {
    const before = template.quasis[i]?.value.cooked ?? '';
    const after = template.quasis[i + 1]?.value.cooked ?? '';
    const opens =
      WIDTH_THEN_VALUE.test(before) || (VALUE_THEN_WIDTH.test(after) && /\(\s*$/u.test(before));
    const lead = leadOf(template, i);
    return opens && !inSupports(lead + before, lead.length + before.length);
  });

const MESSAGE =
  "a breakpoint written out: ask the studio's one breakpoint through PHONE or WIDE (packages/film/src/lab/viewport.ts), so the width is declared once.";

export const oneBreakpoint = Rule.define({
  name: 'one-breakpoint',
  meta: Rule.meta({
    type: 'problem',
    description:
      "A style in TypeScript asks the window through the studio's one breakpoint (PHONE, WIDE in lab/viewport.ts), never a width written out.",
  }),
  create: function* () {
    const context = yield* RuleContext;
    const report = (node: ESTree.Node, text: string, lead: string) =>
      Effect.asVoid(
        Effect.when(
          context.report(Diagnostic.make({ node, message: MESSAGE })),
          Effect.succeed(writesWidth(text, lead)),
        ),
      );
    return Visitor.merge(
      Visitor.on('Literal', (node) => {
        if (!Predicate.isString(node.value)) return Effect.void;
        return report(node, node.value, '');
      }),
      Visitor.on('TemplateElement', (node) => report(node, partText(node), leadOfPart(node))),
      Visitor.on('TemplateLiteral', (node) =>
        Effect.asVoid(
          Effect.when(
            context.report(Diagnostic.make({ node, message: MESSAGE })),
            Effect.succeed(buildsWidth(node)),
          ),
        ),
      ),
    );
  },
});
