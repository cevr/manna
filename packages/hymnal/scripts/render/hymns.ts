import { Array as Arr, Effect, Option } from 'effect';
import { RenderFailed } from './proc.js';

export const FIRST = 1;
export const LAST = 695;

const refused = (reason: string) => RenderFailed.make({ step: 'arguments', reason });

export const hymnsOf = (text: string) => {
  const numbers = text.split(',').map((part) => part.trim());
  const bad = numbers.filter((n) => !/^\d+$/.test(n) || Number(n) < FIRST || Number(n) > LAST);
  return bad.length > 0
    ? Effect.fail(refused(`not a hymn from ${FIRST} to ${LAST}: ${bad.join(', ')}`))
    : Effect.succeed(Arr.dedupe(numbers.map(Number)));
};

export const chosenOf = (hymns: Option.Option<string>, all: boolean) =>
  Option.match(hymns, {
    onNone: () =>
      all ? Effect.succeed(Arr.range(FIRST, LAST)) : Effect.fail(refused('name --hymns or --all')),
    onSome: (text) =>
      all ? Effect.fail(refused('name --hymns or --all, not both')) : hymnsOf(text),
  });
