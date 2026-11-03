import { Effect, Option } from 'effect';
import type { Clipboard } from '../browser/clipboard.ts';
import { type Heard, type Input, type KeyPress, Keys } from '../browser/keys.ts';
import type { PageName } from '../core/api.ts';
import {
  type Asked,
  type Command,
  type CommandId,
  type Commands,
  type Receipt,
  makeCommands,
} from './command.ts';
import { type Context, type Focus, contextAt, focusOf, withFocused } from './context.ts';
import { Resolved, bindingsOf, keysOf, resolve } from './keymap.ts';
import { linkCommands } from './link.ts';
import { targetAt } from './target.ts';

export interface Hub {
  readonly commands: Commands;
  readonly mac: boolean;
  readonly context: (focus?: Focus) => Context;
  readonly refine: (part: (ctx: Context) => Context) => () => void;
  readonly invoke: (command: Command, how: Asked, ctx?: Context) => void;
  readonly invokeId: (id: CommandId, how: Asked) => void;
  readonly input: () => Input;
  readonly traversed: () => Input;
  readonly receipts: (sink: (receipt: Receipt, slot: string) => void) => () => void;
  readonly presses: (listener: () => void) => () => void;
  readonly announce: (receipt: Receipt, slot: string) => void;
  readonly keysOf: (id: CommandId) => ReadonlyArray<string>;
  readonly subscribe: (changed: () => void) => () => void;
  readonly listen: Effect.Effect<never, never, Keys>;
  readonly listenWithin: (part: EventTarget) => Effect.Effect<never, never, Keys>;
}

export const makeHub = (
  page: PageName,
  href: () => string,
): Effect.Effect<Hub, never, Keys | Clipboard> =>
  Effect.gen(function* () {
    const keys = yield* Keys;
    const clipboard = yield* Effect.context<Clipboard>();
    const hub = hubOf(page, href, keys.mac);
    hub.commands.register(...linkCommands(clipboard));
    return hub;
  });

const hubOf = (page: PageName, href: () => string, mac: boolean): Hub => {
  const commands = makeCommands();

  const listeners = new Set<() => void>();
  const changed = () => {
    for (const listener of listeners) listener();
  };
  commands.subscribe(changed);

  let parts: ReadonlyArray<{ readonly part: (ctx: Context) => Context }> = [];
  const context = (focus: Focus = 'page'): Context =>
    parts.reduce<Context>((ctx, p) => p.part(ctx), {
      ...contextAt(page, href()),
      selection: [],
      focus,
    });

  const sinks = new Set<(receipt: Receipt, slot: string) => void>();
  const announce = (receipt: Receipt, slot: string) => {
    for (const sink of sinks) sink(receipt, slot);
  };
  let heard: Heard = { input: 'pointer', walks: () => false };
  let walkUnread = false;
  const invoke = (command: Command, how: Asked, ctx: Context = context()) => {
    if (!command.when(ctx)) return;
    Effect.runFork(
      Effect.tap(command.run(ctx, { ...how, input: how.input ?? heard.input }), (receipt) =>
        Effect.sync(() => announce(receipt, command.id)),
      ),
    );
  };
  const bindings = () => bindingsOf(commands.all());

  const pressHeard = new Set<() => void>();
  const press = (pressed: KeyPress): boolean => {
    for (const heard of pressHeard) heard();
    const ctx = withFocused(context(focusOf(pressed.target)), targetAt(pressed.target));
    return Resolved.$match(resolve(pressed, ctx, commands.all(), bindings()), {
      Run: ({ command, how }) => {
        invoke(command, how, ctx);
        return true;
      },
      Owned: () => true,
      Pass: () => false,
    });
  };

  const hub: Hub = {
    commands,
    mac,
    context,
    refine: (part) => {
      const entry = { part };
      parts = [...parts, entry];
      return () => {
        parts = parts.filter((p) => p !== entry);
      };
    },
    invoke,
    invokeId: (id, how) => {
      Option.map(commands.byId(id), (command) => invoke(command, how));
    },
    input: () => heard.input,
    traversed: () => {
      const walked = walkUnread && heard.walks();
      walkUnread = false;
      return Option.getOrElse(
        Option.liftPredicate('key' as const, () => walked),
        (): Input => 'pointer',
      );
    },
    receipts: (sink) => {
      sinks.add(sink);
      return () => sinks.delete(sink);
    },
    presses: (listener) => {
      pressHeard.add(listener);
      return () => pressHeard.delete(listener);
    },
    announce,
    keysOf: (id) => keysOf(bindings(), id),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    listenWithin: (part) => Keys.use((k) => k.within(part, press)),
    listen: Keys.use((k) =>
      Effect.andThen(
        Effect.all(
          [
            k.inputs((now) => {
              heard = now;
              walkUnread = true;
            }),
            k.listen(press),
          ],
          { concurrency: 'unbounded' },
        ),
        Effect.never,
      ),
    ),
  };
  return hub;
};
