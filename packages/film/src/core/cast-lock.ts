import { Array as Arr, Boolean as Bool, Option } from 'effect';
import type { CastSheetRecord } from './cast-record.ts';
import { type SheetKind, TURNAROUND_SLOTS } from './cast-sheet.ts';

type LockKind = Exclude<SheetKind, 'single'>;

const LOCK_ORDER: ReadonlyArray<LockKind> = ['turnaround', 'heads', 'poses'];

export interface CastLock {
  readonly member: string;
  readonly who: string;
  readonly scope: CastSheetRecord['scope'];
  readonly kept: ReadonlyArray<SheetKind>;
  readonly cut: ReadonlyArray<SheetKind>;
  readonly files: ReadonlyArray<string>;
}

const joined = (folder: string, file: string): string =>
  Bool.match(folder === '', {
    onTrue: () => file,
    onFalse: () => `${folder.replace(/\/+$/, '')}/${file}`,
  });

const viewsOn = (record: CastSheetRecord, kind: SheetKind): number =>
  Bool.match(kind === 'turnaround', {
    onTrue: () => TURNAROUND_SLOTS.length,
    onFalse: () => record.sheets[kind]?.slots?.length ?? 0,
  });

const cutFrom = (record: CastSheetRecord, kind: LockKind): boolean => {
  const views = record.kept?.[kind]?.views ?? [];
  return views.length > 0 && views.length < viewsOn(record, kind);
};

export const castLock = (record: CastSheetRecord, folder: string): CastLock => {
  const kept = LOCK_ORDER.filter((kind) =>
    Option.isSome(Option.fromUndefinedOr(record.kept?.[kind])),
  );
  const cut = kept.filter((kind) => cutFrom(record, kind));
  const filesOf = (kind: LockKind): ReadonlyArray<string> =>
    Bool.match(cut.includes(kind), {
      onTrue: () => (record.kept?.[kind]?.views ?? []).map((v) => `views/${v.name}.png`),
      onFalse: () => [`kept/${kind}.png`],
    });
  const files = Arr.match(kept, {
    onEmpty: () => record.refs.map((ref) => ref.file),
    onNonEmpty: (kinds) => kinds.flatMap(filesOf),
  });
  return {
    member: record.member,
    who: record.who,
    scope: record.scope,
    kept,
    cut,
    files: files.map((file) => joined(folder, file)),
  };
};

const nameOf = (member: string): string => {
  const words = member.replaceAll('-', ' ');
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
};

const possessive = (name: string): string =>
  Bool.match(name.endsWith('s'), { onTrue: () => `${name}'`, onFalse: () => `${name}'s` });

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
    onNonEmpty: (kinds) =>
      `its kept cast sheet: ${kinds
        .map((kind) =>
          Bool.match(lock.cut.includes(kind), {
            onTrue: () => `${kind} (its own figures, cut from a sheet that draws others too)`,
            onFalse: () => kind,
          }),
        )
        .join(', ')}`,
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
