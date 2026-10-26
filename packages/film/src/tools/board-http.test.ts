// The board's routes as an ask's Board block reads them: the record read (an
// empty board before the first panel), an image it names served and one it
// does not refused, a version folder's image from its own Board, and the
// panels drawn from what has changed since, each with why.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Schema } from 'effect';
import { ServerFailed, labUrls } from '../core/api.ts';
import { type BoardFile, BoardFileJson, BoardName } from '../core/board.ts';
import { Segment } from '../core/segment.ts';
import { echoPages, freshFilm } from './film-services/testing.ts';
import { labHandler } from './lab.ts';
import { text } from './host/testing.ts';
import { labInMemory } from './lab/testing.ts';

const tried = (n: number) => ({
  n,
  file: Segment.make(`cold.righteous.${n}.png`),
  sha256: `s${n}`,
  made: 'import' as const,
  refs: [],
  at: '2026-10-14T00:00:00.000Z',
});

const board: BoardFile = {
  film: 'f',
  panels: [
    {
      id: 'cold.righteous',
      beat: BoardName.make('cold'),
      at: BoardName.make('righteous'),
      tries: [tried(1), tried(2)],
    },
    // A keep the board drew from a cast file that is gone now: stale under any script read.
    {
      id: 'title.start',
      beat: BoardName.make('title'),
      at: BoardName.make('start'),
      kept: 1,
      tries: [
        {
          n: 1,
          file: Segment.make('title.start.1.png'),
          sha256: 't1',
          made: 'generate',
          refs: ['style.png', '../cast/christ/cast-sheet/kept/turnaround.png'],
          cast: [
            {
              member: 'christ',
              file: '../cast/christ/cast-sheet/kept/turnaround.png',
              sha256: 'gone',
            },
          ],
          at: '2026-10-14T00:00:00.000Z',
        },
      ],
    },
  ],
  approvals: [],
};

/** Film `f` with its board record and its first try's image. */
const files = () =>
  new Map<string, Uint8Array>([
    ['/films/f/scenes/index.ts', text('export {};\n')],
    ['/films/f/board.json', text(Schema.encodeSync(BoardFileJson)(board))],
    ['/films/f/board/cold.righteous.1.png', text('image one')],
    ['/films/f/v1/script.ts', text('export const script = [];\n')],
    ['/films/f/v1/board.json', text(Schema.encodeSync(BoardFileJson)(board))],
    ['/films/f/v1/board/cold.righteous.2.png', text('v1 image two')],
  ]);

const at = (path: string) => `http://127.0.0.1:4401${path}`;
const bound = { hostname: '127.0.0.1', port: 4401 } as const;
const get = (path: string) => new Request(at(path), { method: 'GET' });

describe('the board routes', () => {
  it.effect('read the record, serve an image it names and refuse one it does not', () =>
    Effect.gen(function* () {
      const lab = yield* labHandler();
      const read = yield* Effect.promise(() =>
        lab(get(labUrls.board.read({ params: { film: 'f' } })), bound),
      );
      expect(read.status).toBe(200);
      const got = yield* Effect.promise(() => read.json());
      expect(got.panels[0].id).toBe('cold.righteous');
      const image = yield* Effect.promise(() =>
        lab(
          get(
            labUrls.board.file({ params: { film: 'f', file: 'cold.righteous.1.png' }, query: {} }),
          ),
          bound,
        ),
      );
      expect([image.status, yield* Effect.promise(() => image.text())]).toEqual([200, 'image one']);
      for (const file of ['cold.righteous.2.png', 'notes.json']) {
        const missing = yield* Effect.promise(() =>
          lab(get(labUrls.board.file({ params: { film: 'f', file }, query: {} })), bound),
        );
        expect([file, missing.status]).toEqual([file, 404]);
      }
    }).pipe(Effect.scoped, Effect.provide(labInMemory(files()))),
  );

  it.effect("serve a version folder's image from its own Board, and not the film's", () =>
    Effect.gen(function* () {
      const lab = yield* labHandler();
      const ask = (file: string, query: { readonly folder?: Segment }) =>
        Effect.promise(() =>
          lab(get(labUrls.board.file({ params: { film: 'f', file }, query })), bound),
        );
      const v1Folder = { folder: Segment.make('v1') };
      const v1 = yield* ask('cold.righteous.2.png', v1Folder);
      expect([v1.status, yield* Effect.promise(() => v1.text())]).toEqual([200, 'v1 image two']);
      expect((yield* ask('cold.righteous.1.png', v1Folder)).status).toBe(404);
      expect((yield* ask('cold.righteous.2.png', {})).status).toBe(404);
    }).pipe(Effect.scoped, Effect.provide(labInMemory(files()))),
  );

  it.effect('name a keep drawn from a cast file gone since, with why', () =>
    Effect.gen(function* () {
      const lab = yield* labHandler();
      const read = yield* Effect.promise(() =>
        lab(get(labUrls.board.stale({ params: { film: 'f' } })), bound),
      );
      const got = yield* Effect.promise(() => read.json());
      expect([read.status, got.panels.map((p: { panel: string }) => p.panel)]).toEqual([
        200,
        ['title.start'],
      ]);
      expect(got.panels[0].why).toContain("christ's cast sheet");
    }).pipe(
      Effect.scoped,
      Effect.provide(
        labInMemory(files(), echoPages, { film: freshFilm({ script: () => Effect.succeed([]) }) }),
      ),
    ),
  );

  it.effect('name no panel stale, and answer, when the script cannot be read now', () =>
    Effect.gen(function* () {
      const lab = yield* labHandler();
      const read = yield* Effect.promise(() =>
        lab(get(labUrls.board.stale({ params: { film: 'f' } })), bound),
      );
      expect([read.status, yield* Effect.promise(() => read.json())]).toEqual([
        200,
        { panels: [] },
      ]);
    }).pipe(
      Effect.scoped,
      Effect.provide(
        labInMemory(files(), echoPages, {
          film: freshFilm({
            script: () =>
              Effect.fail(ServerFailed.make({ tag: 'ScriptBroken', reason: 'script.ts throws' })),
          }),
        }),
      ),
    ),
  );
});
