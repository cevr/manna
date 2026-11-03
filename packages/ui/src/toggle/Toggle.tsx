import type { JSX } from '@solidjs/web';
import { omit, untrack } from 'solid-js';

import { CompositeItem } from '../internals/composite/CompositeItem.tsx';
import type { BaseUIComponentProps, HTMLProps } from '../internals/types.ts';
import { useButton } from '../internals/useButton.ts';
import { useToggleGroupContext } from '../toggle-group/ToggleGroupContext.ts';

interface ToggleState {
  pressed: boolean;
}

interface ToggleProps<Value extends string = string> extends Omit<
  BaseUIComponentProps<'button', ToggleState>,
  'disabled'
> {
  value: Value;
}

export function Toggle<Value extends string = string>(props: ToggleProps<Value>): JSX.Element {
  const group = useToggleGroupContext();
  const pressed = () => group.value.includes(props.value);

  const button = useButton({ composite: true });

  const initialTabStop = (index: number) =>
    group.value.length > 0 ? group.value[0] === props.value : index === 0;

  const state: ToggleState = {
    get pressed() {
      return pressed();
    },
  };

  const ownProps: HTMLProps = {
    get 'aria-pressed'() {
      return pressed() ? 'true' : 'false';
    },
    onMouseDown(event: MouseEvent) {
      if (group.holdsFocus()) {
        return;
      }
      event.preventDefault();
      group.releaseFocus();
    },
    onClick() {
      untrack(() => group.setGroupValue(props.value, !pressed()));
    },
  };

  const elementProps = omit(
    props,
    'class',
    'style',
    'render',
    'value',
    'type',
    'form',
  ) as HTMLProps;

  return (
    <CompositeItem<ToggleState>
      tag="button"
      guess
      initialTabStop={initialTabStop}
      render={props.render}
      class={props.class}
      style={props.style}
      state={state}
      props={[button, ownProps, elementProps]}
    />
  );
}
