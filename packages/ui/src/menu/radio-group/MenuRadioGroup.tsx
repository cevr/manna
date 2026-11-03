import type { JSX } from '@solidjs/web';
import { createContext, omit, untrack, useContext } from 'solid-js';

import type { BaseUIComponentProps } from '../../internals/types.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { MenuGroupContext, createGroupLabelId } from '../group/MenuGroup.tsx';

interface MenuRadioGroupContextValue {
  /** The value of the checked item. */
  readonly value: () => unknown;
  /** Offer `value`, the pressed item's, to the owner. */
  readonly setValue: (value: unknown, event: Event) => void;
}

const MenuRadioGroupContext = createContext<MenuRadioGroupContextValue | null>(null);

export function useMenuRadioGroupContext(): MenuRadioGroupContextValue {
  const context = useContext(MenuRadioGroupContext);
  if (context === null) {
    throw new Error(
      'Base UI: MenuRadioGroupContext is missing. Menu radio items must be used within <Menu.RadioGroup>.',
    );
  }
  return context;
}

interface MenuRadioGroupState {}

interface MenuRadioGroupProps<Value> extends BaseUIComponentProps<'div', MenuRadioGroupState> {
  /** The value of the checked item; none: no item is checked. */
  value: Value | undefined;
  /** Called with the value of the item pressed. */
  onValueChange?: ((value: Value, event: Event) => void) | undefined;
}

export function MenuRadioGroup<Value>(componentProps: MenuRadioGroupProps<Value>): JSX.Element {
  const elementProps = omit(componentProps, 'class', 'style', 'render', 'value', 'onValueChange');
  const { labelId, update } = createGroupLabelId();
  const context: MenuRadioGroupContextValue = {
    value: () => componentProps.value,
    setValue: (value, event) => {
      untrack(() => componentProps.onValueChange)?.(value as Value, event);
    },
  };
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
  return (
    <MenuGroupContext value={update}>
      <MenuRadioGroupContext value={context}>{untrack(element)}</MenuRadioGroupContext>
    </MenuGroupContext>
  );
}
