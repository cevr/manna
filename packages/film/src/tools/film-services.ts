import * as BunCrypto from '@effect/platform-bun/BunCrypto';

import { AskMaterials } from './ask-materials.ts';
import { AskStore } from './ask-store.ts';
import * as BunHttpPlatform from '@effect/platform-bun/BunHttpPlatform';
import * as BunServices from '@effect/platform-bun/BunServices';
import {
  ConfigProvider,
  Context,
  Duration,
  Effect,
  type FileSystem,
  Layer,
  Match,
  Option,
  type Path,
} from 'effect';
import { FetchHttpClient } from 'effect/http';
import {
  localLink,
  type BesideRoutes,
  type LabAt,
  boundUrl,
  labServer,
  serveLab,
} from './api-server.ts';
import { Browser } from './browser.ts';
import { RenderCatalogue } from './catalogue.ts';
import { Choices } from './choices.ts';
import { Composer } from './composer.ts';
import { ContentStore } from './content-store.ts';
import { Easel } from './easel.ts';
import type { ElevenLabs } from './elevenlabs.ts';
import { FilmRepo } from './film-repo.ts';
import { FootageLibrary } from './footage.ts';
import { FootageMedia } from './footage-media.ts';
import { FreshFilm } from './fresh-film.ts';
import { FilmTimelines } from './film-timeline.ts';
import type { LabLinks } from '../core/lab-events.ts';
import { labHandler } from './lab.ts';
import { LabEvents } from './lab-events.ts';
import { LabAddress } from './lab-command.ts';
import { type LabMcpNeeds, labMcp } from './lab-mcp.ts';
import { McpEvents } from './mcp-events.ts';
import { LabPage, type LabPageSpec, PageBundler } from './lab-page.ts';
import { Earshot } from './earshot.ts';
import { SoundLibrary } from './library.ts';
import { SoundRender } from './sound-render.ts';
import { Media } from './media.ts';
import { Mixer } from './mixer.ts';
import { Narrator } from './narrator.ts';
import { NotesStore } from './notes-store.ts';
import { ProductionStore } from './production-store.ts';
import { BeatEdits } from './beat-edits.ts';
import { BoardStore } from './board-store.ts';
import { PageRenderer } from './page-render.ts';
import { PrivateStore } from './private-store.ts';
import { scenesLocatedHere } from './read-cli.ts';
import { Review, type ReviewRoot } from './review.ts';
import { SceneSources } from './scene-sources.ts';
import { SceneWriter } from './scene-writer.ts';
import { SourceWriter } from './source-writer.ts';
import { Stamps } from './stamp.ts';
import { StudioReadings } from './studio.ts';
import { ScriptVoices } from './script-voice.ts';
import { SeriesDrafts } from './series-drafts.ts';
import { StagingCache } from './staging.ts';
import { Takes } from './takes.ts';

interface FilmServicesSpec {
  readonly films: string;
  readonly sounds: string;
  readonly footage: string;
  readonly folders: { readonly out: string; readonly lab: string; readonly productions: string };
  readonly self: ReadonlyArray<string>;
  readonly roots: Effect.Effect<
    ReadonlyArray<ReviewRoot>,
    never,
    FileSystem.FileSystem | Path.Path
  >;
  readonly elevenLabs: Layer.Layer<ElevenLabs, never, FilmRepo | Media | BunServices.BunServices>;
  readonly privateStore: Option.Option<
    Layer.Layer<PrivateStore, never, FileSystem.FileSystem | Path.Path>
  >;
  readonly staging: Option.Option<string>;
  readonly series: Option.Option<string>;
}

export const filmServices = (spec: FilmServicesSpec) => {
  const Platform = Layer.merge(BunServices.layer, BunCrypto.layerMac);
  const Folders = ConfigProvider.layerAdd(
    ConfigProvider.fromUnknown({
      FILMS_OUT: spec.folders.out,
      FILMS_LAB: spec.folders.lab,
      FILMS_PRODUCTIONS: spec.folders.productions,
    }),
  );
  const Store = ContentStore.layer.pipe(Layer.provide(Platform));
  const Render = SoundRender.layer;
  const Repo = FilmRepo.layer(spec.films, Option.some(spec.sounds), Option.some(spec.footage)).pipe(
    Layer.provide([Store, Platform]),
  );
  const Tools = spec.elevenLabs.pipe(
    Layer.provideMerge(Media.layer),
    Layer.provide([Repo, Platform]),
  );
  const Staging = Option.match(spec.staging, {
    onNone: () => StagingCache.fromConfig,
    onSome: (dir) => StagingCache.layer(dir),
  }).pipe(Layer.provide([Store, Platform]));
  const Notes = NotesStore.layer.pipe(Layer.provide([Store, Platform]));
  const Productions = ProductionStore.layer.pipe(Layer.provide([Store, Platform]));
  const Board = BoardStore.layer.pipe(Layer.provide([Store, Repo, Platform]));
  const Fresh = FreshFilm.layer(spec.self).pipe(Layer.provide(Platform));
  const Source = Layer.mergeAll(
    SceneWriter.layer.pipe(Layer.provideMerge(SceneSources.layer)),
    Stamps.layer.pipe(Layer.provide(scenesLocatedHere)),
  ).pipe(Layer.provideMerge(SourceWriter.layer), Layer.provide([Repo, Store, Fresh, Platform]));
  const Catalogue = RenderCatalogue.layer.pipe(Layer.provide([Store, Platform]));
  const Private = Option.match(spec.privateStore, {
    onNone: () => PrivateStore.layer(spec.sounds).pipe(Layer.provide(FetchHttpClient.layer)),
    onSome: (given) => given,
  }).pipe(Layer.provide(Platform));
  const Library = SoundLibrary.layer(spec.sounds).pipe(
    Layer.provide([
      Store,
      Tools,
      Private,
      Render,
      Earshot.layer.pipe(Layer.provide(Platform)),
      Platform,
    ]),
  );
  const Footage = FootageLibrary.layer(spec.footage).pipe(
    Layer.provide(FootageMedia.layer.pipe(Layer.provide([Tools, Platform]))),
    Layer.provide([Store, Tools, Private, Platform]),
  );
  const Reviewed = Review.layerConfig(spec.roots).pipe(
    Layer.provideMerge(BunHttpPlatform.layer),
    Layer.provide([Tools, Catalogue, Platform]),
  );
  const Drafts = SeriesDrafts.layer(spec.series).pipe(Layer.provide([Store, Platform]));
  const Asks = AskStore.layer.pipe(Layer.provide(AskMaterials.layer));
  const Timelines = FilmTimelines.layer.pipe(Layer.provide(Asks));
  const Edits = BeatEdits.layer.pipe(Layer.provideMerge(Timelines));
  return Layer.mergeAll(ScriptVoices.layer, Asks, Edits).pipe(
    Layer.provideMerge(Layer.mergeAll(Choices.layer, StudioReadings.layer, Drafts)),
    Layer.provideMerge(
      Layer.mergeAll(Narrator.layer, Takes.layer, Composer.layer, Mixer.layer).pipe(
        Layer.provideMerge(
          Layer.mergeAll(
            Repo,
            Notes,
            Productions,
            Board,
            Source,
            Library,
            Footage,
            Private,
            Store,
            Staging,
            Tools,
            Reviewed,
            Catalogue,
            Fresh,
            Render,
            Platform,
          ),
        ),
      ),
    ),
    Layer.provideMerge(Folders),
  );
};

export const labPages = (spec: LabPageSpec) =>
  Easel.layer.pipe(
    Layer.provideMerge(LabPage.layer(spec)),
    Layer.provide(Layer.mergeAll(PageBundler.layer, PageRenderer.layer, Browser.layer)),
  );

const FEED_EVERY = Duration.seconds(2);

const mcpRoutes = Effect.fn('film.lab.mcp')(function* (links: LabLinks, beside: BesideRoutes) {
  const events = yield* Layer.build(LabEvents.layer({ links, every: FEED_EVERY }));
  const services = yield* Effect.context<LabMcpNeeds>();
  const subscriptions = yield* Layer.build(
    McpEvents.layer.pipe(Layer.provide(Layer.succeedContext(Context.merge(services, events)))),
  );
  return Layer.merge(
    beside,
    labMcp.pipe(
      Layer.provide(
        Layer.succeedContext(
          Context.add(
            Context.merge(Context.merge(services, events), subscriptions),
            LabAddress,
            links,
          ),
        ),
      ),
    ),
  );
});

const phoneListener = Effect.fn('film.lab.phone')(function* (phone: Option.Option<URL>) {
  if (Option.isNone(phone)) return Option.none();
  const url = phone.value;
  const unbound = (reason: string) =>
    Effect.as(
      Effect.logWarning(`lab.phone.unbound url=${url.href} reason="${reason}"`),
      Option.none(),
    );
  if (url.protocol !== 'http:') return yield* unbound('the lab serves plain http only');
  const at = { hostname: url.hostname.replace(/^\[|\]$/g, ''), port: Number(url.port || 80) };
  return yield* Layer.build(labServer(at)).pipe(
    Effect.flatMap((server) =>
      Effect.map(boundUrl.pipe(Effect.provideContext(server)), (link) =>
        Option.some({ server, link }),
      ),
    ),
    Effect.catch((error) => unbound(error.message)),
  );
});

export const startLab = Effect.fn('film.lab.start')(function* (
  at: LabAt,
  phone: Option.Option<URL> = Option.none(),
  beside: BesideRoutes = Layer.empty,
  mcp: 'mcp' | 'no mcp' = 'no mcp',
) {
  const server = yield* Layer.build(labServer(at));
  const bound = yield* boundUrl.pipe(Effect.provideContext(server));
  const reached = yield* phoneListener(phone);
  const links: LabLinks = {
    local: localLink(bound),
    ...Option.match(reached, { onNone: () => ({}), onSome: (p) => ({ phone: p.link }) }),
  };
  const routes = yield* Match.value(mcp).pipe(
    Match.when('no mcp', () => Effect.succeed(beside)),
    Match.orElse(() => mcpRoutes(links, beside)),
  );
  const handler = yield* labHandler(routes);
  const url = yield* serveLab(handler).pipe(Effect.provideContext(server));
  for (const listener of Option.toArray(reached))
    yield* serveLab(handler).pipe(Effect.provideContext(listener.server));
  yield* (yield* Easel).serve(url);
  return links;
});
