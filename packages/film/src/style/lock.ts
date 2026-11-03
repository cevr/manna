import { DateTime, Option, Schema } from 'effect';
import { ConceptImage } from '../core/match.ts';
import type { Decided } from '../core/production.ts';
import { decoder, ruleCheck } from './decode.ts';
import { Words, overrideOf, whyUnbacked } from './override.ts';

/** A sha256, as lowercase hex. */
const Sha256 = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{64}$/, { message: 'a sha256, as 64 lowercase hex digits' }),
);

/** FigureLock's override: it frees the one print it names, by its sha256, citing a decision of the owner's on the figure. */
const Freed = overrideOf('FigureLock', { frees: Sha256 });
type Freed = typeof Freed.Type;

/** An override frees the figure its lock names: its place is the lock's item. */
const placed = ruleCheck(
  'FigureLock',
  (lock: { readonly item: string; readonly override?: Freed }) =>
    lock.override === undefined || lock.override.place === lock.item
      ? true
      : `its override frees ${lock.override.place}, not ${lock.item}`,
);

/**
 * A figure's lock: its file's fields (the item, its version, its print's
 * sha256, the ask, the ledger's time in ms, the still he saw), and the
 * override that frees one print of it when a decision of his allows.
 */
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

/** A figure's lock, checked as `figure` composes it. */
export const decodeLock = decoder(LockSlot);

/** What a locked figure's print answers its lock: it holds, its override frees it, or it is broken, and why. */
type Held =
  | { readonly _tag: 'Holds' }
  | { readonly _tag: 'Freed'; readonly override: Freed }
  | { readonly _tag: 'Broken'; readonly why: string };

/** The answer that the lock is broken, and `why`. */
const broken = (why: string): Held => ({ _tag: 'Broken', why });

/** Whether the owner's decisions (`decisions`) hold the one `lock` names: filed at its time, answering its ask. */
const keptIn = (lock: Lock, decisions: ReadonlyArray<Decided>) =>
  decisions.some((d) => d.at === lock.at && Option.contains(d.ask, lock.ask));

/**
 * What the print of the figure laid as `item` in its film, its sha256
 * `hash`, answers `lock`, read against the owner's decisions on his
 * production's ledger (`decisions`).
 */
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
