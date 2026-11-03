import {
  Array as Arr,
  Config,
  Context,
  DateTime,
  Duration,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Schedule,
} from 'effect';
import {
  addNote,
  emptyNotes,
  eventsSince,
  noteById,
  replyStill,
  replyToNote,
  resolveNote,
} from '../core/notes.ts';
import {
  type Note,
  type NoteAuthor,
  type NoteDraft,
  type NotesFile,
  NotesFileJson,
  type NotesWait,
} from '../core/schema.ts';
import { ContentStore, type Manifest, type StoreError } from './content-store.ts';
import { NoteNotFound } from '../core/refusals.ts';
import type { FilmName } from './film-repo.ts';

interface NotesPaths {
  readonly dir: string;
  readonly stills: string;
  readonly notes: Manifest<NotesFile>;
}

interface ReplyInput {
  readonly by: NoteAuthor;
  readonly text: string;
  readonly still: Option.Option<Uint8Array>;
}

type NotesError = StoreError;

interface NotesStoreService {
  readonly paths: (film: FilmName) => NotesPaths;
  readonly read: (film: FilmName) => Effect.Effect<NotesFile, StoreError>;
  readonly add: (
    film: FilmName,
    draft: NoteDraft,
    still: Uint8Array,
  ) => Effect.Effect<Note, NotesError>;
  readonly reply: (
    film: FilmName,
    id: string,
    reply: ReplyInput,
  ) => Effect.Effect<Note, NotesError | NoteNotFound>;
  readonly resolve: (film: FilmName, id: string) => Effect.Effect<Note, NotesError | NoteNotFound>;
  readonly wait: (
    film: FilmName,
    since: number,
    timeout: Duration.Input,
  ) => Effect.Effect<NotesWait, StoreError>;
  readonly still: (
    film: FilmName,
    name: string,
  ) => Effect.Effect<Option.Option<string>, StoreError>;
}

const POLL = Duration.millis(200);

const STILL_NAME = /^n\d+(\.r\d+)?\.png$/;

export class NotesStore extends Context.Service<NotesStore, NotesStoreService>()(
  '@manna/film/tools/NotesStore',
) {
  static readonly layer = Layer.effect(
    NotesStore,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const store = yield* ContentStore;
      const root = yield* Config.String('FILMS_LAB').pipe(Config.withDefault(path.resolve('lab')));

      const paths = (film: FilmName): NotesPaths => {
        const dir = path.join(root, film);
        return {
          dir,
          stills: path.join(dir, 'stills'),
          notes: {
            file: path.join(dir, 'notes.json'),
            codec: NotesFileJson,
            empty: emptyNotes(film),
          },
        };
      };

      const read = (film: FilmName) => store.read(paths(film).notes);

      const now = Effect.map(DateTime.now, DateTime.formatIso);

      const find = (film: FilmName, file: NotesFile, id: string) =>
        Effect.fromOption(noteById(file, id), () =>
          NoteNotFound.make({ film, id, known: file.notes.map((n) => n.id) }),
        );

      const after = (film: FilmName, file: NotesFile, id: string) =>
        find(film, file, id).pipe(Effect.orDie);

      const add = Effect.fn('NotesStore.add')(function* (
        film: FilmName,
        draft: NoteDraft,
        still: Uint8Array,
      ) {
        const at = paths(film);
        const note = yield* store.transact(at.notes, (current) =>
          Effect.gen(function* () {
            const next = addNote(current, draft, yield* now);
            const made = yield* Effect.fromOption(Arr.last(next.notes)).pipe(Effect.orDie);
            yield* store.writeFile(path.join(at.stills, made.still), still);
            return [made, next] as const;
          }),
        );
        yield* Effect.log(`notes.add film=${film} id=${note.id} scene=${note.scene} T=${note.T}`);
        return note;
      });

      const reply = Effect.fn('NotesStore.reply')(function* (
        film: FilmName,
        id: string,
        input: ReplyInput,
      ) {
        const at = paths(film);
        const note = yield* store.transact(at.notes, (current) =>
          Effect.gen(function* () {
            yield* find(film, current, id);
            const name = replyStill(id, current.seq + 1);
            yield* Effect.forEach(Option.toArray(input.still), (bytes) =>
              store.writeFile(path.join(at.stills, name), bytes),
            );
            const next = replyToNote(
              current,
              id,
              { by: input.by, text: input.text, still: Option.as(input.still, name) },
              yield* now,
            );
            return [yield* after(film, next, id), next] as const;
          }),
        );
        yield* Effect.log(`notes.reply film=${film} id=${id} by=${input.by} status=${note.status}`);
        return note;
      });

      const resolve = Effect.fn('NotesStore.resolve')(function* (film: FilmName, id: string) {
        const note = yield* store.transact(paths(film).notes, (current) =>
          Effect.gen(function* () {
            yield* find(film, current, id);
            const next = resolveNote(current, id);
            return [yield* after(film, next, id), next] as const;
          }),
        );
        yield* Effect.log(`notes.resolve film=${film} id=${id}`);
        return note;
      });

      const wait = Effect.fn('NotesStore.wait')(function* (
        film: FilmName,
        since: number,
        timeout: Duration.Input,
      ) {
        const found = yield* read(film).pipe(
          Effect.map((file) => eventsSince(file, since)),
          Effect.repeat({
            until: (w) => w.events.length > 0 || w.cursor < since,
            schedule: Schedule.spaced(POLL),
          }),
          Effect.timeoutOption(timeout),
        );
        return Option.getOrElse(found, (): NotesWait => ({ cursor: since, events: [] }));
      });

      const still = Effect.fn('NotesStore.still')(function* (film: FilmName, name: string) {
        if (!STILL_NAME.test(name)) return Option.none<string>();
        const file = path.join(paths(film).stills, name);
        if (!(yield* fs.exists(file))) return Option.none<string>();
        return Option.some(file);
      });

      return NotesStore.of({ paths, read, add, reply, resolve, wait, still });
    }),
  );
}
