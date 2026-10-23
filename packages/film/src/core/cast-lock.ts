// A cast member's library reference: the images a picture of the member is
// drawn to, and the line a prompt says them with. The library's record is the
// member's one truth (the owner, 2026-10-20: the library, not a concept, where
// the concept is wrong), so these images win over any other reference that
// draws the member otherwise, on the person; the brief dresses the member for
// its scene. A member with a kept sheet is sent its kept sheets; one not kept
// yet is sent the references its record names. Pure.

import { Array as Arr, Boolean as Bool, Option } from 'effect';
import type { CastSheetRecord } from './cast-record.ts';
import type { SheetKind } from './cast-sheet.ts';

/** The kinds a kept member's sheets are sent in: the whole figure first, then the face, then the acting. */
const LOCK_ORDER: ReadonlyArray<SheetKind> = ['turnaround', 'heads', 'poses'];

/** A member's library reference: its images, each as its folder joins it, and what they are. */
export interface CastLock {
  readonly member: string;
  /** How a brief names the member: "Him", "her". */
  readonly who: string;
  /** Whose record it is: the library's (a person every film shares) or one film's own role. */
  readonly scope: CastSheetRecord['scope'];
  /** The kinds kept, in `LOCK_ORDER`: none when the files are the record's own references. */
  readonly kept: ReadonlyArray<SheetKind>;
  readonly files: ReadonlyArray<string>;
}

/** `file` in `folder`, as a path joins them (`folder` empty: the file alone). */
const joined = (folder: string, file: string): string =>
  Bool.match(folder === '', {
    onTrue: () => file,
    onFalse: () => `${folder.replace(/\/+$/, '')}/${file}`,
  });

/** The member's library reference: each kept sheet (`kept/<kind>.png`) when any is kept, else the record's refs. */
export const castLock = (record: CastSheetRecord, folder: string): CastLock => {
  const kept = LOCK_ORDER.filter((kind) =>
    Option.isSome(Option.fromUndefinedOr(record.kept?.[kind])),
  );
  const files = Arr.match(kept, {
    onEmpty: () => record.refs.map((ref) => ref.file),
    onNonEmpty: (kinds) => kinds.map((kind) => `kept/${kind}.png`),
  });
  return {
    member: record.member,
    who: record.who,
    scope: record.scope,
    kept,
    files: files.map((file) => joined(folder, file)),
  };
};

/** How a prompt names the member: its id with spaces for hyphens, capitalised (`christ` is Christ). */
const nameOf = (member: string): string => {
  const words = member.replaceAll('-', ' ');
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
};

/** The name's possessive: `Christ's`, `Idea villagers'`. */
const possessive = (name: string): string =>
  Bool.match(name.endsWith('s'), { onTrue: () => `${name}'`, onFalse: () => `${name}'s` });

/**
 * The prompt's line for `lock`, its images numbered from `first` (1-based,
 * among every reference the call sends): they are the member's record, drawn
 * exactly, and they win over every other image on the person as far as its
 * kept kinds show it (a sheet of heads, the face and hair alone). What the
 * member wears and does is the brief's: a beat dresses the member for its
 * own scene (Christ's linen coat on earth, His white robe as Priest).
 */
export const castLockNote = (lock: CastLock, first: number): string => {
  const name = nameOf(lock.member);
  const last = first + lock.files.length - 1;
  const one = lock.files.length === 1;
  const said = (single: string, many: string) =>
    Bool.match(one, { onTrue: () => single, onFalse: () => many });
  const which = said(`Reference image ${first} is`, `Reference images ${first}–${last} are`);
  const where = Bool.match(lock.scope === 'film', {
    onTrue: () => "this film's cast",
    onFalse: () => 'the cast library',
  });
  const what = Arr.match(lock.kept, {
    onEmpty: () => 'the references it is drawn from until its cast sheet is kept',
    onNonEmpty: (kinds) => `its kept cast sheet: ${kinds.join(', ')}`,
  });
  const record = `${which} ${possessive(name)} record in ${where} (${what})`;
  const draws = said('it draws', 'they draw');
  const win = said('this one wins', 'these win');
  const headsAlone = lock.kept.length > 0 && lock.kept.every((kind) => kind === 'heads');
  return Bool.match(headsAlone, {
    onTrue: () =>
      `${record}: draw ${possessive(name)} face and hair as ${draws} them: face, hair, skin and their colours. Where any other reference image draws them otherwise, ${win}. ${said('It shows', 'They show')} no body: ${possessive(name)} build, dress and act are the brief's.`,
    onFalse: () =>
      `${record}: draw ${name} as ${draws} ${lock.who}: face, hair, skin, build and height in heads, and the colours of each. Where any other reference image draws ${lock.who} otherwise, ${win}. What ${name} wears and does is the brief's: where the brief names a garment or an act, draw that; where it names none, dress ${lock.who} as ${said('this image does', 'these images do')}.`,
  });
};
