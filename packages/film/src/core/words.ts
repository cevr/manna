import { Boolean as Bool } from 'effect';

const plural = (n: number, noun: string): string =>
  Bool.match(n === 1, { onTrue: () => noun, onFalse: () => `${noun}s` });

export const counted = (n: number, noun: string): string => `${n} ${plural(n, noun)}`;
