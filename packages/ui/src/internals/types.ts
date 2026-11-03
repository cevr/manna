import type { JSX } from '@solidjs/web';

export type HTMLProps = Record<string, unknown>;

export type BaseUIEvent<E extends Event> = E & {
  preventBaseUIHandler: () => void;
  readonly baseUIHandlerPrevented?: boolean;
};

export type ComponentRenderFn<Props, State> = (props: Props, state: State) => JSX.Element;

export type ClassProp<State> = JSX.ClassValue | ((state: State) => JSX.ClassValue);

export type StyleProp<State> =
  | JSX.CSSProperties
  | string
  | ((state: State) => JSX.CSSProperties | string | undefined);

export type BaseUIComponentProps<
  Tag extends keyof JSX.IntrinsicElements,
  State,
  RenderFunctionProps = HTMLProps,
> = Omit<JSX.IntrinsicElements[Tag], 'class' | 'style'> & {
  class?: ClassProp<State> | undefined;
  style?: StyleProp<State> | undefined;
  render?: ComponentRenderFn<RenderFunctionProps, State> | undefined;
};

export interface FloatingUIOpenChangeDetails {
  open: boolean;
  reason: string;
  nativeEvent: Event;
  triggerElement?: Element | undefined;
}
