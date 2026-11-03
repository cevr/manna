import { Predicate, Schema } from 'effect';
import { ConceptRef } from '../core/match.ts';
import { decoder } from './decode.ts';
import { type Lock, decodeLock } from './lock.ts';
import { GarmentTones } from './paper.ts';
import {
  ARM_SIDES,
  type AnyArm,
  type Arm,
  type ArmSide,
  type JointedArm,
  decodeArm,
} from './parts/arm.ts';
import { type Beard, decodeBeard } from './parts/beard.ts';
import { type Garment, decodeGarment, tonesOn } from './parts/body.ts';
import { type Ear, decodeEar } from './parts/ear.ts';
import { type Feet, decodeFeet } from './parts/feet.ts';
import { type Hair, decodeHair } from './parts/hair.ts';
import { type Hands, decodeHands } from './parts/hands.ts';
import { type Headcloth, decodeHeadcloth } from './parts/headcloth.ts';
import { type Head, type RoundHead, decodeHead } from './parts/head.ts';
import { type KitA, decodeKit } from './parts/kit.ts';
import { Length, Point } from './parts/measure.ts';
import { type OpenMouth, decodeMouth } from './parts/mouth.ts';
import { type Over, decodeOver } from './parts/over.ts';
import { type Seated, type Standing, decodeSeated, decodeStanding } from './parts/stance.ts';
import { type GivenRobe, type Stain, type State, decodeState } from './parts/states.ts';
import { type Stature, decodeStature } from './parts/stature.ts';
import { EXTRA_FACE, FACE, type FaceKnob, type Pt } from './rig/parts.ts';
import { fromEdge, garmentOutline, inside } from './rig/shapes.ts';

const StandingArt = Schema.Struct({ width: Length, height: Length, feet: Point });

const SeatedArt = Schema.Struct({ width: Length, height: Length, head: Point });

interface Arms {
  readonly near?: AnyArm;
  readonly far?: AnyArm;
}

interface Composed {
  readonly lock?: Lock;
  readonly concept: ConceptRef;
  readonly stature: Stature;
  readonly head: Head;
  readonly beard?: Beard;
  readonly hair?: Hair;
  readonly headcloth?: Headcloth;
  readonly ear?: Ear;
  readonly face: KitA;
  readonly mouth?: OpenMouth;
  readonly body: Garment;
  readonly arms?: Arms;
  readonly over?: Over;
  readonly states?: ReadonlyArray<State>;
  readonly hands: Hands;
  readonly path?: 'cubic';
}

interface StandingSpec extends Composed {
  readonly art: typeof StandingArt.Type;
  readonly stance: Standing;
  readonly feet: Feet;
}

interface SeatedSpec extends Composed {
  readonly art: typeof SeatedArt.Type;
  readonly stance: Seated;
  readonly feet?: never;
}

type FigureSpec = StandingSpec | SeatedSpec;

const isPart = Schema.is(Schema.Struct({ _tag: Schema.String }));

const oncePerKind = Schema.makeFilter((states: ReadonlyArray<unknown>) => {
  const kinds = states.map((s) => (isPart(s) ? s._tag : undefined));
  return new Set(kinds).size === kinds.length ? true : 'a state of one kind is laid twice';
});

const cutInTracedHead = Schema.makeFilter(
  (s: {
    readonly head: unknown;
    readonly beard?: unknown;
    readonly hair?: unknown;
    readonly headcloth?: unknown;
    readonly ear?: unknown;
    readonly mouth?: unknown;
  }) =>
    isPart(s.head) &&
    s.head._tag === 'RoundHead' &&
    [s.beard, s.hair, s.headcloth, s.ear, s.mouth].some((cut) => cut !== undefined)
      ? 'a round head takes no beard, hair, headcloth, ear or open mouth: each is cut inside a traced head (Head.Traced)'
      : true,
);

const headAtOrigin = Schema.makeFilter((s: { readonly head: unknown }) =>
  Predicate.hasProperty(s.head, 'y') && s.head.y !== 0
    ? `a seated figure's origin is at its head's height: its head's y is ${String(s.head.y)}, not 0`
    : true,
);

const slots = {
  lock: Schema.optionalKey(Schema.Unknown),
  concept: ConceptRef,
  stature: Schema.Unknown,
  head: Schema.Unknown,
  beard: Schema.optionalKey(Schema.Unknown),
  hair: Schema.optionalKey(Schema.Unknown),
  headcloth: Schema.optionalKey(Schema.Unknown),
  ear: Schema.optionalKey(Schema.Unknown),
  face: Schema.Unknown,
  mouth: Schema.optionalKey(Schema.Unknown),
  body: Schema.Unknown,
  arms: Schema.optionalKey(
    Schema.Struct({
      near: Schema.optionalKey(Schema.Unknown),
      far: Schema.optionalKey(Schema.Unknown),
    }),
  ),
  over: Schema.optionalKey(Schema.Unknown),
  states: Schema.optionalKey(Schema.Array(Schema.Unknown).check(oncePerKind)),
  hands: Schema.Unknown,
  path: Schema.optional(Schema.Literal('cubic')),
};

const StandingSlots = Schema.Struct({
  ...slots,
  art: StandingArt,
  stance: Schema.Unknown,
  feet: Schema.Unknown,
}).check(cutInTracedHead);
const decodeStandingSlots = decoder(StandingSlots);

const SeatedSlots = Schema.Struct({ ...slots, art: SeatedArt, stance: Schema.Unknown }).check(
  cutInTracedHead,
  headAtOrigin,
);
const decodeSeatedSlots = decoder(SeatedSlots);

interface ComposedParts {
  readonly lock?: Lock;
  readonly concept: ConceptRef;
  readonly stature: Stature;
  readonly head: Head;
  readonly beard?: Beard;
  readonly hair?: Hair;
  readonly headcloth?: Headcloth;
  readonly ear?: Ear;
  readonly face: KitA;
  readonly mouth?: OpenMouth;
  readonly body: Garment;
  readonly arms: Arms;
  readonly over?: Over;
  readonly states: { readonly stain?: Stain; readonly robe?: GivenRobe };
  readonly hands: Hands;
  readonly path?: 'cubic';
}

export interface StandingParts extends ComposedParts {
  readonly art: typeof StandingArt.Type;
  readonly stance: Standing;
  readonly feet: Feet;
}

export interface SeatedParts extends ComposedParts {
  readonly art: typeof SeatedArt.Type;
  readonly stance: Seated;
}

export type Parts = StandingParts | SeatedParts;

export type ComposedFigure<K extends string, P extends Parts = Parts> = P & {
  readonly knobs: Readonly<Record<K, number>>;
};

const composed = new WeakSet<object>();

const frozen = <A>(u: A, seen = new Set<object>()): A => {
  if (Predicate.isObjectOrArray(u) && !seen.has(u)) {
    seen.add(u);
    Object.freeze(u);
    for (const v of Object.values(u)) frozen(v, seen);
  }
  return u;
};

export const isComposed = (u: unknown): u is ComposedFigure<string> =>
  Predicate.isObject(u) && composed.has(u);

export const isSeated = (f: Parts): f is SeatedParts => f.stance._tag === 'Seated';

const isSeatedSpec = (spec: FigureSpec): spec is SeatedSpec => spec.stance._tag === 'Seated';

const STANCE = { lean: 0, tilt: 0, nod: 0 } as const;

type HeadKnob<H> = [H] extends [RoundHead] ? 'faceY' : never;

type StateKnob<S> = S extends Stain ? 'stain' : S extends GivenRobe ? 'robe' : never;

type StatesKnob<T> =
  T extends ReadonlyArray<infer S> ? (number extends T['length'] ? never : StateKnob<S>) : never;

type ArmKnob<A> = {
  readonly [Side in keyof A & ArmSide]: A[Side] extends JointedArm
    ? `${Side}Arm` | `${Side}Elbow`
    : A[Side] extends Arm
      ? `${Side}Arm`
      : never;
}[keyof A & ArmSide];

type KnobsOf<S extends FigureSpec> =
  | FaceKnob
  | keyof typeof STANCE
  | HeadKnob<S['head']>
  | (S extends { readonly mouth: OpenMouth } ? 'shout' : never)
  | (S extends { readonly states: infer T } ? StatesKnob<T> : never)
  | (S extends { readonly arms: infer A } ? ArmKnob<A> : never);

const gazeFrom = (head: Head) => [0, head.y] as const;

const knobsOf = (f: Parts) => {
  const [x, y] = gazeFrom(f.head);
  const knobs = new Map(
    Object.entries({
      ...FACE,
      ...f.face.rest,
      gazeX: x + f.face.gaze[0],
      gazeY: y + f.face.gaze[1],
    }),
  );
  for (const mark of f.face.extra ?? []) knobs.set(mark, EXTRA_FACE[mark]);
  if (f.mouth !== undefined) knobs.set('shout', 0);
  for (const [name, rest] of Object.entries(STANCE)) knobs.set(name, rest);
  if (f.head._tag === 'RoundHead') knobs.set('faceY', 0);
  if (f.states.stain !== undefined) knobs.set('stain', 1);
  if (f.states.robe !== undefined) knobs.set('robe', 0);
  for (const side of ARM_SIDES) {
    const arm = f.arms[side];
    if (arm !== undefined) knobs.set(`${side}Arm`, arm.rest);
    if (arm?._tag === 'JointedArm') knobs.set(`${side}Elbow`, arm.bend);
  }
  return Object.fromEntries(knobs);
};

const statesOf = (states: ReadonlyArray<State>): ComposedParts['states'] => {
  const checked = states.map((s, i) => decodeState(s, `states[${i}]`));
  return {
    stain: checked.find((s): s is Stain => s._tag === 'Stain'),
    robe: checked.find((s): s is GivenRobe => s._tag === 'GivenRobe'),
  };
};

const pivotOn = (garment: ReadonlyArray<Pt>, sleeve: ReadonlyArray<Pt>) =>
  decoder(
    Point.check(
      Schema.makeFilter((pivot: Pt) => {
        if (!inside(pivot, garment)) {
          return `its pivot (${pivot.join(', ')}) lies outside its garment: an arm turns inside it`;
        }
        const reach = inside(pivot, sleeve) ? 0 : fromEdge(pivot, sleeve);
        const edge = fromEdge(pivot, garment);
        if (reach < edge) return true;
        const [r, e] = [reach.toFixed(1), edge.toFixed(1)];
        return `its sleeve lies ${r} from its pivot, its garment's edge ${e}: a sleeve lies nearer its pivot than the edge`;
      }),
    ),
  );

const handOn = (pivot: Pt, sleeve: ReadonlyArray<Pt>, radius: number) =>
  decoder(
    Point.check(
      Schema.makeFilter((hand: Pt) => {
        const from = ([x, y]: Pt) => Math.hypot(x - pivot[0], y - pivot[1]);
        const end = Math.max(...sleeve.map(from));
        if (from(hand) < end) {
          const [h, e] = [from(hand).toFixed(1), end.toFixed(1)];
          return `its hand (${hand.join(', ')}) lies ${h} from its pivot, its sleeve's end ${e}: a hand lies past its sleeve's end`;
        }
        const gap = inside(hand, sleeve) ? 0 : fromEdge(hand, sleeve);
        if (gap <= radius) return true;
        const [g, r] = [gap.toFixed(1), radius.toFixed(1)];
        return `its hand (${hand.join(', ')}) lies ${g} from its sleeve, its circle ${r} across from its centre: a hand touches its sleeve`;
      }),
    ),
  );

const elbowIn = (pivot: Pt, upper: ReadonlyArray<Pt>, forearm: ReadonlyArray<Pt>) =>
  decoder(
    Point.check(
      Schema.makeFilter((elbow: Pt) => {
        if (elbow[0] === pivot[0] && elbow[1] === pivot[1]) {
          return `its elbow (${elbow.join(', ')}) lies on its pivot: an upper sleeve runs from its shoulder to its elbow`;
        }
        return inside(elbow, upper) && inside(elbow, forearm)
          ? true
          : `its elbow (${elbow.join(', ')}) lies outside its upper sleeve or its forearm: an elbow lies inside both`;
      }),
    ),
  );

const widthOf = (head: Head) => {
  if (head._tag === 'RoundHead') return 2 * head.r[0];
  const xs = head.outline.map(([x]) => x);
  return Math.max(...xs) - Math.min(...xs);
};

const armsOf = (arms: Arms, body: Garment, radius: number): Arms => {
  const garment = garmentOutline(body);
  const armOn = (arm: AnyArm | undefined, part: string) => {
    if (arm === undefined) return undefined;
    const checked = decodeArm(arm, part);
    pivotOn(garment, checked.outline)(checked.pivot, part);
    if (checked._tag === 'Arm') {
      handOn(checked.pivot, checked.outline, radius)(checked.hand, part);
    } else {
      elbowIn(checked.pivot, checked.outline, checked.forearm)(checked.elbow, part);
      handOn(checked.elbow, checked.forearm, radius)(checked.hand, part);
    }
    return checked;
  };
  return { near: armOn(arms.near, 'arms.near'), far: armOn(arms.far, 'arms.far') };
};

const skinAfterCloth = decoder(
  GarmentTones.check(
    Schema.makeFilter((tones: ReadonlyArray<{ readonly skin?: true }>) => {
      const skin = tones.findIndex((t) => t.skin === true);
      const cloth = skin < 0 ? -1 : tones.findIndex((t, i) => i > skin && t.skin !== true);
      return cloth < 0
        ? true
        : `its tone ${cloth}, cloth, is laid after its skin (tone ${skin}): a given robe lays the skin again over its paper and covers the cloth, so skin that cloth covers would show on the robe; lay the skin after the cloth, cut to where it shows, or, if tone ${cloth} is a shade on the skin, mark it \`skin\``;
    }),
  ),
);

const skinUnderRobe = (f: Pick<ComposedParts, 'body' | 'arms'>) => {
  skinAfterCloth(tonesOn(f.body), 'body');
  for (const side of ARM_SIDES) {
    const arm = f.arms[side];
    if (arm?.tones !== undefined) skinAfterCloth(arm.tones, `arms.${side}`);
    if (arm?._tag === 'JointedArm' && arm.forearmTones !== undefined)
      skinAfterCloth(arm.forearmTones, `arms.${side}.forearm`);
  }
};

const composedOf = (spec: FigureSpec, concept: ConceptRef): ComposedParts => {
  const body = decodeGarment(spec.body, 'body');
  const head = decodeHead(spec.head, 'head');
  const hands = decodeHands(spec.hands, 'hands');
  const parts: ComposedParts = {
    lock: spec.lock === undefined ? undefined : decodeLock(spec.lock, 'lock'),
    concept,
    stature: decodeStature(spec.stature, 'stature'),
    head,
    beard: spec.beard === undefined ? undefined : decodeBeard(spec.beard, 'beard'),
    hair: spec.hair === undefined ? undefined : decodeHair(spec.hair, 'hair'),
    headcloth:
      spec.headcloth === undefined ? undefined : decodeHeadcloth(spec.headcloth, 'headcloth'),
    ear: spec.ear === undefined ? undefined : decodeEar(spec.ear, 'ear'),
    face: decodeKit(spec.face, 'face'),
    mouth: spec.mouth === undefined ? undefined : decodeMouth(spec.mouth, 'mouth'),
    body,
    arms: armsOf(spec.arms ?? {}, body, (hands.share * widthOf(head)) / 2),
    over: spec.over === undefined ? undefined : decodeOver(spec.over, 'over'),
    states: statesOf(spec.states ?? []),
    hands,
  };
  if (parts.states.robe !== undefined) skinUnderRobe(parts);
  return spec.path === undefined ? parts : { ...parts, path: spec.path };
};

const partsOf = (spec: FigureSpec): Parts => {
  if (isSeatedSpec(spec)) {
    const { concept, art } = decodeSeatedSlots(spec, 'figure');
    return { ...composedOf(spec, concept), art, stance: decodeSeated(spec.stance, 'stance') };
  }
  const { concept, art } = decodeStandingSlots(spec, 'figure');
  return {
    ...composedOf(spec, concept),
    art,
    stance: decodeStanding(spec.stance, 'stance'),
    feet: decodeFeet(spec.feet, 'feet'),
  };
};

export function figure<const S extends StandingSpec>(
  spec: S,
): ComposedFigure<KnobsOf<S>, StandingParts>;
export function figure<const S extends SeatedSpec>(
  spec: S,
): ComposedFigure<KnobsOf<S>, SeatedParts>;
export function figure(spec: FigureSpec): ComposedFigure<string> {
  const parts = partsOf(spec);
  const f = frozen({ ...parts, knobs: knobsOf(parts) });
  composed.add(f);
  return f;
}
