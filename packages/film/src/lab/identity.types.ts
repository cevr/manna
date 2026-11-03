import type { Effect } from 'effect';
import type { Bound, ChangeBound } from '../command/command.ts';
import { OpId } from '../core/catalogue.ts';
import { ChangeId, type RequestId } from '../core/schema.ts';
import { uniqueId } from '../core/unique.ts';

declare const cueName: string;
declare const film: string;
declare const anyStringEffect: Effect.Effect<string>;
declare const handMade: string;
declare const madeAt: number;
declare const request: RequestId;

// @ts-expect-error a change is bound by its id, never by its target's words
export const byName: Bound = { film, change: `cue ${cueName} offset` };

// @ts-expect-error a change is bound by its id, never by when it was made
export const byTime: Bound = { film, change: String(madeAt) };

// @ts-expect-error a step's request id is made as one (`uniqueId(RequestId)`)
export const sameType: Effect.Effect<RequestId> = anyStringEffect;

// @ts-expect-error a change id is made or decoded, never any string
export const asId: ChangeBound['change'] = handMade;

// @ts-expect-error a request id never names a change
export const crossed: ChangeBound['change'] = request;

export const own: Bound = { film, change: ChangeId.make('k1') };
export const approved: Bound = { film, gave: { op: OpId.make('op-1'), scenes: ['a'] } };
export const made: Effect.Effect<ChangeId> = uniqueId(ChangeId);
