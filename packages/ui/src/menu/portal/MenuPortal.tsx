import type { JSX } from '@solidjs/web';
import { createContext, Show, useContext } from 'solid-js';

import {
  FloatingPortal,
  type FloatingPortalProps,
} from '../../floating-ui-solid/FloatingPortal.tsx';
import { useMenuRootContext } from '../root/MenuRootContext.ts';

const MenuPortalContext = createContext(false);

export function useMenuPortalContext(): void {
  if (!useContext(MenuPortalContext)) {
    throw new Error('Base UI: <Menu.Portal> is missing.');
  }
}

interface MenuPortalProps extends FloatingPortalProps {}

export function MenuPortal(props: MenuPortalProps): JSX.Element {
  const { store } = useMenuRootContext();
  return (
    <Show when={store.mounted()}>
      <MenuPortalContext value={true}>
        <FloatingPortal {...props} />
      </MenuPortalContext>
    </Show>
  );
}
