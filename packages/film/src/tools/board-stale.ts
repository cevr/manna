// A picture panel drawn from what has changed since: stale. A try is judged
// on two things. Its picture's words: a try records the words of the panel's
// own picture its prompt carried (`BoardTry.words`, `pictureWords`), so words
// that differ now changed; a try from before that record is judged on its
// prompt, which changed when it no longer carries every one of them
// verbatim. Its cast: a try records what each cast reference held
// (`BoardTry.cast`, its sha256), so a reference whose bytes differ now, or
// that is gone, changed; a try from before that record is read against the
// member's record, whose `replaced` history says which kept sheet was
// replaced when (`replacedSince`); and a file a run would send now that the
// try did not carry (a member first kept a sheet since) changed its member's
// references too. Words and the files sent are held only against tries the
// board drew itself (`drawnByBoard`): an imported keep is never stale on
// them. A kept panel is stale when its kept try changed; a panel
// with tries and no keep, when none of its generated tries is fresh. A run
// draws a stale panel again and its keep stays recorded until the owner
// keeps a new try; the board read and the lab's Board name it.

import {
  Array as Arr,
  Boolean as Bool,
  Effect,
  FileSystem,
  Option,
  Path,
  Predicate,
  Result,
  Schema,
} from 'effect';
import type { BoardFile, BoardTry, Panel } from '../core/board.ts';
import type { CastLock } from '../core/cast-lock.ts';
import { CastSheetJson, type CastSheetRecord, replacedSince } from '../core/cast-record.ts';
import { type BoardBeat, pictureWords } from './board-prompt.ts';
import { castReference } from './cast-library.ts';
import { sha256Hex } from './digest.ts';

/**
 * A stale panel: its kept try (none when it keeps none), the members whose
 * sheet it was drawn from has changed, the members a run sends now whose
 * library sheet it was drawn before, whether its picture's words changed.
 */
interface StalePanel {
  readonly panel: string;
  readonly kept: Option.Option<number>;
  readonly members: ReadonlyArray<string>;
  readonly added: ReadonlyArray<string>;
  readonly words: boolean;
}

/** A stale panel and how many of its tries the board drew from the words and the cast as they stand. */
export interface Staleness extends StalePanel {
  readonly fresh: number;
}

/** A reference into a member's sheet folder: the folder, and the file within it (`kept/turnaround.png`). */
const SHEET_FILE = /^(.*\/cast-sheet)\/((?:kept|views)\/[^/]+\.png)$/;

/** A file a run would send now for a member, as the board folder reaches it. */
interface CastFile {
  readonly member: string;
  readonly file: string;
}

/** What a run would draw a panel from now, and what the cast files hold. */
interface DrawnNow {
  /** Each beat as the script has it, by id. */
  readonly beats: ReadonlyMap<string, BoardBeat>;
  /** Each beat's cast files a run would send, by beat id. */
  readonly cast: ReadonlyMap<string, ReadonlyArray<CastFile>>;
  /** Each recorded cast file's sha256 now, none when it cannot be read. */
  readonly sha: ReadonlyMap<string, Option.Option<string>>;
  /** Each sheet folder's record, none when it cannot be read. */
  readonly records: ReadonlyMap<string, Option.Option<CastSheetRecord>>;
}

/** How a try differs from what a run would draw it from now. */
interface Changed {
  readonly members: ReadonlyArray<string>;
  readonly added: ReadonlyArray<string>;
  readonly words: boolean;
}

const unchanged = (c: Changed) => c.members.length === 0 && c.added.length === 0 && !c.words;

/**
 * Whether the board drew `t` itself (`generate`, `tweak`): only such a try is
 * held against what a run would send now (its words, its cast's files). An
 * import was made elsewhere, from a prompt and references of its own, and the
 * owner picked it as it is.
 */
const drawnByBoard = (t: BoardTry): boolean => t.made === 'generate' || t.made === 'tweak';

/**
 * Whether `t`'s words differ from `now`: by its record when it has one, else
 * by its prompt; a try with neither is not judged, nor is one the board did
 * not draw itself (`drawnByBoard`). Pure.
 */
const wordsChanged = (t: BoardTry, now: ReadonlyArray<string>): boolean =>
  drawnByBoard(t) &&
  Option.match(Option.fromUndefinedOr(t.words), {
    onSome: (was) => was.length !== now.length || was.some((w, i) => w !== now[i]),
    onNone: () =>
      Option.match(Option.fromUndefinedOr(t.prompt), {
        onNone: () => false,
        onSome: (prompt) => !now.every((w) => prompt.includes(w)),
      }),
  });

/** How try `t` of panel `p` differs from what a run would draw it from now. Pure. */
const changedIn = (
  p: Panel,
  t: BoardTry,
  now: DrawnNow,
  resolve: (ref: string) => string,
): Changed => {
  const beat = Option.fromUndefinedOr(now.beats.get(p.beat));
  const byRecord = Option.match(Option.fromUndefinedOr(t.cast), {
    onSome: (cast) =>
      cast
        .filter((c) =>
          Option.match(Option.flatten(Option.fromUndefinedOr(now.sha.get(resolve(c.file)))), {
            onNone: () => true,
            onSome: (sha) => sha !== c.sha256,
          }),
        )
        .map((c) => c.member),
    onNone: () =>
      t.refs.flatMap((ref) =>
        Option.toArray(
          Option.flatMap(Option.fromNullishOr(SHEET_FILE.exec(resolve(ref))), (m) =>
            Option.flatMap(
              Option.flatten(Option.fromUndefinedOr(now.records.get(m[1] ?? ''))),
              (record) =>
                Bool.match(replacedSince(record, m[2] ?? '', t.at), {
                  onTrue: () => Option.some<string>(record.member),
                  onFalse: () => Option.none<string>(),
                }),
            ),
          ),
        ),
      ),
  });
  const carried = new Set(t.refs);
  const added = (now.cast.get(p.beat) ?? [])
    .filter((c) => drawnByBoard(t) && !carried.has(c.file))
    .map((c) => c.member);
  return {
    members: Arr.dedupe(byRecord),
    added: Arr.dedupe(added),
    words: Option.exists(beat, (b) => wordsChanged(t, pictureWords(b, p.at))),
  };
};

/** The picture panels a run judges: each with a try kept, or with tries and none kept. */
const judgedPanels = (board: BoardFile): ReadonlyArray<Panel> =>
  board.panels.filter((p) => Predicate.isUndefined(p.text) && p.tries.length > 0);

const decodeRecord = Schema.decodeResult(CastSheetJson);

/** Each member's library reference as a run would send it now: a member with none sends nothing. */
const locksOf = Effect.fn('Board.locksNow')(function* (
  film: string,
  beats: ReadonlyArray<BoardBeat>,
) {
  const members = Arr.dedupe(beats.flatMap((b) => b.cast));
  const locks = yield* Effect.forEach(
    members,
    (member) =>
      castReference(film, member).pipe(
        Effect.map((lock) => [member, Option.some(lock)] as const),
        Effect.orElseSucceed(() => [member, Option.none<CastLock>()] as const),
      ),
    { concurrency: 8 },
  );
  return new Map(locks);
});

/**
 * Each stale picture panel of `film`'s `board` (its images in `folder`),
 * judged against `beats` as the script has them now and the cast a run
 * would send: a kept panel whose kept try changed, or a panel that keeps
 * none whose generated tries all changed; with how many of its tries the
 * board drew (`generate`) from the words and the cast as they stand.
 */
export const stalenessOf = Effect.fn('Board.staleness')(function* (
  film: string,
  folder: string,
  board: BoardFile,
  beats: ReadonlyArray<BoardBeat>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const resolve = (ref: string) => path.join(folder, ref);
  const panels = judgedPanels(board);
  const locks = yield* locksOf(film, beats);
  const cast = new Map(
    beats.map(
      (b) =>
        [
          b.id,
          Arr.dedupe(b.cast).flatMap((m) =>
            Option.match(Option.flatten(Option.fromUndefinedOr(locks.get(m))), {
              onNone: () => [],
              onSome: (lock) =>
                lock.files.map((f): CastFile => ({
                  member: lock.member,
                  file: path.relative(folder, f),
                })),
            }),
          ),
        ] as const,
    ),
  );
  const tries = panels.flatMap((p) => p.tries);
  const files = Arr.dedupe(tries.flatMap((t) => (t.cast ?? []).map((c) => resolve(c.file))));
  const sheets = Arr.dedupe(
    tries
      .filter((t) => Predicate.isUndefined(t.cast))
      .flatMap((t) =>
        t.refs.flatMap((ref) =>
          Option.toArray(
            Option.flatMap(Option.fromNullishOr(SHEET_FILE.exec(resolve(ref))), (m) =>
              Option.fromUndefinedOr(m[1]),
            ),
          ),
        ),
      ),
  );
  const sha = yield* Effect.forEach(
    files,
    (file) =>
      fs.readFile(file).pipe(
        Effect.map((bytes) => [file, Option.some(sha256Hex(bytes))] as const),
        Effect.orElseSucceed(() => [file, Option.none<string>()] as const),
      ),
    { concurrency: 8 },
  );
  const records = yield* Effect.forEach(
    sheets,
    (sheet) =>
      fs.readFileString(path.join(sheet, 'cast-sheet.json')).pipe(
        Effect.map((json) => [sheet, Result.getSuccess(decodeRecord(json))] as const),
        Effect.orElseSucceed(() => [sheet, Option.none<CastSheetRecord>()] as const),
      ),
    { concurrency: 8 },
  );
  const now: DrawnNow = {
    beats: new Map(beats.map((b) => [b.id, b] as const)),
    cast,
    sha: new Map(sha),
    records: new Map(records),
  };
  return panels.flatMap((p): ReadonlyArray<Staleness> => {
    const generated = p.tries
      .filter((t) => t.made === 'generate')
      .map((t) => changedIn(p, t, now, resolve));
    const fresh = generated.filter(unchanged).length;
    const kept = Option.fromUndefinedOr(p.kept);
    const changed = Option.match(kept, {
      onSome: (n) =>
        Option.map(
          Arr.findFirst(p.tries, (t) => t.n === n),
          (t) => changedIn(p, t, now, resolve),
        ),
      onNone: () =>
        Option.liftPredicate(
          {
            members: Arr.dedupe(generated.flatMap((c) => c.members)),
            added: Arr.dedupe(generated.flatMap((c) => c.added)),
            words: generated.some((c) => c.words),
          },
          () => generated.length > 0 && fresh === 0,
        ),
    });
    return Option.match(
      Option.filter(changed, (c) => !unchanged(c)),
      {
        onNone: () => [],
        onSome: (c) => [
          { panel: p.id, kept, members: c.members, added: c.added, words: c.words, fresh },
        ],
      },
    );
  });
});

/** What changed under a stale panel, in words: its picture's words, a member's cast sheet, or both; none when neither did. */
const changedWhat = (stale: StalePanel): Option.Option<string> =>
  Arr.match(
    [
      ...Bool.match(stale.words, { onTrue: () => ["the picture's words"], onFalse: () => [] }),
      ...stale.members.map((m) => `${m}'s cast sheet`),
    ],
    { onEmpty: () => Option.none(), onNonEmpty: (what) => Option.some(what.join(' and ')) },
  );

/** The library sheets a run sends now that a stale panel was drawn before, in words; none when there are none. */
const addedWhat = (stale: StalePanel): Option.Option<string> =>
  Arr.match(stale.added, {
    onEmpty: () => Option.none(),
    onNonEmpty: (members) =>
      Option.some(`${members.map((m) => `${m}'s library sheet`).join(' and ')} was sent`),
  });

/** Why a stale panel is drawn again, in a sentence. */
export const staleWhy = (film: string, stale: StalePanel): string =>
  Option.match(stale.kept, {
    onSome: (n) =>
      `kept try ${n} was drawn ${Arr.getSomes([
        Option.map(changedWhat(stale), (what) => `from ${what} as it was, which has changed since`),
        Option.map(addedWhat(stale), (what) => `before ${what}`),
      ]).join(
        ', and ',
      )}: \`film board ${film}\` draws new tries, and the keep stays until one is kept`,
    onNone: () =>
      `no try is kept, and none was drawn ${Arr.getSomes([
        Option.map(changedWhat(stale), (what) => `from ${what} as it is now`),
        Option.map(addedWhat(stale), (what) => `after ${what}`),
      ]).join(', or ')}: \`film board ${film}\` draws new tries`,
  });
