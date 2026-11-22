/* oxlint-disable effect/noThrowStatement, effect/noNewError, effect/noNullish, effect/noTernary, effect/noTryCatch, effect/noGlobals -- a host tool: a row naming a fixture that does not exist is a broken harness, said by a throw; the agent's flags are plain strings, and its replies JSON texts read as they come. */

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
import { PORT_STORES, statesOf, type PortStore } from './port-store.ts';

/** The port's store for a row's shot: its name, and the fixture written into it first, if any. */
type SeedPlan =
  | { readonly _tag: 'Reset'; readonly storage: string }
  | {
      readonly _tag: 'Seed';
      readonly storage: string;
      readonly port: PortStore;
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
export const storageFlags = (plan: Pick<SeedPlan, '_tag' | 'storage'>) => [
  '--storage',
  plan.storage,
  plan._tag === 'Seed' ? '--keep-storage' : '--reset-storage',
];

/**
 * What a row's web shot starts from: the same plan as its iOS shot
 * (`seedPlan`), as the persisted states the port's web page reads from
 * `localStorage` (`web-store.ts` writes them into the drive's own Chrome
 * profile). A port that keeps its fixture in a file has it in the browser's
 * IndexedDB, which nothing here writes yet: such a row's web cell is
 * refused, never shot on an empty store against a reference that holds the
 * fixture.
 */
type WebSeed =
  | { readonly _tag: 'Reset'; readonly storage: string }
  | {
      readonly _tag: 'Seed';
      readonly storage: string;
      readonly bundle: string;
      readonly states: ReadonlyArray<readonly [string, string]>;
    }
  | { readonly _tag: 'Refused'; readonly reason: string };

/** A JSON text in one spelling, or the text itself when it is no JSON. */
const canonical = (text: string) => {
  try {
    return JSON.stringify(JSON.parse(text));
  } catch {
    return text.trim();
  }
};

/**
 * Why a seeded web drive did not open on its fixture, or none: the agent's
 * `--json` output `out` holds one reply a line, and the replies to the
 * `state <name>` read-backs `webCommand` puts after `prefer` and the first
 * `clock settle` are the third line on; each must be the state's seeded
 * value. A store the page did not read (another origin, another key)
 * answers the port's own initial values and is refused here, not scored.
 */
export const readBackRefusal = (
  out: string,
  states: ReadonlyArray<readonly [string, string]>,
): string | undefined => {
  const replies = out.trim().split('\n').slice(2);
  const wrong = states.flatMap(([name, text], i) => {
    const reply = replies[i] ?? '';
    return canonical(reply) === canonical(text)
      ? []
      : [`${name} read ${reply.trim() || 'nothing'}, seeded ${text}`];
  });
  return wrong.length === 0 ? undefined : `the web store was not read: ${wrong.join('; ')}`;
};

/** `row`'s web seed, made at `now`. */
export const webSeedOf = (app: AppName, row: Row, now: Date): WebSeed => {
  const plan = seedPlan(app, row, now);
  if (plan._tag === 'Reset') return plan;
  if (plan.port._tag === 'File')
    return {
      _tag: 'Refused',
      reason: `${row.id}: its fixture ${row.fixture ?? ''} cannot be seeded on the web yet: the ${app} port keeps it in app:/${plan.port.file}, which the web host holds in IndexedDB`,
    };
  return {
    _tag: 'Seed',
    storage: plan.storage,
    bundle: plan.port.bundle,
    states: statesOf(plan.port.states, plan.store),
  };
};
