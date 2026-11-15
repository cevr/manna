import type { Answer, Sources } from './app.contract.d.ts';
import { sources as registered } from './src/sources.ts';

export const grants = '';

const sources: Sources = registered;
export const answer: Answer = (source, args, store, storage, native) =>
  sources[source](args, store, storage, native);
