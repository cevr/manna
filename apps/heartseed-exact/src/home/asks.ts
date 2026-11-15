/** What the reader does: open a row's ask (`key` names the row: the id its Yes acts on), answer it, tap elsewhere, or go back. */
export type AskInput =
  | { readonly _tag: 'ask'; readonly key: string }
  | { readonly _tag: 'yes' }
  | { readonly _tag: 'no' }
  | { readonly _tag: 'elsewhere' }
  | { readonly _tag: 'back' };

/** The ask open after a step (empty for none), and the row a Yes acts on (empty for none). */
export interface Asked {
  readonly asking: string;
  readonly acts: string;
}

/**
 * The ask after `input`, from the ask `asking` open before it, as the
 * Contract holds home's and a list page's asks (`homeAsking`, `listAsking`):
 * an ask is a state of its row, never a route or an alert. A Remove or a
 * Move back opens its row's ask and closes any other; only the ask's Yes
 * acts, on the row the ask is open on; No, a tap anywhere else and Back
 * close it and do nothing. `asks.test.ts` walks generated sequences through
 * it, and `words.test.ts` holds the Contract's actions to it.
 */
export const askStep = (asking: string, input: AskInput): Asked => {
  if (input._tag === 'ask') return { asking: input.key, acts: '' };
  if (input._tag === 'yes') return { asking: '', acts: asking };
  return { asking: '', acts: '' };
};
