import {
  Array as Arr,
  Boolean as Bool,
  Clock,
  Config,
  Context,
  Data,
  DateTime,
  Effect,
  FileSystem,
  Layer,
  Match,
  Option,
  Order,
  Path,
  Random,
  Record,
  Result,
  Semaphore,
} from 'effect';
import { decodeComponent } from '@manna/url-state';
import { Machine } from 'effect-machine';
import {
  type Ask,
  type AskImage,
  type BoardTryRef,
  AskName,
  type AskRecord,
  AskEvent,
  type AsksPage,
  NEW_PAGE,
  AskRecordJson,
  type AskState,
  type StepValues,
  answerRefusal,
  answeredToEnd,
  answersLine,
  askMachine,
  askProblems,
  askStart,
  askStatus,
  asksOnPage,
  filled,
  givenAnswers,
  imagesIn,
  mapImages,
  pageIdOf,
  pageOpen,
  unrecommended,
} from '../core/ask.ts';
import { REVIEW_FILES, askShownUrl, boardFileUrl } from '../core/api.ts';
import { panelById, tryOf } from '../core/board.ts';
import {
  type ProductionFile,
  type Said,
  aimedWord,
  setPathOf,
  withAskSaid,
} from '../core/production.ts';
import {
  AskInvalid,
  AskRefused,
  AskUnknown,
  ReviewFileUnknown,
  type WordUnaimed,
} from '../core/refusals.ts';
import { AskMaterials } from './ask-materials.ts';
import { BoardStore } from './board-store.ts';
import { ContentStore, type Manifest, type StoreError } from './content-store.ts';
import { sha256Hex, sha256OfFile } from './digest.ts';
import { type FilmFolder, filmNamed } from './film-repo.ts';
import { ProductionStore } from './production-store.ts';

interface AskDraft {
  readonly title: string;
  readonly why: string;
  readonly by: string;
  readonly film?: string;
  readonly production?: string;
  readonly set?: string;
  readonly point?: string;
  readonly override?: { readonly quote: string };
  readonly deadline?: string;
  readonly page?: string;
  readonly ask: Ask;
}

interface AskStoreService {
  readonly dir: string;
  readonly file: (id: string) => string;
  readonly make: (
    draft: AskDraft,
  ) => Effect.Effect<AskRecord, WordUnaimed | AskInvalid | AskUnknown | AskRefused | StoreError>;
  readonly read: (id: string) => Effect.Effect<AskRecord, AskUnknown | StoreError>;
  readonly page: (id: string) => Effect.Effect<AsksPage, AskUnknown | StoreError>;
  readonly list: Effect.Effect<ReadonlyArray<AskRecord>, StoreError>;
  readonly answerPage: (
    id: string,
    sections: ReadonlyArray<{ readonly step: AskName; readonly values: StepValues }>,
  ) => Effect.Effect<AskRecord, AskUnknown | AskRefused | StoreError>;
  readonly shownFile: (
    id: string,
    file: string,
  ) => Effect.Effect<
    { readonly name: string; readonly bytes: Uint8Array },
    AskUnknown | AskRefused | ReviewFileUnknown | StoreError
  >;
  readonly close: (
    id: string,
    why: string,
  ) => Effect.Effect<AskRecord, AskUnknown | AskRefused | StoreError>;
}

const MISSING_END = AskName.make('done');
const MISSING_ASK: Ask = { start: MISSING_END, steps: { [MISSING_END]: { end: true } } };
const MISSING: AskRecord = {
  id: AskName.make('missing'),
  title: '-',
  why: '-',
  by: '-',
  created: '',
  ask: MISSING_ASK,
  state: askStart(MISSING_ASK),
  answered: [],
};

const newId = Effect.map(
  Effect.all([Random.nextIntBetween(0, 0x100000), Random.nextIntBetween(0, 0x100000)]),
  (halves) => AskName.make(`a${halves.map((h) => h.toString(16).padStart(5, '0')).join('')}`),
);

const ASK_ID = /^a[0-9a-f]{10}$/;

const COPY = /^([0-9a-f]{64})(\.[a-z0-9]{1,8})?$/;

interface Copy {
  readonly src: string;
  readonly hash: string;
}

type Plan =
  | { readonly _tag: 'Copy'; readonly src: string; readonly file: string }
  | { readonly _tag: 'Shown'; readonly src: string; readonly copy: Copy };

const copyPlan = (src: string, file: string) => Option.some<Plan>({ _tag: 'Copy', src, file });

const ASK_AT = 'askxroutexask';
const FILE_AT = 'askxroutexfile';
const SHOWN_ROUTE = new RegExp(
  `^${askShownUrl(ASK_AT, FILE_AT)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(ASK_AT, '([^/]+)')
    .replace(FILE_AT, '([^/]+)')}$`,
);

const shownRouteOf = (src: string) =>
  Option.flatMap(
    Option.fromNullishOr(SHOWN_ROUTE.exec(new URL(src, 'http://lab.invalid').pathname)),
    ([, ask = '', file = '']) =>
      Option.all({
        ask: Result.getSuccess(decodeComponent(ask)),
        file: Result.getSuccess(decodeComponent(file)),
      }),
  );

const extensionOf = (file: string): string =>
  Option.getOrElse(
    Option.fromNullishOr(/\.[A-Za-z0-9]{1,8}$/.exec(file)?.[0]),
    () => '',
  ).toLowerCase();

const asksDir = Effect.gen(function* () {
  const path = yield* Path.Path;
  const root = yield* Config.String('FILMS_LAB').pipe(Config.withDefault(path.resolve('lab')));
  return path.join(root, 'asks');
});

const recordAt = (file: string, empty = MISSING): Manifest<AskRecord> => ({
  file,
  codec: AskRecordJson,
  empty,
});

export class AskStore extends Context.Service<AskStore, AskStoreService>()(
  '@manna/film/tools/AskStore',
) {
  static readonly layer = Layer.effect(
    AskStore,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const store = yield* ContentStore;
      const boards = yield* BoardStore;
      const productions = yield* ProductionStore;
      const materials = yield* AskMaterials;
      const films = yield* Effect.context<FilmFolder>();
      const dir = yield* asksDir;

      const file = (id: string) => path.join(dir, `${id}.json`);
      const shownDir = path.join(dir, 'shown');
      const manifest = (id: string, empty = MISSING) => recordAt(file(id), empty);
      const now = Effect.map(DateTime.now, DateTime.formatIso);

      const found = (image: AskImage) =>
        Option.match(Option.fromUndefinedOr(image.board), {
          onNone: () => Effect.succeedSome(image),
          onSome: (ref) =>
            Effect.gen(function* () {
              const film = yield* filmNamed(ref.film).pipe(
                Effect.provideContext(films),
                Effect.option,
              );
              if (Option.isNone(film)) return Option.none<AskImage>();
              const board = yield* boards.read(film.value).pipe(Effect.option);
              return Option.map(
                Option.flatMap(
                  Option.flatMap(board, (b) => panelById(b, ref.panel)),
                  (p) => tryOf(p, ref.try),
                ),
                (t): AskImage => ({ ...image, src: boardFileUrl(film.value, t.file) }),
              );
            }),
        });

      const keyOf = (ref: BoardTryRef) => `${ref.film}\u0000${ref.panel}\u0000${ref.try}`;

      const located = Effect.fn('AskStore.located')(function* (ask: Ask) {
        const refs = imagesIn(ask).flatMap((i) => Option.toArray(Option.fromUndefinedOr(i.board)));
        const srcs = new Map<string, string>();
        const missing: Array<string> = [];
        yield* Effect.forEach(refs, (ref) =>
          Effect.map(found({ board: ref }), (o) =>
            Option.match(
              Option.flatMap(o, (i) => Option.fromUndefinedOr(i.src)),
              {
                onNone: () => {
                  missing.push(
                    `board try ${ref.try} of ${ref.film} ${ref.panel} is not on its board`,
                  );
                },
                onSome: (src) => {
                  srcs.set(keyOf(ref), src);
                },
              },
            ),
          ),
        );
        const withSrc = mapImages(ask, (image) =>
          Option.match(
            Option.flatMap(Option.fromUndefinedOr(image.board), (ref) =>
              Option.fromUndefinedOr(srcs.get(keyOf(ref))),
            ),
            { onNone: () => image, onSome: (src) => ({ ...image, src }) },
          ),
        );
        return { ask: withSrc, missing: [...new Set(missing)] };
      });

      const filed = (record: AskRecord) =>
        Option.match(Option.fromUndefinedOr(record.production), {
          onNone: () => Effect.void,
          onSome: (production) =>
            Effect.gen(function* () {
              const words = askWords(record, yield* Clock.currentTimeMillis);
              if (words.length === 0) return;
              yield* productions.modify(production, (current) =>
                Result.succeed(words.reduce(withAskSaid, current)),
              );
            }),
        });

      const making = yield* Semaphore.make(1);

      const pageFor = (by: string, named: Option.Option<string>) =>
        Effect.gen(function* () {
          if (Option.contains(named, NEW_PAGE)) return Option.none<AskName>();
          if (Option.isSome(named)) {
            const page = pageIdOf(yield* read(named.value));
            if (!pageOpen(asksOnPage(yield* list, page)))
              return yield* AskRefused.make({
                id: page,
                reason: `its page has nothing left asking, so it takes no new ask: leave \`page\` out, or say "${NEW_PAGE}"`,
              });
            return Option.some(page);
          }
          return Option.map(
            Arr.findFirst(yield* list, (r) => r.by === by && askStatus(r.state) === 'asking'),
            pageIdOf,
          );
        });

      const productionFilmOf = (production: Option.Option<string>) =>
        Option.match(production, {
          onNone: () => Effect.succeed({}),
          onSome: (p) =>
            productions.read(p).pipe(
              Effect.map((file) =>
                Option.match(
                  Option.flatMap(file, (f) => f.film),
                  { onNone: () => ({}), onSome: (productionFilm) => ({ productionFilm }) },
                ),
              ),
              Effect.orElseSucceed(() => ({})),
            ),
        });

      const make = Effect.fn('AskStore.make')(function* (draft: AskDraft) {
        yield* Effect.fromResult(
          aimedWord({
            set: Option.fromUndefinedOr(draft.set),
            point: Option.fromUndefinedOr(draft.point),
            variant: Option.none(),
          }),
        );
        const deadline = Option.map(Option.fromUndefinedOr(draft.deadline), (d) =>
          Option.map(DateTime.make(d), DateTime.formatIso),
        );
        const problems = [
          ...askProblems(draft.ask),
          ...unrecommended(draft.ask),
          ...Option.match(deadline, {
            onNone: () => [],
            onSome: (d) =>
              Option.match(d, {
                onNone: () => [
                  `deadline ${draft.deadline} is not a time (ISO, 2026-10-15T18:00:00Z)`,
                ],
                onSome: () => [],
              }),
          }),
        ];
        if (problems.length > 0) return yield* AskInvalid.make({ problems });
        const { ask, missing } = yield* located(draft.ask);
        const absent = [
          ...(yield* materials.problems(draft.ask)),
          ...missing,
          ...(yield* materials.evidence(
            { ...draft, ...(yield* productionFilmOf(Option.fromUndefinedOr(draft.production))) },
            draft.ask,
          )),
        ];
        if (absent.length > 0) return yield* AskInvalid.make({ problems: absent });
        const id = yield* newId;
        const { ask: showing, shown } = yield* receipted(id, ask);
        return yield* making.withPermit(
          Effect.gen(function* () {
            const page = yield* pageFor(draft.by, Option.fromUndefinedOr(draft.page));
            return yield* kept(id, draft, showing, shown, deadline, page);
          }),
        );
      });

      const copied = (file: string) =>
        Effect.gen(function* () {
          yield* fs.makeDirectory(shownDir, { recursive: true });
          const partial = path.join(
            shownDir,
            `.${process.pid}-${yield* Random.nextIntBetween(0, 1e9)}.partial`,
          );
          return yield* Effect.gen(function* () {
            yield* fs.copyFile(file, partial);
            const hash = yield* sha256OfFile(fs, partial);
            const name = `${hash}${extensionOf(file)}`;
            yield* fs.rename(partial, path.join(shownDir, name));
            return Option.some({ hash, name });
          }).pipe(Effect.onError(() => Effect.ignore(fs.remove(partial, { force: true }))));
        }).pipe(Effect.orElseSucceed(() => Option.none<{ hash: string; name: string }>()));

      const receipted = (id: AskName, ask: Ask) =>
        Effect.gen(function* () {
          const planned = yield* Effect.forEach(yield* materials.served(ask), ([src, at]) =>
            Match.value(at).pipe(
              Match.tag('File', ({ file }) => Effect.succeed(Result.succeed(copyPlan(src, file)))),
              Match.tag('Frame', () => Effect.succeed(Result.succeed(Option.none<Plan>()))),
              Match.tag('None', () => shownAgain(id, src)),
              Match.exhaustive,
            ),
          );
          const unserved = Arr.getFailures(planned);
          if (unserved.length > 0) return yield* refusedImages(id, unserved);
          const each = yield* Effect.forEach(
            Arr.getSomes(Arr.getSuccesses(planned)),
            (plan): Effect.Effect<Result.Result<readonly [string, Copy], string>> =>
              Match.value(plan).pipe(
                Match.tag('Copy', ({ src, file }) =>
                  Effect.map(copied(file), (copy) =>
                    Result.fromOption(
                      Option.map(
                        copy,
                        ({ hash, name }) => [src, { src: askShownUrl(id, name), hash }] as const,
                      ),
                      () => `image ${src}: its file did not copy as the ask was made`,
                    ),
                  ),
                ),
                Match.tag('Shown', ({ src, copy }) =>
                  Effect.succeed(Result.succeed([src, copy] as const)),
                ),
                Match.exhaustive,
              ),
          );
          const refused = Arr.getFailures(each);
          if (refused.length > 0) return yield* refusedImages(id, refused);
          const copies = new Map(Arr.getSuccesses(each));
          const showing = mapImages(ask, (image) =>
            Option.match(
              Option.flatMap(Option.fromUndefinedOr(image.src), (src) =>
                Option.fromUndefinedOr(copies.get(src)),
              ),
              { onNone: () => image, onSome: (copy) => ({ ...image, src: copy.src }) },
            ),
          );
          const shown = Object.fromEntries([...copies.values()].map((c) => [c.src, c.hash]));
          return { ask: showing, shown };
        });

      const refusedImages = (id: AskName, why: ReadonlyArray<string>) =>
        AskRefused.make({
          id,
          reason: `its images show only copies made with it, and ${why.join('; ')}: make it again`,
        });

      const shownAgain = (id: AskName, src: string) =>
        Option.match(shownRouteOf(src), {
          onNone: () =>
            Effect.succeed(
              Result.fail(
                `image ${src}: the lab serves no file there now (a set's file is at the link \`set\` and \`publish_set\` answer for it, under ${REVIEW_FILES}; a board try, {board: {film, panel, try}})`,
              ),
            ),
          onSome: ({ ask: earlier, file: name }) =>
            shownFile(earlier, name).pipe(
              Effect.map(({ bytes }) =>
                Result.succeed(
                  Option.some<Plan>({
                    _tag: 'Shown',
                    src,
                    copy: { src: askShownUrl(id, name), hash: sha256Hex(bytes) },
                  }),
                ),
              ),
              Effect.catch((error) =>
                Effect.succeed(
                  Result.fail(
                    `image ${src}: it is no copy ask ${earlier} holds (${error.message})`,
                  ),
                ),
              ),
            ),
        });

      const kept = (
        id: AskName,
        draft: AskDraft,
        ask: Ask,
        shown: Readonly<Record<string, string>>,
        deadline: Option.Option<Option.Option<string>>,
        page: Option.Option<AskName>,
      ) =>
        Effect.gen(function* () {
          const record: AskRecord = {
            id,
            title: draft.title,
            why: draft.why,
            by: draft.by,
            ...Option.match(Option.fromUndefinedOr(draft.film), {
              onNone: () => ({}),
              onSome: (film) => ({ film }),
            }),
            ...Option.match(Option.fromUndefinedOr(draft.production), {
              onNone: () => ({}),
              onSome: (production) => ({ production }),
            }),
            ...Option.match(Option.fromUndefinedOr(draft.set), {
              onNone: () => ({}),
              onSome: (set) => ({ set }),
            }),
            ...Option.match(Option.fromUndefinedOr(draft.point), {
              onNone: () => ({}),
              onSome: (point) => ({ point }),
            }),
            ...Option.match(Option.fromUndefinedOr(draft.override), {
              onNone: () => ({}),
              onSome: (override) => ({ override }),
            }),
            ...Option.match(page, { onNone: () => ({}), onSome: (p) => ({ page: p }) }),
            created: yield* now,
            ...Option.match(Option.flatten(deadline), {
              onNone: () => ({}),
              onSome: (at) => ({ deadline: at }),
            }),
            ask,
            shown,
            state: askStart(ask),
            answered: [],
          };
          yield* store.update(manifest(id, record), () => record);
          yield* filed(record);
          yield* Effect.log(
            `asks.make id=${id} by=${draft.by} page=${pageIdOf(record)} steps=${Object.keys(ask.steps).length}`,
          );
          return record;
        });

      const known = (id: string) =>
        Effect.gen(function* () {
          if (!ASK_ID.test(id) || !(yield* fs.exists(file(id))))
            return yield* AskUnknown.make({ id });
          return manifest(id);
        });

      const read = Effect.fn('AskStore.read')(function* (id: string) {
        return yield* store.read(yield* known(id));
      });

      const list = Effect.gen(function* () {
        if (!(yield* fs.exists(dir))) return [];
        const names = (yield* fs.readDirectory(dir)).filter((n) =>
          ASK_ID.test(n.replace(/\.json$/, '')),
        );
        const records = yield* Effect.forEach(names, (n) =>
          store.read(manifest(n.replace(/\.json$/, ''))).pipe(Effect.option),
        );
        return Arr.sort(
          records.flatMap((r) => Option.toArray(Option.filter(r, (a) => a.id !== ''))),
          Order.flip(Order.mapInput(Order.String, (a: AskRecord) => a.created)),
        );
      });

      const moved = (ask: Ask, state: AskState, event: AskEvent) =>
        Machine.replay(askMachine(ask, state), [event], { from: state });

      const stepped = (current: AskRecord, step: AskName, values: StepValues, when: string) =>
        Effect.gen(function* () {
          const refuse = (reason: string) => AskRefused.make({ id: current.id, reason });
          const before = Arr.findFirst(current.answered, (a) => a.step === step);
          if (Option.isSome(before)) {
            if (sameValues(before.value.values, values)) return current;
            return yield* refuse(`step ${step} is answered already`);
          }
          const past = Option.filter(Option.fromUndefinedOr(current.deadline), (d) => d < when);
          if (Option.isSome(past)) return yield* refuse(`it was due by ${past.value}`);
          const why = answerRefusal(current.ask, current.state, step, values);
          if (Option.isSome(why)) return yield* refuse(why.value);
          const state = yield* moved(current.ask, current.state, AskEvent.Answer({ step, values }));
          return {
            ...current,
            state,
            answered: [...current.answered, { step, values, at: when }],
          } satisfies AskRecord;
        });

      const copyOf = (id: string, src: string, hash: string) => {
        const prefix = askShownUrl(id, '');
        return Option.filter(
          Option.map(
            Option.liftPredicate(src, (s) => s.startsWith(prefix)),
            (s) => s.slice(prefix.length),
          ),
          (name) => COPY.exec(name)?.[1] === hash,
        );
      };

      const unbacked = (record: AskRecord) =>
        Effect.map(
          Effect.forEach(Object.entries(record.shown ?? {}), ([src, hash]) =>
            Option.match(copyOf(record.id, src, hash), {
              onNone: () => Effect.succeed([`${src} is not the copy of ${hash} the ask made`]),
              onSome: (name) =>
                Effect.map(
                  Effect.option(sha256OfFile(fs, path.join(shownDir, name))),
                  (now): ReadonlyArray<string> =>
                    Bool.match(Option.contains(now, hash), {
                      onTrue: () => [],
                      onFalse: () => [`${src}: its copy no longer holds ${hash}`],
                    }),
                ),
            }),
          ),
          (each) => each.flat(),
        );

      const shownFile = Effect.fn('AskStore.shownFile')(function* (id: string, name: string) {
        const record = yield* read(id);
        const src = askShownUrl(record.id, name);
        const hash = Option.fromUndefinedOr(record.shown?.[src]);
        const copy = Option.flatMap(hash, (h) => copyOf(record.id, src, h));
        if (Option.isNone(copy) || Option.isNone(hash))
          return yield* ReviewFileUnknown.make({ ref: src });
        const bytes = yield* fs
          .readFile(path.join(shownDir, copy.value))
          .pipe(Effect.mapError(() => ReviewFileUnknown.make({ ref: src })));
        if (sha256Hex(bytes) !== hash.value)
          return yield* AskRefused.make({
            id: record.id,
            reason: `its copy ${name} no longer holds ${hash.value}: close it and make the ask again`,
          });
        return { name, bytes };
      });

      const answerPage = Effect.fn('AskStore.answerPage')(function* (
        id: string,
        sections: ReadonlyArray<{ readonly step: AskName; readonly values: StepValues }>,
      ) {
        const at = yield* known(id);
        const when = yield* now;
        const record = yield* store.transact(at, (current) =>
          Effect.gen(function* () {
            const problems = yield* unbacked(current);
            if (problems.length > 0)
              return yield* AskRefused.make({
                id: current.id,
                reason: `its page shows images the lab holds no copy of as the ask was made (${problems.join('; ')}): close it and make the ask again`,
              });
            const next = yield* Effect.reduce(
              sections,
              () => current,
              (run: AskRecord, s) => stepped(run, s.step, filled(s.values), when),
            );
            return [next, next] as const;
          }),
        );
        yield* Effect.log(
          `asks.answer id=${id} steps=${sections.map((s) => s.step).join(',')} state=${record.state._tag}`,
        );
        return record;
      });

      const close = Effect.fn('AskStore.close')(function* (id: string, why: string) {
        const at = yield* known(id);
        const record = yield* store.transact(at, (current) =>
          Effect.gen(function* () {
            if (current.state._tag === 'Closed') {
              if (current.state.why === why) return [current, current] as const;
              return yield* AskRefused.make({
                id,
                reason: `it is closed already: ${current.state.why}`,
              });
            }
            const state = yield* moved(
              current.ask,
              current.state,
              AskEvent.Close({ why, at: yield* now }),
            );
            const next: AskRecord = { ...current, state };
            return [next, next] as const;
          }),
        );
        yield* filed(record);
        yield* Effect.log(`asks.close id=${id}`);
        return record;
      });

      const page = Effect.fn('AskStore.page')(function* (id: string) {
        const on = pageIdOf(yield* read(id));
        return { page: on, asks: asksOnPage(yield* list, on) } satisfies AsksPage;
      });

      return AskStore.of({ dir, file, make, read, page, list, answerPage, shownFile, close });
    }),
  );
}

const askWords = (record: AskRecord, now: number): ReadonlyArray<Said> => {
  const set = Option.map(Option.fromUndefinedOr(record.set), setPathOf);
  const on = {
    set,
    point: Option.fromUndefinedOr(record.point),
    variant: Option.none<string>(),
    ask: Option.some(record.id),
    picks: Option.none<Readonly<Record<string, string>>>(),
    by: Option.some(record.by),
  };
  const named = `${record.title} (ask ${record.id})`;
  const timeOf = (iso: Option.Option<string>) =>
    Option.getOrElse(
      Option.map(Option.flatMap(iso, DateTime.make), DateTime.toEpochMillis),
      () => now,
    );
  const question = Arr.filter(
    [
      {
        _tag: 'Asked' as const,
        at: timeOf(Option.some(record.created)),
        text: named,
        quote: Option.none<string>(),
        ...on,
      },
    ],
    () => Option.isSome(set),
  );
  const closing = Match.value(record.state).pipe(
    Match.tag('Closed', (closed): ReadonlyArray<Said> => {
      if (!answeredToEnd(record))
        return [
          {
            _tag: 'Noted',
            at: timeOf(Option.fromUndefinedOr(closed.at)),
            text: `${named} withdrawn: ${closed.why}`,
            quote: Option.none(),
            ...on,
          },
        ];
      const given = givenAnswers(closed.answers);
      const words = Object.values(given).flatMap((a) =>
        Match.value(a).pipe(
          Match.discriminatorsExhaustive('kind')({
            choose: (): ReadonlyArray<string> => [],
            free_text: (t) => [t.text],
            skipped: (): ReadonlyArray<string> => [],
          }),
        ),
      );
      const picks = Record.getSomes(
        Record.map(given, (a) =>
          Match.value(a).pipe(
            Match.discriminatorsExhaustive('kind')({
              choose: (c) => Option.some(c.value),
              free_text: () => Option.none<string>(),
              skipped: () => Option.none<string>(),
            }),
          ),
        ),
      );
      const line = answersLine(
        Option.getOrElse(
          Option.liftPredicate(given, (g) => !Record.isEmptyRecord(g)),
          () => closed.answers,
        ),
      );
      return [
        {
          _tag: 'Decided',
          at: timeOf(Option.map(Arr.last(record.answered), (a) => a.at)),
          text: `${named}: ${line}`,
          quote: Option.liftPredicate(words.join(' / '), (w) => w.length > 0),
          ...on,
          picks: Option.liftPredicate(picks, (p) => !Record.isEmptyRecord(p)),
        },
      ];
    }),
    Match.orElse((): ReadonlyArray<Said> => []),
  );
  return [...question, ...closing];
};

export type PicksFound = Data.TaggedEnum<{
  Filled: { readonly ask: string; readonly picks: Readonly<Record<string, string>> };
  Left: { readonly ask: string; readonly why: string };
}>;
const PicksFound = Data.taggedEnum<PicksFound>();

type Read = Result.Result<AskRecord, string>;

const unpicked = (file: ProductionFile): ReadonlyArray<string> =>
  file.said.flatMap((s) => Option.toArray(unpickedAsk(s)));

const unpickedAsk = (said: Said): Option.Option<string> =>
  Option.filter(said.ask, () => said._tag === 'Decided' && Option.isNone(said.picks));

const foundFor = (production: string, ask: string, record: Read): PicksFound =>
  Result.match(record, {
    onFailure: (why) => PicksFound.Left({ ask, why }),
    onSuccess: (r) => {
      if (r.production !== production)
        return PicksFound.Left({ ask, why: `its ask files on ${r.production ?? 'no production'}` });
      const decided = Arr.findFirst(askWords(r, 0), (w) => w._tag === 'Decided');
      return Option.match(decided, {
        onNone: () =>
          PicksFound.Left({
            ask,
            why: Match.value(r.state).pipe(
              Match.tagsExhaustive({
                Asking: () => 'its ask is not closed: it still asks',
                Answered: () => 'its ask is not closed: it is answered',
                Closed: () => 'its ask was closed before its end',
              }),
            ),
          }),
        onSome: (d) =>
          Option.match(d.picks, {
            onNone: () => PicksFound.Left({ ask, why: 'he answered it by no choice' }),
            onSome: (picks) => PicksFound.Filled({ ask, picks }),
          }),
      });
    },
  });

const picksFiled = (file: ProductionFile, recordOf: (ask: string) => Read) => {
  const found = unpicked(file).map((ask) => foundFor(file.production, ask, recordOf(ask)));
  const filled = new Map(
    Arr.filter(found, PicksFound.$is('Filled')).map((f) => [f.ask, f.picks] as const),
  );
  const said = file.said.map((s) =>
    Option.match(
      Option.flatMap(unpickedAsk(s), (ask) => Option.fromUndefinedOr(filled.get(ask))),
      { onNone: () => s, onSome: (picks) => ({ ...s, picks: Option.some(picks) }) },
    ),
  );
  return { file: { ...file, said }, found };
};

class NothingFiled extends Data.TaggedError('NothingFiled')<{
  readonly found: ReadonlyArray<PicksFound>;
}> {}

export const fillPicks = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const store = yield* ContentStore;
  const productions = yield* ProductionStore;
  const dir = yield* asksDir;
  const recordOf = (ask: string): Effect.Effect<Read> =>
    Effect.gen(function* () {
      const file = path.join(dir, `${ask}.json`);
      if (!ASK_ID.test(ask) || !(yield* fs.exists(file)))
        return Result.fail(`no record of it at ${file}`);
      return Result.succeed(yield* store.read(recordAt(file)));
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(Result.fail(`its record does not read: ${error.message}`)),
      ),
    );
  const ledgers = yield* productions.list;
  const found = yield* Effect.forEach(ledgers, (ledger) =>
    Effect.gen(function* () {
      const asks = Arr.dedupe(unpicked(ledger));
      if (asks.length === 0) return [];
      const records = new Map(
        yield* Effect.forEach(asks, (ask) => Effect.map(recordOf(ask), (r) => [ask, r] as const)),
      );
      const recordIn = (ask: string): Read =>
        records.get(ask) ?? Result.fail('filed after its ledger was read');
      const filed = yield* productions
        .attempt(
          ledger.production,
          (
            current,
          ): Result.Result<readonly [ReadonlyArray<PicksFound>, ProductionFile], NothingFiled> => {
            const next = picksFiled(current, recordIn);
            if (next.found.some(PicksFound.$is('Filled')))
              return Result.succeed([next.found, next.file] as const);
            return Result.fail(new NothingFiled({ found: next.found }));
          },
        )
        .pipe(Effect.catchTag('NothingFiled', (nothing) => Effect.succeed(nothing.found)));
      return filed.map((f) => ({ production: ledger.production, found: f }));
    }),
  );
  return found.flat();
});

const sameValues = (a: StepValues, b: StepValues): boolean => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
};
