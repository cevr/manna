/* oxlint-disable effect/noNodeBuiltinImport, no-restricted-imports, effect/noTryCatch -- a link read answered by the kernel's own lstat and readlink, at once and in this thread, beside the platform's FileSystem. */
/**
 * The platform's FileSystem with `readLink` answered at once: the same
 * target for a link, and for anything else (a file, a folder, a missing
 * name) the same failure tag the platform's gives. The contained host reads
 * a link at every component of every path it resolves, and the platform
 * sends each read through its thread pool and builds an `Error` with a stack
 * for each name that is not a link; the models resolve thousands of paths a
 * case, so their link reads are answered here instead. The folders above
 * the system's temporary folder (and the temporary folder itself), which no
 * case makes or changes, are read once.
 */
import * as nfs from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname } from 'node:path';

import { Effect, type FileSystem, Option, Predicate } from 'effect';
import * as PlatformError from 'effect/PlatformError';

type Reason = PlatformError.SystemErrorTag;

/** The kernel's answer: the link's target, or the reason the platform fails the read. */
type Answer =
  | { readonly _tag: 'Link'; readonly target: string }
  | { readonly _tag: 'NotLink'; readonly reason: Reason };

/** The platform's reason for a failed readlink, by errno code; any other is `Unknown`, as EINVAL (not a link) is. */
const REASONS = new Map<string, Reason>([
  ['ENOENT', 'NotFound'],
  ['EACCES', 'PermissionDenied'],
  ['EPERM', 'PermissionDenied'],
  ['ENOTDIR', 'BadResource'],
  ['ELOOP', 'BadResource'],
]);

/** The temporary folder and every folder above it, as spelled and as resolved. */
const STEADY = new Set(
  [tmpdir(), nfs.realpathSync(tmpdir())].flatMap((start) => {
    const folders: Array<string> = [];
    for (let at = start.replace(/\/$/, ''); at !== dirname(at); at = dirname(at)) folders.push(at);
    return folders;
  }),
);

const steadyAnswers = new Map<string, Answer>();

/** One failure per reason: a caller reads its tag, never its path. */
const failures = new Map<Reason, Effect.Effect<never, PlatformError.PlatformError>>(
  (['NotFound', 'PermissionDenied', 'BadResource', 'Unknown'] satisfies ReadonlyArray<Reason>).map(
    (reason) => [
      reason,
      Effect.fail(
        PlatformError.systemError({
          _tag: reason,
          module: 'FileSystem',
          method: 'readLink',
          description: 'not a link',
        }),
      ),
    ],
  ),
);

/** What the kernel answers for `path`'s link now. */
const ask = (path: string): Answer => {
  try {
    if (!nfs.lstatSync(path).isSymbolicLink()) return { _tag: 'NotLink', reason: 'Unknown' };
    return { _tag: 'Link', target: nfs.readlinkSync(path) };
  } catch (error) {
    let code = '';
    if (Predicate.hasProperty(error, 'code')) code = String(error.code);
    return { _tag: 'NotLink', reason: REASONS.get(code) ?? 'Unknown' };
  }
};

/** The answer for `path`, read once when it is a steady folder. */
const answerOf = (path: string) =>
  Option.getOrElse(Option.fromUndefinedOr(steadyAnswers.get(path)), () => {
    const answer = ask(path);
    if (STEADY.has(path)) steadyAnswers.set(path, answer);
    return answer;
  });

/** Read `path`'s link as the kernel does: its target, or the platform's failure. */
const readLinkNow = (path: string): Effect.Effect<string, PlatformError.PlatformError> =>
  Effect.suspend(() => {
    const answer = answerOf(path);
    if (answer._tag === 'Link') return Effect.succeed(answer.target);
    return Option.getOrElse(Option.fromUndefinedOr(failures.get(answer.reason)), () =>
      Effect.die('no failure for the reason'),
    );
  });

/** `base` with its link reads answered at once. */
export const quickLinks = (base: FileSystem.FileSystem): FileSystem.FileSystem => ({
  ...base,
  readLink: readLinkNow,
});
