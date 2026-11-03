import { sweep } from './limb-sweep.ts';
import { Effect } from 'effect';

// oxlint-disable-next-line effect/noAsyncFunction -- register the real-art cases after this shard's sheets load
await Effect.runPromise(sweep(5, 8));
