import type { JSX } from '@solidjs/web';

import { MenuPositioner, type MenuPositionerProps } from '../menu/positioner/MenuPositioner.tsx';

export { ContextMenuRoot as Root } from './root/ContextMenuRoot.tsx';
export { ContextMenuTrigger as Trigger } from './trigger/ContextMenuTrigger.tsx';

export const Positioner: (props: Omit<MenuPositionerProps, 'sideOffset' | 'align'>) => JSX.Element =
  MenuPositioner;

export { MenuGroup as Group, MenuGroupLabel as GroupLabel } from '../menu/group/MenuGroup.tsx';
export { MenuItem as Item } from '../menu/item/MenuItem.tsx';
export { MenuPopup as Popup } from '../menu/popup/MenuPopup.tsx';
export { MenuPortal as Portal } from '../menu/portal/MenuPortal.tsx';
export { Separator } from '../separator/Separator.tsx';
