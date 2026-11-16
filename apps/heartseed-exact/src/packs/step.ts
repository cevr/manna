/* oxlint-disable effect/noTernary, effect/noNullish -- Exact's app folder cannot import effect (docs/exact.md): a plain step over plain records, and a persisted line's parts split from text. */

/** How long a good check holds before the next showing asks again: 7 days. */
export const WEEK = 7 * 24 * 60 * 60 * 1000;

/** What is kept: the pack's version (empty for none) and the time of its last good check (0 for never). */
export interface Kept {
  readonly version: string;
  readonly checkedAt: number;
}

/** No pack, never checked. */
export const NOTHING_KEPT: Kept = { version: '', checkedAt: 0 };

/** A pack as a check answers it: whatever it holds, and its version. */
export interface Versioned {
  readonly version: string;
}

/** A body checked: the pack it holds, or the first check it failed. */
export type Checked<P extends Versioned> =
  | { readonly _tag: 'Good'; readonly pack: P }
  | { readonly _tag: 'Bad'; readonly fault: string };

/** A pack's check: a body is kept only when this answers `Good`. */
export type Check<P extends Versioned> = (body: string) => Checked<P>;

/**
 * What a launch takes as kept at its first ask: the version of the file on
 * disk, and the persisted check's time only when the persisted version is
 * that file's. A relaunch between a write and its version so asks again,
 * naming the file it has.
 */
export const keptOf = (fileVersion: string, persisted: Kept): Kept => ({
  version: fileVersion,
  checkedAt: fileVersion !== '' && persisted.version === fileVersion ? persisted.checkedAt : 0,
});

/** One launch's view of one pack's download. */
export interface Machine {
  /** What this launch takes as kept: as found at its first ask (`keptOf`), then each good check's. */
  readonly kept: Kept;
  readonly loaded: boolean;
  /** The fetch in flight, 0 for none; ids rise through the launch. */
  readonly current: number;
  readonly last: number;
  /** The version of a checked body being written by the current fetch, empty while none is. */
  readonly writing: string;
  /** Whether the last try failed. */
  readonly failed: boolean;
}

/** A launch's start: nothing read yet. */
export const START: Machine = {
  kept: NOTHING_KEPT,
  loaded: false,
  current: 0,
  last: 0,
  writing: '',
  failed: false,
};

/** What a fetch heard: a body, a `304`, another status, or no answer at all (refused, timed out, cut short). */
export type Heard =
  | { readonly _tag: 'Body'; readonly body: string }
  | { readonly _tag: 'Same' }
  | { readonly _tag: 'Status'; readonly status: number }
  | { readonly _tag: 'Refused' };

/** What the launch hears: an ask (the Read tab shown, or Try again), a fetch's answer, a write's end. */
export type Input =
  | {
      readonly _tag: 'Ask';
      readonly now: number;
      readonly force: boolean;
      /** What is kept as the launch finds it (`keptOf`), read only at its first ask. */
      readonly found: Kept;
    }
  | { readonly _tag: 'Answered'; readonly id: number; readonly now: number; readonly heard: Heard }
  | { readonly _tag: 'Wrote'; readonly id: number; readonly now: number; readonly ok: boolean };

/** What the step asks the host to do. */
export type Command<P extends Versioned> =
  | { readonly _tag: 'Fetch'; readonly id: number; readonly version: string }
  | { readonly _tag: 'Write'; readonly id: number; readonly body: string; readonly pack: P }
  | { readonly _tag: 'Keep'; readonly kept: Kept };

/** A step's result: the next machine and what to do. */
export interface Stepped<P extends Versioned> {
  readonly state: Machine;
  readonly commands: ReadonlyArray<Command<P>>;
}

/** Whether a check is owed at `now`: no pack, or the last good check more than a week away either way. */
export const due = (kept: Kept, now: number): boolean =>
  kept.version === '' || Math.abs(now - kept.checkedAt) > WEEK;

const still = <P extends Versioned>(state: Machine): Stepped<P> => ({ state, commands: [] });

const failedTry = <P extends Versioned>(state: Machine): Stepped<P> =>
  still({ ...state, current: 0, writing: '', failed: true });

const ask = <P extends Versioned>(
  state: Machine,
  now: number,
  force: boolean,
  found: Kept,
): Stepped<P> => {
  const loaded = state.loaded ? state : { ...state, kept: found, loaded: true };
  if (loaded.current !== 0) return still(loaded);
  if (!force && !loaded.failed && !due(loaded.kept, now)) return still(loaded);
  const id = loaded.last + 1;
  return {
    state: { ...loaded, current: id, last: id },
    commands: [{ _tag: 'Fetch', id, version: loaded.kept.version }],
  };
};

const answered = <P extends Versioned>(
  state: Machine,
  now: number,
  heard: Heard,
  check: Check<P>,
): Stepped<P> => {
  switch (heard._tag) {
    case 'Body': {
      const checked = check(heard.body);
      if (checked._tag === 'Bad') return failedTry(state);
      return {
        state: { ...state, writing: checked.pack.version },
        commands: [{ _tag: 'Write', id: state.current, body: heard.body, pack: checked.pack }],
      };
    }
    case 'Same': {
      if (state.kept.version === '') return failedTry(state);
      const kept = { version: state.kept.version, checkedAt: now };
      return {
        state: { ...state, kept, current: 0, failed: false },
        commands: [{ _tag: 'Keep', kept }],
      };
    }
    case 'Status':
    case 'Refused':
      return failedTry(state);
  }
};

const wrote = <P extends Versioned>(state: Machine, now: number, ok: boolean): Stepped<P> => {
  if (!ok) return failedTry(state);
  const kept = { version: state.writing, checkedAt: now };
  return {
    state: { ...state, kept, current: 0, writing: '', failed: false },
    commands: [{ _tag: 'Keep', kept }],
  };
};

/**
 * One pack's download, as one pure step: what this launch knows of the
 * kept pack, the one fetch in flight, and what each input does to them.
 * Every pack the reader downloads (the commentary, and the study packs
 * after it, q126) runs this same step, a body checked by the pack's own
 * `check`. A showing of the Read tab (`Ask`, `force` false) fetches when
 * no pack is kept, the last try failed, or the last good check is more
 * than a week from now; Try again (`force` true) fetches unless one is in
 * flight. An answer that is not the current fetch's changes nothing. A
 * `200` whose body passes the check is written whole (`Write`); only once
 * the write lands is its version kept (`Keep`). A launch takes what is
 * kept from the file itself at its first ask (`keptOf`), so a relaunch
 * between the write and the version reads the new file, names it, and
 * fetches again. A `304` keeps the check's time. Anything else keeps what
 * was there and marks the try failed, so the next showing or Try again
 * fetches.
 */
export const step = <P extends Versioned>(
  state: Machine,
  input: Input,
  check: Check<P>,
): Stepped<P> => {
  switch (input._tag) {
    case 'Ask':
      return ask(state, input.now, input.force, input.found);
    case 'Answered':
      if (input.id !== state.current || state.current === 0 || state.writing !== '')
        return still(state);
      return answered(state, input.now, input.heard, check);
    case 'Wrote':
      if (input.id !== state.current || state.current === 0 || state.writing === '')
        return still(state);
      return wrote(state, input.now, input.ok);
  }
};

/**
 * What Contract persists of every pack, as one string (`packsKept`): a
 * line per pack, `<name> <version> <checkedAt>`, in name order. A name it
 * does not hold is `NOTHING_KEPT`.
 */
export const keptIn = (text: string, name: string): Kept => {
  for (const line of text.split('\n')) {
    const [each, version, checkedAt] = line.split(' ');
    if (each === name && version !== undefined && checkedAt !== undefined)
      return { version, checkedAt: Number(checkedAt) || 0 };
  }
  return NOTHING_KEPT;
};

/** `text` with `name`'s line set to `kept` (or left out for none), every other pack's line as it was. */
export const keptWith = (text: string, name: string, kept: Kept): string =>
  [
    ...text.split('\n').filter((line) => line !== '' && line.split(' ')[0] !== name),
    ...(kept.version === '' ? [] : [`${name} ${kept.version} ${kept.checkedAt}`]),
  ]
    .sort()
    .join('\n');
