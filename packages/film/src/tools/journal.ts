import { Array as Arr, DateTime, Effect, FileSystem, Option, Path, Schema } from 'effect';
import { FilmFolder, type FilmName } from './film-repo.ts';

class JournalEmpty extends Schema.TaggedError<JournalEmpty>()('JournalEmpty', {}) {
  override get message() {
    return 'a journal note needs words: what was seen, heard or measured';
  }
}

const JOURNAL_FILE = 'journal.md';

export const JOURNAL_RULE =
  'Observations, never instructions: what was seen, heard or measured while making this film, each dated and placed. A decision lands in the source and a request is a lab note; an entry says what is, never what to do.';

const header = (film: string) => `# Journal: ${film}\n\n${JOURNAL_RULE}\n`;

const FILM_WIDE = 'film';

export interface JournalEntry {
  readonly at: string;
  readonly scene: string;
  readonly text: string;
}

const JOURNAL_CAP = 7_000;

export const JOURNAL_LAST = 20;

const HEADING = /^## (\S+) · (\S+)$/;

const oneLine = (text: string) => text.trim().replace(/\s+/g, ' ').replace(/^#/, '\\#');

const entryBlock = (entry: JournalEntry) => `\n## ${entry.at} · ${entry.scene}\n\n${entry.text}\n`;

export const entriesOf = (text: string): ReadonlyArray<JournalEntry> => {
  const entries: Array<JournalEntry> = [];
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    for (const [, at = '', scene = FILM_WIDE] of Option.toArray(
      Option.fromNullishOr(HEADING.exec(line)),
    )) {
      const text = Arr.takeWhile(lines.slice(i + 1), (next) => !HEADING.test(next))
        .join(' ')
        .trim()
        .replace(/^\\#/, '#');
      entries.push({ at, scene, text });
    }
  });
  return entries;
};

export const entryLine = (entry: JournalEntry) => `${entry.at} scene=${entry.scene} ${entry.text}`;

interface JournalPage {
  readonly lines: ReadonlyArray<string>;
  readonly left: number;
}

export const pageOf = (
  entries: ReadonlyArray<JournalEntry>,
  scene: Option.Option<string>,
  last: number,
  cap: number,
): JournalPage => {
  const matching = Option.match(scene, {
    onNone: () => entries,
    onSome: (id) => entries.filter((e) => e.scene === id),
  });
  const newest = Arr.reverse(matching).slice(0, Math.max(0, last));
  const kept: Array<string> = [];
  let used = 0;
  for (const entry of newest) {
    const line = entryLine(entry);
    if (used + line.length + 1 > cap) break;
    kept.push(line);
    used += line.length + 1;
  }
  return { lines: Arr.reverse(kept), left: matching.length - kept.length };
};

const fileOf = Effect.fn('journal.file')(function* (film: FilmName) {
  const folder = yield* FilmFolder;
  const path = yield* Path.Path;
  return path.join(folder.paths(film).dir, JOURNAL_FILE);
});

const textOf = Effect.fn('journal.text')(function* (file: string) {
  const fs = yield* FileSystem.FileSystem;
  if (!(yield* fs.exists(file))) return '';
  return yield* fs.readFileString(file);
});

export const note = Effect.fn('journal.note')(function* (
  film: FilmName,
  words: string,
  scene: Option.Option<string>,
) {
  const text = oneLine(words);
  if (text === '') return yield* JournalEmpty.make({});
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const file = yield* fileOf(film);
  const at = DateTime.formatIso(yield* DateTime.now).replace(/\.\d+Z$/, 'Z');
  const entry: JournalEntry = { at, scene: Option.getOrElse(scene, () => FILM_WIDE), text };
  const made = yield* Effect.scoped(
    Effect.gen(function* () {
      const draft = yield* fs.makeTempFileScoped({
        directory: path.dirname(file),
        prefix: `.${JOURNAL_FILE}-`,
      });
      yield* fs.writeFileString(draft, `${header(film)}${entryBlock(entry)}`);
      return yield* fs.link(draft, file).pipe(
        Effect.as(true),
        Effect.catchIf(
          (error) => error.reason._tag === 'AlreadyExists',
          () => Effect.succeed(false),
        ),
      );
    }),
  );
  if (!made) yield* fs.writeFileString(file, entryBlock(entry), { flag: 'a' });
  yield* Effect.log(`journal.note film=${film} scene=${entry.scene} chars=${text.length}`);
  return { file, entry };
});

export const read = Effect.fn('journal.read')(function* (
  film: FilmName,
  scene: Option.Option<string>,
  last: number = JOURNAL_LAST,
  cap: number = JOURNAL_CAP,
) {
  const file = yield* fileOf(film);
  return { file, ...pageOf(entriesOf(yield* textOf(file)), scene, last, cap) };
});
