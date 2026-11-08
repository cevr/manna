/**
 * The natural voice's download, load and crash fuse, as one pure reducer,
 * and the status line Today shows for it. `step` takes the machine and one
 * input (the launch, a Voice tap, `Try again`, an install event, a load's
 * answer) and returns the next machine and the calls to perform: an
 * install, a load, or a write of the fuse. It performs none; the `Natural`
 * service does. No state calls a cancel or a remove: Off stops nothing,
 * and the app never removes the download.
 */

import { Match, Option, Predicate } from 'effect';

import type { Choice } from '../voice';
import { TOTAL_BYTES } from './manifest';

/** Why a download or a load failed, as the line says it. */
export type Failure = 'network' | 'check' | 'space' | 'load';

/** Where the natural voice's files stand in this launch. */
export type Download =
  | { readonly _tag: 'Idle' }
  | { readonly _tag: 'Waiting' }
  | { readonly _tag: 'Downloading'; readonly bytes: number; readonly total: number }
  | { readonly _tag: 'Failed'; readonly reason: Failure }
  | { readonly _tag: 'Loading' }
  | { readonly _tag: 'Ready' }
  | { readonly _tag: 'Unsupported' };

/** `blown` after a crash mid-reading, until the next Voice tap: the system voice reads meanwhile. */
export type Fuse = 'clear' | 'blown';

/** What Today shows of the natural voice: the download, the fuse, whether the crash line is owed, and the Voice choice. */
export interface NaturalView {
  readonly download: Download;
  readonly fuse: Fuse;
  readonly said: boolean;
  readonly choice: Choice;
}

/** The status line's words, and whether `Try again` shows beside them. */
export interface Line {
  readonly text: string;
  readonly retry: boolean;
}

/**
 * The view and what the launch knows beside it: every file present
 * (`complete`), the download begun by itself already (`started`), and a
 * load's bad file already sent back to the download once (`again`).
 */
export interface Machine {
  readonly view: NaturalView;
  readonly complete: boolean;
  readonly started: boolean;
  readonly again: boolean;
}

/** One thing that happened: the launch, a Voice choice, `Try again`, an install event or a load's answer. */
export type Input =
  | {
      readonly _tag: 'Opened';
      readonly complete: boolean;
      readonly crashed: boolean;
      readonly stored: Fuse;
    }
  | { readonly _tag: 'Begin'; readonly choice: Choice }
  | { readonly _tag: 'Chosen'; readonly choice: Choice }
  | { readonly _tag: 'Retry' }
  | { readonly _tag: 'Progress'; readonly bytes: number; readonly total: number }
  | { readonly _tag: 'Waiting' }
  | { readonly _tag: 'Done' }
  | { readonly _tag: 'Failed'; readonly reason: string }
  | { readonly _tag: 'Refused' }
  | { readonly _tag: 'Loaded' }
  | { readonly _tag: 'LoadFailed'; readonly reason: string };

/** What the service performs after a step: start the download, load the choice's pack, or store the fuse. */
export type Call =
  | { readonly _tag: 'Install' }
  | { readonly _tag: 'Load'; readonly choice: Choice }
  | { readonly _tag: 'Fuse'; readonly fuse: Fuse };

/** A step's result: the next machine and the calls it asks for, in order. */
export interface Stepped {
  readonly machine: Machine;
  readonly calls: ReadonlyArray<Call>;
}

const MEGABYTES = Math.round(TOTAL_BYTES / 1e6);

const FAILED: Record<Failure, string> = {
  network: 'Natural voice could not download.',
  check: 'Natural voice could not be checked.',
  space: `Not enough space for the natural voice (${MEGABYTES} MB).`,
  load: 'Natural voice could not start.',
};

const CRASHED = 'The natural voice stopped unexpectedly, so the system voice reads for now.';

const percent = (bytes: number, total: number): number => {
  if (!(total > 0)) return 0;
  return Math.min(100, Math.max(0, Math.floor((100 * bytes) / total)));
};

const shown = (text: string, retry: boolean): Option.Option<Line> => Option.some({ text, retry });

/** The status line for a view: none while Voice is Off, else the first row that holds. */
export const lineOf = (view: NaturalView): Option.Option<Line> => {
  if (view.choice === 'off') return Option.none();
  if (view.said) return shown(CRASHED, false);
  const download = view.download;
  switch (download._tag) {
    case 'Failed':
      return shown(FAILED[download.reason], true);
    case 'Waiting':
      return shown('Natural voice: waiting for a connection', false);
    case 'Downloading':
      return shown(
        `Natural voice: downloading, ${percent(download.bytes, download.total)}%`,
        false,
      );
    case 'Loading':
      return shown('Natural voice: getting ready', false);
    case 'Idle':
    case 'Ready':
    case 'Unsupported':
      return Option.none();
  }
};

/** Whether a reading goes to the natural voice: its files loaded and no crash since the last Voice tap. */
export const reads = (view: NaturalView): boolean =>
  view.download._tag === 'Ready' && view.fuse === 'clear';

/** The fuse a launch finds stored: exactly `blown` is blown; nothing, `clear` or any other text is clear. */
export const storedFuse = (stored: Option.Option<string>): Fuse => {
  if (Option.contains(stored, 'blown')) return 'blown';
  return 'clear';
};

/** The machine before a launch opens it. */
export const closed: Machine = {
  view: { download: { _tag: 'Idle' }, fuse: 'clear', said: false, choice: 'off' },
  complete: false,
  started: false,
  again: false,
};

const INSTALL: Call = { _tag: 'Install' };

const stay = (machine: Machine): Stepped => ({ machine, calls: [] });

const toDownload = (machine: Machine, download: Download): Machine => ({
  ...machine,
  view: { ...machine.view, download },
});

const isInstalling: (download: Download) => boolean = Predicate.or(
  Predicate.isTagged('Downloading'),
  Predicate.isTagged('Waiting'),
);

const installing = (machine: Machine): boolean => isInstalling(machine.view.download);

const isLoading = (machine: Machine): boolean => machine.view.download._tag === 'Loading';

const install = (machine: Machine): Stepped => ({
  machine: toDownload(machine, { _tag: 'Downloading', bytes: 0, total: TOTAL_BYTES }),
  calls: [INSTALL],
});

const load = (machine: Machine): Stepped => ({
  machine: toDownload(machine, { _tag: 'Loading' }),
  calls: [{ _tag: 'Load', choice: machine.view.choice }],
});

const start = (machine: Machine): Stepped => {
  const begun = { ...machine, started: true };
  if (begun.complete) return load(begun);
  return install(begun);
};

const isFailure = (reason: string): reason is Exclude<Failure, 'load'> =>
  reason === 'network' || reason === 'check' || reason === 'space';

const opened = (input: Extract<Input, { _tag: 'Opened' }>): Stepped => {
  const machine: Machine = { ...closed, complete: input.complete };
  if (!input.crashed) return stay({ ...machine, view: { ...machine.view, fuse: input.stored } });
  return {
    machine: { ...machine, view: { ...machine.view, fuse: 'blown', said: true } },
    calls: [{ _tag: 'Fuse', fuse: 'blown' }],
  };
};

const begun = (machine: Machine, choice: Choice): Stepped => {
  const next = { ...machine, view: { ...machine.view, choice } };
  if (choice === 'off') return stay(next);
  return start(next);
};

const clearing = (machine: Machine): ReadonlyArray<Call> => {
  if (machine.view.fuse === 'blown') return [{ _tag: 'Fuse', fuse: 'clear' }];
  return [];
};

const chosen = (machine: Machine, choice: Choice): Stepped => {
  const cleared = clearing(machine);
  const next: Machine = {
    ...machine,
    view: { ...machine.view, choice, fuse: 'clear', said: false },
  };
  if (choice === 'off' || machine.started || machine.view.download._tag !== 'Idle')
    return { machine: next, calls: cleared };
  const started = start(next);
  return { machine: started.machine, calls: [...cleared, ...started.calls] };
};

const retried = (machine: Machine): Stepped => {
  const download = machine.view.download;
  if (download._tag !== 'Failed') return stay(machine);
  if (download.reason === 'load') return load(machine);
  return install({ ...machine, again: false });
};

const loadFailed = (machine: Machine, reason: string): Stepped => {
  if (reason !== 'missing' && reason !== 'check')
    return stay(toDownload(machine, { _tag: 'Failed', reason: 'load' }));
  if (machine.again) return stay(toDownload(machine, { _tag: 'Failed', reason: 'check' }));
  return install({ ...machine, again: true, complete: false });
};

/** The next machine after one input, and the calls the service performs for it. */
const installFailed = (machine: Machine, reason: string): Stepped => {
  if (isFailure(reason)) return stay(toDownload(machine, { _tag: 'Failed', reason }));
  return stay(toDownload(machine, { _tag: 'Idle' }));
};

const whileInstalling = (machine: Machine, next: () => Stepped): Stepped => {
  if (!installing(machine)) return stay(machine);
  return next();
};

const whileLoading = (machine: Machine, next: () => Stepped): Stepped => {
  if (!isLoading(machine)) return stay(machine);
  return next();
};

/** The next machine after one input, and the calls the service performs for it. */
export const step = (machine: Machine, input: Input): Stepped =>
  Match.type<Input>().pipe(
    Match.tagsExhaustive({
      Opened: opened,
      Begin: ({ choice }) => begun(machine, choice),
      Chosen: ({ choice }) => chosen(machine, choice),
      Retry: () => retried(machine),
      Progress: ({ bytes, total }) =>
        whileInstalling(machine, () =>
          stay(toDownload(machine, { _tag: 'Downloading', bytes, total })),
        ),
      Waiting: () => whileInstalling(machine, () => stay(toDownload(machine, { _tag: 'Waiting' }))),
      Done: () => whileInstalling(machine, () => load({ ...machine, complete: true })),
      Failed: ({ reason }) => whileInstalling(machine, () => installFailed(machine, reason)),
      Refused: () => stay(toDownload(machine, { _tag: 'Unsupported' })),
      Loaded: () =>
        whileLoading(machine, () =>
          stay({ ...toDownload(machine, { _tag: 'Ready' }), again: false }),
        ),
      LoadFailed: ({ reason }) => whileLoading(machine, () => loadFailed(machine, reason)),
    }),
  )(input);
