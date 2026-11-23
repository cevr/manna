/**
 * The rows a `pixel ref` or `pixel shot` names: every row of the app when
 * it names none, else the rows named, in the inventory's order; refused
 * when one named is no row of the app, so a typo never shoots nothing and
 * exits 0.
 */

import type { AppName, Row } from './model.ts';

type Asked =
  | { readonly _tag: 'Rows'; readonly rows: ReadonlyArray<Row> }
  | { readonly _tag: 'Refused'; readonly reason: string };

/** The rows of `all` (app `app`'s) that `ids` names. */
export const rowsAsked = (
  app: AppName,
  all: ReadonlyArray<Row>,
  ids: ReadonlyArray<string>,
): Asked => {
  const unknown = ids.filter((id) => !all.some((row) => row.id === id));
  if (unknown.length > 0)
    return { _tag: 'Refused', reason: `pixel: no row ${unknown.join(', ')} in ${app}` };
  return { _tag: 'Rows', rows: all.filter((row) => ids.length === 0 || ids.includes(row.id)) };
};
