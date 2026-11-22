/**
 * The current hymnal's intro rules (`src/follow/intro-rules.ts`) as Exact's
 * type check reads them (the app's `tsconfig.json` maps
 * `@manna/hymnal-app/follow/intro-rules` here): the source answers
 * `effect`'s `Option`, named here by the two shapes it takes at run time.
 * `src/follow/follow.model.test.ts` holds them to the source.
 */

type Maybe<A> = { readonly _tag: 'None' } | { readonly _tag: 'Some'; readonly value: A };

export interface Intro {
  readonly share: number;
  readonly left: number;
}

export declare const introAt: (first: number, ms: number) => Maybe<Intro>;

export declare const readingOf: (intro: Intro) => { readonly now: number; readonly text: string };
