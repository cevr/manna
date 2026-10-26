// A scene's source through the lab, over a film on disk: the
// `tweak` command, as an agent calls it on the lab's MCP, lands a cue's
// timing in the scene file and answers the span as the file now declares
// it, the cue resolved on the scene's clock and the fresh check; a knob's
// value answers the knob; a computed value, a shared or missing scene and a
// timing the timeline would not resolve are refused with the file
// untouched; an input that names no one literal is the call's InvalidParams;
// and the film's one history steps a tweak back (`undo`), byte for byte,
// refusing a change another stands on.

import { AskMaterials } from './ask-materials.ts';
import { AskStore } from './ask-store.ts';
import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Context, Effect, FileSystem, Layer, Path, Schema } from 'effect';
import { HttpPlatform } from 'effect/http';
import { LabWrite } from '../core/schema.ts';
import { ContentStore } from './content-store.ts';
import { FilmModuleInvalid } from './errors.ts';
import { FilmFolder, FilmRepo } from './film-repo.ts';
import { NotesStore } from './notes-store.ts';
import { ProductionStore } from './production-store.ts';
import { BoardStore } from './board-store.ts';
import { RenderCatalogue } from './catalogue.ts';
import { Critic } from './critique.ts';
import { SceneSources } from './scene-sources.ts';
import { SceneWriter } from './scene-writer.ts';
import { SourceWriter } from './source-writer.ts';
import {
  echoPages,
  freshFilm,
  freshHere,
  noRenders,
  noReview,
  noStudio,
} from './film-services/testing.ts';
import { withTimelines } from './lab/testing.ts';
import { labWithMcp, mcpSession } from './lab-mcp/testing.ts';
import { sceneFixture } from './scene-sources/testing.ts';

/** The fixture's hand scene file. */
class HandFile extends Context.Service<HandFile, string>()('test/HandFile') {}

/** A check that reports one warning, and counts its runs. */
const checks: Array<string> = [];
const fakeCheck = freshHere({
  check: (film) =>
    Effect.sync(() => {
      checks.push(film);
      return [{ level: 'warning', tag: 'AssetMissing', message: 'sound "coins" is missing' }];
    }),
});

/** The film repo over `films`, but loading the film fails (its paths still resolve). */
const brokenRepo = (films: string) =>
  Layer.effect(
    FilmRepo,
    Effect.map(FilmRepo, (repo) =>
      FilmRepo.of({
        load: (film) =>
          Effect.fail(
            FilmModuleInvalid.make({ film, module: 'voice.ts', reason: 'broken for the test' }),
          ),
        script: repo.script,
        sound: repo.sound,
        scores: repo.scores,
      }),
    ),
  ).pipe(Layer.provide(FilmRepo.layer(films)), Layer.merge(FilmFolder.layer(films)));

const fixtureWith = (repoOver: (films: string) => ReturnType<typeof FilmRepo.layer>) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const films = yield* sceneFixture(root);
      const repo = repoOver(films);
      return Layer.mergeAll(
        SceneWriter.layer.pipe(
          Layer.provideMerge(SourceWriter.layer),
          Layer.provideMerge(SceneSources.layer),
          Layer.provideMerge(Layer.merge(repo, fakeCheck.pipe(Layer.provide(repo)))),
        ),
        NotesStore.layer,
        ProductionStore.layer,
        BoardStore.layer.pipe(Layer.provide(FilmFolder.layer(films))),
        AskStore.layer.pipe(
          Layer.provide(AskMaterials.layer),
          Layer.provide([
            BoardStore.layer,
            NotesStore.layer,
            ProductionStore.layer,
            noStudio,
            noRenders,
            freshFilm({}),
          ]),
          Layer.provide(FilmFolder.layer(films)),
        ),
        noStudio,
        noReview,
        echoPages,
        RenderCatalogue.layer,
        Critic.skipping('no critic in this test'),
        HttpPlatform.layer,
        Layer.succeed(HandFile, path.join(films, 'f', 'scenes', 'hand.ts')),
      ).pipe(Layer.provideMerge(ContentStore.layer), withTimelines);
    }),
  ).pipe(Layer.provideMerge(BunServices.layer));

const fixture = fixtureWith(FilmRepo.layer);

/** The lab with its MCP over the fixture, and an agent's session on it: `tweak` and the rest by name. */
const agent = Effect.gen(function* () {
  const { lab } = yield* labWithMcp;
  const { tool } = yield* mcpSession(lab);
  return { lab, tool };
});

const read = Effect.fn('test.read')(function* () {
  return yield* (yield* FileSystem.FileSystem).readFileString(yield* HandFile);
});

describe('a scene source through the lab', () => {
  it.effect(
    'a tweak of a cue lands in the file and answers the span, its timing and the check',
    () =>
      Effect.gen(function* () {
        const { tool } = yield* agent;
        const before = yield* read();
        const written = yield* Schema.decodeUnknownEffect(LabWrite)(
          yield* tool('tweak', { film: 'f', scene: 'hand', cue: 'topple', offset: 0.4 }),
        );
        expect(written).toMatchObject({
          scene: 'hand',
          file: 'scenes/hand.ts',
          target: 'cue topple offset',
          span: { mark: 'earns', offset: 0.4, dur: 1.8 },
          findings: [{ level: 'warning', tag: 'AssetMissing' }],
        });
        expect(written.change).toBeString();
        // Resolved on the scene's clock: the mark, plus the new offset, lasting its dur.
        expect(written.resolved?.dur).toBeCloseTo(1.8);
        expect(yield* read()).toBe(before.replace('offset: 0.1,', 'offset: 0.4,'));
        expect(checks).toContain('f');
      }).pipe(Effect.scoped, Effect.provide(fixture)),
  );

  it.effect(
    'a tweak of a knob answers the knob; a computed value, a missing scene and a timing that would not resolve are refused, the file untouched',
    () =>
      Effect.gen(function* () {
        const { tool } = yield* agent;
        const palm = tool('tweak', { film: 'f', scene: 'hand', knob: 'palm', value: [1000, 760] });
        const knob = yield* palm;
        expect(knob).toMatchObject({ target: 'knob palm', knob: [1000, 760] });
        expect(knob).toHaveProperty('change');
        const after = yield* read();
        // The same value again changes nothing: the answer says so, and has no change to undo.
        const again = yield* palm;
        expect(again).toMatchObject({ target: 'knob palm (already so)', knob: [1000, 760] });
        expect(again).not.toHaveProperty('change');
        expect(yield* read()).toBe(after);
        const computed = yield* tool('tweak', { film: 'f', scene: 'hand', cue: 'late', offset: 1 });
        expect(computed.refused).toContain('scenes/hand.ts: will not edit cue late offset');
        expect(computed.refused).toContain('`GAP * 2`, not a literal');
        expect(
          (yield* tool('tweak', { film: 'f', scene: 'nope', cue: 'topple', dur: 1 })).refused,
        ).toContain('scene "nope"');
        // A timing the timeline would not resolve with.
        const unresolved = yield* tool('tweak', {
          film: 'f',
          scene: 'hand',
          cue: 'topple',
          until: 'earns',
        });
        expect(unresolved.refused).toContain('the timeline would not resolve');
        expect(
          (yield* tool('tweak', { film: 'nope', scene: 'hand', knob: 'palm', value: 1 })).refused,
        ).toContain('nope');
        expect(yield* read()).toBe(after);
      }).pipe(Effect.scoped, Effect.provide(fixture)),
  );

  const badInputs = [
    ['names no literal', { scene: 'hand', offset: 1 }, 'name one `cue` or one `knob`'],
    [
      'names both',
      { scene: 'hand', cue: 'topple', knob: 'palm', value: 1 },
      'name one `cue` or one `knob`',
    ],
    ['sets nothing of a cue', { scene: 'hand', cue: 'topple' }, 'set at least one of offset'],
    ['gives a cue a value', { scene: 'hand', cue: 'topple', value: 1 }, 'not `value`'],
    ['gives a knob no value', { scene: 'hand', knob: 'palm' }, 'a knob takes its `value`'],
    ['gives a knob a timing', { scene: 'hand', knob: 'palm', value: 1, dur: 1 }, 'not dur'],
    ['ends a span twice', { scene: 'hand', cue: 'topple', dur: 1, until: 'earns' }, 'not both'],
    ['names no ease', { scene: 'hand', cue: 'topple', ease: 'bouncy' }, 'inOutQuad'],
  ] as const;
  for (const [what, input, said] of badInputs)
    it.effect(`a tweak that ${what} is refused as its input, the file untouched`, () =>
      Effect.gen(function* () {
        const { tool } = yield* agent;
        const before = yield* read();
        expect((yield* tool('tweak', { film: 'f', ...input })).refused).toContain(said);
        expect(yield* read()).toBe(before);
      }).pipe(Effect.scoped, Effect.provide(fixture)),
    );

  it.effect("a tweak is a step of the film's one history: `undo` puts it back", () =>
    Effect.gen(function* () {
      const { tool } = yield* agent;
      const before = yield* read();
      yield* tool('tweak', { film: 'f', scene: 'hand', cue: 'topple', ease: 'inQuad' });
      const written = yield* read();
      expect(written).not.toBe(before);
      expect(yield* tool('undo', { film: 'f' })).toMatchObject({
        target: 'undo cue topple ease',
        said: 'Undone: cue topple ease.',
      });
      expect(yield* read()).toBe(before);
      expect((yield* tool('undo', { film: 'f' })).refused).toBeString();
    }).pipe(Effect.scoped, Effect.provide(fixture)),
  );

  it.effect(
    'an undo asked for one change steps only that one: another standing on top is refused, the file untouched',
    () =>
      Effect.gen(function* () {
        const { tool } = yield* agent;
        const cue = (patch: Record<string, number | string>) =>
          Effect.flatMap(
            tool('tweak', { film: 'f', scene: 'hand', cue: 'topple', ...patch }),
            (a) => Schema.decodeUnknownEffect(LabWrite)(a),
          );
        // Each write answers the change it made, by an id no other change has.
        const first = yield* cue({ ease: 'inQuad' });
        const middle = yield* read();
        const second = yield* cue({ offset: 0.4 });
        const last = yield* read();
        expect(first.change).toBeString();
        expect(second.change).not.toBe(first.change);
        // The older change's undo: refused, naming the change on top; nothing written.
        const older = yield* tool('undo', { film: 'f', change: first.change ?? '' });
        expect(older.refused).toContain('cue topple offset');
        expect(yield* read()).toBe(last);
        // Its own change on top: put back.
        expect(yield* tool('undo', { film: 'f', change: second.change ?? '' })).toMatchObject({
          change: second.change,
        });
        expect(yield* read()).toBe(middle);
      }).pipe(Effect.scoped, Effect.provide(fixture)),
  );

  it.effect(
    'a cue that lands but does not resolve says why, instead of leaving it out silently',
    () =>
      Effect.gen(function* () {
        const { tool } = yield* agent;
        const written = yield* Schema.decodeUnknownEffect(LabWrite)(
          yield* tool('tweak', { film: 'f', scene: 'hand', cue: 'topple', offset: 0.4 }),
        );
        expect(written.span).toEqual({ mark: 'earns', offset: 0.4, dur: 1.8 });
        expect(written.resolved).toBeUndefined();
        expect(written.unresolved).toContain('FilmModuleInvalid');
        expect(written.unresolved).toContain('broken for the test');
      }).pipe(Effect.scoped, Effect.provide(fixtureWith(brokenRepo))),
  );
});
