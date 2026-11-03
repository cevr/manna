import { Layer } from 'effect';

import { List, ListHandlers } from '../list/List.model.ts';
import { layer as addressesLayer, layerBook } from './addresses.ts';
import { layerPostman } from './postman.ts';
import { layer as rosterLayer, layerStore } from './roster.ts';

export const layerTables = Layer.mergeAll(addressesLayer, rosterLayer);

export const layerModel = List.layer(ListHandlers).pipe(
  Layer.provide(Layer.mergeAll(layerBook, layerStore, layerPostman)),
);
