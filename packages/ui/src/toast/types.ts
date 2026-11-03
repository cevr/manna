import type { JSX } from '@solidjs/web';

export interface ToastObject<Data extends object = object> {
  id: string;
  ref?: { current: HTMLElement | null } | undefined;
  title?: JSX.Element;
  type?: string | undefined;
  timeout?: number | undefined;
  transitionStatus?: 'starting' | 'ending' | undefined;
  updateKey?: number | undefined;
  limited?: boolean | undefined;
  onRemove?: (() => void) | undefined;
  actionProps?: ToastObjectActionProps | undefined;
  data?: Data | undefined;
}

type ToastObjectActionProps = Omit<JSX.HTMLAttributes<HTMLButtonElement>, 'children'> & {
  children?: JSX.Element;
  disabled?: boolean | undefined;
  [key: string]: unknown;
};

export interface ToastManagerAddOptions<Data extends object> extends Omit<
  ToastObject<Data>,
  'id' | 'ref' | 'limited' | 'updateKey'
> {
  id?: string | undefined;
}
