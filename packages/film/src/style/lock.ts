import { DateTime, Option, Schema } from 'effect';
import { ConceptImage } from '../core/match.ts';
import type { Decided } from '../core/production.ts';
import { decoder, ruleCheck } from './decode.ts';
import { Words, overrideOf, whyUnbacked } from './override.ts';

const Sha256 = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{64}$/, { message: 'a sha256, as 64 lowercase hex digits' }),
);

const Freed = overrideOf('FigureLock', { frees: Sha256 });
type Freed = typeof Freed.Type;

const placed = ruleCheck(
  'FigureLock',
  (lock: { readonly item: string; readonly override?: Freed }) =>
    lock.override === undefined || lock.override.place === lock.item
      ? true
      : `its override frees ${lock.override.place}, not ${lock.item}`,
);

const LockSlot = Schema.Struct({
  item: Words,
  version: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  hash: Sha256,
  ask: Words,
  at: Schema.Int.check(Schema.isGreaterThan(0)),
  seen: ConceptImage,
  override: Schema.optionalKey(Freed),
}).check(placed);
export type Lock = typeof LockSlot.Type;

export const decodeLock = decoder(LockSlot);

type Held =
  | { readonly _tag: 'Holds' }
  | { readonly _tag: 'Freed'; readonly override: Freed }
  | { readonly _tag: 'Broken'; readonly why: string };

const broken = (why: string): Held => ({ _tag: 'Broken', why });

const keptIn = (lock: Lock, decisions: ReadonlyArray<Decided>) =>
  decisions.some((d) => d.at === lock.at && Option.contains(d.ask, lock.ask));

export const heldTo = (
  item: string,
  lock: Lock,
  hash: string,
  decisions: ReadonlyArray<Decided>,
): Held => {
  if (lock.item !== item) return broken(`it carries ${lock.item}'s lock`);
  if (!keptIn(lock, decisions))
    return broken(
      `its lock names a decision his production's ledger does not hold: none filed at ${DateTime.formatIso(DateTime.makeUnsafe(lock.at))} answers ask ${lock.ask}`,
    );
  const o = lock.override;
  if (hash === lock.hash)
    return o === undefined
      ? { _tag: 'Holds' }
      : broken(
          `its print is its lock's, so its override frees nothing: drop it, or it frees a later change unasked`,
        );
  if (o === undefined)
    return broken(
      `its print ${hash} is not its lock's ${lock.hash} (version ${lock.version}, kept in ask ${lock.ask}): only an override citing a decision of the owner's on ${item}, filed after the lock, frees it, naming the print it frees`,
    );
  if (o.frees !== hash) return broken(`its override frees ${o.frees}, not its print ${hash}`);
  return Option.match(whyUnbacked({ item, override: o, since: lock.at }, decisions), {
    onNone: (): Held => ({ _tag: 'Freed', override: o }),
    onSome: broken,
  });
};
