import { Array as Arr, Match, Option, Schema } from 'effect';
import { Segment } from './segment.ts';

const PART_ID = /^[a-z0-9][a-z0-9-]*$/;

export const PartId = Schema.String.check(
  Schema.makeFilter(
    (id: string) =>
      PART_ID.test(id) ||
      `"${id}" is no id: lower case, digits and dashes, starting with a letter or a digit`,
  ),
  Schema.isPattern(PART_ID),
);

export const ActName = Segment.check(
  Schema.isPattern(/^[^-]/, {
    message: 'an act is named by a word, never empty nor starting with "-"',
  }),
);
export type ActName = typeof ActName.Type;

const actNamed = Schema.decodeOption(ActName);

const FilmPart = Schema.TaggedStruct('Film', {});
const ActPart = Schema.TaggedStruct('Act', { act: ActName });
const ScenesPart = Schema.TaggedStruct('Scenes', { ids: Schema.NonEmptyArray(PartId) });

export const Address = Schema.Union([
  FilmPart,
  ActPart,
  ScenesPart,
  Schema.TaggedStruct('Short', { id: PartId }),
]);
export type Address = typeof Address.Type;

export const addressKey = (address: Address): string =>
  Match.valueTags(address, {
    Film: () => 'film',
    Act: ({ act }) => `act:${act}`,
    Scenes: ({ ids }) => `scenes:${ids.join(',')}`,
    Short: ({ id }) => `short:${id}`,
  });

export const addressOfKey = (key: string): Option.Option<Address> => {
  if (key === 'film') return Option.some({ _tag: 'Film' });
  const [kind = '', ...rest] = key.split(':');
  const name = rest.join(':');
  if (name === '') return Option.none();
  if (kind === 'act') return Option.map(actNamed(name), (act): Address => ({ _tag: 'Act', act }));
  if (kind === 'short') return Option.some({ _tag: 'Short', id: name });
  if (kind !== 'scenes') return Option.none();
  const ids = name.split(',');
  if (!Arr.isReadonlyArrayNonEmpty(ids)) return Option.none();
  return Option.some({ _tag: 'Scenes', ids });
};

export const sceneAddress = (id: string): Address => ({ _tag: 'Scenes', ids: [id] });
