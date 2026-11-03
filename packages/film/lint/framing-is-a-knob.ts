import { Effect, Option, Predicate } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import { UNMOVED } from '../src/canvas/camera.ts';
import { type Bindings, bindings, isFilmTime, memberName, property } from './nodes.ts';

const UNMOVED_AT: Readonly<Record<'x' | 'y' | 'zoom', number>> = {
  x: UNMOVED.x,
  y: UNMOVED.y,
  zoom: UNMOVED.zoom ?? 1,
};

const KEYS = ['x', 'y', 'zoom'] as const;
type Key = (typeof KEYS)[number];

const handWritten = (top: Bindings, n: ESTree.Node, key: Key): boolean =>
  Option.exists(top.numberOf(n), (v) => v !== UNMOVED_AT[key]);

const numbersOnly = (n: ESTree.Node): boolean =>
  n.type === 'ArrayExpression' &&
  n.elements.every((e) => e?.type === 'Literal' && Predicate.isNumber(e.value));

const handEnd = (top: Bindings, n: ESTree.Node): boolean => {
  if (Option.isSome(top.numberOf(n))) return true;
  return (
    n.type === 'MemberExpression' &&
    n.computed &&
    n.object.type === 'Identifier' &&
    Option.exists(top.valueOf(n.object), numbersOnly)
  );
};

const handBlend = (top: Bindings, n: ESTree.Node): boolean => {
  switch (n.type) {
    case 'CallExpression': {
      const blend = top.callsImport(n, isFilmTime, 'lerp');
      if (blend && n.arguments.slice(0, 2).some((a) => handEnd(top, a))) return true;
      return n.arguments.some((a) => handBlend(top, a));
    }
    case 'BinaryExpression':
      return handBlend(top, n.left) || handBlend(top, n.right);
    case 'ParenthesizedExpression':
      return handBlend(top, n.expression);
    default:
      return false;
  }
};

const handFraming = (
  top: Bindings,
  fields: ReadonlyArray<readonly [Key, ESTree.Node]>,
): boolean => {
  if (fields.some(([, value]) => handBlend(top, value))) return true;
  const written = fields
    .filter(([key]) => key !== 'zoom')
    .every(([, v]) => Option.isSome(top.numberOf(v)));
  return written && fields.some(([key, value]) => handWritten(top, value, key));
};

interface CameraFields {
  readonly fields: ReadonlyArray<readonly [Key, ESTree.Node]>;
  readonly whole: boolean;
}

const cameraFields = (n: ESTree.ObjectExpression): Option.Option<CameraFields> => {
  const fields = KEYS.flatMap((key) =>
    Option.toArray(Option.map(property(n, key), (p) => [key, p.value] as const)),
  );
  const whole = fields.length === KEYS.length;
  const spread = n.properties.some((p) => p.type === 'SpreadElement');
  return Option.liftPredicate({ fields, whole }, () => whole || (spread && fields.length > 0));
};

const handCamera = (top: Bindings, { fields, whole }: CameraFields): boolean => {
  if (whole) return handFraming(top, fields);
  return fields.some(([, value]) => handBlend(top, value));
};

const zoomBlend = (top: Bindings, n: ESTree.AssignmentExpression): boolean =>
  n.left.type === 'MemberExpression' &&
  Option.contains(memberName(n.left), 'zoom') &&
  handBlend(top, n.right);

const MESSAGE =
  'a framing written in the scene: make it knobs (a point and a zoom, read with knobCamera), a move between framings a shotPath of them, and a push that keeps going pushOn with a number knob, so the lab can reach it.';

export const framingIsAKnob = Rule.define({
  name: 'framing-is-a-knob',
  meta: Rule.meta({
    type: 'problem',
    description:
      "A scene's framing is knobs: a camera written or blended by hand from numbers is a value the lab cannot reach.",
  }),
  create: function* () {
    const context = yield* RuleContext;
    const top = yield* bindings;
    const report = (node: ESTree.Node) =>
      context.report(Diagnostic.make({ node, message: MESSAGE }));
    return Visitor.merge(
      Visitor.on('ObjectExpression', (node) =>
        Option.match(cameraFields(node), {
          onNone: () => Effect.void,
          onSome: (camera) =>
            Effect.asVoid(Effect.when(report(node), Effect.succeed(handCamera(top, camera)))),
        }),
      ),
      Visitor.on('AssignmentExpression', (node) =>
        Effect.asVoid(Effect.when(report(node), Effect.succeed(zoomBlend(top, node)))),
      ),
    );
  },
});
