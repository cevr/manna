import type { JSX } from '@solidjs/web';
import { omit, untrack } from 'solid-js';

import {
  type FocusableElement,
  getFocusableAncestor,
} from '../floating-ui-solid/utils/tabbable.ts';
import { CompositeRoot } from '../internals/composite/CompositeRoot.tsx';
import type { BaseUIComponentProps, HTMLProps } from '../internals/types.ts';
import { ToggleGroupContext, type ToggleGroupContextValue } from './ToggleGroupContext.ts';

interface ToggleGroupState {}

interface ToggleGroupProps<Value extends string = string> extends BaseUIComponentProps<
  'div',
  ToggleGroupState
> {
  value: readonly Value[];
  onValueChange: (groupValue: Value[]) => void;
}

const STATE: ToggleGroupState = {};

const pressedIndex = (elements: ReadonlyArray<HTMLElement | null>) =>
  elements.findIndex((el) => el?.getAttribute('aria-pressed') === 'true');

export function ToggleGroup<Value extends string = string>(
  props: ToggleGroupProps<Value>,
): JSX.Element {
  let element: HTMLElement | null = null;
  const context: ToggleGroupContextValue<Value> = {
    get value() {
      return props.value;
    },
    setGroupValue(newValue, nextPressed) {
      untrack(() => props.onValueChange)(nextPressed ? [newValue] : []);
    },
    holdsFocus() {
      return element?.contains(element.ownerDocument.activeElement) ?? false;
    },
    releaseFocus() {
      if (element === null) {
        return;
      }
      const ancestor = getFocusableAncestor(element);
      if (ancestor !== null) {
        ancestor.focus({ preventScroll: true });
        return;
      }
      const active = element.ownerDocument.activeElement;
      if (active !== null && active !== element.ownerDocument.body && 'blur' in active) {
        (active as FocusableElement).blur();
      }
    },
  };

  const defaultProps: HTMLProps = {
    role: 'group',
    ref(node: HTMLElement | null) {
      element = node;
    },
  };
  const elementProps = omit(
    props,
    'class',
    'style',
    'render',
    'value',
    'onValueChange',
  ) as HTMLProps;

  return (
    <ToggleGroupContext value={context as unknown as ToggleGroupContextValue<string>}>
      <CompositeRoot<ToggleGroupState>
        render={props.render}
        class={props.class}
        style={props.style}
        state={STATE}
        initialIndex={pressedIndex}
        props={[defaultProps, elementProps]}
      />
    </ToggleGroupContext>
  );
}
