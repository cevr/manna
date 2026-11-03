import type { JSX } from '@solidjs/web';
import { omit } from 'solid-js';

import type { BaseUIComponentProps } from '../../internals/types.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { useRegisteredId } from '../../utils/useRegisteredId.ts';
import { useDialogRootContext } from '../root/DialogRootContext.ts';

interface DialogTitleState {}

interface DialogTitleProps extends BaseUIComponentProps<'h2', DialogTitleState> {}

interface DialogDescriptionState {}

interface DialogDescriptionProps extends BaseUIComponentProps<'p', DialogDescriptionState> {}

export function DialogTitle(componentProps: DialogTitleProps): JSX.Element {
  const { store } = useDialogRootContext();
  const elementProps = omit(componentProps, 'class', 'style', 'render', 'id');
  const id = useRegisteredId(componentProps, store.setTitleElementId);
  return useRenderElement('h2', componentProps, {
    props: [
      {
        get id() {
          return id();
        },
      },
      elementProps,
    ],
  });
}

export function DialogDescription(componentProps: DialogDescriptionProps): JSX.Element {
  const { store } = useDialogRootContext();
  const elementProps = omit(componentProps, 'class', 'style', 'render', 'id');
  const id = useRegisteredId(componentProps, store.setDescriptionElementId);
  return useRenderElement('p', componentProps, {
    props: [
      {
        get id() {
          return id();
        },
      },
      elementProps,
    ],
  });
}
