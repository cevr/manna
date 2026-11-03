import { Boolean as Bool } from 'effect';

/** `noun` as `n` of them are named: plural but for one (`scene`, `scenes`). */
const plural = (n: number, noun: string): string =>
  Bool.match(n === 1, { onTrue: () => noun, onFalse: () => `${noun}s` });

/** `n` and `noun`, plural but for one: `1 scene`, `3 scenes`. */
export const counted = (n: number, noun: string): string => `${n} ${plural(n, noun)}`;
