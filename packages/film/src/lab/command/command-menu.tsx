import { Dialog } from '@manna/ui/dialog';
import { For, Show } from '@solidjs/web';
import { Option } from 'effect';
import { createMemo, createSignal, onCleanup } from 'solid-js';
import { quietly } from '../../command/command.ts';
import type { Context } from '../../command/context.ts';
import type { Hub } from '../../command/hub.ts';
import { type MenuRow, menuRows, rowKey } from '../../command/menu.ts';
import { EVERYWHERE } from '../../command/target.ts';
import { deferredRun, hubChanges, hubKeys } from './changes.ts';

export const COMMAND_MENU = 'app.command-menu';

export const GO_TO_COMMAND = 'app.go-to';

const PSEUDO = { true: 'true', false: 'false' } as const;

export const CommandMenu = (props: { readonly hub: Hub }) => {
  const hub = props.hub;
  const keys = hubKeys(hub);
  const [open, setOpen] = createSignal(false, { ownedWrite: true });
  const [query, setQuery] = createSignal('');
  const [at, setAt] = createSignal(0);
  const run = deferredRun(hub, 'palette');
  const changes = hubChanges(hub);

  const rows = createMemo(() => {
    changes();
    const ctx = run.opened();
    return menuRows(
      hub.commands.available(ctx).filter((c) => c.id !== COMMAND_MENU && c.id !== GO_TO_COMMAND),
      ctx,
      query(),
    );
  });

  const active = () =>
    Option.getOrUndefined(
      Option.map(Option.fromUndefinedOr(rows()[at()]), () => `lab-command-${at()}`),
    );

  const show = (ctx: Context) => {
    run.open({ ...ctx, focus: 'page' });
    setQuery('');
    setAt(0);
    setOpen(true);
  };

  onCleanup(
    hub.commands.register(
      {
        id: COMMAND_MENU,
        label: 'Command menu',
        group: 'Help',
        keys: ['mod+k'],
        keysIn: ['page', 'field', 'studio'],
        about: EVERYWHERE,
        touch: 'long-press a cue, a card or a note, then Command menu',
        when: () => true,
        run: quietly((ctx) => {
          if (open()) setOpen(false);
          else show(ctx);
        }),
      },
      {
        id: GO_TO_COMMAND,
        label: 'Go to…',
        group: 'Help',
        keys: ['/'],
        touch: 'the command menu, then type a name',
        when: () => !open(),
        run: quietly((ctx) => show(ctx)),
      },
    ),
  );

  const choose = (row: MenuRow) => {
    run.choose(row);
    setOpen(false);
  };

  const onKey = (e: KeyboardEvent) => {
    const count = rows().length;
    if (e.key === 'ArrowDown') setAt((i) => Math.max(0, Math.min(count - 1, i + 1)));
    else if (e.key === 'ArrowUp') setAt((i) => Math.max(0, i - 1));
    else if (e.key === 'Enter') Option.map(Option.fromUndefinedOr(rows()[at()]), choose);
    else return;
    e.preventDefault();
  };

  return (
    <Dialog.Root
      open={open()}
      onOpenChange={(next) => setOpen(next)}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) run.closed();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop class="lab-sheet-backdrop" />
        <Dialog.Popup class="lab-command-menu" data-role="command-menu">
          <Dialog.Title class="lab-sheet-title">Commands</Dialog.Title>
          <input
            class="lab-command-query"
            type="search"
            placeholder="Type a command"
            aria-label="Command"
            aria-controls="lab-command-rows"
            aria-activedescendant={active()}
            value={query()}
            onInput={(e) => {
              setQuery(e.currentTarget.value);
              setAt(0);
            }}
            onKeyDown={onKey}
          />
          <div class="lab-command-rows" id="lab-command-rows" role="listbox" aria-label="Commands">
            <For each={rows()} keyed={rowKey}>
              {(row, i) => (
                // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus -- focus stays in the query, which names this row its active descendant and chooses it on Enter
                <div
                  class="lab-command-row"
                  id={`lab-command-${i()}`}
                  role="option"
                  aria-selected={PSEUDO[`${i() === at()}`]}
                  data-command={row().command.id}
                  onPointerMove={() => setAt(i())}
                  onClick={() => choose(row())}
                >
                  <span class="lab-command-label">{row().label}</span>
                  <span class="lab-command-group">{row().command.group}</span>
                  <kbd>{keys.text(row().command.id)}</kbd>
                </div>
              )}
            </For>
          </div>
          <Show when={rows().length === 0}>
            <p class="lab-command-none">No command matches.</p>
          </Show>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
