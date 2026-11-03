import { Data, Option, Schema } from 'effect';

import type { StackRoute } from '~/stack';

export interface StackState {
  readonly routes: ReadonlyArray<StackRoute>;
  readonly index: number;
}

export type TitleGo = Data.TaggedEnum<{
  Close: {};
  Open: { readonly number: number };
  Replace: { readonly number: number };
}>;

export const TitleGo = Data.taggedEnum<TitleGo>();

const hymnRoute = 'hymns/[number]';

const decodeHymn = Schema.decodeUnknownOption(Schema.Struct({ number: Schema.String }));

const hymnOf = (route: StackRoute): Option.Option<string> =>
  Option.liftPredicate(route, (r) => r.name === hymnRoute).pipe(
    Option.flatMap((r) => decodeHymn(r.params)),
    Option.map(({ number }) => number),
  );

export const titleGoes = (state: StackState, hymn: number): TitleGo =>
  Option.fromNullishOr(state.routes[state.index - 1]).pipe(
    Option.match({
      onNone: () => TitleGo.Replace({ number: hymn }),
      onSome: (under) =>
        hymnOf(under).pipe(
          Option.filter((shown) => shown === String(hymn)),
          Option.match({
            onNone: () => TitleGo.Open({ number: hymn }),
            onSome: () => TitleGo.Close(),
          }),
        ),
    }),
  );
