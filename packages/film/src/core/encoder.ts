import { Option, Schema } from 'effect';

const Hardware = Schema.TaggedStruct('Hardware', {});
const Software = Schema.TaggedStruct('Software', {});
const NoEncoder = Schema.TaggedStruct('Missing', { reason: Schema.String });

export const Encoder = Schema.Union([Hardware, Software]).pipe(Schema.toTaggedUnion('_tag'));
export type Encoder = typeof Encoder.Type;

export const EncoderChoice = Schema.Union([Hardware, Software, NoEncoder]).pipe(
  Schema.toTaggedUnion('_tag'),
);
export type EncoderChoice = typeof EncoderChoice.Type;

export const EncoderName = Schema.Literals(['hardware', 'software']);
export type EncoderName = typeof EncoderName.Type;

const BY_NAME = {
  hardware: { _tag: 'Hardware' },
  software: { _tag: 'Software' },
} as const satisfies Readonly<Record<EncoderName, Encoder>>;

export const encoderName = (encoder: Encoder): EncoderName =>
  Encoder.match(encoder, {
    Hardware: (): EncoderName => 'hardware',
    Software: (): EncoderName => 'software',
  });

export const sharesInPage = (encoder: Encoder): boolean =>
  Encoder.match(encoder, { Hardware: () => true, Software: () => false });

export type Copies = 'master' | 'master+share' | 'share';

export const hasMaster = (copies: Copies): boolean => copies !== 'share';

export const hasShare = (copies: Copies): boolean => copies !== 'master';

export const copiesInPage = (asked: Copies, encoder: Encoder): Copies => {
  if (sharesInPage(encoder)) return asked;
  return 'master';
};

export const encoderNamed = (name: EncoderName): Encoder => BY_NAME[name];

export const encoderCandidates = (asked: Option.Option<Encoder>): ReadonlyArray<Encoder> => [
  Option.getOrElse(asked, () => BY_NAME.hardware),
];
