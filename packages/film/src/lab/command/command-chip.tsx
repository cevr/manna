import { For, type JSX } from '@solidjs/web';
import { Menu } from '@manna/ui/menu';
import { createMemo } from 'solid-js';
import type { Command } from '../../command/command.ts';
import type { Context } from '../../command/context.ts';
import type { Hub } from '../../command/hub.ts';
import { type MenuRow, rowKey } from '../../command/menu.ts';
import { deferredRun, hubChanges, hubKeys } from './changes.ts';

interface RowsMenuProps {
  readonly hub: Hub;
  readonly rows: (available: ReadonlyArray<Command>, ctx: Context) => ReadonlyArray<MenuRow>;
  readonly role: string;
  readonly align: 'start' | 'end';
  readonly children: JSX.Element;
  readonly title: string;
  readonly label?: string;
  readonly act: string;
  readonly class?: string;
}

export const RowsMenu = (props: RowsMenuProps) => {
  const hub = props.hub;
  const changes = hubChanges(hub);
  const run = deferredRun(hub, 'menu');
  const rows = createMemo(() => {
    changes();
    const ctx = run.opened();
    return props.rows(hub.commands.available(ctx), ctx);
  });
  const keys = hubKeys(hub);
  return (
    <Menu.Root
      onOpenChange={(open) => {
        if (open) run.open(hub.context());
      }}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) run.closed();
      }}
    >
      <Menu.Trigger
        class={props.class}
        data-act={props.act}
        aria-label={props.label}
        title={props.title}
      >
        {props.children}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner class="lab-context-positioner" sideOffset={4} align={props.align}>
          <Menu.Popup class="lab-context-menu" data-role={props.role}>
            <For each={rows()} keyed={rowKey}>
              {(row) => (
                <Menu.Item
                  class="lab-context-item"
                  data-command={row().command.id}
                  label={row().label}
                  onClick={() => run.choose(row())}
                >
                  <span>{row().label}</span>
                  <kbd>{keys.text(row().command.id)}</kbd>
                </Menu.Item>
              )}
            </For>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
};
