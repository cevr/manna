/* oxlint-disable effect/noThrowStatement, effect/noNewError, effect/noNullish, effect/noTernary -- a host tool: a row naming a fixture that does not exist is a broken harness, said by a throw; the agent's flags are plain strings. */

/**
 * What a row's port shot starts from (`pixel shot`): its own named agent
 * store (`pm-<row id>`), so nothing one row keeps reaches another; kept as
 * written (`--keep-storage`) when the row's fixture is written into it
 * first, emptied (`--reset-storage`) for a row with no fixture or an app
 * whose port store is not described (`PORT_STORES`). A row naming a
 * fixture that does not exist is refused, never shot over an empty store.
 */

import { storeOf, type Store } from './fixtures.ts';
import type { AppName, Row } from './model.ts';
import { PORT_STORES } from './port-store.ts';

/** The port's store for a row's shot: its name, and the fixture written into it first, if any. */
type SeedPlan =
  | { readonly _tag: 'Reset'; readonly storage: string }
  | {
      readonly _tag: 'Seed';
      readonly storage: string;
      readonly port: { readonly bundle: string; readonly file: string };
      readonly store: Store;
    };

/** The store `row`'s port shot starts from, made at `now` as the reference's fixture was at its own instant. */
export const seedPlan = (app: AppName, row: Row, now: Date): SeedPlan => {
  const storage = `pm-${row.id}`;
  const port = PORT_STORES[app];
  if (port === undefined || row.fixture === undefined) return { _tag: 'Reset', storage };
  const store = storeOf(app, row.fixture, now);
  if (store === undefined) throw new Error(`${row.id}: no fixture ${row.fixture}`);
  return { _tag: 'Seed', storage, port, store };
};

/** The agent's flags for a plan's store: its name, and keep (a seeded store) or reset. */
export const storageFlags = (plan: SeedPlan) => [
  '--storage',
  plan.storage,
  plan._tag === 'Seed' ? '--keep-storage' : '--reset-storage',
];
