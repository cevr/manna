import { Context, type Effect, Schema } from 'effect';

export type SqlValue = string | number;

export class SqlError extends Schema.TaggedError<SqlError>()('SqlError', {
  statement: Schema.String,
  reason: Schema.String,
}) {}

export interface SqlService {
  readonly all: (
    statement: Statement,
    values: ReadonlyArray<SqlValue>,
  ) => Effect.Effect<ReadonlyArray<unknown>, SqlError>;
  readonly run: (
    statement: Statement,
    values: ReadonlyArray<SqlValue>,
  ) => Effect.Effect<number, SqlError>;
  readonly batch: (steps: ReadonlyArray<Step>) => Effect.Effect<ReadonlyArray<number>, SqlError>;
}

export interface Statement {
  readonly name: string;
  readonly text: string;
}

export interface Step {
  readonly statement: Statement;
  readonly values: ReadonlyArray<SqlValue>;
}

export const batchName = (steps: ReadonlyArray<Step>) =>
  steps.map((step) => step.statement.name).join('+');

export class Sql extends Context.Service<Sql, SqlService>()('firsttheblade/Sql') {}

export const reasonOf = (cause: unknown) => {
  if (cause instanceof Error) return cause.message.slice(0, 200);
  return 'unknown';
};
