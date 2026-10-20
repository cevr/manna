// A cast member's library reference: the images a picture of the member is
// drawn to, and the line a prompt says them with. The library's record is the
// member's one truth (the owner, 2026-10-20: the library, not a concept, where
// the concept is wrong), so these images win over any other reference or brief
// that draws the member otherwise. A member with a kept sheet is sent its kept
// sheets; one not kept yet is sent the references its record names. Pure.

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
    kept,
    files: files.map((file) => joined(folder, file)),
  };
};

/** How a prompt names the member: its id with spaces for hyphens, capitalised (`christ` is Christ). */
const nameOf = (member: string): string => {
  const words = member.replaceAll('-', ' ');
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
};

/**
 * The prompt's line for `lock`, its images numbered from `first` (1-based,
 * among every reference the call sends): they are the member's record in the
 * cast library, drawn exactly, and they win over every other image and the brief.
 */
export const castLockNote = (lock: CastLock, first: number): string => {
  const name = nameOf(lock.member);
  const last = first + lock.files.length - 1;
  const one = lock.files.length === 1;
  const said = (single: string, many: string) =>
    Bool.match(one, { onTrue: () => single, onFalse: () => many });
  const which = said(`Reference image ${first} is`, `Reference images ${first}–${last} are`);
  const what = Arr.match(lock.kept, {
    onEmpty: () => 'the references it is drawn from until its cast sheet is kept',
    onNonEmpty: (kinds) => `its kept cast sheet: ${kinds.join(', ')}`,
  });
  const draws = said('it draws', 'they draw');
  const win = said('this one wins', 'these win');
  return `${which} ${name}'s record in the cast library (${what}): draw ${name} exactly as ${draws} ${lock.who}: face, hair, build, height in heads, dress and colours. Where any other reference image or the brief draws ${lock.who} otherwise, ${win}.`;
};
