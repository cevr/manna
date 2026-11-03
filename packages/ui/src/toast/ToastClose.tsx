import type { JSX } from '@solidjs/web';
import { omit, untrack } from 'solid-js';

import { useButton } from '../internals/useButton.ts';
import type { BaseUIComponentProps } from '../internals/types.ts';
import { useRenderElement } from '../internals/useRenderElement.tsx';
import { useToastProviderContext } from './ToastProviderContext.ts';
import { useToastRootContext } from './ToastRootContext.ts';

interface ToastCloseState {
  type: string | undefined;
}

interface ToastCloseProps extends BaseUIComponentProps<'button', ToastCloseState> {}

export function ToastClose(props: ToastCloseProps): JSX.Element {
  const { store } = useToastProviderContext();
  const { toast } = useToastRootContext();

  const button = useButton();

  const state: ToastCloseState = {
    get type() {
      return toast().type;
    },
  };

  return useRenderElement('button', props, {
    state,
    props: [
      button,
      {
        onClick() {
          store.closeToast(untrack(toast).id);
        },
      },
      omit(props, 'class', 'style', 'render'),
    ],
  });
}
