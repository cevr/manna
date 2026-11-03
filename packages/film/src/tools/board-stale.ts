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

interface StalePanel {
  readonly panel: string;
  readonly kept: Option.Option<number>;
  readonly members: ReadonlyArray<string>;
  readonly added: ReadonlyArray<string>;
  readonly words: boolean;
}

export interface Staleness extends StalePanel {
  readonly fresh: number;
}

const SHEET_FILE = /^(.*\/cast-sheet)\/((?:kept|views)\/[^/]+\.png)$/;

interface CastFile {
  readonly member: string;
  readonly file: string;
}

interface DrawnNow {
  readonly beats: ReadonlyMap<string, BoardBeat>;
  readonly cast: ReadonlyMap<string, ReadonlyArray<CastFile>>;
  readonly sha: ReadonlyMap<string, Option.Option<string>>;
  readonly records: ReadonlyMap<string, Option.Option<CastSheetRecord>>;
}

interface Changed {
  readonly members: ReadonlyArray<string>;
  readonly added: ReadonlyArray<string>;
  readonly words: boolean;
}

const unchanged = (c: Changed) => c.members.length === 0 && c.added.length === 0 && !c.words;

const drawnByBoard = (t: BoardTry): boolean => t.made === 'generate' || t.made === 'tweak';

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

const judgedPanels = (board: BoardFile): ReadonlyArray<Panel> =>
  board.panels.filter((p) => Predicate.isUndefined(p.text) && p.tries.length > 0);

const decodeRecord = Schema.decodeResult(CastSheetJson);

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

const changedWhat = (stale: StalePanel): Option.Option<string> =>
  Arr.match(
    [
      ...Bool.match(stale.words, { onTrue: () => ["the picture's words"], onFalse: () => [] }),
      ...stale.members.map((m) => `${m}'s cast sheet`),
    ],
    { onEmpty: () => Option.none(), onNonEmpty: (what) => Option.some(what.join(' and ')) },
  );

const addedWhat = (stale: StalePanel): Option.Option<string> =>
  Arr.match(stale.added, {
    onEmpty: () => Option.none(),
    onNonEmpty: (members) =>
      Option.some(`${members.map((m) => `${m}'s library sheet`).join(' and ')} was sent`),
  });

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
