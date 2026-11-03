import { isServer } from '@solidjs/web';
import { Context as Services, Effect, Option, Scheduler } from 'effect';
import type { Accessor } from 'solid-js';
import { createSignal, onCleanup } from 'solid-js';
import type { Input } from '../../browser/keys.ts';
import type { CommandId, Invocation } from '../../command/command.ts';
import type { Context } from '../../command/context.ts';
import type { Hub } from '../../command/hub.ts';
import { chordLabel, titleWith } from '../../command/keymap.ts';
import type { MenuRow } from '../../command/menu.ts';

export const hubChanges = (hub: Hub): Accessor<number> => {
  const [changes, setChanges] = createSignal(0, { ownedWrite: true });
  if (!isServer) onCleanup(hub.subscribe(() => setChanges((n) => n + 1)));
  return changes;
};

interface HubKeys {
  readonly bound: (id: CommandId) => ReadonlyArray<string>;
  readonly label: (chord: string) => string;
  readonly text: (id: CommandId) => string;
  readonly first: (id: CommandId) => string;
  readonly titled: (title: string, id: CommandId) => string;
}

export const keysAs = (hub: Hub, follow: () => void = () => {}): HubKeys => {
  const bound = (id: CommandId) => {
    follow();
    return hub.keysOf(id);
  };
  const label = (chord: string) => chordLabel(chord, hub.mac);
  const first = (id: CommandId) => bound(id).slice(0, 1).map(label).join('');
  return {
    bound,
    label,
    text: (id) => bound(id).map(label).join(' '),
    first,
    titled: (title, id) => titleWith(title, first(id)),
  };
};

export const hubKeys = (hub: Hub): HubKeys => {
  const changes = hubChanges(hub);
  return keysAs(hub, changes);
};

interface DeferredRun {
  readonly opened: Accessor<Context>;
  readonly open: (ctx: Context) => void;
  readonly choose: (row: MenuRow) => void;
  readonly closed: () => void;
}

const NEXT_MICROTASK = Services.make(Scheduler.Scheduler, new Scheduler.MixedScheduler('sync'));

export const deferredRun = (hub: Hub, via: Invocation['via']): DeferredRun => {
  const [opened, setOpened] = createSignal<Context>(hub.context());
  let chosen = Option.none<{ readonly row: MenuRow; readonly input: Input }>();
  return {
    opened,
    open: (ctx) => {
      chosen = Option.none();
      setOpened(ctx);
    },
    choose: (row) => {
      chosen = Option.some({ row, input: hub.input() });
    },
    closed: () => {
      const picked = chosen;
      const ctx = opened();
      chosen = Option.none();
      Option.map(picked, ({ row, input }) =>
        Effect.runForkWith(NEXT_MICROTASK)(
          Effect.andThen(
            Effect.yieldNow,
            Effect.sync(() => hub.invoke(row.command, { step: row.step, via, input }, ctx)),
          ),
        ),
      );
    },
  };
};
