import {
  Array as Arr,
  Boolean as Bool,
  Context,
  DateTime,
  type Duration,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Random,
  Ref,
  Stream,
  SubscriptionRef,
  Schedule,
  Schema,
  Semaphore,
} from 'effect';
import { CatalogueJson, emptyCatalogue, type Catalogue } from '../core/catalogue.ts';
import { type BoardFile, BoardFileJson, emptyBoard } from '../core/board.ts';
import {
  LabChange,
  type LabLinks,
  type LabChangeDraft,
  changeOf,
  type SetSeen,
  askChanges,
  boardChanges,
  catalogueChanges,
  changeAsked,
  noteChanges,
  notesNews,
  productionChanges,
  setChanges,
  sourceChanges,
} from '../core/lab-events.ts';
import type { ProductionFile } from '../core/production.ts';
import { eventsSince } from '../core/notes.ts';
import { ReviewManifestJson } from '../core/review.ts';
import type { AskRecord } from '../core/ask.ts';
import type { Note } from '../core/schema.ts';
import { AskStore } from './ask-store.ts';
import { BoardStore } from './board-store.ts';
import { CATALOGUE_FILE } from './catalogue.ts';
import { ContentStore } from './content-store.ts';
import { sha256Hex } from './digest.ts';
import { FilmFolder, filmNamed } from './film-repo.ts';
import { NotesStore } from './notes-store.ts';
import { ProductionStore } from './production-store.ts';
import { Review, recordsUnder } from './review.ts';
import { SourceWriter } from './source-writer.ts';

export const LabChanges = Schema.Struct({
  cursor: Schema.String,
  changes: Schema.Array(LabChange),
  reset: Schema.Boolean,
});
export type LabChanges = typeof LabChanges.Type;

const boardText = Schema.encodeSync(BoardFileJson);

const KEPT = 1000;

const MANIFEST_FILE = 'review.json';

type Stamp = Option.Option<string>;

interface Seen {
  readonly notes: Map<
    string,
    { readonly stamp: Stamp; readonly seq: number; readonly notes: ReadonlyArray<Note> }
  >;
  readonly boards: Map<string, { readonly stamp: Stamp; readonly board: BoardFile }>;
  readonly catalogues: Map<string, { readonly stamp: Stamp; readonly catalogue: Catalogue }>;
  sets: ReadonlyMap<string, SetSeen>;
  readonly asks: Map<string, { readonly stamp: Stamp; readonly record: AskRecord }>;
  readonly productions: Map<string, ProductionFile>;
  landed: number;
}

interface Journal {
  readonly seq: number;
  readonly kept: ReadonlyArray<LabChange>;
}

interface LabEventsService {
  readonly look: Effect.Effect<void>;
  readonly since: (cursor: Option.Option<string>, of?: Of) => Effect.Effect<LabChanges>;
  readonly wait: (
    cursor: Option.Option<string>,
    timeout: Duration.Input,
    of?: Of,
  ) => Effect.Effect<LabChanges>;
}

interface Of {
  readonly names?: ReadonlyArray<string>;
  readonly film?: string;
}

const kept = (of: Of = {}) => changeAsked(of.names ?? [], Option.fromUndefinedOr(of.film));

interface FeedOptions {
  readonly links: LabLinks;
}

const cursorOf = (cursor: string): Option.Option<{ epoch: string; seq: number }> =>
  Option.map(Option.fromNullishOr(/^([0-9a-z]+)\.(\d+)$/.exec(cursor)), ([, epoch = '', seq]) => ({
    epoch,
    seq: Number(seq),
  }));

export const cursorAfter = (cursor: string, change: { readonly seq: number }): string =>
  Option.match(cursorOf(cursor), {
    onNone: () => cursor,
    onSome: ({ epoch }) => `${epoch}.${change.seq}`,
  });

export class LabEvents extends Context.Service<LabEvents, LabEventsService>()(
  '@manna/film/tools/LabEvents',
) {
  static readonly make = Effect.fn('LabEvents.make')(function* (options: FeedOptions) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const notes = yield* NotesStore;
    const boards = yield* BoardStore;
    const folder = yield* FilmFolder;
    const review = yield* Review;
    const store = yield* ContentStore;
    const asks = yield* AskStore;
    const productions = yield* ProductionStore;
    const writer = yield* SourceWriter;
    const films = yield* Effect.context<FilmFolder>();
    const platform = yield* Effect.context<FileSystem.FileSystem | Path.Path>();
    const epoch = (yield* Random.nextIntBetween(0, 2 ** 31)).toString(36);
    const journal = yield* SubscriptionRef.make<Journal>({ seq: 0, kept: [] });
    const seen: Seen = {
      notes: new Map(),
      boards: new Map(),
      catalogues: new Map(),
      sets: new Map(),
      asks: new Map(),
      productions: new Map(),
      landed: 0,
    };
    const first = yield* Ref.make(true);
    const one = yield* Semaphore.make(1);

    const stampOf = (file: string) =>
      fs.stat(file).pipe(
        Effect.map((info) => ({
          there: info.type === 'File',
          stamp: Option.map(info.mtime, (m) => `${m.getTime()}:${info.size}`),
        })),
        Effect.orElseSucceed(() => ({ there: false, stamp: Option.none<string>() })),
      );

    const same = (was: Stamp, now: Stamp) =>
      Option.isSome(was) && Option.isSome(now) && was.value === now.value;

    const unread = (file: string) => (error: { readonly message: string }) =>
      Effect.as(
        Effect.logWarning(`lab.events.unread file=${file} reason="${error.message}"`),
        Arr.empty<LabChangeDraft>(),
      );

    const lookNotes = (name: string, baseline: boolean) =>
      Effect.gen(function* () {
        const film = yield* filmNamed(name).pipe(Effect.provideContext(films));
        const file = notes.paths(film).notes.file;
        const { stamp } = yield* stampOf(file);
        const was = Option.fromUndefinedOr(seen.notes.get(name));
        if (Option.exists(was, (w) => same(w.stamp, stamp))) return [];
        const log = yield* notes.read(film);
        seen.notes.set(name, { stamp, seq: log.seq, notes: log.notes });
        return Option.match(was, {
          onNone: () =>
            noteChanges(
              eventsSince(log, Bool.match(baseline, { onTrue: () => log.seq, onFalse: () => 0 }))
                .events,
            ),
          onSome: (w) => notesNews(w, log),
        });
      }).pipe(Effect.catch(unread(`notes of ${name}`)));

    const lookBoard = (name: string, baseline: boolean) =>
      Effect.gen(function* () {
        const film = yield* filmNamed(name).pipe(Effect.provideContext(films));
        const file = boards.paths(film).record.file;
        const { stamp } = yield* stampOf(file);
        const was = Option.fromUndefinedOr(seen.boards.get(name));
        if (Option.exists(was, (w) => same(w.stamp, stamp))) return [];
        const board = yield* boards.read(film);
        seen.boards.set(name, { stamp, board });
        const read = Option.getOrElse(stamp, () => sha256Hex(boardText(board)));
        return Option.match(was, {
          onNone: () =>
            Bool.match(baseline, {
              onTrue: () => [],
              onFalse: () => boardChanges(emptyBoard(board.film), board, read),
            }),
          onSome: (w) => boardChanges(w.board, board, read),
        });
      }).pipe(Effect.catch(unread(`board of ${name}`)));

    const lookCatalogue = (ref: string, dir: string, baseline: boolean) =>
      Effect.gen(function* () {
        const file = path.join(dir, CATALOGUE_FILE);
        const { there, stamp } = yield* stampOf(file);
        const was = Option.fromUndefinedOr(seen.catalogues.get(ref));
        if (!there) return [];
        if (Option.exists(was, (w) => same(w.stamp, stamp))) return [];
        const catalogue = yield* store.read({
          file,
          codec: CatalogueJson,
          empty: emptyCatalogue(path.basename(dir)),
        });
        seen.catalogues.set(ref, { stamp, catalogue });
        return Option.match(was, {
          onNone: () =>
            Bool.match(baseline, {
              onTrue: () => [],
              onFalse: () => catalogueChanges(ref, emptyCatalogue(catalogue.film), catalogue),
            }),
          onSome: (w) => catalogueChanges(ref, w.catalogue, catalogue),
        });
      }).pipe(Effect.catch(unread(path.join(dir, CATALOGUE_FILE))));

    const lookAsks = (baseline: boolean) =>
      Effect.gen(function* () {
        const names = yield* fs.readDirectory(asks.dir).pipe(Effect.orElseSucceed(() => []));
        const ids = names.flatMap((n) =>
          Option.toArray(Option.fromNullishOr(/^(a[0-9a-f]{10})\.json$/.exec(n)?.[1])),
        );
        const told = yield* Effect.forEach(
          ids,
          (id) =>
            Effect.gen(function* () {
              const { stamp } = yield* stampOf(asks.file(id));
              const was = Option.fromUndefinedOr(seen.asks.get(id));
              if (Option.exists(was, (w) => same(w.stamp, stamp))) return [];
              const record = yield* asks.read(id);
              seen.asks.set(id, { stamp, record });
              if (baseline) return [];
              return askChanges(
                Option.map(was, (w) => w.record),
                record,
              );
            }).pipe(Effect.catch(unread(asks.file(id)))),
          { concurrency: 8 },
        );
        return Arr.flatten(told);
      });

    const lookProductions = (baseline: boolean) =>
      Effect.gen(function* () {
        const ledgers = yield* productions.list;
        return ledgers.flatMap((ledger) => {
          const was = Option.fromUndefinedOr(seen.productions.get(ledger.production));
          seen.productions.set(ledger.production, ledger);
          if (baseline) return [];
          return productionChanges(was, ledger);
        });
      }).pipe(Effect.catch(unread('productions')));

    const lookSource = (baseline: boolean) =>
      Effect.map(writer.landings, (landings) => {
        const fresh = landings.filter((l) => l.n > seen.landed);
        seen.landed = Option.match(Arr.last(landings), {
          onNone: () => seen.landed,
          onSome: (l) => l.n,
        });
        if (baseline) return [];
        return sourceChanges(fresh);
      });

    const setAt = (dir: string) =>
      Effect.gen(function* () {
        const file = path.join(dir, MANIFEST_FILE);
        const { there } = yield* stampOf(file);
        if (!there) return Option.none<SetSeen>();
        const text = yield* fs.readFileString(file);
        const title = Option.flatMap(Schema.decodeOption(ReviewManifestJson)(text), (m) => m.title);
        return Option.some<SetSeen>({ title, stamp: sha256Hex(text) });
      }).pipe(Effect.orElseSucceed(() => Option.none<SetSeen>()));

    const read = Effect.gen(function* () {
      const baseline = yield* Ref.getAndSet(first, false);
      const names = yield* folder.names;
      const filmChanges = yield* Effect.forEach(
        names,
        (name) =>
          Effect.map(
            Effect.all([lookNotes(name, baseline), lookBoard(name, baseline)]),
            Arr.flatten,
          ),
        { concurrency: 4 },
      );
      const listed = yield* recordsUnder(review.roots).pipe(Effect.provideContext(platform));
      const catalogued = yield* Effect.forEach(
        listed.filter((f) => f.kind === 'project'),
        (f) => lookCatalogue(f.ref, f.dir, baseline),
        {
          concurrency: 8,
        },
      );
      const sets = new Map<string, SetSeen>();
      yield* Effect.forEach(
        listed.filter((f) => f.kind === 'montage'),
        (f) =>
          Effect.map(setAt(f.dir), (set) => {
            if (Option.isSome(set)) sets.set(f.ref, set.value);
          }),
        { concurrency: 8, discard: true },
      );
      const published = Bool.match(baseline, {
        onTrue: () => [],
        onFalse: () => setChanges(seen.sets, sets),
      });
      seen.sets = sets;
      const asked = yield* lookAsks(baseline);
      const filed = yield* lookProductions(baseline);
      const edited = yield* lookSource(baseline);
      return [
        ...Arr.flatten(filmChanges),
        ...Arr.flatten(catalogued),
        ...published,
        ...asked,
        ...filed,
        ...edited,
      ];
    });

    const look = one.withPermits(1)(
      Effect.gen(function* () {
        const drafts = yield* read;
        if (drafts.length === 0) return;
        if (drafts.some((d) => d.kind.startsWith('set.') || d.kind.startsWith('render.')))
          yield* review.written;
        const at = DateTime.formatIso(yield* DateTime.now);
        yield* SubscriptionRef.update(journal, (j) => {
          const made = drafts.map((draft, i) => changeOf(draft, j.seq + i + 1, at, options.links));
          return { seq: j.seq + made.length, kept: [...j.kept, ...made].slice(-KEPT) };
        });
        yield* Effect.log(`lab.events.seen count=${drafts.length}`);
      }),
    );

    const answerOf =
      (cursor: Option.Option<string>, of?: Of) =>
      (j: Journal): LabChanges => {
        const now = `${epoch}.${j.seq}`;
        if (Option.isNone(cursor)) return { cursor: now, changes: [], reset: false };
        const asked = Option.filter(
          cursorOf(cursor.value),
          (c) => c.epoch === epoch && c.seq <= j.seq,
        );
        const oldest = Option.match(Arr.head(j.kept), {
          onNone: () => j.seq + 1,
          onSome: (c) => c.seq,
        });
        return Option.match(asked, {
          onNone: () => ({ cursor: now, changes: j.kept.filter(kept(of)), reset: true }),
          onSome: (c) => ({
            cursor: now,
            changes: j.kept.filter((change) => change.seq > c.seq && kept(of)(change)),
            reset: c.seq + 1 < oldest,
          }),
        });
      };

    const since = (cursor: Option.Option<string>, of?: Of) =>
      Effect.map(SubscriptionRef.get(journal), answerOf(cursor, of));

    const wait = (cursor: Option.Option<string>, timeout: Duration.Input, of?: Of) =>
      SubscriptionRef.changes(journal).pipe(
        Stream.map(answerOf(cursor, of)),
        Stream.filter(
          (answer) => answer.changes.length > 0 || answer.reset || Option.isNone(cursor),
        ),
        Stream.runHead,
        Effect.timeoutOption(timeout),
        Effect.flatMap((heard) =>
          Option.match(Option.flatten(heard), {
            onNone: () => since(cursor, of),
            onSome: Effect.succeed,
          }),
        ),
      );

    return LabEvents.of({ look, since, wait });
  });

  static readonly layer = (options: FeedOptions & { readonly every: Duration.Input }) =>
    Layer.effect(
      LabEvents,
      Effect.gen(function* () {
        const events = yield* LabEvents.make(options);
        yield* events.look;
        yield* Effect.forkScoped(Effect.repeat(events.look, Schedule.spaced(options.every)));
        return events;
      }),
    );
}
