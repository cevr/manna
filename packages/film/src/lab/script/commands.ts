import { Option } from 'effect';
import { type Command, quietly } from '../../command/command.ts';
import type { WordsSelection } from '../../command/selection.ts';
import { selectedTo } from '../transcript/commands.ts';

interface ScriptVerbs {
  readonly selection: () => Option.Option<WordsSelection>;
  readonly select: (words: WordsSelection) => void;
}

export const scriptCommands = (verbs: ScriptVerbs): ReadonlyArray<Command> => [
  {
    id: 'script.select-to',
    label: 'Select to here',
    group: 'Script',
    about: ['Words'],
    touch: 'tap the first word, hold the last, then Select to here',
    when: (ctx) => Option.isSome(selectedTo(ctx, verbs.selection())),
    run: quietly((ctx) => Option.map(selectedTo(ctx, verbs.selection()), verbs.select)),
  },
];
