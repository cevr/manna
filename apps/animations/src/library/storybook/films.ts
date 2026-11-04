import { cardWords } from '@manna/film/canvas';
import { layout, type Placed, Timings } from '@manna/film/core';
import { castFolder, FilmFolder } from '@manna/film/tools';
import { Effect, FileSystem, Option, Path, Result, Schema } from 'effect';
import { inItsOrder } from '../../films/in-its-order/storybook/index.ts';
import { APP, StorybookFailed } from './render.ts';
import {
  cardCue,
  castOf,
  shotCue,
  shotOf,
  type StoryFilm,
  type StoryScene,
  timelineOf,
} from './scene.ts';
import type { Shot } from './shot.ts';
import { type Cast, readRecord, sheetDir } from './store.ts';

/** The films drawn in storybook shots, by name. */
export const FILMS: ReadonlyMap<string, StoryFilm> = new Map([[inItsOrder.film, inItsOrder]]);

/** A film by name, or why not. */
export const filmNamed = (name: string) =>
  Effect.fromOption(Option.fromUndefinedOr(FILMS.get(name)), () =>
    StorybookFailed.make({
      reason: `no film ${name} is drawn in storybook shots (${[...FILMS.keys()].join(', ')})`,
    }),
  );

/** A film's scenes laid out on its narration as the film lays them (`layout`, at its fps). */
export const placedOf = Effect.fn('Storybook.placedOf')(function* (film: StoryFilm) {
  const fs = yield* FileSystem.FileSystem;
  const timings = yield* Schema.decodeEffect(Schema.fromJsonString(Timings))(
    yield* fs.readFileString(film.timings),
  );
  const placed = layout(film.scenes, timings, film.grid.fps);
  if (Result.isFailure(placed))
    return yield* StorybookFailed.make({ reason: `${film.film}: ${placed.failure.message}` });
  return placed.success;
});

/** Where a laid-out scene's named cue lies, in scene seconds; nowhere (0 to 0) for a cue it lacks, which `missingCues` names first. */
const cueIn = (p: Placed) => (name: string) => {
  const c = p.cues.get(name);
  return { start: c?.start ?? 0, end: c?.end ?? 0 };
};

/** Each cue a storybook scene declares that its laid-out scene lacks. */
const missingCues = (p: Placed, story: StoryScene): ReadonlyArray<string> =>
  Object.keys(timelineOf(story)).filter((name) => !p.cues.has(name));

/** One storybook shot of a film as laid out: its scene, the scene's placement, and the shot. */
export interface PlacedShot {
  readonly scene: Placed;
  readonly shot: Shot;
}

/** Every storybook shot of a film in film order, each made from its scene's cues as laid out. */
export const shotsOf = Effect.fn('Storybook.filmShots')(function* (film: StoryFilm) {
  const placed = yield* placedOf(film);
  return yield* Effect.forEach(film.stories, (story) =>
    Effect.gen(function* () {
      const p = placed.find((q) => q.spec.id === story.scene);
      if (!p)
        return yield* StorybookFailed.make({ reason: `${film.film} has no scene ${story.scene}` });
      const missing = missingCues(p, story);
      if (missing.length > 0)
        return yield* StorybookFailed.make({
          reason: `${film.film}'s scene ${story.scene} lays out no cue ${missing.join(', ')}`,
        });
      return story.shots.map((s): PlacedShot => ({
        scene: p,
        shot: shotOf(story, s, cueIn(p), film.grid),
      }));
    }),
  ).pipe(Effect.map((all) => all.flat()));
});

/** A film's shot by id, or why not. */
export const filmShot = Effect.fn('Storybook.filmShot')(function* (film: StoryFilm, id: string) {
  const shots = yield* shotsOf(film);
  return yield* Effect.fromOption(Option.fromUndefinedOr(shots.find((s) => s.shot.id === id)), () =>
    StorybookFailed.make({
      reason: `${film.film} has no storybook shot ${id} (${shots.map((s) => s.shot.id).join(', ')})`,
    }),
  );
});

/** The app's films, as `castFolder` reads a film's own roles: provided once where a command runs. */
export const filmFolder = FilmFolder.layer(`${APP}/src/films`);

/** A film's cast: each member its sheets name, in the film's own `cast/` first, then the library's (`castFolder`). */
export const filmCast = Effect.fn('Storybook.filmCast')(function* (film: StoryFilm) {
  const path = yield* Path.Path;
  const members = [...new Set(film.sheets.map((s) => s.member))];
  const dirs = yield* Effect.forEach(members, (m) =>
    castFolder(film.film, m).pipe(Effect.map((folder) => [m, path.dirname(folder)] as const)),
  );
  const byMember = new Map(dirs);
  return {
    dirOf: (member: string) => byMember.get(member) ?? `${APP}/src/library/cast/${member}`,
  } satisfies Cast;
});

/** The JSON `storybook shots` writes: the film's layout, its storybook shots and cards in film seconds, and its sheets. */
export const ShotsJson = Schema.fromJsonString(
  Schema.Struct({
    film: Schema.String,
    fps: Schema.Finite,
    width: Schema.Finite,
    height: Schema.Finite,
    scenes: Schema.Array(
      Schema.Struct({
        id: Schema.String,
        start: Schema.Finite,
        dur: Schema.Finite,
        speechStart: Schema.Finite,
      }),
    ),
    shots: Schema.Array(
      Schema.Struct({
        id: Schema.String,
        scene: Schema.String,
        from: Schema.Finite,
        to: Schema.Finite,
        figures: Schema.Array(
          Schema.Struct({ name: Schema.String, member: Schema.String, sheet: Schema.String }),
        ),
        overlays: Schema.Array(
          Schema.Struct({
            x: Schema.Finite,
            y: Schema.Finite,
            width: Schema.Finite,
            height: Schema.Finite,
          }),
        ),
      }),
    ),
    cards: Schema.Array(
      Schema.Struct({
        scene: Schema.String,
        cue: Schema.String,
        from: Schema.Finite,
        to: Schema.Finite,
        payoff: Schema.String,
        words: Schema.Array(Schema.Struct({ text: Schema.String, at: Schema.Finite })),
      }),
    ),
    sheets: Schema.Array(
      Schema.Struct({
        member: Schema.String,
        id: Schema.String,
        dir: Schema.String,
        keys: Schema.Array(Schema.String),
        kept: Schema.Boolean,
      }),
    ),
  }),
  { space: 2 },
);

/** A film's storybook shots, cards and sheets as `storybook shots` writes them, and each sheet the owner has not kept (`<member>/<sheet>`). */
export const shotsJsonOf = Effect.fn('Storybook.shotsJson')(function* (film: StoryFilm) {
  const path = yield* Path.Path;
  const placed = yield* placedOf(film);
  const shots = yield* shotsOf(film);
  const cast = yield* filmCast(film);
  const cards = yield* Effect.forEach(film.stories, (story) =>
    Effect.gen(function* () {
      const p = placed.find((q) => q.spec.id === story.scene);
      if (!p) return [];
      return yield* Effect.forEach(story.cards, (c, i) =>
        Effect.gen(function* () {
          const cue = cardCue(story.scene, i);
          const span = cueIn(p)(cue);
          const words = cardWords(story.scene, p.voice, p.speechStart, {
            from: c.from,
            payoff: c.payoff,
            ...Option.match(Option.fromUndefinedOr(c.to), {
              onNone: () => ({}),
              onSome: (to) => ({ to }),
            }),
          });
          if (Result.isFailure(words))
            return yield* StorybookFailed.make({ reason: `${cue}: ${words.failure}` });
          const payoff = words.success.find((w) => w.payoff)?.text ?? c.payoff;
          return {
            scene: story.scene,
            cue,
            from: p.start + span.start,
            to: p.start + span.end,
            payoff,
            words: words.success.map((w) => ({ text: w.text, at: p.start + w.at })),
          };
        }),
      );
    }),
  ).pipe(Effect.map((all) => all.flat()));
  const sheets = yield* Effect.forEach(film.sheets, (s) =>
    readRecord(cast, s.member, s.id).pipe(
      Effect.map((r) => Option.isSome(Option.fromUndefinedOr(r.kept))),
      Effect.orElseSucceed(() => false),
      Effect.map((kept) => ({
        member: s.member,
        id: s.id,
        dir: path.relative(APP, sheetDir(cast, s.member, s.id)),
        keys: [...s.keys],
        kept,
      })),
    ),
  );
  const json = yield* Schema.encodeEffect(ShotsJson)({
    film: film.film,
    fps: film.grid.fps,
    width: film.grid.size.width,
    height: film.grid.size.height,
    scenes: placed.map((p) => ({
      id: p.spec.id,
      start: p.start,
      dur: p.dur,
      speechStart: p.speechStart,
    })),
    shots: shots.map(({ scene, shot }) => {
      const story = film.stories.find((s) => s.scene === scene.spec.id);
      const span = cueIn(scene)(shotCue(shot.id));
      return {
        id: shot.id,
        scene: scene.spec.id,
        from: scene.start + span.start,
        to: scene.start + span.end,
        figures: castOf(shot),
        overlays: (story?.over ?? [])
          .filter((o) => o.shot === shot.id)
          .map(({ box }) => ({ x: box.x, y: box.y, width: box.w, height: box.h })),
      };
    }),
    cards,
    sheets,
  });
  return {
    json,
    unkept: sheets.filter((s) => !s.kept).map((s) => `${s.member}/${s.id}`),
  };
});
