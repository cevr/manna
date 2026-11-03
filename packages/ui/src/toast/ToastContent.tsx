import type { JSX } from '@solidjs/web';
import { omit } from 'solid-js';

import type { BaseUIComponentProps } from '../internals/types.ts';
import { useRenderElement } from '../internals/useRenderElement.tsx';
import { useToastRootContext } from './ToastRootContext.ts';

interface ToastContentState {
  expanded: boolean;
  behind: boolean;
}

interface ToastContentProps extends BaseUIComponentProps<'div', ToastContentState> {}

export function ToastContent(props: ToastContentProps): JSX.Element {
  const { visibleIndex, expanded } = useToastRootContext();

  const state: ToastContentState = {
    get expanded() {
      return expanded();
    },
    get behind() {
      return visibleIndex() > 0;
    },
  };

  return useRenderElement('div', props, {
    state,
    props: omit(props, 'class', 'style', 'render'),
  });
}
