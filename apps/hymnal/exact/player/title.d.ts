/**
 * `src/player/title.ts` as Exact's type check reads it: where a press on the
 * full player's title goes, from the stack the sheet is in. A screen is
 * named as the current app's stack names it (`hymns/[number]` with its
 * `number` for a hymn's page).
 */

export interface StackState {
  readonly routes: ReadonlyArray<{ readonly name: string; readonly params?: unknown }>;
  readonly index: number;
}

/** Back to the page under the sheet; the sheet closed and the page pushed; or the page in the sheet's place. */
export type TitleGo =
  | { readonly _tag: 'Close' }
  | { readonly _tag: 'Open'; readonly number: number }
  | { readonly _tag: 'Replace'; readonly number: number };

export declare const titleGoes: (state: StackState, hymn: number) => TitleGo;
