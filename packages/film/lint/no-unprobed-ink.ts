import { Effect, Option } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import { ancestors, type Bindings, bindings, isCanvas, memberName } from './nodes.ts';

/** The context methods that put ink on the frame as a line: a stroke or text. */
const INK: ReadonlySet<string> = new Set(['stroke', 'strokeRect', 'fillText', 'strokeText']);

/** Any module, imported whole: a namespace is a module, never a context. */
const anyModule = () => true;

/** `node` sits inside a call of the kit's `unprobed`. */
const insideUnprobed = (b: Bindings, node: ESTree.Node) =>
  ancestors(node).some((a) => b.callsImport(a, isCanvas, 'unprobed'));

/** The ink method a member expression reads (`ctx.fillText`, `ctx['stroke']`), off anything but a namespace import. */
const inkRead = (b: Bindings, node: ESTree.MemberExpression): Option.Option<string> =>
  Option.filter(
    memberName(node),
    (name) => INK.has(name) && !b.importsAs(node.object, anyModule, '*'),
  );

/** `const { fillText } = ctx`: the ink methods an object pattern takes off its value. */
const inkTaken = (node: ESTree.ObjectPattern): ReadonlyArray<string> =>
  node.properties.flatMap((p) => {
    if (p.type !== 'Property' || p.computed || p.key.type !== 'Identifier') return [];
    if (!INK.has(p.key.name)) return [];
    return [p.key.name];
  });

const message = (name: string) =>
  `ctx.${name} bypasses the probe, so film check cannot see it cross text. Draw it with the kit's stroke/write, or wrap it in the kit's unprobed(ctx, () => …) to say it is texture.`;

export const noUnprobedInk = Rule.define({
  name: 'no-unprobed-ink',
  meta: Rule.meta({
    type: 'problem',
    description:
      "A stroke or text drawn on the raw context is invisible to film check's probe: draw it with the kit (stroke, write, block), or wrap texture in unprobed().",
  }),
  create: function* () {
    const context = yield* RuleContext;
    const b = yield* bindings;
    const report = (node: ESTree.Node, names: ReadonlyArray<string>) =>
      Effect.forEach(
        names.filter(() => !insideUnprobed(b, node)),
        (name) => context.report(Diagnostic.make({ node, message: message(name) })),
        { discard: true },
      );
    return Visitor.merge(
      Visitor.on('MemberExpression', (node) => report(node, Option.toArray(inkRead(b, node)))),
      Visitor.on('ObjectPattern', (node) => report(node, inkTaken(node))),
    );
  },
});
