// A kept panel drawn from a cast sheet that has changed since it was drawn:
// stale. A try records what each cast reference held (`BoardTry.cast`, its
// sha256), so a reference whose bytes differ now, or that is gone, changed;
// a try from before tries recorded it is read against the member's record,
// whose `replaced` history says which kept sheet was replaced when
// (`replacedSince`). A run draws a stale panel again and its keep stays
// recorded until the owner keeps a new try; the board read names it.

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
import { CastSheetJson, type CastSheetRecord, replacedSince } from '../core/cast-record.ts';
import { sha256Hex } from './digest.ts';

/** A kept panel drawn from a cast sheet that has changed: its kept try, the members whose sheet changed. */
interface StalePanel {
  readonly panel: string;
  readonly kept: number;
  readonly members: ReadonlyArray<string>;
}

/** A kept panel's staleness and how many of its tries are drawn from the cast as it stands. */
export interface Staleness extends StalePanel {
  readonly fresh: number;
}

/** A reference into a member's sheet folder: the folder, and the file within it (`kept/turnaround.png`). */
const SHEET_FILE = /^(.*\/cast-sheet)\/((?:kept|views)\/[^/]+\.png)$/;

/** What the cast files hold now: each recorded file's sha256, each sheet folder's record. */
interface CastNow {
  readonly sha: ReadonlyMap<string, Option.Option<string>>;
  readonly records: ReadonlyMap<string, Option.Option<CastSheetRecord>>;
}

/** The members whose reference `t` was drawn from has changed since, each once. Pure. */
const changedIn = (
  t: BoardTry,
  now: CastNow,
  resolve: (ref: string) => string,
): ReadonlyArray<string> => {
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
  return Arr.dedupe(byRecord);
};

/** The panels whose kept try a run reads: a picture panel with a try kept. */
const keptPanels = (board: BoardFile): ReadonlyArray<Panel> =>
  board.panels.filter((p) => Predicate.isUndefined(p.text) && Predicate.isNotUndefined(p.kept));

const decodeRecord = Schema.decodeResult(CastSheetJson);

/**
 * Each kept panel of `board` (its images in `folder`) drawn from a cast sheet
 * that has changed, with how many of its tries the board drew (`generate`)
 * from the cast as it stands.
 */
export const stalenessOf = Effect.fn('Board.staleness')(function* (
  folder: string,
  board: BoardFile,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const resolve = (ref: string) => path.join(folder, ref);
  const panels = keptPanels(board);
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
  const now: CastNow = { sha: new Map(sha), records: new Map(records) };
  return panels.flatMap((p): ReadonlyArray<Staleness> => {
    const kept = p.kept ?? 0;
    const members = Option.match(
      Arr.findFirst(p.tries, (t) => t.n === kept),
      { onNone: () => [], onSome: (t) => changedIn(t, now, resolve) },
    );
    const fresh = p.tries.filter(
      (t) => t.made === 'generate' && changedIn(t, now, resolve).length === 0,
    ).length;
    return Arr.filter([{ panel: p.id, kept, members, fresh }], (s) => s.members.length > 0);
  });
});

/** Why a stale panel is drawn again, in a sentence. */
export const staleWhy = (film: string, stale: StalePanel): string =>
  `kept try ${stale.kept} was drawn from ${stale.members.map((m) => `${m}'s cast sheet`).join(' and ')} as it was; it has changed since: \`film board ${film}\` draws new tries, and the keep stays until one is kept`;
