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

/** A page's commands, its keymap, its context and its receipts. */
export interface Hub {
  readonly commands: Commands;
  /** Whether chords read as a Mac's (⌘) or a PC's (Ctrl): the page's keyboard. */
  readonly mac: boolean;
  /** The page's context now, with focus `focus` (the page's, when a menu or a button asks). */
  readonly context: (focus?: Focus) => Context;
  /** Refine every context with `part` (what the page knows that its URL does not), until the returned stop. */
  readonly refine: (part: (ctx: Context) => Context) => () => void;
  /**
   * Run `command` in `ctx` (the page's context now) if it is available there,
   * asked by `how.input`, else by the input the viewer last used (`input`).
   */
  readonly invoke: (command: Command, how: Asked, ctx?: Context) => void;
  /** Run the command registered as `id` (a receipt's Undo), if it is registered and available. */
  readonly invokeId: (id: CommandId, how: Asked) => void;
  /**
   * The input the viewer last used on the page: a key pressed or a pointer put
   * down; `pointer` until a key is pressed, so a move nothing asked for (a
   * page opened on a point) shows no ring.
   */
  readonly input: () => Input;
  /**
   * The input that asked for a step through the history the page just heard
   * (a `popstate`): `key` only when the last input is a key the browser walks
   * it by (Alt+←, ⌘[, …: `Heard.walks`) and no step has read it yet; else
   * `pointer` (the toolbar's Back, a swipe, a step after typing). Read once
   * per step.
   */
  readonly traversed: () => Input;
  /** Hand every receipt to `sink`, with its slot, until the returned stop. */
  readonly receipts: (sink: (receipt: Receipt, slot: string) => void) => () => void;
  /** Tell `listener` of every key pressed on the page, whatever the keymap does with it, until the returned stop. */
  readonly presses: (listener: () => void) => () => void;
  /** Say `receipt` in `slot`: what a write no command ran said as it landed, or while it is out. */
  readonly announce: (receipt: Receipt, slot: string) => void;
  /** The keys bound to `id` now. */
  readonly keysOf: (id: CommandId) => ReadonlyArray<string>;
  /** Call `changed` each time a command comes or goes, until the returned stop. */
  readonly subscribe: (changed: () => void) => () => void;
  /**
   * Hear the page's presses through `Keys`, until interrupted: the page's one
   * key listener; and which input the viewer uses (`input`).
   */
  readonly listen: Effect.Effect<never, never, Keys>;
  /**
   * Hear the presses inside `part` as the page's listener does, until
   * interrupted: a part whose wrapper keeps keys from the page (the
   * recorder's section in its dialog, which stops the arrows) hears them here.
   */
  readonly listenWithin: (part: EventTarget) => Effect.Effect<never, never, Keys>;
}

/**
 * The hub of `page`, whose URL `href` reads: built with the page's `Keys`
 * (whose keyboard says how chords read) and its `Clipboard` (where Copy
 * link, every page's command, writes).
 */
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

/** The hub of `page`, chords read as a Mac's when `mac`. */
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
  /** The input the viewer last used; nothing heard yet, a pointer's (no ring). */
  let heard: Heard = { input: 'pointer', walks: () => false };
  /** Whether the last input's walk is still unread: a step through the history reads it once. */
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
  /** One press, heard, then bound and run: whether the keymap took it (its default is then prevented). */
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
