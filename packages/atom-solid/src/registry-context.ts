/* oxlint-disable effect/noNewError -- a hook used outside its provider is a programming defect, reported the way Solid reports its own: by throwing from the hook. */

import { Option } from 'effect';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import type { ParentProps } from 'solid-js';
import { createComponent, createContext, onCleanup, useContext } from 'solid-js';

const RegistryContext = createContext<Option.Option<AtomRegistry.AtomRegistry>>(Option.none());

export const useRegistry = (): AtomRegistry.AtomRegistry =>
  Option.getOrThrowWith(
    useContext(RegistryContext),
    () =>
      new Error(
        '@manna/atom-solid: an atom hook ran outside a RegistryProvider. Wrap each page (and each server render) in its own RegistryProvider.',
      ),
  );

type RegistryProviderProps = ParentProps<
  Pick<NonNullable<Parameters<typeof AtomRegistry.make>[0]>, 'initialValues'>
>;

export const RegistryProvider = (props: RegistryProviderProps) => {
  const registry = AtomRegistry.make({
    initialValues: props.initialValues,
    defaultIdleTTL: 400,
  });
  onCleanup(() => registry.dispose());
  return createComponent(RegistryContext, {
    value: Option.some(registry),
    get children() {
      return props.children;
    },
  });
};
