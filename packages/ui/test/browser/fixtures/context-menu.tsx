import type { JSX } from '@solidjs/web';

import { ContextMenu } from '../../../src/context-menu/index.ts';
import { log, param } from './log.ts';

function AreaMenu(): JSX.Element {
  const under = param('under') === 'true';
  const padded = param('padded') === 'true';
  return (
    <ContextMenu.Root
      onOpenChange={(open, details) => {
        if (open && (details.event.target as Element | null)?.id === 'field') {
          details.cancel();
          log('open declined');
          return;
        }
        log(`open ${open} ${details.reason}`);
      }}
    >
      <ContextMenu.Trigger
        id="area"
        style={{ width: '300px', height: '200px', margin: '40px', background: '#eee' }}
      >
        Right click here
        <input id="field" style={{ display: 'block', width: '80px' }} />
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner id="positioner">
          <ContextMenu.Popup
            id="popup"
            style={{
              ...(under ? { transform: 'translate(-20px, -20px)' } : {}),
              ...(padded ? { padding: '8px' } : {}),
            }}
          >
            <ContextMenu.Item id="copy" onClick={() => log('click copy')}>
              Copy
            </ContextMenu.Item>
            <ContextMenu.Item id="paste" onClick={() => log('click paste')}>
              Paste
            </ContextMenu.Item>
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

function NestedTargets(): JSX.Element {
  const targetOf = (event: Event) =>
    (event.target as Element | null)?.closest('[data-target]')?.getAttribute('data-target') ??
    'page';
  return (
    <ContextMenu.Root
      onOpenChange={(open, details) =>
        log(open ? `open true ${targetOf(details.event)}` : `open false ${details.reason}`)
      }
    >
      <ContextMenu.Trigger id="page" style={{ display: 'contents' }}>
        <div style={{ padding: '40px' }}>
          <ContextMenu.Trigger
            id="target-a"
            data-target="a"
            style={{ width: '200px', height: '80px', background: '#ddd' }}
          >
            A
          </ContextMenu.Trigger>
          <ContextMenu.Trigger
            id="target-b"
            data-target="b"
            style={{ width: '200px', height: '80px', background: '#ccc' }}
          >
            B
          </ContextMenu.Trigger>
          <div id="blank" style={{ width: '200px', height: '120px' }}>
            blank
          </div>
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner id="positioner">
          <ContextMenu.Popup id="popup">
            <ContextMenu.Item
              id="duplicate"
              label="Duplicate"
              onClick={() => log('click duplicate')}
            >
              <kbd>⌘D</kbd> Duplicate
            </ContextMenu.Item>
            <ContextMenu.Item id="rename" label="Rename" onClick={() => log('click rename')}>
              <kbd>F2</kbd> Rename
            </ContextMenu.Item>
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

export const fixtures: Record<string, () => JSX.Element> = {
  area: () => <AreaMenu />,
  nested: () => <NestedTargets />,
};
