import { type JSX, dynamic } from '@solidjs/web';
import { createMemo, untrack } from 'solid-js';

import {
  mergeClassNames,
  mergePropsLive,
  mergePropsN,
  mergeStyles,
  type PropsInput,
} from '../merge-props/mergeProps.ts';
import { getStateAttributesProps, type StateAttributesMapping } from './getStateAttributesProps.ts';
import type { ClassProp, ComponentRenderFn, HTMLProps, StyleProp } from './types.ts';

export type IntrinsicTagName = keyof JSX.IntrinsicElements;

export interface UseRenderElementComponentProps<State> {
  class?: ClassProp<State> | undefined;
  style?: StyleProp<State> | undefined;
  render?: ComponentRenderFn<HTMLProps, State> | undefined;
}

interface UseRenderElementParameters<State> {
  state?: State | undefined;
  ref?: unknown;
  props?: PropsInput | ReadonlyArray<PropsInput> | undefined;
  stateAttributesMapping?: StateAttributesMapping<State> | undefined;
}

const EMPTY_STATE = {};

function resolveClass<State>(value: ClassProp<State> | undefined, state: State) {
  return typeof value === 'function' ? value(state) : value;
}

function resolveStyle<State>(value: StyleProp<State> | undefined, state: State) {
  return typeof value === 'function' ? value(state) : value;
}

export function propsFromAccessor(read: () => HTMLProps): HTMLProps {
  return new Proxy<HTMLProps>(
    {},
    {
      get: (_, key) => (typeof key === 'string' ? read()[key] : undefined),
      has: (_, key) => typeof key === 'string' && key in read(),
      ownKeys: () => Object.keys(read()),
      getOwnPropertyDescriptor: (_, key) => {
        if (typeof key !== 'string' || !(key in read())) {
          return undefined;
        }
        return { configurable: true, enumerable: true, get: () => read()[key] };
      },
    },
  );
}

function useRenderElementProps<State extends object>(
  componentProps: UseRenderElementComponentProps<State>,
  params: UseRenderElementParameters<State>,
): HTMLProps {
  const state = () => (params.state ?? EMPTY_STATE) as State;
  const stateAttributes = createMemo(() =>
    getStateAttributesProps(state(), params.stateAttributesMapping),
  );
  const resolved = mergePropsLive(() => {
    const inputs = params.props;
    return Array.isArray(inputs) ? (inputs as ReadonlyArray<PropsInput>) : [inputs as PropsInput];
  });
  const own: HTMLProps = {
    get class() {
      return mergeClassNames(resolved['class'], resolveClass(componentProps.class, state()));
    },
    get style() {
      return mergeStyles(resolved['style'], resolveStyle(componentProps.style, state()));
    },
    ref: untrack(() => params.ref),
  };
  return mergePropsN([propsFromAccessor(stateAttributes), resolved, own]);
}

export function useRenderElement<State extends object>(
  element: IntrinsicTagName | undefined,
  componentProps: UseRenderElementComponentProps<State>,
  params: UseRenderElementParameters<State> = {},
): JSX.Element {
  const props = useRenderElementProps(componentProps, params);
  const state = propsFromAccessor(() => (params.state ?? EMPTY_STATE) as HTMLProps) as State;
  const tag = element ?? 'div';
  const Tag = dynamic(() => tag, { static: true });
  const tagProps = tag === 'button' ? mergePropsN([{ type: 'button' }, props]) : props;

  return createMemo(() => {
    const render = componentProps.render;
    return untrack(() => (render ? render(props, state) : <Tag {...tagProps} />));
  }) as unknown as JSX.Element;
}
