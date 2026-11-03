import { Effect, Option, Schema, SchemaIssue, SchemaTransformation } from 'effect';
import { Address, addressKey, addressOfKey } from './address.ts';
import { PartId } from './address-schema.ts';

const Name = Schema.NonEmptyString;

export const Clip = Name.check(
  Schema.makeFilter((clip: string) =>
    Option.match(addressOfKey(clip), {
      onNone: () => true,
      onSome: () => `a montage clip is not named like an address ("${clip}")`,
    }),
  ),
);

export const PointRef = Schema.Union([
  Schema.TaggedStruct('Render', { address: Address }),
  Schema.TaggedStruct('Montage', { clip: Clip }),
  Schema.TaggedStruct('Score', {}),
  Schema.TaggedStruct('Take', { sound: Name }),
  Schema.TaggedStruct('Voice', { beat: PartId }),
  Schema.TaggedStruct('Look', { name: Name }),
]).pipe(Schema.toTaggedUnion('_tag'));
export type PointRef = typeof PointRef.Type;

const encode = (ref: PointRef): string =>
  PointRef.match(ref, {
    Render: ({ address }) => `render:${addressKey(address)}`,
    Montage: ({ clip }) => `render:${clip}`,
    Score: () => 'score',
    Take: ({ sound }) => `take:${sound}`,
    Voice: ({ beat }) => `voice:${beat}`,
    Look: ({ name }) => `look:${name}`,
  });

const read = (id: string): Option.Option<PointRef> => {
  if (id === 'score') return Option.some({ _tag: 'Score' });
  const colon = id.indexOf(':');
  if (colon <= 0 || colon === id.length - 1) return Option.none();
  const kind = id.slice(0, colon);
  const name = id.slice(colon + 1);
  switch (kind) {
    case 'take':
      return Option.some({ _tag: 'Take', sound: name });
    case 'voice':
      return Option.some({ _tag: 'Voice', beat: name });
    case 'look':
      return Option.some({ _tag: 'Look', name });
    case 'render':
      return Option.some(
        Option.match(addressOfKey(name), {
          onNone: (): PointRef => ({ _tag: 'Montage', clip: name }),
          onSome: (address): PointRef => ({ _tag: 'Render', address }),
        }),
      );
    default:
      return Option.none();
  }
};

const isPointRef = Schema.is(PointRef);

const decode = (id: string): Option.Option<PointRef> =>
  Option.filter(read(id), (ref) => isPointRef(ref) && encode(ref) === id);

export const PointId = Schema.String.pipe(
  Schema.decodeTo(
    Schema.toType(PointRef),
    SchemaTransformation.transformEffect({
      decode: (id: string) =>
        Effect.fromOption(decode(id)).pipe(
          Effect.mapError(
            () => new SchemaIssue.InvalidValue({ message: `no choice point is "${id}"` }, id),
          ),
        ),
      encode: (ref: PointRef) => Effect.succeed(encode(ref)),
    }),
  ),
);

export const pointIdOf = (ref: PointRef): string => encode(ref);
