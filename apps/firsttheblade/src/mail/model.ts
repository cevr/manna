/**
 * The list's model (`../list/List.model.ts`) with this server's adapters: the
 * address book and the roster over the database (`./addresses.ts`,
 * `./roster.ts`), and the Postman over the mailer (`./postman.ts`). A
 * platform hosts it: Durable Objects on Cloudflare (`../worker/mail.ts`),
 * memory in the tests and the preview (`./local.ts`).
 */
import { Layer } from 'effect';

import { List, ListHandlers } from '../list/List.model.ts';
import { layer as addressesLayer, layerBook } from './addresses.ts';
import { layerPostman } from './postman.ts';
import { layer as rosterLayer, layerStore } from './roster.ts';

/** The address book and the roster, over the database's port. */
export const layerTables = Layer.mergeAll(addressesLayer, rosterLayer);

/** The model, its subscribers' client and its handlers, over the tables, the tokens and the mailer. */
export const layerModel = List.layer(ListHandlers).pipe(
  Layer.provide(Layer.mergeAll(layerBook, layerStore, layerPostman)),
);
