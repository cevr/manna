import { For, Show } from '@solidjs/web';
import { ContextMenu } from '@manna/ui/context-menu';
import { Option } from 'effect';
import { type Accessor, type ComponentProps, type ParentProps, createMemo, omit } from 'solid-js';
import { isField, withSelection } from '../../command/context.ts';
import type { Hub } from '../../command/hub.ts';
import { type MenuRow, contextRows, rowChord, rowKey } from '../../command/menu.ts';
import type { Selection } from '../../command/selection.ts';
import { targetAt, targetAttr } from '../../command/target.ts';
import { deferredRun, hubChanges, hubKeys } from './changes.ts';

export const TargetMenu = (props: ParentProps<{ readonly hub: Hub }>) => {
  const hub = props.hub;
  const run = deferredRun(hub, 'menu');
  const changes = hubChanges(hub);

  const groups = createMemo(() => {
    changes();
    const ctx = run.opened();
    return contextRows(hub.commands.available(ctx), ctx);
  });

  const keys = hubKeys(hub);
  const keysText = (row: MenuRow): string =>
    keys
      .bound(row.command.id)
      .map((k) => keys.label(rowChord(row, k)))
      .join(' ');

  return (
    <ContextMenu.Root
      onOpenChange={(open, details) => {
        if (!open) return;
        const at = Option.fromNullishOr(details.event.target);
        if (isField(at)) {
          details.cancel();
          return;
        }
        run.open(withSelection(hub.context(), Option.toArray(targetAt(at))));
      }}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) run.closed();
      }}
    >
      <ContextMenu.Trigger class="lab-page-target" style={{ display: 'contents' }}>
        {props.children}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner class="lab-context-positioner">
          <ContextMenu.Popup class="lab-context-menu" data-role="context-menu">
            <For each={groups()} keyed={([group]) => group}>
              {(entry, i: Accessor<number>) => (
                <ContextMenu.Group class="lab-context-group">
                  <Show when={i() > 0}>
                    <ContextMenu.Separator class="lab-context-separator" />
                  </Show>
                  <ContextMenu.GroupLabel class="lab-context-label">
                    {entry()[0]}
                  </ContextMenu.GroupLabel>
                  <For each={entry()[1]} keyed={rowKey}>
                    {(row) => (
                      <ContextMenu.Item
                        class="lab-context-item"
                        data-command={row().command.id}
                        data-step={row().step}
                        label={row().label}
                        onClick={() => run.choose(row())}
                      >
                        <span>{row().label}</span>
                        <kbd>{keysText(row())}</kbd>
                      </ContextMenu.Item>
                    )}
                  </For>
                </ContextMenu.Group>
              )}
            </For>
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
};

export const Target = (
  props: ComponentProps<typeof ContextMenu.Trigger> & { readonly of: Selection },
) => {
  const rest = omit(props, 'of');
  return <ContextMenu.Trigger {...rest} data-target={targetAttr(props.of)} />;
};
