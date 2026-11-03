import { Array as Arr, Option } from 'effect';
import { type Command, type CommandId, type Invocation, labelOf } from './command.ts';
import type { Context } from './context.ts';
import { EVERYWHERE, type Target, targetOf } from './target.ts';

export interface MenuRow {
  readonly command: Command;
  readonly label: string;
  readonly step: Invocation['step'];
}

const rowOf = (command: Command, ctx: Context): MenuRow => ({
  command,
  label: labelOf(command, ctx),
  step: 'normal',
});

export const rowKey = (row: MenuRow): string =>
  [row.command.id, ...[row.step].filter((s) => s !== 'normal')].join(' ');

export const rowChord = (row: MenuRow, key: string): string =>
  [...['shift'].filter(() => row.step === 'coarse'), key].join('+');

const matches = (query: string, text: string): boolean => {
  const said = text.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== '')
    .every((word) => said.includes(word));
};

const isTyped = (command: Command): boolean => command.typed === true;

export const menuRows = (
  available: ReadonlyArray<Command>,
  ctx: Context,
  query: string,
): ReadonlyArray<MenuRow> => {
  const typing = query.trim() !== '';
  return byGroup(available.filter((command) => typing || !isTyped(command)))
    .flatMap(([, commands]) => commands)
    .map((command) => rowOf(command, ctx))
    .filter((row) => matches(query, `${row.label} ${row.command.group} ${row.command.id}`));
};

export const sheetRows = (
  all: ReadonlyArray<Command>,
  bound: (id: CommandId) => ReadonlyArray<unknown>,
): ReadonlyArray<readonly [string, ReadonlyArray<Command>]> =>
  byGroup(all.filter((command) => !isTyped(command) || bound(command.id).length > 0));

const VIEW = 'View';

export const viewRows = (
  available: ReadonlyArray<Command>,
  ctx: Context,
  last: ReadonlyArray<Command>,
): ReadonlyArray<MenuRow> =>
  [...available.filter((c) => c.group === VIEW), ...last].map((command) => rowOf(command, ctx));

const steppedRows = (command: Command, ctx: Context): ReadonlyArray<MenuRow> => {
  const row = rowOf(command, ctx);
  return [
    row,
    ...[{ ...row, label: `${row.label} ×10`, step: 'coarse' as const }].filter(
      () => command.stepped === true,
    ),
  ];
};

export const contextRows = (
  available: ReadonlyArray<Command>,
  ctx: Context,
): ReadonlyArray<readonly [string, ReadonlyArray<MenuRow>]> => {
  const target: Target = targetOf(Option.fromUndefinedOr(ctx.selection[0]));
  const targetsOf = (c: Command): ReadonlyArray<Target> =>
    Option.getOrElse(Option.fromUndefinedOr(c.about), () => []);
  const about = available.filter((c) => targetsOf(c).includes(target));
  const everywhere = (c: Command) => EVERYWHERE.every((t) => targetsOf(c).includes(t));
  return byGroup([...about.filter((c) => !everywhere(c)), ...about.filter(everywhere)]).map(
    ([group, commands]) =>
      [group, commands.flatMap((command) => steppedRows(command, ctx))] as const,
  );
};

export const byGroup = (
  commands: ReadonlyArray<Command>,
): ReadonlyArray<readonly [string, ReadonlyArray<Command>]> =>
  Arr.dedupe(commands.map((c) => c.group)).map(
    (group) => [group, commands.filter((c) => c.group === group)] as const,
  );
