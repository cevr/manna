import { Array as Arr, Data, Effect, Option } from 'effect';
import type { Input } from '../browser/keys.ts';
import type { Gave } from '../core/catalogue.ts';
import type { ChangeId } from '../core/schema.ts';
import type { Context, Focus } from './context.ts';
import type { Target } from './target.ts';

export type CommandId = string;

export type Receipt = Data.TaggedEnum<{
  Quiet: {};
  Said: {
    readonly said: string;
    readonly undo: Option.Option<CommandId>;
    readonly bound: Option.Option<Bound>;
    readonly tone: Tone;
  };
}>;
export const Receipt = Data.taggedEnum<Receipt>();

export type Bound = ChangeBound | GaveBound | NoteBound;

export interface ChangeBound {
  readonly film: string;
  readonly change: ChangeId;
}

interface GaveBound {
  readonly film: string;
  readonly gave: Pick<Gave, 'op' | 'scenes'> & {
    readonly of?: { readonly point: string; readonly version: string };
  };
}

interface NoteBound {
  readonly film: string;
  readonly note: string;
}

export type Unfit = Data.TaggedEnum<{
  Now: { readonly reason: string };
  Never: { readonly reason: string };
}>;
export const Unfit = Data.taggedEnum<Unfit>();

type Tone = 'done' | 'refused' | 'busy';

const quiet: Receipt = Receipt.Quiet();

export const quietly =
  (act: (ctx: Context, how: Invocation) => void) =>
  (ctx: Context, how: Invocation): Effect.Effect<Receipt> =>
    Effect.sync(() => {
      act(ctx, how);
      return quiet;
    });

interface Undoing {
  readonly command: CommandId;
  readonly bound: Bound;
}

export const said = (text: string, undo: Option.Option<Undoing> = Option.none()): Receipt =>
  Receipt.Said({
    said: text,
    undo: Option.map(undo, (u) => u.command),
    bound: Option.map(undo, (u) => u.bound),
    tone: 'done',
  });

export const refused = (text: string, past: Option.Option<CommandId> = Option.none()): Receipt =>
  Receipt.Said({ said: text, undo: past, bound: Option.none(), tone: 'refused' });

export interface Invocation {
  readonly step: 'normal' | 'coarse' | 'fine';
  readonly via: 'key' | 'menu' | 'palette' | 'button';
  readonly input: Input;
  readonly bound?: Bound;
}

export type Asked = Omit<Invocation, 'input'> & { readonly input?: Input };

export const BY_BUTTON: Asked = { step: 'normal', via: 'button' };

export interface Command {
  readonly id: CommandId;
  readonly label: string;
  readonly labelIn?: (ctx: Context) => string;
  readonly group: string;
  readonly keys?: ReadonlyArray<string>;
  readonly about?: ReadonlyArray<Target>;
  readonly keysIn?: ReadonlyArray<Focus>;
  readonly stepped?: boolean;
  readonly touch: string;
  readonly typed?: true;
  readonly when: (ctx: Context) => boolean;
  readonly fits?: (bound: Bound, ctx: Context) => Option.Option<Unfit>;
  readonly run: (ctx: Context, how: Invocation) => Effect.Effect<Receipt>;
}

export const unfit = (command: Command, bound: Bound, ctx: Context): Option.Option<Unfit> =>
  Option.match(Option.fromUndefinedOr(command.fits), {
    onNone: () => Option.some(Unfit.Never({ reason: `${command.label} acts on no single change` })),
    onSome: (fits) => fits(bound, ctx),
  });

export const labelOf = (command: Command, ctx: Context): string =>
  Option.match(Option.fromUndefinedOr(command.labelIn), {
    onNone: () => command.label,
    onSome: (read) => read(ctx),
  });

export interface Commands {
  readonly register: (...commands: ReadonlyArray<Command>) => () => void;
  readonly all: () => ReadonlyArray<Command>;
  readonly available: (ctx: Context) => ReadonlyArray<Command>;
  readonly byId: (id: CommandId) => Option.Option<Command>;
  readonly subscribe: (changed: () => void) => () => void;
}

export const makeCommands = (): Commands => {
  let entries: ReadonlyArray<{ readonly token: symbol; readonly command: Command }> = [];
  const listeners = new Set<() => void>();
  const changed = () => {
    for (const listener of listeners) listener();
  };
  const all = (): ReadonlyArray<Command> => {
    const latest = new Map<CommandId, Command>();
    for (const entry of entries) latest.set(entry.command.id, entry.command);
    return Arr.dedupe(entries.map((e) => e.command.id)).flatMap((id) =>
      Option.toArray(Option.fromUndefinedOr(latest.get(id))),
    );
  };
  return {
    register: (...commands) => {
      const added = commands.map((command) => ({ token: Symbol(command.id), command }));
      entries = [...entries, ...added];
      changed();
      return () => {
        const tokens = new Set(added.map((a) => a.token));
        entries = entries.filter((e) => !tokens.has(e.token));
        changed();
      };
    },
    all,
    available: (ctx) => all().filter((command) => command.when(ctx)),
    byId: (id) => Option.fromUndefinedOr(all().find((command) => command.id === id)),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};
