import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Option, Result, Schema } from 'effect';

const Answer = Schema.Struct({
  label: Schema.String,
  probabilities: Schema.Record(Schema.String, Schema.Finite),
  /** The day (whole days since 1970, UTC) a run last read or asked it. */
  seen: Schema.Finite,
});

/** A model's answer for one item: its label and each label's probability, and the day a run last read it. */
export type Answer = typeof Answer.Type;

/** A model's answer as a run receives it: its label and each label's probability. */
export type Verdict = Omit<Answer, 'seen'>;

/** The file's shape: the answers by key. */
export const Store = Schema.fromJsonString(
  Schema.Struct({ answers: Schema.Record(Schema.String, Answer) }),
);

export type Store = typeof Store.Type;

/**
 * How many days an answer no run reads stays: a worktree or a branch left a
 * month finds its answers asked again, and the store holds no answer of an
 * item every checkout has long since changed.
 */
export const MAX_AGE_DAYS = 30;

/** The day of the time `millis` (since 1970), as an answer's `seen` writes it. */
export const dayOf = (millis: number) => Math.floor(millis / 86_400_000);

/**
 * The form of the keys this module makes, hashed into each: an answer kept
 * under another form is never found, and is asked again.
 */
const KEY_FORM = 'items-parsed-2';

/** The store's key of the item whose key is `item`, judged by the rule whose words hash to `rule` on `model`. */
export const cacheKey = (rule: string, model: string, item: string) =>
  createHash('sha256').update(`${KEY_FORM}\0${rule}\0${model}\0${item}`).digest('hex');

/**
 * Git's common dir of the checkout at `root`, as git finds it: `.git` is the
 * folder itself, or, in a worktree, a file naming the worktree's git dir
 * (`gitdir: <path>`), whose `commondir` file names the common dir from it.
 * `read` answers a file's text, none when it is no file (a folder, or
 * missing).
 */
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

/** A file's text, none when it is no file to read (a folder, or missing). */
const textOf = (file: string) => Result.getSuccess(Result.try(() => readFileSync(file, 'utf8')));

/**
 * The store of the checkout at `root`: `store` (`settings.judged.store`) from
 * its git common dir. It reads the checkout's `.git` (and a worktree's
 * `commondir`) with node's file system, in the runner and in the plugin alike.
 */
export const storeFileOf = (root: string, store: string, read = textOf) =>
  join(commonDirOf(root, read), store);
