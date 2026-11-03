import { Array as Arr, Effect, Option, Schema, SchemaTransformation } from 'effect';
import { Address } from './address.ts';
import {
  ApprovalState,
  type Catalogue,
  SaidComment,
  StaleBy,
  type Subject,
  VariantState,
  approvalState,
  saidOn,
  topicAt,
} from './catalogue.ts';
import { PointId, PointRef, pointIdOf } from './point.ts';
import { Seconds, maybe } from './schema.ts';
import { ReviewFile, ReviewVideo } from './served.ts';

const ChoiceKind = Schema.Literals(['render', 'score', 'take', 'voice', 'look']);
type ChoiceKind = typeof ChoiceKind.Type;

export const ChoiceVerb = Schema.Literals(['pick', 'unpick', 'reject']);
export type ChoiceVerb = typeof ChoiceVerb.Type;

const VariantMedia = Schema.Union([
  Schema.TaggedStruct('Seen', { video: ReviewVideo }),
  Schema.TaggedStruct('Heard', { alone: Schema.Boolean, inPlace: Schema.Boolean }),
  Schema.TaggedStruct('Unseen', {}),
]).pipe(Schema.toTaggedUnion('_tag'));
type VariantMedia = typeof VariantMedia.Type;

export const ChoiceVariant = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  lines: Schema.Array(Schema.String),
  state: VariantState,
  staleBy: maybe(StaleBy),
  picked: Schema.Boolean,
  verbs: Schema.Array(ChoiceVerb),
  fixed: maybe(Schema.String),
  media: VariantMedia,
  key: Schema.String,
  approval: ApprovalState,
  comments: Schema.Array(SaidComment),
  notes: maybe(ReviewFile),
});
export type ChoiceVariant = typeof ChoiceVariant.Type;

export const ChoiceMark = Schema.Struct({ t: Seconds, label: Schema.String });
export type ChoiceMark = typeof ChoiceMark.Type;

const pointFields = {
  id: Schema.String,
  kind: ChoiceKind,
  address: maybe(Address),
  title: Schema.String,
  lines: Schema.Array(Schema.String),
  start: Seconds,
  moments: maybe(Schema.Array(Seconds)),
  marks: Schema.Array(ChoiceMark),
  variants: Schema.Array(ChoiceVariant),
};

const KIND = {
  Render: 'render',
  Montage: 'render',
  Score: 'score',
  Take: 'take',
  Voice: 'voice',
  Look: 'look',
} as const satisfies { readonly [Tag in PointRef['_tag']]: ChoiceKind };

export const ChoicePoint = Schema.Struct(pointFields).pipe(
  Schema.decodeTo(
    Schema.toType(Schema.Struct({ ...pointFields, ref: PointRef })),
    SchemaTransformation.transformEffect({
      decode: (point) =>
        Schema.decodeEffect(PointId)(point.id).pipe(
          Effect.map((ref) => ({ ...point, ref, kind: KIND[ref._tag] })),
          Effect.mapError((error) => error.issue),
        ),
      encode: ({ ref: _ref, ...point }) => Effect.succeed(point),
    }),
  ),
);
export type ChoicePoint = typeof ChoicePoint.Type;

export type VariantDraft = Omit<
  ChoiceVariant,
  'approval' | 'comments' | 'notes' | 'staleBy' | 'fixed'
> & {
  readonly notes?: Option.Option<ReviewFile>;
  readonly staleBy?: Option.Option<StaleBy>;
  readonly fixed?: Option.Option<string>;
};

export const pointHead = (ref: PointRef): Pick<ChoicePoint, 'id' | 'ref' | 'kind'> => ({
  id: pointIdOf(ref),
  ref,
  kind: KIND[ref._tag],
});

export interface PointDraft extends Omit<
  ChoicePoint,
  'id' | 'kind' | 'variants' | 'moments' | 'marks' | 'start'
> {
  readonly variants: ReadonlyArray<VariantDraft>;
  readonly start?: number;
  readonly moments?: Option.Option<ReadonlyArray<number>>;
  readonly marks?: ReadonlyArray<ChoiceMark>;
}

export const subjectAt = (
  ref: PointRef,
  address: Address,
  variant: { readonly id: string; readonly key: string },
): Subject => ({ ...topicAt(address, ref, variant.id), key: variant.key });

const STALE = {
  render: 'it was drawn for an earlier version; render it again, then approve the new render',
  score: 'it was composed for an earlier plan; compose it again, then approve that',
  take: 'it was made for an earlier declaration; approve a take made for the one now',
  voice: 'it was recorded for an earlier line; approve an attempt at the line now',
  look: 'it is no level the look offers now',
} as const satisfies { readonly [K in ChoiceKind]: string };

const STALE_BY = {
  sources: {
    why: 'its sources changed since it was made',
    fix: 'render it again, then approve the new render',
  },
  sound: {
    why: "the film's sound changed since it was made",
    fix: 'render it again (a re-mux), then approve that',
  },
} as const satisfies { readonly [S in StaleBy]: { readonly why: string; readonly fix: string } };

export const approvalRefused = (
  kind: ChoiceKind,
  variant: {
    readonly state: VariantState;
    readonly staleBy: Option.Option<StaleBy>;
  },
): Option.Option<string> => {
  if (variant.state === 'current') return Option.none();
  if (variant.state === 'missing')
    return Option.some('nothing is made of it yet; make it, then approve it');
  return Option.some(
    `it is stale: ${Option.match(variant.staleBy, {
      onNone: () => STALE[kind],
      onSome: (by) => `${STALE_BY[by].why}; ${STALE_BY[by].fix}`,
    })}`,
  );
};

export const withSay = (catalogue: Option.Option<Catalogue>, draft: PointDraft): ChoicePoint => {
  const { ref } = draft;
  return {
    ...draft,
    ...pointHead(ref),
    start: draft.start ?? 0,
    moments: draft.moments ?? Option.none(),
    marks: draft.marks ?? [],
    variants: draft.variants.map((variant): ChoiceVariant => {
      const said = Option.map(
        Option.all({ cat: catalogue, address: draft.address }),
        ({ cat, address }) => ({ cat, subject: subjectAt(ref, address, variant) }),
      );
      return {
        ...variant,
        notes: variant.notes ?? Option.none(),
        staleBy: variant.staleBy ?? Option.none(),
        fixed: variant.fixed ?? Option.none(),
        approval: Option.match(said, {
          onNone: (): ApprovalState => 'none',
          onSome: ({ cat, subject }) => approvalState(cat, subject),
        }),
        comments: Option.match(said, {
          onNone: () => [],
          onSome: ({ cat, subject }) => saidOn(cat, subject),
        }),
      };
    }),
  };
};

export const pointNamed = (
  points: ReadonlyArray<ChoicePoint>,
  id: string,
): Option.Option<ChoicePoint> => Arr.findFirst(points, (p) => p.id === id);

export const variantNamed = (point: ChoicePoint, id: string): Option.Option<ChoiceVariant> =>
  Arr.findFirst(point.variants, (v) => v.id === id);

interface SeenVariant extends ChoiceVariant {
  readonly video: ReviewVideo;
}

export const seenVariants = (point: ChoicePoint): ReadonlyArray<SeenVariant> =>
  point.variants.flatMap((variant) =>
    VariantMedia.match(variant.media, {
      Seen: ({ video }) => [{ ...variant, video }],
      Heard: () => [],
      Unseen: () => [],
    }),
  );

export const FilmChoices = Schema.Struct({
  film: Schema.String,
  pictures: Schema.Array(ReviewVideo),
  points: Schema.Array(ChoicePoint),
});
export type FilmChoices = typeof FilmChoices.Type;

export const PickPost = Schema.Struct({
  point: Schema.String,
  variant: Schema.String,
  verb: ChoiceVerb,
  acceptMismatch: Schema.optionalKey(Schema.Boolean),
});
export type PickPost = typeof PickPost.Type;
