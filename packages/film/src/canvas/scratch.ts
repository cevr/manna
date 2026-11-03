export type Posed<T> = { -readonly [K in keyof T]: T[K] };

export const reset = <T extends object>(scratch: T, defaults: Readonly<Partial<T>>): T =>
  Object.assign(scratch, defaults);
