import { createEffect, createUniqueId } from 'solid-js';

/** Sets the registered id from the current one. */
export type RegisterId = (update: (current: string | undefined) => string | undefined) => void;

/** The part's id, registered through `register` while the part renders. */
export function useRegisteredId(
  props: { readonly id?: string | false | undefined },
  register: RegisterId,
): () => string {
  const fallbackId = createUniqueId();
  const id = () => props.id || fallbackId;
  createEffect(id, (value) => {
    register(() => value);
    return () => register((current) => (current === value ? undefined : current));
  });
  return id;
}
