import type { JSX } from '@solidjs/web';
import { createSignal, Show } from 'solid-js';

import { Dialog } from '../../../src/dialog/index.ts';
import { log, param } from './log.ts';

function ownerOpen(id: string) {
  const [open, setOpen] = createSignal(false);
  const Opener = (props: { children: JSX.Element }) => (
    <button type="button" id={id} onClick={() => setOpen(true)}>
      {props.children}
    </button>
  );
  return { open, setOpen, Opener };
}

function BasicDialog(): JSX.Element {
  const owner = ownerOpen('open');
  const [firstTitle, setFirstTitle] = createSignal(true);
  (window as unknown as { __dropTitle: () => void }).__dropTitle = () => setFirstTitle(false);
  const opener = param('opener') === 'range' ? 'range' : param('opener') === 'text' ? 'text' : null;
  (window as unknown as { __open: () => void }).__open = () => owner.setOpen(true);
  return (
    <div style={{ padding: '20px', height: param('tall') === 'true' ? '3000px' : undefined }}>
      <button type="button" id="outside">
        outside
      </button>
      {opener === null ? <owner.Opener>Open</owner.Opener> : <input id="open" type={opener} />}
      <Dialog.Root
        open={owner.open()}
        modal={param('modal') !== 'false'}
        onOpenChange={(open, details) => {
          log(`open ${open} ${details.reason}`);
          if (param('owner') !== 'keep') {
            owner.setOpen(open);
          }
        }}
        onOpenChangeComplete={(open) => log(`complete ${open}`)}
      >
        <Dialog.Portal id="portal" inline={param('portal') === 'inline'}>
          {param('backdrop') === 'user' ? <Dialog.Backdrop id="backdrop" /> : null}
          <Dialog.Popup id="popup">
            <Show when={firstTitle()}>
              <Dialog.Title id="title">Title</Dialog.Title>
            </Show>
            {param('titles') === 'two' ? <Dialog.Title id="title-2">Second</Dialog.Title> : null}
            <Dialog.Description id="description">Description</Dialog.Description>
            <button type="button" id="first">
              first
            </button>
            <input id="input" />
            <Dialog.Close id="close">Close</Dialog.Close>
            <Show when={param('closes') === 'owner'}>
              <button type="button" id="owner-close" onClick={() => owner.setOpen(false)}>
                Owner close
              </button>
              <div id="owner-close-row" onClick={() => owner.setOpen(false)}>
                Owner close row
              </div>
            </Show>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function SideBySide(): JSX.Element {
  const first = ownerOpen('open');
  const [second, setSecond] = createSignal(false);
  const [third, setThird] = createSignal(false);
  return (
    <div>
      <first.Opener>Open base</first.Opener>
      <Dialog.Root open={first.open()} onOpenChange={(open) => first.setOpen(open)}>
        <Dialog.Portal>
          <Dialog.Popup id="level-1">
            <button type="button" id="open-2" onClick={() => setSecond(true)}>
              Open 2
            </button>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={second()} onOpenChange={(open) => setSecond(open)}>
        <Dialog.Portal>
          <Dialog.Popup id="level-2">
            <button type="button" id="open-3" onClick={() => setThird(true)}>
              Open 3
            </button>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={third()} onOpenChange={(open) => setThird(open)}>
        <Dialog.Portal>
          <Dialog.Popup id="level-3">Final</Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function Animated(): JSX.Element {
  const owner = ownerOpen('open');
  return (
    <div>
      <style>{`
        #popup { transition: opacity 200ms; }
        #popup[data-starting-style], #popup[data-ending-style] { opacity: 0; }
      `}</style>
      <owner.Opener>Open</owner.Opener>
      <Dialog.Root
        open={owner.open()}
        onOpenChange={(open) => owner.setOpen(open)}
        onOpenChangeComplete={(open) => log(`complete ${open}`)}
      >
        <Dialog.Portal>
          <Dialog.Popup id="popup">
            <Dialog.Close id="close">Close</Dialog.Close>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function withPopupStyles(fixture: () => JSX.Element): () => JSX.Element {
  return () => (
    <>
      <style>{`[role="dialog"] { position: relative; }`}</style>
      {fixture()}
    </>
  );
}

export const fixtures: Record<string, () => JSX.Element> = {
  dialog: withPopupStyles(BasicDialog),
  'side-by-side': withPopupStyles(SideBySide),
  animated: withPopupStyles(Animated),
};
