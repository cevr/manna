import type { Layer } from 'effect';
import type { ChoicesNeeds } from './choices.ts';
import type { FilmRepo } from './film-repo.ts';
import type { LabContext } from './lab.ts';
import type { SoundLibrary } from './library.ts';
import type { Mixer } from './mixer.ts';
import type { SceneSources } from './scene-sources.ts';
import type { SceneWriter } from './scene-writer.ts';

/** The services that import a film's modules or the app's `sounds/library.ts` in their own process. */
type Loader = FilmRepo | SoundLibrary | Mixer;

/** `true` when `Context` holds no loader; otherwise the loaders it holds. */
type LoadsNothing<Context> = [Extract<Context, Loader>] extends [never]
  ? true
  : Extract<Context, Loader>;

/** What a layer is built on. */
type LayerNeeds<L> = L extends Layer.Layer<infer _Out, infer _E, infer In> ? In : never;

export const choicesLoadNothing: LoadsNothing<ChoicesNeeds> = true;

export const labLoadsNothing: LoadsNothing<LabContext> = true;

export const sceneWriterLoadsNothing: LoadsNothing<LayerNeeds<typeof SceneWriter.layer>> = true;

export const sceneSourcesLoadNothing: LoadsNothing<LayerNeeds<typeof SceneSources.layer>> = true;
