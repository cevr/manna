import { Dialog } from '@manna/ui/dialog';
import { For } from '@solidjs/web';
import { createSignal } from 'solid-js';

import { Lockup } from './brand.tsx';
import { MenuIcon } from './header.tsx';
import { NAV, SUBSCRIBE } from './nav.ts';

const CloseIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    aria-hidden="true"
  >
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

const EXPANDED = { true: 'true', false: 'false' } as const;

export const PhoneMenu = () => {
  const [open, setOpen] = createSignal(false, { ownedWrite: true });
  return (
    <>
      <button
        type="button"
        class="menu-button"
        aria-label="Menu"
        aria-haspopup="dialog"
        aria-expanded={EXPANDED[`${open()}`]}
        onClick={() => setOpen(true)}
      >
        <MenuIcon />
      </button>
      <Dialog.Root open={open()} onOpenChange={(next) => setOpen(next)}>
        <Dialog.Portal>
          <Dialog.Backdrop class="menu-backdrop" />
          <Dialog.Popup class="menu-popup">
            <div class="menu-top">
              <Lockup />
              <Dialog.Close class="menu-button" aria-label="Close menu">
                <CloseIcon />
              </Dialog.Close>
            </div>
            <Dialog.Title class="visually-hidden">Menu</Dialog.Title>
            <nav aria-label="Main">
              <ul class="menu-links">
                <For each={NAV}>
                  {(link) => (
                    <li>
                      <a href={link.href} onClick={() => setOpen(false)}>
                        {link.label}
                      </a>
                    </li>
                  )}
                </For>
                <li>
                  <a class="button" href={SUBSCRIBE.href}>
                    <span class="button-label">{SUBSCRIBE.label}</span>
                  </a>
                </li>
              </ul>
            </nav>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
};
