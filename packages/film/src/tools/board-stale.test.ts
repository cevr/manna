// A panel drawn from what has changed since (its picture's words in the
// script, a cast sheet, a member who first kept a sheet): a run draws it again
// (new tries, numbered on) and its keep stays recorded; a panel drawn from
// what still stands is left alone, and so is a change to the style; a panel
// that keeps none is drawn again once none of its tries is fresh; the board
// read names the stale panel and why. A try records the words of its picture
// and what each cast reference held (the sha256 of the bytes sent); a try from
// before is judged by its prompt and the member's `replaced` history.

import { describe, expect, it } from 'effect-bun-test';
import {
  Boolean as Bool,
  ConfigProvider,
  type FileSystem,
  Effect,
  Layer,
  Option,
  Path,
  Result,
  Schema,
} from 'effect';
import { BoardName } from '../core/board.ts';
import { CastSheetJson, type CastSheetRecord } from '../core/cast-record.ts';
import type { SheetKind } from '../core/cast-sheet.ts';
import { Segment } from '../core/segment.ts';
import { makeBoard } from './board-make.ts';
import { staleWhy } from './board-stale.ts';
import type { BoardBeat } from './board-prompt.ts';
import { BoardStore } from './board-store.ts';
import { sha256Hex } from './digest.ts';
import { ContentStore } from './content-store.ts';
import { FilmFolder, FilmName } from './film-repo.ts';
import { memoryFileSystem, memoryLocks, text } from './host/testing.ts';
import { ImageRoute } from './image-route.ts';
import { freshFilm } from './film-services/testing.ts';
import { LabAddress } from './lab-command.ts';
import { notesReads } from './notes-mcp.ts';
import { NotesStore } from './notes-store.ts';

const film = FilmName.make('f');
const SUPPER = BoardName.make('supper');
const PANEL = 'supper.start';
const SHEET = '/library/cast/christ/cast-sheet';
const TURNAROUND = `${SHEET}/kept/turnaround.png`;

const beat: BoardBeat = {
  id: SUPPER,
  say: Option.none(),
  picture: Option.some('He breaks the bread at the table.'),
  cast: ['christ'],
};

const style = {
  id: BoardName.make('9005'),
  name: 'K1',
  block: 'A paper-cut frame.',
  ref: Segment.make('style.9005.png'),
  sha256: 'x',
};

/** A keep of `kind` replaced on `at`: try 1 kept (the views it cut, `views`), try 2 in its place. */
const replacedAt = (
  at: string,
  kind: SheetKind = 'turnaround',
  views: ReadonlyArray<string> = [],
) => ({
  kind,
  kept: {
    try: 1,
    why: 'the first',
    views: views.map((name, i) => ({ view: i + 1, name, box: [0, 0, 1, 1] as const })),
  },
  by: 2,
  folder: 'kept/replaced/turnaround-1',
  ask: 'a1',
  why: 'a man’s face',
  at,
});

/** A member's record in the library (Christ's unless named), its turnaround kept, with the keeps `replaced` named. */
const christ = (
  files: Map<string, Uint8Array>,
  replaced: ReadonlyArray<ReturnType<typeof replacedAt>> = [],
  member = 'christ',
) => {
  const sheet = `/library/cast/${member}/cast-sheet`;
  const record: CastSheetRecord = {
    member: Segment.make(member),
    scope: 'library',
    who: 'Him',
    refs: [],
    sheets: {},
    kept: { turnaround: { try: 2, why: 'the owner kept it', views: [] } },
    ...Bool.match(replaced.length > 0, { onTrue: () => ({ replaced }), onFalse: () => ({}) }),
  };
  files.set(`${sheet}/cast-sheet.json`, text(Schema.encodeSync(CastSheetJson)(record)));
  files.set(`${sheet}/kept/turnaround.png`, text('kept turnaround'));
};

/** A board over memory, the film `f` under `/films`, with the lab's reads beside it. */
const boardOver = (
  files: Map<string, Uint8Array>,
  route: Layer.Layer<ImageRoute, never, FileSystem.FileSystem> = ImageRoute.fake(() =>
    text('image'),
  ),
) => {
  files.set('/films/f/scenes/index.ts', text('export default []'));
  return Layer.mergeAll(
    BoardStore.layer,
    NotesStore.layer,
    route,
    Layer.succeed(LabAddress, LabAddress.of({ local: 'http://lab' })),
    // The lab reads the script fresh: the supper beat as `beat` has it.
    freshFilm({
      script: () =>
        Effect.succeed([
          {
            id: SUPPER,
            picture: Option.getOrElse(beat.picture, () => ''),
            cast: beat.cast,
            cite: [],
          },
        ]),
    }),
  ).pipe(
    Layer.provide(ContentStore.layer),
    Layer.provideMerge(FilmFolder.layer('/films')),
    Layer.provideMerge([
      memoryFileSystem(files),
      memoryLocks,
      Path.layer,
      ConfigProvider.layer(ConfigProvider.fromUnknown({ FILMS_OUT: '/out', FILMS_LAB: '/lab' })),
    ]),
  );
};

const styled = Effect.gen(function* () {
  const store = yield* BoardStore;
  const sha256 = yield* store.put(film, 'style.9005.png', text('style'));
  yield* store.modify(film, (b) => Result.succeed({ ...b, style: { ...style, sha256 } }));
});

/** A run of the supper beat (as `drawn` has it, `beat` unless given), `tries` tries a panel; the lines it printed. */
const run = (tries: number, drawn: BoardBeat = beat) =>
  Effect.gen(function* () {
    const lines: Array<string> = [];
    yield* makeBoard(film, [drawn], [], { beats: [], tries, lanes: 1, dryRun: false }, (l) =>
      Effect.sync(() => {
        lines.push(`${l._tag} ${l.panel}`);
      }),
    );
    return lines;
  });

const keep = (n: number) =>
  Effect.flatMap(BoardStore, (store) =>
    store.modify(film, (b) =>
      Result.succeed({
        ...b,
        panels: b.panels.map((p) =>
          Bool.match(p.id === PANEL, { onTrue: () => ({ ...p, kept: n }), onFalse: () => p }),
        ),
      }),
    ),
  );

const panel = Effect.flatMap(BoardStore, (store) =>
  Effect.map(store.read(film), (b) => b.panels.find((p) => p.id === PANEL)),
);

describe('a kept panel whose cast sheet changed', () => {
  it.effect(
    'is drawn again with new tries, numbered on, and keeps its keep; once drawn, it is not drawn again',
    () => {
      const files = new Map<string, Uint8Array>();
      christ(files);
      return Effect.gen(function* () {
        yield* styled;
        yield* run(1);
        yield* keep(1);
        expect((yield* panel)?.tries[0]?.cast).toEqual([
          {
            member: 'christ',
            file: '../../../library/cast/christ/cast-sheet/kept/turnaround.png',
            sha256: expect.any(String),
          },
        ]);
        // The sheet as it was drawn from: the kept panel is left as it stands.
        expect(yield* run(2)).toEqual([]);
        files.set(TURNAROUND, text('the turnaround kept in its place'));
        expect(yield* run(2)).toEqual([
          'Stale supper.start',
          'Made supper.start',
          'Made supper.start',
        ]);
        const after = yield* panel;
        expect(after?.tries.map((t) => t.n)).toEqual([1, 2, 3]);
        expect(after?.kept).toBe(1);
        // Its new tries are drawn from the sheet as it is now: a run again draws none.
        expect(yield* run(2)).toEqual(['Stale supper.start']);
        expect((yield* panel)?.tries).toHaveLength(3);
      }).pipe(Effect.provide(boardOver(files)));
    },
  );

  it.effect('the board read names the stale panel and whose sheet changed', () => {
    const files = new Map<string, Uint8Array>();
    christ(files);
    return Effect.gen(function* () {
      yield* styled;
      yield* run(1);
      yield* keep(1);
      const { boardOf } = yield* notesReads();
      const before = yield* boardOf(film, Option.none());
      expect(before.panels[0]?.stale).toBeUndefined();
      files.set(TURNAROUND, text('the turnaround kept in its place'));
      const read = yield* boardOf(film, Option.none());
      expect(read.panels[0]?.stale?.members).toEqual(['christ']);
      expect(read.panels[0]?.stale?.why).toContain("christ's cast sheet");
    }).pipe(Effect.provide(boardOver(files)));
  });

  it.effect(
    'a try from before tries recorded their cast is stale when its member kept a sheet in its place since',
    () => {
      const old = (replaced: ReadonlyArray<ReturnType<typeof replacedAt>>) => {
        const files = new Map<string, Uint8Array>();
        christ(files, replaced);
        return Effect.gen(function* () {
          yield* styled;
          const store = yield* BoardStore;
          yield* store.modify(film, (b) =>
            Result.succeed({
              ...b,
              panels: [
                {
                  id: PANEL,
                  beat: SUPPER,
                  at: BoardName.make('start'),
                  kept: 1,
                  tries: [
                    {
                      n: 1,
                      file: Segment.make('supper.start.1.png'),
                      sha256: 's',
                      made: 'generate',
                      refs: [
                        'style.9005.png',
                        '../../../library/cast/christ/cast-sheet/kept/turnaround.png',
                      ],
                      at: '2026-10-25T11:00:00.000Z',
                    },
                  ],
                },
              ],
            }),
          );
          const stale = yield* store.stale(film, [beat]);
          return { stale, lines: yield* run(1) };
        }).pipe(Effect.provide(boardOver(files)));
      };
      return Effect.gen(function* () {
        const since = yield* old([replacedAt('2026-10-25T15:00:00.000Z')]);
        expect(since.stale).toEqual([
          { panel: PANEL, kept: Option.some(1), members: ['christ'], words: false, fresh: 0 },
        ]);
        expect(since.lines).toEqual(['Stale supper.start', 'Made supper.start']);
        const before = yield* old([replacedAt('2026-10-25T09:00:00.000Z')]);
        expect(before.stale).toEqual([]);
        expect(before.lines).toEqual([]);
      });
    },
  );

  /** The board's stale panels over `panels`, each one kept try from before tries recorded their cast, drawn from `ref`. */
  const staleOver = (files: Map<string, Uint8Array>, panels: ReadonlyArray<[string, string]>) =>
    Effect.gen(function* () {
      const store = yield* BoardStore;
      yield* store.modify(film, (b) =>
        Result.succeed({
          ...b,
          panels: panels.map(([at, ref]) => ({
            id: `supper.${at}`,
            beat: SUPPER,
            at: BoardName.make(at),
            kept: 1,
            tries: [
              {
                n: 1,
                file: Segment.make(`supper.${at}.1.png`),
                sha256: 's',
                made: 'generate' as const,
                refs: ['style.9005.png', `../../../library/cast/${ref}`],
                at: '2026-10-25T11:00:00.000Z',
              },
            ],
          })),
        }),
      );
      // The beat names no cast now, so only the try's own record of its sheets is judged.
      return (yield* store.stale(film, [{ ...beat, cast: [] }])).map((s) => [s.panel, s.members]);
    }).pipe(Effect.provide(boardOver(files)));

  it.effect(
    'a try from before is stale on a view cut from a sheet replaced since, which named that view',
    () => {
      const files = new Map<string, Uint8Array>();
      christ(files, [replacedAt('2026-10-25T15:00:00.000Z', 'poses', ['kneel'])]);
      return Effect.gen(function* () {
        expect(
          yield* staleOver(files, [
            ['one', 'christ/cast-sheet/views/kneel.png'],
            ['two', 'christ/cast-sheet/views/stand.png'],
          ]),
        ).toEqual([['supper.one', ['christ']]]);
      });
    },
  );

  it.effect(
    "a try from before is not stale on another member's sheet, nor on a kind of its own sheet not replaced",
    () => {
      const files = new Map<string, Uint8Array>();
      christ(files, [replacedAt('2026-10-25T15:00:00.000Z')]);
      christ(files, [replacedAt('2026-10-25T15:00:00.000Z', 'heads')], 'paul');
      return Effect.gen(function* () {
        expect(
          yield* staleOver(files, [
            ['one', 'christ/cast-sheet/kept/turnaround.png'],
            ['two', 'paul/cast-sheet/kept/turnaround.png'],
          ]),
        ).toEqual([['supper.one', ['christ']]]);
      });
    },
  );
});

describe("a stale beat's ride-along", () => {
  const two: BoardBeat = {
    id: SUPPER,
    say: Option.some('He {breaks}breaks the {bread}bread.'),
    picture: Option.some('He breaks it (`breaks`); the bread in His hands (`bread`).'),
    cast: ['christ'],
  };

  it.effect(
    "takes the first panel's first try drawn in this run, never its keep from the sheet replaced",
    () => {
      const files = new Map<string, Uint8Array>();
      christ(files);
      const draw = makeBoard(
        film,
        [two],
        [],
        { beats: [], tries: 1, lanes: 1, dryRun: false },
        () => Effect.void,
      );
      return Effect.gen(function* () {
        yield* styled;
        const store = yield* BoardStore;
        yield* draw;
        yield* store.modify(film, (b) =>
          Result.succeed({ ...b, panels: b.panels.map((p) => ({ ...p, kept: 1 })) }),
        );
        files.set(TURNAROUND, text('the turnaround kept in its place'));
        yield* draw;
        const bread = (yield* store.read(film)).panels.find((p) => p.id === 'supper.bread');
        expect(bread?.tries.map((t) => t.refs[1])).toEqual([
          'supper.breaks.1.png',
          'supper.breaks.2.png',
        ]);
      }).pipe(Effect.provide(boardOver(files)));
    },
  );
});

describe("a panel whose picture's words changed in the script", () => {
  const robed: BoardBeat = {
    ...beat,
    picture: Option.some('He breaks the bread at the table, in His white robe and gold sash.'),
  };

  it.effect(
    'is drawn again with its keep held; a change to the style is not its words; once drawn, it is not drawn again',
    () => {
      const files = new Map<string, Uint8Array>();
      christ(files);
      return Effect.gen(function* () {
        yield* styled;
        const store = yield* BoardStore;
        yield* run(1);
        yield* keep(1);
        expect((yield* panel)?.tries[0]?.words).toEqual(['He breaks the bread at the table.']);
        yield* store.modify(film, (b) =>
          Result.succeed({
            ...b,
            style: { ...style, sha256: b.style?.sha256 ?? '', block: 'A painted frame.' },
          }),
        );
        expect(yield* run(2)).toEqual([]);
        expect(yield* run(2, robed)).toEqual([
          'Stale supper.start',
          'Made supper.start',
          'Made supper.start',
        ]);
        const stale = Option.getOrThrow(
          Option.fromUndefinedOr((yield* store.stale(film, [robed]))[0]),
        );
        expect(stale).toEqual({
          panel: PANEL,
          kept: Option.some(1),
          members: [],
          words: true,
          fresh: 2,
        });
        expect(staleWhy('f', stale)).toContain("drawn from the picture's words");
        expect((yield* panel)?.kept).toBe(1);
        expect(yield* run(2, robed)).toEqual(['Stale supper.start']);
        expect((yield* panel)?.tries).toHaveLength(3);
      }).pipe(Effect.provide(boardOver(files)));
    },
  );

  it.effect(
    'a try from before tries recorded their words is stale when its prompt does not carry them verbatim',
    () => {
      const files = new Map<string, Uint8Array>();
      return Effect.gen(function* () {
        yield* styled;
        const store = yield* BoardStore;
        const kept = (at: string, prompt: string) => ({
          id: `supper.${at}`,
          beat: SUPPER,
          at: BoardName.make(at),
          kept: 1,
          tries: [
            {
              n: 1,
              file: Segment.make(`supper.${at}.1.png`),
              sha256: 's',
              made: 'generate' as const,
              prompt,
              refs: ['style.9005.png'],
              at: '2026-10-25T11:00:00.000Z',
            },
          ],
        });
        yield* store.modify(film, (b) =>
          Result.succeed({
            ...b,
            panels: [
              kept(
                'start',
                `An older style.\n\nTHE BRIEF: ${Option.getOrThrow(beat.picture)}\n\nRULES`,
              ),
              kept('other', 'An older style.\n\nTHE BRIEF: He breaks the loaf.\n\nRULES'),
            ],
          }),
        );
        const stale = yield* store.stale(film, [{ ...beat, cast: [] }]);
        expect(stale.map((s) => [s.panel, s.words])).toEqual([['supper.other', true]]);
      }).pipe(Effect.provide(boardOver(files)));
    },
  );
});

describe('a panel with tries and none kept', () => {
  it.effect(
    'is drawn again, `--tries` new tries, when none of its tries is drawn from the cast as it stands',
    () => {
      const files = new Map<string, Uint8Array>();
      christ(files);
      return Effect.gen(function* () {
        yield* styled;
        yield* run(1);
        files.set(TURNAROUND, text('the turnaround kept in its place'));
        expect(yield* run(2)).toEqual([
          'Stale supper.start',
          'Made supper.start',
          'Made supper.start',
        ]);
        expect((yield* panel)?.tries.map((t) => t.n)).toEqual([1, 2, 3]);
        expect((yield* panel)?.kept).toBeUndefined();
        // Two of its tries are drawn from the sheet as it is now: it is not stale.
        expect(yield* run(2)).toEqual([]);
      }).pipe(Effect.provide(boardOver(files)));
    },
  );
});

describe("a kept try and the cast's references as a run sends them now", () => {
  it.effect('is stale once its member first kept a sheet after it was drawn', () => {
    const files = new Map<string, Uint8Array>();
    const record = (
      kept: Option.Option<NonNullable<CastSheetRecord['kept']>>,
    ): CastSheetRecord => ({
      member: Segment.make('christ'),
      scope: 'library',
      who: 'Him',
      refs: [{ file: 'rig.png', why: 'the rig as it stands' }],
      sheets: {},
      ...Option.match(kept, {
        onNone: () => ({}),
        onSome: (k) => ({ kept: k }),
      }),
    });
    files.set(
      `${SHEET}/cast-sheet.json`,
      text(Schema.encodeSync(CastSheetJson)(record(Option.none()))),
    );
    files.set(`${SHEET}/rig.png`, text('rig'));
    const keptSince = Schema.encodeSync(CastSheetJson)(
      record(Option.some({ turnaround: { try: 1, why: 'the owner kept it', views: [] } })),
    );
    return Effect.gen(function* () {
      yield* styled;
      yield* run(1);
      yield* keep(1);
      expect(yield* run(1)).toEqual([]);
      files.set(`${SHEET}/cast-sheet.json`, text(keptSince));
      files.set(TURNAROUND, text('kept turnaround'));
      expect(yield* run(1)).toEqual(['Stale supper.start', 'Made supper.start']);
      expect((yield* panel)?.tries[1]?.refs.at(-1)).toBe(
        '../../../library/cast/christ/cast-sheet/kept/turnaround.png',
      );
    }).pipe(Effect.provide(boardOver(files)));
  });
});

describe("a try's record of its cast", () => {
  it.effect(
    'holds the sha256 of the very bytes the route was sent, though the sheet is replaced while the run draws',
    () => {
      const files = new Map<string, Uint8Array>();
      christ(files);
      const sent: Array<string> = [];
      // The route takes each try's last reference as it is sent, then the sheet is replaced before the next try.
      const route = ImageRoute.fake((request) => {
        sent.push(sha256Hex(files.get(request.refs.at(-1) ?? '') ?? new Uint8Array()));
        files.set(TURNAROUND, text(`turnaround ${sent.length + 1}`));
        return text('image');
      });
      return Effect.gen(function* () {
        yield* styled;
        yield* run(2);
        expect(sent).toHaveLength(2);
        expect(sent[0]).not.toBe(sent[1]);
        expect((yield* panel)?.tries.map((t) => t.cast?.[0]?.sha256)).toEqual(sent);
        expect([...files.keys()].filter((f) => f.includes('/.drawing/'))).toEqual([]);
      }).pipe(Effect.provide(boardOver(files, route)));
    },
  );
});
