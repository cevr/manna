/**
 * A pose written in place every frame (a `House`, a `Temple`, a hand's
 * `GestureAt`) with its fields writable, so a scene keeps one at module
 * scope and draws with no allocation.
 */
export type Posed<T> = { -readonly [K in keyof T]: T[K] };

/** Write every field of `defaults` onto `scratch`, in place (no allocation), and hand it back. */
export const reset = <T extends object>(scratch: T, defaults: Readonly<Partial<T>>): T =>
  Object.assign(scratch, defaults);
