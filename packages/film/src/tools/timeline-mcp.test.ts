import { describe, expect, it } from 'effect-bun-test';
import { Effect, Layer, Option, Result, Schema } from 'effect';
import { type BoardFile, BoardFileJson, BoardName } from '../core/board.ts';
import type { FilmClock } from '../core/timeline-schema.ts';
import { Segment } from '../core/segment.ts';
import { RenderCatalogue } from './catalogue.ts';
import { ProductionStore } from './production-store.ts';
import { echoPages, freshFilm } from './film-services/testing.ts';
import { text } from './host/testing.ts';
import { labInMemory } from './lab/testing.ts';
import { labWithMcp, mcpSession } from './lab-mcp/testing.ts';

const older: FilmClock = {
  fps: 30,
  beats: [
    {
      id: 'cold',
      start: 0,
      dur: 6,
      hold: { lead: 0.5, tail: 0.1, declared: [], asked: 0.1, min: 0 },
      speech: { start: 0.5, end: 5.9 },
      marks: [{ name: 'judge', at: 3 }],
      voice: 'staging',
      drawn: true,
    },
    {
      id: 'title',
      start: 6,
      dur: 3,
      hold: { lead: 0, tail: 3, declared: [], asked: 0.1, min: 0 },
      marks: [],
      voice: 'silent',
      drawn: true,
    },
  ],
  acts: [{ name: 'open', from: 'cold', start: 0, end: 9 }],
  movements: [],
};

const registered: FilmClock = {
  fps: 30,
  beats: [
    {
      id: 'seed',
      start: 0,
      dur: 8,
      hold: { lead: 0.5, tail: 0.1, declared: [], asked: 0.1, min: 0 },
      speech: { start: 0.5, end: 7.9 },
      marks: [],
      voice: 'estimated',
      drawn: false,
    },
  ],
  acts: [],
  movements: [],
};

const boardOf = (beat: string, at: string): BoardFile => ({
  film: 'f',
  panels: [
    {
      id: `${beat}.${at}`,
      beat: BoardName.make(beat),
      at: BoardName.make(at),
      tries: [
        {
          n: 1,
          file: Segment.make(`${beat}.${at}.1.png`),
          sha256: 's1',
          made: 'import',
          refs: [],
          at: '2026-10-14T00:00:00.000Z',
        },
      ],
      kept: 1,
    },
  ],
  approvals: [],
});

const files = () =>
  new Map<string, Uint8Array>([
    ['/films/f/scenes/index.ts', text('export {};\n')],
    ['/films/f/board.json', text(Schema.encodeSync(BoardFileJson)(boardOf('seed', 'start')))],
    ['/films/f/v1/script.ts', text('export const script = [];\n')],
    ['/films/f/v1/board.json', text(Schema.encodeSync(BoardFileJson)(boardOf('cold', 'judge')))],
  ]);

const asked: Array<Option.Option<string>> = [];

const provided = <A, E, R>(
  self: Effect.Effect<A, E, R>,
  mtimes: ReadonlyMap<string, number> = new Map(),
) =>
  self.pipe(
    Effect.scoped,
    Effect.provide(
      RenderCatalogue.layer.pipe(
        Layer.provideMerge(
          labInMemory(files(), echoPages, {
            mtimes,
            film: freshFilm({
              clock: (_film, folder) =>
                Effect.sync(() => {
                  asked.push(folder);
                  return Option.match(folder, { onNone: () => registered, onSome: () => older });
                }),
            }),
          }),
        ),
      ),
    ),
  );

const twoVersions = Effect.gen(function* () {
  const productions = yield* ProductionStore;
  yield* productions.start('f', {
    title: 'F',
    film: Option.some('f'),
    blurb: Option.none(),
    first: 'the canvas cut',
    at: 1,
  });
  yield* productions.modify('f', (current) =>
    Result.succeed({
      ...current,
      versions: [
        ...current.versions,
        { at: 2, title: 'written from scratch', because: Option.some('the owner said so') },
      ],
    }),
  );
});

const SEED_WAITS = {
  count: 1,
  items: [{ kind: 'approve', beat: 'seed', href: '/' }],
};

describe('timeline', () => {
  it.effect(
    'answers the open version, a version asked, only the lanes asked, and refuses one it has not',
    () =>
      provided(
        Effect.gen(function* () {
          asked.length = 0;
          yield* twoVersions;
          const { lab } = yield* labWithMcp;
          const { tool } = yield* mcpSession(lab);
          const open = yield* tool('timeline', { film: 'f' });
          expect(open.version).toEqual({
            n: 2,
            title: 'written from scratch',
            open: true,
            files: 'film',
          });
          expect(open.lanes.map((l: { track: string }) => l.track)).toEqual(['script', 'board']);
          expect(open.lanes[1].clips.map((c: { panel: string }) => c.panel)).toEqual([
            'seed.start',
          ]);
          expect(open.header.stage).toBe('board');
          expect(open.lab).toEqual({
            local: 'http://localhost:4401/',
            phone: 'http://100.64.0.9:8230/',
          });
          expect(open.header.waits).toEqual(SEED_WAITS);
          const v1 = yield* tool('timeline', { film: 'f', version: 1 });
          expect(v1.version.files).toBe('folder');
          expect(v1.lanes.map((l: { track: string }) => l.track)).toEqual([
            'script',
            'board',
            'voice',
            'scenes',
          ]);
          expect(v1.lanes[1].clips).toEqual([
            {
              start: 0,
              dur: 6,
              state: 'kept',
              clock: 'measured',
              panel: 'cold.judge',
              beat: 'cold',
              mark: 'judge',
              markAt: 3,
              try: 1,
              file: 'cold.judge.1.png',
              card: false,
            },
          ]);
          expect(v1.header.waits).toEqual(SEED_WAITS);
          expect(v1.bands.map((b: { name: string }) => b.name)).toEqual(['open']);
          const only = yield* tool('timeline', { film: 'f', version: 1, tracks: ['voice'] });
          expect(only.lanes.map((l: { track: string }) => l.track)).toEqual(['voice']);
          expect(asked).toEqual([Option.none(), Option.some('v1')]);
          expect((yield* tool('timeline', { film: 'f', version: 5 })).refused).toBe(
            'f has no v5 (its versions: v1, v2)',
          );
          expect((yield* tool('timeline', { film: 'nope' })).refused).toContain('no film "nope"');
        }),
      ),
  );

  it.effect("reads a clock once per stamp of the film's sources, and again once it moves", () => {
    const mtimes = new Map([['/films/f/scenes/index.ts', 1]]);
    return provided(
      Effect.gen(function* () {
        asked.length = 0;
        const { lab } = yield* labWithMcp;
        const { tool } = yield* mcpSession(lab);
        yield* tool('timeline', { film: 'f' });
        yield* tool('timeline', { film: 'f' });
        expect(asked.length).toBe(1);
        mtimes.set('/films/f/scenes/index.ts', 2);
        yield* tool('timeline', { film: 'f' });
        expect(asked.length).toBe(2);
      }),
      mtimes,
    );
  });
});
