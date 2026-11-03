import { Cause, Effect, Option } from 'effect';

export type LogField = string | number;

const line = (action: string, fields: Readonly<Record<string, LogField>>) =>
  [`[mail] ${action}`, ...Object.entries(fields).map(([key, value]) => `${key}=${value}`)].join(
    ' ',
  );

export const logMail = (action: string, fields: Readonly<Record<string, LogField>> = {}) =>
  Effect.logInfo(line(action, fields));

export const warnMail = (action: string, fields: Readonly<Record<string, LogField>> = {}) =>
  Effect.logWarning(line(action, fields));

export const reasonOf = <E>(cause: Cause.Cause<E>, field: (error: E) => string) =>
  Option.match(Cause.findErrorOption(cause), { onNone: () => 'defect', onSome: field });
