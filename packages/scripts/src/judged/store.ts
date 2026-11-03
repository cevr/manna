import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Option, Result, Schema } from 'effect';

const Answer = Schema.Struct({
  label: Schema.String,
  probabilities: Schema.Record(Schema.String, Schema.Finite),
  seen: Schema.Finite,
});

export type Answer = typeof Answer.Type;

export type Verdict = Omit<Answer, 'seen'>;

export const Store = Schema.fromJsonString(
  Schema.Struct({ answers: Schema.Record(Schema.String, Answer) }),
);

export type Store = typeof Store.Type;

export const MAX_AGE_DAYS = 30;

export const dayOf = (millis: number) => Math.floor(millis / 86_400_000);

const KEY_FORM = 'items-parsed-2';

export const cacheKey = (rule: string, model: string, item: string) =>
  createHash('sha256').update(`${KEY_FORM}\0${rule}\0${model}\0${item}`).digest('hex');

const commonDirOf = (root: string, read: (file: string) => Option.Option<string>) => {
  const dotGit = join(root, '.git');
  return Option.match(
    Option.flatMap(read(dotGit), (text) =>
      Option.fromNullishOr(/^gitdir:\s*(.+?)\s*$/m.exec(text)?.[1]),
    ),
    {
      onNone: () => dotGit,
      onSome: (named) => {
        const gitDir = resolve(dirname(dotGit), named);
        return Option.match(read(join(gitDir, 'commondir')), {
          onNone: () => gitDir,
          onSome: (common) => resolve(gitDir, common.trim()),
        });
      },
    },
  );
};

const textOf = (file: string) => Result.getSuccess(Result.try(() => readFileSync(file, 'utf8')));

export const storeFileOf = (root: string, store: string, read = textOf) =>
  join(commonDirOf(root, read), store);
