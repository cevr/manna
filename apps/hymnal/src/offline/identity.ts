/** Where a saved recording lives and what it is kept under: pure rules the cache and its storages share. */
import { soundingOffset } from '~/remote';
import { setOf } from '@manna/hymnal/recordings';

/**
 * Each recording set keeps its saved files in a storage of its own, and a
 * hymn's files live in the storage of the set it plays from (`setOf`). A set
 * added later moves only its own hymns (`warm-2` moved hymn 663): every other
 * hymn's saved recording stays where it was saved and is still found. A
 * moved hymn's file left in its old set's storage is a stray: never listed,
 * so never played as the new recording, and freed at Delete (`removeOld`).
 */
export const storageOf = (set: string) => `hymnal-recordings-${set}-v1`;
/** The storage hymn `number`'s saved files live in. */
export const storageFor = (number: number) => storageOf(setOf(number));
/**
 * The storages some hymn plays from. Any other recording storage belongs to
 * an old set that no hymn reads, and Delete frees it whole.
 */
export const readStorages: ReadonlyArray<string> = [
  ...new Set(Array.from({ length: 695 }, (_, i) => storageFor(i + 1))),
];
/** Whether file `name` in `storage` belongs to a hymn that plays from another storage. */
export const stray = (storage: string, name: string) =>
  /^\d+_/.test(name) && storageFor(Number(name.split('_')[0])) !== storage;
export const recordingStorage = (name: string) => /^hymnal-recordings-[a-z0-9-]+-v\d+$/.test(name);

/** A saved recording's identity: the hymn and the key offset it sounds in. */
export interface IdentityOf {
  readonly number: number;
  readonly offset: number;
}
export const identityKey = (id: IdentityOf) => `${id.number}_${soundingOffset(id.offset)}`;
export const CHUNK = 2 * 1024 * 1024;
export const mediaHeader = (b: Uint8Array) =>
  (b[0] === 73 && b[1] === 68 && b[2] === 51) || (b[0] === 255 && ((b[1] ?? 0) & 224) === 224);
