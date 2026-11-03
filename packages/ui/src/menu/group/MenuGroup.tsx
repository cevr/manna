import type { JSX } from '@solidjs/web';
import { createContext, createSignal, omit, untrack, useContext } from 'solid-js';

import type { BaseUIComponentProps } from '../../internals/types.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { type RegisterId, useRegisteredId } from '../../utils/useRegisteredId.ts';

type MenuGroupContextValue = RegisterId;

export const MenuGroupContext = createContext<MenuGroupContextValue | null>(null);

function useMenuGroupRootContext(): MenuGroupContextValue {
  const context = useContext(MenuGroupContext);
  if (context === null) {
    throw new Error(
      'Base UI: MenuGroupContext is missing. Menu group parts must be used within <Menu.Group>.',
    );
  }
  return context;
}

export function createGroupLabelId() {
  const [labelId, setLabelId] = createSignal<string | undefined>(undefined, { ownedWrite: true });
  const update: MenuGroupContextValue = (fn) => setLabelId((current) => fn(current));
  return { labelId, update };
}

interface MenuGroupState {}

interface MenuGroupProps extends BaseUIComponentProps<'div', MenuGroupState> {}

export function MenuGroup(componentProps: MenuGroupProps): JSX.Element {
  const elementProps = omit(componentProps, 'class', 'style', 'render');
  const { labelId, update } = createGroupLabelId();
  const element = () =>
    useRenderElement('div', componentProps, {
      props: [
        {
          role: 'group',
          get 'aria-labelledby'() {
            return labelId();
          },
        },
        elementProps,
      ],
    });
  return <MenuGroupContext value={update}>{untrack(element)}</MenuGroupContext>;
}

interface MenuGroupLabelState {}

interface MenuGroupLabelProps extends BaseUIComponentProps<'div', MenuGroupLabelState> {}

export function MenuGroupLabel(componentProps: MenuGroupLabelProps): JSX.Element {
  const elementProps = omit(componentProps, 'class', 'style', 'render', 'id');
  const id = useRegisteredId(componentProps, useMenuGroupRootContext());
  return useRenderElement('div', componentProps, {
    props: [
      {
        get id() {
          return id();
        },
        'aria-hidden': 'true',
      },
      elementProps,
    ],
  });
}
