import { createContext, useContext } from 'solid-js';

import type { HTMLProps } from '../../internals/types.ts';
import type { MenuParent, MenuStore } from '../store/MenuStore.ts';

export interface MenuRootContext {
  store: MenuStore;
  parent: MenuParent;
  /** The props of the trigger that opened the menu (`active`) or of another trigger. */
  triggerProps: (active: boolean) => HTMLProps;
  popupProps: HTMLProps;
  itemProps: HTMLProps;
}

export const MenuRootContext = createContext<MenuRootContext | null>(null);

export function useMenuRootContext(): MenuRootContext {
  const context = useContext(MenuRootContext);
  if (context === null) {
    throw new Error(
      'Base UI: MenuRootContext is missing. Menu parts must be placed within <Menu.Root>.',
    );
  }
  return context;
}

export function useMenuRootContextOptional(): MenuRootContext | null {
  return useContext(MenuRootContext);
}
