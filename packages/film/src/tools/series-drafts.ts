import {
  Array as Arr,
  Boolean as Bool,
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Result,
  Schema,
  Semaphore,
} from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import type { DraftRead, MarksPost, SeriesList } from '../core/api.ts';
import { type Draft, DraftMarkdown, draftMarked, draftMissed, unreadText } from '../core/draft.ts';
import { DraftUnknown, DraftUnread, SourceChanged, SourceRefused } from '../core/refusals.ts';
import type { HeardAs, Voice } from '../core/schema.ts';
import { stagingVoice } from '../core/staging-voice.ts';
import type { ReadBeat } from '../core/studio.ts';
import { ContentStore, type StoreError } from './content-store.ts';
import { WriteUnverified } from './errors.ts';
import { readBeat } from './narrator.ts';

const SCRIPTS = 'scripts';

const PLAN = 'series.md';

export const draftKey = (series: string, draft: string) => `${series}/${draft}`;

interface DraftReading {
  readonly voice: Voice;
  readonly heardAs: HeardAs;
  readonly beats: ReadonlyArray<ReadBeat>;
}

const titleOf = (markdown: string, fallback: string): string =>
  Option.getOrElse(
    Option.map(
      Option.fromNullishOr(/^# (.+)$/m.exec(markdown)),
      ([, heading = '']) => heading.split(':')[0]?.trim() ?? heading,
    ),
    () => fallback,
  );

export const draftRead = (series: string, draft: string, read: Draft): DraftRead => ({
  series,
  draft,
  title: read.title,
  beats: read.beats.map((b) => ({
    id: b.id,
    label: b.label,
    ...Option.match(b.say, { onNone: () => ({}), onSome: (s) => ({ say: s.text }) }),
    ...Option.match(b.brief, { onNone: () => ({}), onSome: (brief) => ({ brief }) }),
    cite: b.cite,
  })),
});

type DraftError = DraftUnknown | DraftUnread | PlatformError;

interface SeriesDraftsService {
  readonly list: Effect.Effect<SeriesList, PlatformError>;
  readonly keys: Effect.Effect<ReadonlyArray<readonly [string, string]>, PlatformError>;
  readonly read: (series: string, draft: string) => Effect.Effect<Draft, DraftError>;
  readonly reading: (series: string, draft: string) => Effect.Effect<DraftReading, DraftError>;
  readonly mark: (
    series: string,
    draft: string,
    post: MarksPost,
  ) => Effect.Effect<
    Draft,
    DraftError | SourceRefused | WriteUnverified | SourceChanged | StoreError
  >;
}

export class SeriesDrafts extends Context.Service<SeriesDrafts, SeriesDraftsService>()(
  '@manna/film/tools/SeriesDrafts',
) {
  static readonly layer = (root: Option.Option<string>) =>
    Layer.effect(
      SeriesDrafts,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const store = yield* ContentStore;
        const writer = yield* Semaphore.make(1);

        const entries = (dir: string) =>
          Effect.flatMap(fs.exists(dir), (there) =>
            Bool.match(there, {
              onTrue: () => fs.readDirectory(dir),
              onFalse: () => Effect.succeed<ReadonlyArray<string>>([]),
            }),
          );
        const text = (file: string) =>
          Effect.flatMap(fs.exists(file), (there) =>
            Bool.match(there, {
              onTrue: () => fs.readFileString(file),
              onFalse: () => Effect.succeed(''),
            }),
          );

        const list: Effect.Effect<SeriesList, PlatformError> = Effect.gen(function* () {
          if (Option.isNone(root)) return { series: [] };
          const dir = root.value;
          const series = yield* Effect.forEach(
            (yield* entries(dir)).toSorted(),
            Effect.fn('SeriesDrafts.series')(function* (name) {
              const scripts = path.join(dir, name, SCRIPTS);
              const folder = yield* fs.stat(path.join(dir, name)).pipe(
                Effect.map((info): string => info.type),
                Effect.catchIf(
                  (e) => e.reason._tag === 'NotFound',
                  () => Effect.succeed('Missing'),
                ),
              );
              if (folder !== 'Directory') return Option.none();
              const drafts = yield* Effect.forEach(
                (yield* entries(scripts)).filter((f) => f.endsWith('.md')).toSorted(),
                (file) =>
                  Effect.map(text(path.join(scripts, file)), (md) => {
                    const draft = file.slice(0, -'.md'.length);
                    return { name: draft, title: titleOf(md, draft) };
                  }),
              );
              const title = titleOf(yield* text(path.join(dir, name, PLAN)), name);
              return Option.some({ name, title, drafts });
            }),
          );
          return { series: Arr.getSomes(series).filter((s) => s.drafts.length > 0) };
        });

        const keys = Effect.map(list, (l) =>
          l.series.flatMap((s) => s.drafts.map((d) => [s.name, d.name] as const)),
        );

        const fileOf = Effect.fn('SeriesDrafts.fileOf')(function* (series: string, draft: string) {
          const known = yield* keys;
          const listed = known.some(([s, d]) => s === series && d === draft);
          if (!listed || Option.isNone(root))
            return yield* DraftUnknown.make({
              series,
              draft,
              known: known.map(([s, d]) => draftKey(s, d)),
            });
          return path.join(root.value, series, SCRIPTS, `${draft}.md`);
        });

        const readText = (series: string, draft: string, markdown: string) =>
          Effect.mapError(Schema.decodeEffect(DraftMarkdown)(markdown), (e) =>
            DraftUnread.make({ draft: draftKey(series, draft), reason: e.message }),
          );

        const read = Effect.fn('SeriesDrafts.read')(function* (series: string, draft: string) {
          const file = yield* fileOf(series, draft);
          return yield* readText(series, draft, yield* fs.readFileString(file));
        });

        const reading = Effect.fn('SeriesDrafts.reading')(function* (
          series: string,
          draft: string,
        ) {
          const read_ = yield* read(series, draft);
          const voice: Voice = stagingVoice;
          const beats = yield* Effect.forEach(
            read_.beats.flatMap((b) =>
              Option.toArray(Option.map(b.say, (s) => [b.id, s.text] as const)),
            ),
            ([id, say]) =>
              Effect.mapError(Effect.fromResult(readBeat(voice, id, say)), (e) =>
                DraftUnread.make({ draft: draftKey(series, draft), reason: e.message }),
              ),
          );
          return { voice, heardAs: {}, beats } satisfies DraftReading;
        });

        const mark = Effect.fn('SeriesDrafts.mark')(
          (series: string, draft: string, { beat, marks, read }: MarksPost) =>
            writer.withPermits(1)(
              Effect.gen(function* () {
                const file = yield* fileOf(series, draft);
                const shown = path.join(series, SCRIPTS, `${draft}.md`);
                const target = `marks:${beat}`;
                const before = yield* fs.readFileString(file);
                const after = yield* Effect.mapError(
                  Effect.fromResult(draftMarked(before, beat, marks, Option.fromUndefinedOr(read))),
                  (u) => SourceRefused.make({ file: shown, target, reason: unreadText(u) }),
                );
                const missed = draftMissed(after, before, beat, marks);
                if (missed.length > 0)
                  return yield* WriteUnverified.make({
                    file: shown,
                    target,
                    reason: missed.join(', '),
                  });
                if (after !== before) {
                  yield* store.modify({ file, codec: Schema.String, empty: '' }, (now) =>
                    Bool.match(now === before, {
                      onTrue: () => Result.succeed(after),
                      onFalse: () => Result.fail(SourceChanged.make({ file: shown, target })),
                    }),
                  );
                  yield* Effect.log(
                    `lab.write draft=${draftKey(series, draft)} target="${target}"`,
                  );
                }
                return yield* readText(series, draft, after);
              }),
            ),
        );

        return SeriesDrafts.of({ list, keys, read, reading, mark });
      }),
    );
}
