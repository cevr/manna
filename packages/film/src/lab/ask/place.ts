import { Place } from '@manna/url-state';
import { Data, Option } from 'effect';
import { Places } from '../../core/api.ts';

export type AskPlace = Data.TaggedEnum<{
  Ask: { readonly ask: string };
  AskPage: { readonly page: string };
}>;
export const AskPlace = Data.taggedEnum<AskPlace>();

export const askPlaceOf = (href: string): Option.Option<AskPlace> =>
  Option.firstSomeOf<AskPlace>([
    Option.map(Place.decode(Places.ask, href), (v) => AskPlace.Ask(v.path)),
    Option.map(Place.decode(Places.askPage, href), (v) => AskPlace.AskPage(v.path)),
  ]);

interface Stilled {
  readonly read: (href: string) => Option.Option<string>;
  readonly write: (href: string, still: string) => Option.Option<string>;
}

const stilled = <A extends { readonly query: { readonly still: string } }>(
  place: Place.Place<A>,
): Stilled => ({
  read: (href) => Option.map(Place.decode(place, href), (v) => v.query.still),
  write: (href, still) =>
    Option.map(Place.decode(place, href), (v) =>
      Place.href(place, { ...v, query: { ...v.query, still } }),
    ),
});

const STILLED: ReadonlyArray<Stilled> = [stilled(Places.ask), stilled(Places.askPage)];

export const stillIn = (href: string): Option.Option<string> =>
  Option.filter(Option.firstSomeOf(STILLED.map((s) => s.read(href))), (still) => still !== '');

export const withStill = (href: string, still: string): Option.Option<string> =>
  Option.firstSomeOf(STILLED.map((s) => s.write(href, still)));
