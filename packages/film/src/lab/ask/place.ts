// Where the ask page is, read from its URL's path (`Places`, `core/api.ts`),
// so a link, a reload or Back opens the same place: an ask (`/asks/<ask>`),
// the page of asks it is on taken to it, or a page of asks by its first ask
// (`/asks/page/<page>`). Both keep a still open full size (`?still=`:
// `stillIn`, `withStill`), an ask's Board panel opened by its `Zoom`.

import { Place } from '@manna/url-state';
import { Data, Option } from 'effect';
import { Places } from '../../core/api.ts';

export type AskPlace = Data.TaggedEnum<{
  /** An ask: the page of asks it is on, taken to it. */
  Ask: { readonly ask: string };
  /** A page of asks, by its first ask's id: taken to the first still asking. */
  AskPage: { readonly page: string };
}>;
export const AskPlace = Data.taggedEnum<AskPlace>();

/** The place `href` names: an ask's or a page of asks'; none on any other path. */
export const askPlaceOf = (href: string): Option.Option<AskPlace> =>
  Option.firstSomeOf<AskPlace>([
    Option.map(Place.decode(Places.ask, href), (v) => AskPlace.Ask(v.path)),
    Option.map(Place.decode(Places.askPage, href), (v) => AskPlace.AskPage(v.path)),
  ]);

/** A place that keeps a still open full size: reads its `?still=` from an href, and writes it. */
interface Stilled {
  readonly read: (href: string) => Option.Option<string>;
  readonly write: (href: string, still: string) => Option.Option<string>;
}

/** `place`'s still, for any place whose query keeps one. */
const stilled = <A extends { readonly query: { readonly still: string } }>(
  place: Place.Place<A>,
): Stilled => ({
  read: (href) => Option.map(Place.decode(place, href), (v) => v.query.still),
  write: (href, still) =>
    Option.map(Place.decode(place, href), (v) =>
      Place.href(place, { ...v, query: { ...v.query, still } }),
    ),
});

/**
 * Every page a still opens full size on (`Zoom`). A page that shows a
 * `Zoom` keeps `?still=` in its place and is listed here; the type admits
 * only a place whose query has one.
 */
const STILLED: ReadonlyArray<Stilled> = [stilled(Places.ask), stilled(Places.askPage)];

/** The still `href` opens full size (`?still=`): its key, or none. */
export const stillIn = (href: string): Option.Option<string> =>
  Option.filter(Option.firstSomeOf(STILLED.map((s) => s.read(href))), (still) => still !== '');

/** `href` with the still `still` open full size ('' for none), on a page that keeps one; none elsewhere. */
export const withStill = (href: string, still: string): Option.Option<string> =>
  Option.firstSomeOf(STILLED.map((s) => s.write(href, still)));
