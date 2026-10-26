# @manna/film

The engine behind the cut-paper explainer films in `apps/animations`: a film
is an ordered list of narrated scenes, laid end to end on a clock set by the
recorded words, and every frame is a pure function of that film and a time.

## Entry points

| Import                     | What it holds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@manna/film/core`         | The clock: easing and `progress` (`time`), seeded noise (`random`), `{mark}` narration timing, named cues (`timeline`), the sound plan, scene `layout`, a person's takes (`recording`, `align`, the reading `sheet`, the studio's wire `studio`), and the mix: `mixPlan` (what plays where) and `renderMix` over planar PCM (`audio`, `dsp`: the ffmpeg filters it replaced, ported), and the synth (`synth/`: a code sound is a graph of nodes, `synth/graph/nodes.ts` `CodeSound`, that `renderCode(sound, seed)` renders to the same samples on every host with its own transcendental maths, `synth/graph/math.ts`; `synth/graph/presets.ts` holds the families the app's code sounds are built from, the tones (`room`, `chime`, `drone`, `drain`, `bloom`, `notes`) and the shapes (`burst`, `thump`, `knock`, `scatter`, `whoosh`, `hiss`, `sizzle`, `breeze`, `rain`); `loudness` is an ITU-R BS.1770-4 meter, integrated, momentary max and peak; `sheet` draws a sound's spectrogram, waveform and loudness as one picture; `compare` sets a sound's numbers beside another's), the audit of which generated sounds code can make (`sfx-audit`), and the sound library's pure half (`sfx`: `family.thing` names, generated (each with its `why` and an optional code trial), code and recorded declarations, the lock's variants and the request hash that says a sound is current, which variant each placement plays and its seeded jitter, levels in dB relative to the voice). The entry names only what films, their kits, the app's sound library and tests import (the clock, `hash2`/`rng`, `defineScript` and the film schemas, `defineLibrary` and the sound families, `defineStore`); the framework reads every other module by its path.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `@manna/film/canvas`       | The Canvas 2D draw kit (ink, cutout, paper by meaning (`piece`: a figure cut and outlined, its line crawling, scenery torn with no ink and held still; `stroke`'s `boil`: tick, crawl or none), the `ground` contact shadow, paper fibre fixed to the backdrop plane (`planeFibre`), paper under a faint film grain, type, the one floating mitten hand with no arm (`hand.ts`: `floatingHand(ctx, root, { to, reach, grip }, style, hand)`, at rest beside its figure bobbing with the breath (`breathOf`), travelling toward its target on a soft arc about the shoulder, eased, with a settle, its grip forming from the open rest as it arrives; a hand at work that changes grip names the grip it `was` and morphs into the new one by `change`, point for point, never swapping in a frame (`handShape` its outline, for tests); `handAt` where it is, pure and allocation-free; `closeHand` the same hand close up, an open hand held out palm up seen from above, the palm the biggest shape, its middle on the origin, whose round finger block bends up toward the eye and back over the palm to cup (`closeShape` its outline at any `open`, continuous), with a lifeline and two soft joint lines; `CLOSE_SPAN` its length, no forearm; a gesture's `turn` turns its mitten palm up into the same shape at the mitten's size (`palmUpFrame`), so a push from the figure's hand into the close-up is one shape at two scales), figure, multiplane camera; every drawn scene breathes once by `DRIFT` (a scene's own `drawing({ drift })` in its place, `0` held still): through its outermost `camera` or `multiplane` when it frames one (a shot's `drift` is its share, `0` held still, `driftHeld`), as the outermost transform over its whole draw when it frames none, `shotPath`/`lerpCamera` shots (a deep push by `pushInto`, its target held in frame), `inset` for a picture in picture whose shots never take the scene's breath and `knobCamera` framings from knobs, storyboard), `createFilm`, which composites any `T` (a scene's full-screen cards, `drawing({ cards })` and `SceneSpec.cards`, more than one where a scene needs them, each the whole frame over its own cue on the film's paper, hard cut in, no caption over it; two whose cues hold at one instant stop the film and refuse the edit that would make them, `CardsOverlap`; the card that holds to the scene's end leaves as the card into a transition; a card's `flood` grows from the `Box` the scene's draw returns on the same frame (`floodBox`), within the look's own edge where its `mask` paints one, and a flood inside a transition stops the film and refuses the edit that would move it there, `FloodInTransition`), the card kit (`fullCard` with `CardStyle` and the take's `CardWord`s, `verse` with `Verse` and `VerseStyle`, whose `pad` joins a line's highlight into one bar, a phrase not in its verse stopping the frame; `TextStyle`; `floodBox`, where a flood stands at its eased progress), `glCanvas` (a WebGL 2 canvas for a look drawn in 3D: kept per key, a page-wide namespace a look names for its film, remade when its context is lost, 8 contexts kept live on the page, the keys' and the webgl2 rigs' together, so a frame asks for at most 8 and a look composites a canvas before asking for another key or size; none where WebGL 2 cannot be made, the look's fallback drawn), and the text probe (`probe.ts`) `film check` reads. The entry names only what films, their kits and their tests use, the credits roll (`creditRoll`), `glow`, `sky`, `wash`, `mix`, `clearOf`, `ramp` (a base colour's shade and light under a key light, CRAFT 12 as one function: the shade darker and turned toward the light's complement, the light lighter and leaning to the light's hue, neither ever grey; a look tunes it by its `Shading` knobs, a near-neutral's turn among them, and reads the result as a `Ramp`; `ramp` refuses knobs under CRAFT 12's floors, a chroma of 6 and a 10° turn, so no tuning shades grey), the `Hex` a colour is written as (a palette `satisfies Record<string, Hex>`, `Light`'s colours) and `reset` among them; the engine's own parts (`handShape`, `closeShape`, `palmUpFrame`, `lerpCamera`, `planeFibre`, the paper's sheets) are exported from their files for the framework and its tests. |
| `@manna/film/render`       | `mountRender(films)` (`player/render.ts`, the encoder's one importer; no other lab page loads mediabunny): the render page (a film's export page: the lab's `/films/<film>/export`, the PreviewServer's `/?film=<film>&export`), whose handle (`ExportHandle`, on `window.__film`) a renderer and the easel drive. Its own entry, never re-exported by `player`: every page imports its films through `player`, so a studio page built beside the render page would load the encoder too (`tools/page-graph.slow.test.ts`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `@manna/film/player`       | In `main.ts` the film a page stages (`stageFilm`), its canvas drawn once the faces its film draws in have loaded (its loader asks for them and gives the film without waiting, `narratedFilms`; the stills and the render handle wait, `pictureFacesWait`; the engine names no family), the one source of stills (`stills.ts`: drawn a frame apart, the last asked for first, none when a face the film draws in will not load, its `ready` and waiting `all` then rejecting; the look-book sheet draws through it), and the look-book sheet `film lookbook` writes (`lookbook-sheet.ts`), set in the film's own type (its shorts' hook and caption families). Framework-free, so the renderer's page never loads Solid. `player.css` styles it and the lab, over the studio's tokens (`tokens.css`, `@manna/film/tokens.css`). The entry exports only `narratedFilms`, the `Narrated` type, and the films’ faces (`pictureFaces`, `Face`, `SUBSETS`); the lab reaches the rest of `main.ts` by path. `src/exports.slow.test.ts` guards this entry, `render`, `canvas`, `stand-in`, `core`, `@manna/film/style` and `@manna/film/style/build`: each names its exports, and each name has a user; and every module under `core/`, `lab/`, `tools/`, `canvas/`, `player/`, `browser/`, `command/`, `style/` and `lint/` exports only names another file imports (read by the parser, so a comment hides nothing; a `.types.ts` check, a fixture film and a lint fixture are not swept).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `@manna/film/ask`          | `mountAsk` (`lab/ask/mount.tsx`): the ask page (`/asks/<ask>`, `/asks/page/<page>`), the owner's guided review, hydrating what `@manna/film/ask-server` rendered, mounted as every lab page is (`mountStudio`, `lab/page-client.tsx`) under the shell (`lab/page-shell.tsx`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `@manna/film/ask-server`   | `askRender`, the ask page's server entry (the default export of an app's `ask.server.tsx`, `lab/ask/server.tsx`): the page of asks rendered for one request, each read through the render's own reads, and sent with the page.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `@manna/film/solid-plugin` | The Bun plugin that compiles `.tsx` with Solid's compiler (`@solidjs/compiler`): the lab's pages (`LabPage`: `solidPlugin` for each browser bundle, `solidPluginFor('ssr')` for each server entry) and the lab's browser tests bundle with it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `@manna/film/stand-in`     | The one stand-in 2D context for tests (bun has no canvas): `recorder` holds a canvas's drawing state from a canvas's defaults, saved and restored whole (the transform, which `setTransform` takes as six numbers, a matrix or nothing; an alpha kept within 0..1; the shadow, font, line width and every other property set), records each fill and image, answers a pixel read with the last hex fill over it (so a face's opacity read takes the canvas's branch and `cutout` draws pre-blended faces as a render does), and with `onCall` tells a test of every call and property set (how `check --draw`'s leg, `tools/draw-check.ts`, logs a frame to check it is pure); with `measure` it sets text with a test's own advances in the context's font; each canvas it makes carries its number (`isStandInCanvas`, `made`); `withDom`/`standInDom` put up a document whose canvases are stand-ins; it refuses what a real canvas refuses (a negative radius, a colour stop off 0..1, a stop colour made of NaN or undefined, a non-finite gradient coordinate). The framework's canvas tests and `check --draw` draw into it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `@manna/film/rive`         | A Rive rig as a drawing declares it (`RivePropSpec`, `RiveEngine`, `PoseOf`; its `ink`, how it follows the shot, sets the number `INK_NUMBER` from the shot's scale) and the draw that poses it from rest (`drawRig`, `canvas/rive.ts`); its loader, `RiveRuntime` service and host layers are `src/rive/` (see Rive).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `@manna/film/style`        | The house look as a scene reads it: a face acted from `EASE` toward an `Expression` (`acted`), the paper's boil (`boilTime`), a hand reached about a point (`reachAbout`), an arm's hand at its sleeve's end at a turn of the arm (`armHand`), a jointed arm's turns that reach its hand to a point, its elbow kept on the side its hand hangs from (`armReach`), `smooth`, and the house's key light and shading knobs (`keyLight`, `shading`: K1), which a film ramps its own papers under (`rampedPaper`). A film's papers are checked as its module loads (`papers`), each rimmed as its concept lays it (the house's `RIM`, or a width of its own) or not at all; a film's canvas people and page read the house's two papers (`peoplePaper`, `parchment`). A figure is composed of parts (`figure`, its parts' kinds from `src/style/parts/`: an arm that swings whole behind its garment, `Arm`, or one bent at its elbow on it, `JointedArm`; trousers with a shoe under each leg, `Trousers`; a traced head whose chin meets its garment by a shade step and no line, `chin: 'open'`, its line drawn just behind the garment), cut from the house's outlines (`ellipse`, `roundedPolygon`, `shifted`), each checked under the house's rules (`src/style/rules.ts`) as it is made; one the owner locked carries its lock (`src/style/lock.ts`). A set creases its pieces under the same light (`boxOf`, `creaseOf`; a turn's `Crease`). A film lays its figures in one file (`figuresFile`, `src/style/figures-file.ts`): each artboard its name, its boil's seed and its place on the stage, drawing a composed figure, with the artboard its hands are drawn on, or a circle hand at its size (`HAND_ART` times it); a name laid twice, a figure's hands laid on a hand of another paper, or a figure `figure` did not return (a copy of one with a part changed, its parts never checked) is refused as the module loads, and the house draws no such figure. The house prints the file in its line at the file's weight (`figuresRml`: `src/style/rig/draw.ts` `drawFigure` and `drawHand`, in `DIRECTION`: K1, A3 in B1), each locked figure's print alone (`lockedPrints`), and every override its figures carry, whatever rule it frees, by the artboard it is laid on (`figureOverrides`, found by `src/style/override.ts` `overridesIn`), each saying what it cites, the owner's words or his pick on an ask (`citedBy`). Every ink stroke of a figure and its hands (the silhouette, each piece's line, and the face's brows and mouth line) binds its width to the artboard's number `ink` through a range mapper, 1 the line as cut, 0.75 three quarters of the ink that shows past its paper and light core; the file's rigs follow the shot (`shot`, spread into each spec), the line thinning from a head a fifth of the frame's height to 0.75 at three tenths (`src/style/house.ts` `CLOSE_SHOT`, `inkAt`); a file that bakes its ink (`baked`, its widths written into the print as cut) binds none and follows no shot. A film writes no RML: the rig (`src/style/rig/`) is the house's alone. Its source is `src/style/` (see Rive).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `@manna/film/style/build`  | `compile`: a figure project compiled by the Rive CLI, offline and unsigned, into its `.riv`, with the CLI's warnings and problems and the stamp of what it was built from; `unbuilt`: why a committed `.riv` is not the build of its rigs, read through that stamp with no CLI; `unlocked`: which locked figures' prints are not the ones their lock files hold, or whose locks name no decision on the production's ledger, and which an override backed by the owner's decision on that figure frees; `unsaid`: which overrides on a film's figures cite a word that is not the owner's on that figure: no decision on his production's ledger filed at the point `item:<item>` (after the lock, for a lock's override) says its quote, verbatim, or filed the pick its answer cites; a question or a note is never his word (see Rive).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `@manna/film/tools`        | The `film` CLI (`runFilmCli`) and its Effect services: FilmFolder and FilmRepo (`film-repo.ts`: a film's paths, and its modules loaded), ContentStore, ElevenLabs, Media (mediabunny + mpg123 + WASM AAC and FLAC + FFmpeg in-process through NodeAV: durations, decode, WAV, a person's recordings loaded and their FLAC masters, joining a film; x264 in-process for a software share copy and the review's phone copies (`x264.ts`), `jpeg.ts` for its stills, `png.ts` for a sound's sheet, and `card`, a picture held over a sound as an MP4), Narrator, Takes (a person's recordings), Composer, Mixer, SoundLibrary (`library.ts`: an app's `sounds/`, its candidates made, kept, rejected, imported, auditioned, checked, its code sounds and trials rendered, compared and clipped for an ask, and its private `files/` synced through the app's private store), SoundRender (`sound-render.ts`: each code sound's seed rendered once and measured once), `MediaStoreService` (`media-store.ts`: the store interface, `put`/`get`/`hashOf`/`list`/`read` with a byte range, and the folder store), `r2-store.ts` (the R2 store, SigV4 in `sigv4.ts` through `HttpClient`), PrivateStore (`private-store.ts`: the store `library.ts` declares, reached with the `FILM_STORE_*` key read as `Config.Redacted`), Browser, Pages (`pages.ts`: the export page pool check, look and render share), PreviewServer, Renderer (`render-plan.ts` is its pure plan), RenderCatalogue (`catalogue.ts`: a film's `catalogue.json`; the domain is `core/catalogue.ts`), Stamps (`stamp.ts`: each scene's content key), `film project` (`project-cli.ts`), Checker (`check.ts` holds its pure detectors), NotesStore, the composition root (`film-services.ts`: `filmServices`, `labPages`, `startLab`, the one graph `runFilmCli` runs on; `film-services.slow.test.ts` sweeps for a second), LabPage (`lab-page.ts`: each page's browser bundle and server entry, `PageBundler`) and PageRenderer (`page-render.ts`: a worker per build, its reads through the lab's own handler, `PageReads`), the lab's routes (`lab.ts`), its studio (`studio.ts`, StudioReadings) and its source editing: SceneSources, SourceWriter (every write, its undo and redo), SceneWriter, and BeatEdits (`beat-edits.ts`: the studio's edits of a script); FreshFilm (`fresh-film.ts`: the film CLI run again in a new process, its answer or refusal read back: options, takes, the project, the check, the studio's reading, a cue, the mix; `film read`, `read-cli.ts`); and the review (`review.ts`, `review-http.ts`): Review, and Choices (`choices.ts`, a film's options: listed, heard, picked, each read in a fresh process through `FreshFilm` and `film options`, `choices-cli.ts`); and the art-direction seeder (`core/art-seed.ts`: `drawBatch` draws looks from an app's `ArtDeck` of `ArtAxis` options by seed, the same seed the same look forever, keeping off incompatible picks and a distance from the existing looks and each other; `artBrief` writes one as a style brief; `conflicts` names the picks of a look that cannot stand together; `apps/animations`' `bun run seed-look`). The picks fill (`fill-picks.ts`: `runFillPicks`, over `ask-store.ts`' `fillPicks`) files the owner's picks onto each ledger decision that names its ask and carries none, from the ask's record in the lab's asks, and leaves one whose record is not there (`apps/animations`' `bun run fill-picks`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Data

`core/schema.ts` holds the Schemas for everything a film reads or writes:
`Timed` scenes, `Beat` (a script's beat: `Timed` plus `cite` and a `picture`
brief), `Voice`, `Timings` (`narration/timings.json`), `Sound`, and
`SoundManifest` (`sound/manifest.json`). The TypeScript types derive from them.
`TimingsJson` and `SoundManifestJson` decode a file's text and encode it back
byte for byte; the request hashes (`voiceKey`, `musicKey`, `requestKey`) are
taken over Schema-encoded requests, so a committed hash stays current.
The export page's handle and what its probe records (`ExportInfo`,
`TextBox`, `InkMark`, `FaceMark`, `HandMark`, `Probed`) are declared beside
the handle in `core/export-handle.ts`; a choice point's id in
`core/point.ts`; an address as data (`Address`, `addressKey` and its inverse
`addressOfKey`) in `core/address-schema.ts`, a leaf both `schema.ts` and
`address.ts` read (`address.ts` re-exports it beside `resolveAddress`). A scene's and a short's
id is one shape, `PartId` (lower case, digits and dashes, starting with a
letter or a digit), and an act's name (`ActName`) never starts with `-`: the
film is refused at load, naming the id, when one names no address, point or
argument. A short's id and an act's name are each declared once (`Shorts`,
`Look`), so `short:<id>` and `act:<name>` each name one part.

## Tools

`film narrate|takes import|script|score|mix|cues|check|render|lookbook|judge|project|chapters|options|read <film>` (and `film doctor`, `film lab` (the lab and the review, every film), `film lab <command>` (the lab's command set, its MCP tools: `notes`, `look`, `match`, `journal` and the rest, `tools/lab-cli.ts`), `film lab events` (the lab's events, a line each, `tools/events-cli.ts`), `film media …` over the private media store, `film sfx …` over the app's sound library, `tools/sfx-cli.ts`, and `film footage …` over its footage library, `tools/footage-cli.ts`, and `film talk words <talk>` over a talk's edit, `tools/talk-cli.ts`, and `film ask wait <ask>` (or `--page <ask>`, every ask on its page), which exits once the owner has answered an ask on the running lab, `tools/ask-cli.ts`) runs from the app that holds the
films. The app owns the entry: it calls `runFilmCli({ films, sounds, footage, folders, previewServer, lab, self, judge })`
with its films folder, its sound library folder, its footage library folder, its own `out` and `lab` folders
(where a run writes renders and notes, whatever directory it starts in; `FILMS_OUT` and
`FILMS_LAB` win when set) and its `productions` folder (the committed ledgers;
`FILMS_PRODUCTIONS` wins when set), a scoped `PreviewServer` layer that serves its
player page, `lab`: where the lab listens (`at`, a `LabAt`), its pages
(`pages`: the app's HTML entries, `pages`, and the server entries of those the
server renders, `servers`) and the roots it reviews; the framework's
server (`labServer`) answers there (see `apps/animations/cli.ts`); and
`judge`, the rule files `film judge` quotes. Logs (`Effect.log`, `event
key=value`) go to stderr, a failed command's report too (logged under the
same logger before the runtime exits, not by `runMain`'s own reporter, which
would print to stdout; a typed failure as its tag and message, a defect with
its stack); stdout carries only what a command prints, so a
failing `check --json` still prints only findings (a film that does not load is its one error finding). The player imports the same folder, so the tools
and the page never read two different films. Paid calls (ElevenLabs speech, music,
effects) go through the `ElevenLabs` service only; `mix`, `cues` and every
`--dry-run` make none. Assets are content-addressed: `ContentStore.ensure`
produces an asset only when its stored hash is stale, and every manifest
update is serialized. At most three paid jobs run at once. Failures are
tagged errors (`ApiKeyMissing`, `EncoderMissing`, ...) in `tools/errors.ts`,
and the refusals a page shows in their own words (`TakeMismatch`, ...) in
`core/refusals.ts`; `film check`'s findings, with their levels and addresses,
are in `tools/findings.ts`. Logs are `Effect.log` lines `event key=value`.
Each `tools/<area>/testing.ts` has the in-memory doubles the tool tests of
that area use (`tools/host/testing.ts`, `tools/media/testing.ts`, ...).

`film sfx` is the app's sound library (`SoundLibrary`, `tools/library.ts`).
`make` is its one paid command: it prints each sound's candidates and
credits (40 a second), fails `PaidUnconfirmed` without `--yes`, and
`CreditsOverCap` when `--cap` is under the credits it would spend plus those
its `--tally` TSV already records; every generation is appended to the tally
as it lands. Candidates are FLAC under the git-ignored `files/<name>/`, named
by their hash, and wait in the lock until `keep` or `reject`; `keep --replace`
keeps them in place of the kept variants, and `unkeep` sends kept variants
back to wait (the lock is only ever written by these commands). `push` copies
each private file the store lacks, or holds with other bytes, reads it back by
hash (`StoreCopyFailed` otherwise), and names every file it sent (`--from
<folder>` sends a file this checkout lacks from an older folder store when its
hash matches the lock: a move between stores); `push` and
`pull` name each lock file they find nowhere (`missing`) rather than fail on
it. `try <name> --prompt/--secs/--influence --count n` is `make` for other
settings than the declaration's (paid, capped and tallied the same): its
candidates wait under their own request, and become keepable when the
declaration is changed to say the same (`TrialInvalid` for settings no
declaration could take). A sound that names no `influence` is made at its
use's default (`DEFAULT_INFLUENCE`: 0.7 for a one-shot, 0.3 for a bed) and
as `DEFAULT_CANDIDATES` (6 one-shots, 3 beds), both measured in the sweet-spot
trials (`apps/animations/sounds/PROMPTING.md`).

A `code` sound is a graph of nodes (`core/synth/graph/nodes.ts`), rendered from each of
its seeds whenever it is needed, through `SoundRender` (`tools/sound-render.ts`):
nothing of it is made, kept, stored or paid for. A film's load resolves its
sounds and renders none; what plays them measures them, once each: the mix,
the check and the options (`measuredFilm`). The library load refuses a
graph that cannot render (`core/synth/resolve.ts` `resolveCode`: a stream
named twice, `StreamDuplicate`; a sample of itself, `SampleCycle`; a sound
too long, `CodeTooLong`). A generated sound says `why` it needs ElevenLabs,
since code makes every simpler sound (the owner's rule), and may carry a code
trial, `code: { sound, variants }`, which no film places. The free
commands read them: `render <name> [--seed n] [--trial] [--sheet]` writes a
code sound's seeds, or a trial's, as WAVs under
`<FILMS_OUT>/sounds`, each with its sheet as a PNG under `--sheet`;
`audition <name> --trial` lines a trial's seeds up; `compare <name>` prints a
trial's numbers beside what plays, and how far each film's placement would
hear the hit move; `audit` reads from each generated sound's prompt whether
code can make it; `ab <name> --out <dir>` writes the clips an ask plays (what
plays now, the trial, and both; only what plays now for a sound with no
trial) as MP4s beside their sheets; `check` hears a
trial bed's seams. The loop they serve, and the bar a trial meets before the
owner hears it, are the film skill's
[sound reference](../../.claude/skills/film/reference/sound.md).

A `recorded` sound is a recording under a licence that may be public, kept
under the committed `public/<name>/`: CC0, or CC BY 3.0 or 4.0. Its
`licence` names the recording's `title`, `author`, `authorUrl` and `source`
page (and its `openverse` id when Openverse found it); a CC BY one must name
all four and say whether the file was `changed` (cut, trimmed, levelled).
`sfx import <file> <name> [--from s --to s]` folds the recording to one
channel at 44.1 kHz and takes the cut it is given (`CutEmpty` for seconds
that hold none of it), or, with no cut, the sound's `secs`: a one-shot's
from a fifth of them before its loudest moment, a bed's at the 2-second
offset whose loop seam is smallest, past its first 2 seconds when the
recording can spare them; no `secs`, the whole recording. A one-shot's quiet
ends are trimmed, a bed's ends kept, and a recording that peaks over
`TAKE_LEVEL.ceiling` (-1 dBFS) is scaled down to it. It records the cut in
the variant (`cut`, clipped to the recording), prints the gain and the share
of power under 30 Hz, filtered by nothing, and keeps the sound's variants made
for another request (a generated sound's takes, once it is recorded) as
candidates: its history, never offered again. A CC BY recording a film places owes a credit line
(`soundCredits(library, sound)`, one a source): `creditRoll` gives each
under a "Sound" head, a whole-film render writes each with its pages linked
into `<video>.description.txt` after the chapters (`videoDescription`), and
`film check` fails a film whose `credits.ts` roll does not give a line it
owes (`SoundCreditMissing`).

A recording's code trial is fitted, never written by hand: `sfx fit <name>
[--size small|full] [--from model.json]` runs earshot (`tools/earshot.ts`
`Earshot`) on its kept variant and writes the model it makes as code
(`core/synth/fit` `fitSound`) into `sounds/fits/<name>.json`, the trial
beside the file and hash it came from, the earshot commit, the size and what
the code leaves out (`SoundFit`). The library reads each fit as its
recording's trial (`codeTrialOf`), so `render --trial`, `compare`, `check`
and `ab` hear it as they hear a generated sound's; a fit for a name that is
not a recording, or code kept from one, is refused (`FitUnmatched`), and a
fit file that does not decode, `FitUnreadable`. A fit the owner keeps is the
entry's code: `library.ts` imports the fit file and declares
`{ kind: 'code', ...keptFit(fit), licence }`, the recording's licence kept
(a CC BY one `changed: true`), so `soundCredits` owes the same line for the
code as for the recording, and the fit file stays its one source. `fit`
refuses a generated or code sound, and code kept from a fit (`FitRefused`):
a generated take stays private. earshot is downloaded code,
so it runs as an external tool, trusted with nothing: pinned at one commit
(`Earshot.pin`), its clone and virtualenv outside the repo (`EARSHOT_HOME`,
else `~/.cache/bible-film/earshot`), its packages wheels only and none of
the describer's, run as `python -I -B` with Hugging Face offline under
macOS's sandbox with no network (`tools/sandbox.ts`, `offline`), reading its
clone, its virtualenv, the interpreter and the recording's folder and
writing only a scratch folder. A clone missing, off the pin or changed fails
`EarshotMissing` with the lines that install it; a run that fails,
`EarshotFailed`. It never runs in CI or the gate. The model it wrote is kept
under `<FILMS_OUT>/sounds/fits/<name>.model.json`, and `--from` translates a
model file in place of running earshot (`FitModelInvalid` when it does not
decode). `small` writes a graph a person can read: modes closer than their
bandwidth merged by their sum, the 16 heard loudest kept (their energy within
the loudness meter's 400 ms block), and the energy each third of an octave
sounded kept, sums and cancellations counted: a strike's kept modes scaled
down where the ones left out cancelled them, and what the left-out modes
carried added to their band as noise; noise bands merged by octave, each
coloured by its slope, their breakpoints thinned with their energy kept.
`full` keeps every part that fits; either merges further until the render's
work fits `MAX_CODE_WORK`. A bed is tilted so its loop seam is level, and a
recording with little rumble under 30 Hz is high-passed there, its lowest
band of noise starting at 30 Hz.

`film footage` is the app's camera footage (`FootageLibrary`,
`tools/footage.ts`, its schema in `core/footage.ts`), shared by its talks.
`import <file> --as <name> [--take]` keeps an original whole under the
git-ignored `files/<name>/<sha12><ext>`, by the hash of its bytes, once it is
probed (`FootageMedia`, `tools/footage-media.ts`: container, codec, displayed
size, rotation, rate and whether it varies, where its picture starts, its
sound) and found one the render can conform: HDR fails `FootageHdr`, naming
the iPhone's setting, and a take with no sound `FootageSilent`; a take whose
sound is lossy imports with `footage.lossy`. Importing the same bytes again
answers the name they have; a name holding other bytes fails
`FootageNameTaken` (a second recording is a second name). Both cameras a talk
is shot on import as they record: an iPhone's HEVC MOV and a Sony ZV-E10's
XAVC S (H.264 MP4, landscape, framed to 9:16 by the talk's `frame` knob).
`make [name…]` derives, under `<FILMS_OUT>/footage/<name>/<sha12>/`, the
mezzanine (H.264 at the original's size, CRF 16, a key frame every second)
and the proxy (1280 on its long side, never larger than the original, CRF 26,
a key frame every half second), each constant-rate at 30, its rotation baked
in, stamped from its first frame, and remade only when its recipe
(`FOOTAGE_RECIPES`, recorded in `stamp.json`) changes; a take's voice
(`voice.flac`, one channel at `MIX_RATE`, levelled by one gain and never
trimmed, laid on the picture's clock, so a frame and the voice at its time
are one moment, whatever the camera's rate: `e2e/tools/av-sync.test.ts`); and,
once per take, its transcript (`ElevenLabs.stt`, the one paid call, run only
when a take has none or `--hear-again` asks): its words, each voiced, and its
loudness every 10 ms in whole dB, under `transcripts/<name>.<sha12>[.n].json`,
committed. A second hearing is a second file, which the lock
(`library.lock.json`) then names; a transcript is never rewritten, and its
name is chosen and its file put in place under the library's lock, so two
`make` runs at once never take one name. Every field of the lock a path is
made of is checked, read and written, so no original, copy or transcript
lands outside the library: a footage name (`--as`, and every key) is a
lower-case slug, a transcript one file under `transcripts/`, an original's
`sha256` 64 lower-case hex digits and its `ext` none or a dot and lower-case
letters and digits. `--as` refuses a name that is not one
(`FootageNameInvalid`), an import a file whose extension is not one
(`FootageExtInvalid`), and a lock that breaks any of them is not read
(`FileInvalid`, so `make`, `pull` and `push` stop before they write) and
never written. A name is found only among the lock's own: `constructor`,
which every object answers to, is unknown until it is imported. The copies
are made frame by frame, not by a mediabunny `Conversion`, so each copy's
content hint reaches x264 (`FOOTAGE_HINTS`), which sets its key-frame
interval itself (`keyint`: node-av clears the key-frame flag mediabunny
asks for). `push` and `pull` keep the originals in the private store under
`footage/<name>/<sha12><ext>`, each read back by its hash; `list` prints the
lock.

A talk is a film cut from a take, not drawn: its folder holds `talk.ts`
(`export const talk = { … } satisfies Talk`, `core/talk.ts`) and no
`scenes/index.ts`. Its `takes` name
takes in the footage library by a key of the talk's own; each of its
`sections` plays words `from`–`to` of one take, but those its `cut` strikes
(`[i, j]`, both ends struck), and is one scene of the film. Its
`format` is `question` (45–65 s, the speaker on screen 40–55% of it) or
`episode` (135–170 s, 20–30%), as `TALK_FORMATS` holds them. `talkCut`, pure
and shared by the page and the tools, derives what the edit plays: each
section's kept words; its pieces of the take's voice, a new one after each
strike and each pause longer than the talk's `gaps` (0.25 s unless it says),
every seam on a frame of `TALK_FPS` (the mezzanine's 30) at the quietest
frame boundary in the silence around it and never inside a kept word's
voice (where that silence holds no boundary, the kept word plays whole and
its piece ends on the frame past it, under a frame of the struck word
faded out, and never past the take's end); the retimed `VoiceTiming` and
`Timed` of each section; and the film's `Timings`. A section that strikes
every word fails `TalkSectionSilent`, a word or a take the transcripts lack
`TalkWordMissing` or `TalkTakeMissing`. `FilmRepo.load` reads a talk's takes'
transcripts through the footage lock, plays the take's derived `voice.flac`,
and lays its sections out as a film's scenes, so `film cues` lists them.
A talk has no narrator (`LoadedFilm.voice` is none): what needs one (`narrate`,
`takes import`, `read voice`, the studio) refuses it with `TalkUnvoiced`.
`film mix` plays each section's voice as its pieces of the take
(`VoicePieces`; a `Take` played `from` a second of its sound for `dur`
seconds, each end faded over `fade`), each faded `CUT_FADE` (5 ms) at its
seams so a cut never clicks, and decodes each voice file once; a drawn
film's takes play whole and key its mix as before.

`film talk words <talk>` prints a talk as its edit plays it (`tools/talk-cli.ts`):
how long it plays against its format's length (under, within or over), then
each section's head (its take, its word range, its length and its pieces),
then its words with their indices, `[33]law`, a struck one `[34]~um~`, so
words are named by what they say; `--take <key>` prints that take's whole
transcript, every word the edit could play. A film that is not a talk fails
`NotATalk`.

A talk's takes come from the footage library by one derivation,
`talkTakes` (`core/talk.ts`): the lock names each take's source
(`<name>/<sha12>`) and its current transcript, and the transcript gives its
words and loudness; a take the lock lacks, a clip, a take not yet heard, a
transcript missing or heard from another source is refused, naming the
`film footage` step that mends it. Each `TalkTake` is the source, its
words, its envelope and its picture's displayed size. The tools read the
lock and transcripts from disk (`FilmRepo.load`); the page reads the same
files over the footage route, and both cut with `talkCut`, so the picture
and the mix play the same pieces (`tools/talk.slow.test.ts` holds every frame of
the page to the moment of the take the mix plays under it). The voice the
mix plays is the take's `voice.flac` under its copies, keyed by its source
and `VOICE_RECIPE`, not by its path.

A talk's page is `canvas/talk.ts`: a `Film` of 1080×1920 at `TALK_FPS`,
built from the talk, its takes and its cut, each section a scene. Each
frame reads the frame of the take its cut names (`footageAt`: the piece of
its section playing, as many frames on from the piece's in-point as the
frame is from the piece's start; a time between frames reads the frame at
or before it, as the mix's voice does), and draws what the host decoded,
cropped 9:16 about the section's `frame` knob (a point in the take's
pixels; the picture's middle unless set) and `zoom` times in from the
largest 9:16 crop the picture holds, kept inside the picture; the lab drags
both. The crop is taken in the decoded picture's own pixels (the proxy's on
the lab, the mezzanine's in a render), so every page frames the same
picture; a frame the host did not decode fails loud. Over it, the hook
(`canvas/vertical.ts`, the same hook a short sets) and the burned captions:
each section's kept words as they are heard, spelt as the talk's `fixes`
spell them, a word inside one of its `quotes` gold (`talkPhrases`), all set
inside every platform's zone (`TALK_LAYOUT`): the hook centred where a
short's is, the captions centred in the room beside TikTok's buttons. The
app's films index lists its talks with `talkFilms` (`player/talks.ts`:
`() => import('./<talk>/talk.ts')`, read with the library's lock and
transcripts), beside its drawn films in `narratedFilms`, so the player, the
render and the checks open a talk as they open a film. A frame of a talk the
player cannot decode stops the film and says why in its place.

`film check <talk>` checks a talk as a vertical film as well as a film: the
static leg holds its length to its format's and reads its first word and
its loop's silence; the full check probes its page every half second and at
each phrase's first frame for text past every platform's zone
(`platforms`), and its open for motion (its footage moving is motion), over
only the seconds `--scene` or `--act` name when given (the open only where
it lies in them). Each finding is the talk's, named `talk "<id>"`: a line of
text or a hook at the film's scene and second, its length or loop of the
whole film; a talk is no short. `--draw` draws the talk as its page builds it
(`createTalk` over its edit, takes and cut, its footage left undrawn).

The words a talk is made in:

- **talk**: a film cut from the speaker's own take, not drawn.
- **take**: one recording of the speaker, kept whole in the footage library; a talk is cut on its transcript.
- **A-roll**: the speaker on camera, the take the talk's voice comes from.
- **B-roll**: footage cut in over the speaker (a clip, in the library's words), the voice running on.
- **paper edit**: the edit made on the words, not the picture: `talk.ts`'s sections and strikes, read with `film talk words`.
- **seam**: where one piece of a take meets the next, on a frame, in a silence.
- **jump cut**: a seam that shows: the same framing on both sides, the speaker jumping.
- **punch-in**: the framing moved closer at a seam, so a jump cut reads as a new shot.
- **cutaway**: a shot of something else laid over a seam, which hides it.
- **mezzanine**: the high-quality constant-rate copy a render reads (`make`'s H.264 at the original's size).
- **proxy**: the small copy the lab plays while editing.
- **conform**: bringing every original to one rate, way up and clock, as the mezzanine does.
- **media pool**: every original a film may draw on: the footage library.

Preflights: `film doctor` checks headless Chrome (a page opened and closed
in Bun.WebView's Chrome: `BUN_CHROME_PATH`, else the Chrome Bun finds, else
Playwright's cached Chromium; `BrowserMissing` names `BUN_CHROME_PATH`; on
macOS the renderer's Chrome runs its GPU, through the GPU launcher, see
"Encoders"), the `elevenlabs` CLI and its
login (`auth status`, free), the H.264 encoder a render would use (a page
chooses it as a render does; the line says `hardware` or `software`, the
default pages and the encoder budget), reports each, and fails if any is
missing. Nothing needs an ffmpeg on the machine: every media file is read and
written in-process (below), and `tools/no-ffmpeg.test.ts` fails on a source
that names `ffmpeg` or `ffprobe` as a command. `narrate`, `takes import` and `score` run the ElevenLabs check before their first paid call,
and the `ElevenLabs` service uses `ELEVENLABS_API_KEY` when the environment
or the Keychain holds one (effects need it) and the CLI's OAuth login
otherwise, one OAuth call at a time (concurrent refreshes race and fail);
and a video `render` asks a page which H.264 encoder it can encode the film's
size with (`EncoderMissing` when none) before it draws a frame.

Media files go through `Media` (`tools/media.ts`, its live layer
`tools/media-bun.ts`, loaded when the layer is built): mediabunny reads and writes
the containers in-process, and MP3 decodes through mpg123 (WASM), gapless, so
a take measures what it plays (`duration`). `join` writes a film: its H.264
segments' packets copied in order (never re-encoded; segments encoded unlike
the first fail), and its track encoded to AAC beside them through
`@mediabunny/aac-encoder` (FFmpeg's encoder built to WASM), one frame of
priming early so the MP4's edit list starts it on the first frame, into a
partial beside the film renamed over it once whole. Every byte
moves through the FileSystem service but the joined film's, which mediabunny's
`FilePathTarget` writes by position on Bun's file system (Effect's file handle
appends under Bun: its `fs.write` passes no offset, and Bun then ignores the
position). Failures are `MediaFailed`. A person's recordings arrive in
whatever format a recorder saves (WAV, FLAC, AIFF, M4A, MP3, at any rate) and
load in-process: `load` decodes any of them to one channel of 32-bit float at
the rate asked for. mediabunny opens the containers; FLAC and AAC decode through FFmpeg's own
decoders in-process (`@mediabunny/server`, NodeAV: Bun has no WebCodecs
audio decoder), an AAC's priming dropped as its edit list says; AIFF, which
mediabunny cannot read, is plain PCM read by `tools/aiff.ts`; the mixdown and
the rate change are libswresample's at its defaults (`tools/resample.ts`,
through NodeAV). `encodeFlac` writes a take as a
24-bit FLAC master through libFLAC (`@mediabunny/flac-encoder`, WASM, in a
worker; float in, one quantisation 144 dB down, no dither needed). A person's
take is the film's final voice, so it is never lossy after the recorder, and
the mix reads it as it reads a staging MP3. Staging takes stay the MP3s
ElevenLabs sends. mediabunny picks the first coder registered that can, so
the AAC and FLAC encoders and x264 (`tools/x264.ts`) register before
`@mediabunny/server`'s FFmpeg ones, which it registers with no hardware
context. Video is converted by mediabunny too: a software render's share
copy (x264, below) and the review's phone copy of a video over 40 MiB or
8 Mbps, drawn 2D renders too (720p at most, x264 at CRF 23, preset medium,
averaging 8 Mbps at most, a key frame every second, on two threads so the
review answers while it encodes: "Phone copies", below) re-encode the
film with its track copied, and a review's still is a
frame mediabunny decodes, scaled by libswscale and written by FFmpeg's MJPEG
encoder (`tools/jpeg.ts`, through NodeAV). A card (`card`) is a picture held over a
sound, the clip an ask plays (`sfx ab`): the picture a frame a second, each
a key frame, through x264 at the phone copy's settings, the last frame held
for what the sound has left, and the sound as AAC. `writePng` writes a
picture as a PNG (`tools/png.ts`), and `decodePng` reads one back (any
8-bit PNG with no palette, not interlaced: a concept a match reads).

`mix` plays `mixPlan` out through `renderMix` (the voice bus, a staging take
lifted to the speech level `takes import` sets and a person's take as
imported; the score option the film plays, `under` dB against the voice
wherever anyone speaks and `alone` dB where no one has for 3 s or more, each
levelled by BS.1770 loudness against the voice bus, ramped, and faded in and
out (`core/score.ts`); the library's beds looped over their spans, crossfaded
where they wrap, faded at each end and ducked unless the library says not,
the effects on their cues, summed and limited) and writes the film's
one track, `narration/full.wav` (16-bit), whole (a partial of its own,
renamed only once written): a failed or interrupted mix leaves the previous
track. The track's rename and its stamp are one step under `full.json`'s
store lock (`ContentStore.transact`), so two mixes finishing together never
leave one's track under the other's stamp. `full.json` stamps the key of the plan it played
(`mixKey`: every sound it plays by its file name, which carries its hash, or
a code sound by its renderer's version, its graph's hash and its seed, with
where, how loud and at what pitch, the score option and its
levels, and the levels it masters, fades and ducks by). A bed or
effect names a library sound (`core/sfx.ts`) and a level in dB relative to
the voice; its gain comes from the level its variant measured, a take's
when it was made and a code seed's when what plays it renders it
(one-shots by momentary max, beds by integrated loudness). An effect's
placements rotate through the sound's variants (never the same one back to
back while it has another), each nudged late, louder or quieter and up or
down in pitch by the sound's jitter, seeded by the film, the effect and the
placement, so a repeated sound never repeats exactly and a film always mixes
the same way. `sound.ts` may declare `seed: '<original-film>'` to preserve that
effect variant and jitter identity in another visual version; it defaults to
the current film's name. With the same resolved cues and assets, the inherited
seed gives the same effect placements and mix key. A code variant is its
data played with a seed. A
placement meets its cue with the variant's start, with its onset for an
effect that says `sync: 'onset'` (a sustained sound), or with its hit for
one that says `sync: 'hit'` (an impact): the lock's `Variant` carries
`onset` and `hit` (`describeSound` in `core/synth/analyse.ts`, recorded on
keep and by `SoundLibrary.describe`, `sfx describe`), a code one is
measured from its seed, and the mix starts each variant that much early
(`mix.unsynced` warns where a take has none recorded). `sfx check` warns
`TimingUnrecorded`; the film's check warns `LeadIn` on an effect placed from
its first sample whose kept take's onset is past `LEAD_IN`, 0.05 s (the
placement's finding, since only it can say `sync`), and refuses a placed code
sound with a seed that measures silent (`SeedSilent`, by seed:
nothing over BS.1770's −70 LUFS gate). It logs
each bus's mean and peak dBFS (`mix.levels`), and `--stems` writes each bus
the film's length. A file at another rate fails as `SampleRateMismatch`: the
mix resamples only to repitch an effect's jitter. The
player streams the WAV (the preview server answers range requests);
`masterFinding` holds it to the film's length and to the plan the film
mixes to now (`AudioMissing`; `AudioStale`, `length` or `mixed for another
plan`, which an unstamped track is too): the renderer checks it before the
first frame and `check` in its static leg.

`narrate` makes each new take, `<id>.<audio hash>.mp3`, in a temporary folder
of its own, and places it in `narration/` only under the timings' store lock,
in the same step as the `timings.json` rewrite that makes it current. No crash
leaves a take and its timings disagreeing, and another `narrate`'s sweep
never puts away a take still being made. The sweep removes a partial write
only when its writer, named in `<file>.<pid>-<n>.<host tag>.partial`, is a
pid on this host that no longer runs. It keeps every other partial: another
host's, and one whose name carries no host
or no writer, since a leftover partial blocks nothing and is
git-ignored while removing a live one loses its write. A mix landing its
track meanwhile, here or on another host, keeps its partial. A take's words come from the speech model's alignment and its
length from the encoded file; a word the alignment puts past the end is held
inside the take (`core/narration.ts` `heldInside`, with a `narrate.overrun`
warning past `TAKE_TOLERANCE`), so the timings always fit their audio. The
aligner puts the pause before a word into that word's start, so each word
also carries where it is heard (`voiced`, a `TakeWord`): the first and last
10 ms window inside its aligned span over a −40 dBFS gate, read from the take
itself when it is timed (`core/voiced.ts` `voicedWords`; `narrate`,
`takes import` and the studio alike; a span no window passes holds no
voice, since the aligner put it past the span, so it is heard from the span's
end, never sooner). A mark and the long film's captions read the aligned start;
what must meet the ear (a short's captions, its hook and its loop) reads the
voice (`heard`). Heard seconds are branded (`Heard`, made only by
`voicedAt`), so aligned seconds passed where the ear is met are a type
error. It removes the takes (`.mp3` or a person's `.flac`) the timings
no longer name, and partial writes, at the start and end of every run. A
replaced person's take loses only its copy in `narration/`: its master and
its original stay in `narration/attempts/`.

Each take in `timings.json` carries its `source`: `elevenlabs` (staged by
`narrate`; written as no `source` key, so a file from before sources reads
as this and a staged take never churns the committed file) or `recorded` (a
person's, by `takes import` or the lab's studio). `core/narration.ts`
`takeState` says where a beat's take stands: `Recorded`, `Staging`, or
`Stale` (missing, text changed, voice changed) with whether a person read it.
`narrate` never stages over a current recorded take and refuses a stale one
without `--replace-recorded`; a recorded take stays current across a change
of staging voice, since no staging voice made it; `check` fails a stale one
(`TakeStale`, `recorded: true`). A recorded take whose beat id the script no
longer has (a renamed or removed beat) stays in `timings.json` and on disk,
so no sweep deletes a person's reading; `narrate` warns
`narrate.orphaned id=… file=…` and `--dry-run` lists it as `orphaned`, for
the author to rename the entry or remove the file by hand.

`takes import` (`Takes`, `tools/takes.ts`) makes a person's recording a take:
`Media.load` at the mix rate, `prepareTake` (`core/recording.ts`: one
channel, trimmed, levelled, held under the ceiling; `RecordingInvalid` when
nothing in it reaches −60 dBFS), `Media.encodeFlac` (the take,
`<beat>.<hash>.flac`), then the same speech-to-text as `narrate`, whose words
time the script's words through an edit-distance line-up (`core/align.ts`
`timeScript`: a misheard word keeps its place, an unheard one shares the gap
its neighbours leave; a reply that heard words but timed none fails
`SttUntimed` rather than timing the take by nothing). The recording lands as an attempt in
`narration/attempts/<beat>/`: the recording itself, byte for byte
(`<beat>.<hash>.orig.<ext>`; a whole reading once, under `whole/`, each beat's
attempt naming the stretch it was cut from), its FLAC, and its
`attempts.json` ledger (what was heard, the word error, when). Keeping one
checks its word error again as the check reads now, then copies the FLAC
beside the other takes and rewrites `timings.json` to name it; the take it
replaced is put away into `narration/attempts/<beat>/` (`putAwayTake`: a
recorded take's attempt is already there, and any other take, a staging one
or a recorded one whose attempt this machine lacks, is copied there first;
an attempt of the same name with other bytes stays as it is, and the take
is kept beside it as `<file>.<sha12><ext>`, logged `takes.put-away.kept-aside`),
so no take's bytes are ever lost and git drops it from `narration/` as
before. Placing a take and naming it hold the timings' store lock (a keep's,
and a `narrate` staging take's), and a
take is put away only while the timings, read under that lock, do not name
it (`putAwayUnnamed`; narrate's sweep runs under it too), so a sweep in
another process never puts away a take a lab's Undo is naming. A
keep made in the lab is undoable: its change carries the takes the timings
name (`Takes.named`), so Undo brings the replaced take back into
`narration/` (a kept-aside copy first) before the timings name it again, and refuses when it is in
neither place. The check (`core/spoken.ts`
`lineError`, for narrate and takes alike) reads both sides as said
(`spokenWords`): a run of numbers is one token of digits however written or
spoken (`144,000`, "one hundred and forty-four thousand", a year in pairs),
"chapter" and "verses" before a number and "to" or "through" between two are
dropped (so "Zechariah 3:1-4" is read aloud either way), `Mrs.`, `Dr.`,
`St.` are the words they stand for, and a name spelt as `script.ts`'s
optional `heardAs` export lists it (`{ Ellet: ['Elliot'] }`, `HeardAs`,
loaded onto the film as `heardAs`) is the script's. `--accept-mismatch id,id`
keeps those beats' mismatched takes (`accept.ts`); bare, it means the
`--only` beats, and bare without `--only` fails `AcceptMismatchUnnamed`. A lossy recording (M4A,
MP3) still imports, with a `takes.lossy` warning: the master is lossless from
there on, but record WAV or FLAC for the final voice. `--whole` transcribes one recording of the script and
places every beat by the same line-up (`placeBeats`), with affine gap costs
(`GAP_OPEN`) so a beat's words pair with one reading of it: a beat the
reading skipped is the one named (under half its words heard fails
`BeatUnplaced`), and a line flubbed and read again belongs to the reading
that finished it, the false start to neither beat. Each beat is cut on its
own (`cutsAround`), at the quietest 10 ms of the silence before and after it,
and faded over 5 ms at both cuts (`cutPcm`), so a false start is cut out of
both beats beside it. Every beat is placed and cut before `--only` picks.

The padding and loudness a recorded take gets are measured, not chosen: over
the 30 committed staging takes (both films, 2026-09-28; mpg123 decode, 10 ms
RMS windows), the median speech level is −17.10 dBFS (−17.90 to −15.67;
`speechLevel`: the mean power of the 10 ms windows over −70 dBFS and within
10 dB of their mean, BS.1770's two-stage gate without K-weighting, so pauses
are left out), the median peak −1.28 dBFS (−0.4 to −3.0), and the median
silence 0.07 s before the first window within 40 dB of the take's loudest
(the loudest sits near −9.5 dBFS, so that is a −50 dBFS gate) and 0.00 s
after the last. So a take is made louder or quieter by one clean gain, to
`TAKE_LEVEL.speech` −17.1 dBFS or less when that would take its peak past
the −1 dBFS ceiling: min(target − speech level, ceiling − peak), with no
limiter, so the voice keeps its dynamics and a longer pause never changes
its level. `TAKE_PAD` is 0.07 s lead and no tail; a recording that starts on
its first word gets the lead in silence. Speech is sound over the gate that
lasts 0.1 s (`TAKE_MIN_SPEECH`) counting gaps under 0.25 s (`TAKE_HOLD`), so
a click or tap after the line is trimmed with its silence, and the take fades
over 5 ms (`TAKE_FADE`) at both ends so neither trim clicks.

`film script <film>` prints the reading sheet (`core/sheet.ts`), and
`--sheet` writes it to `out/<film>/script-sheet.md` and a page to print,
`script-sheet.html`: each beat with a line (from `script.ts` when the film
has one, with its `cite` sources; from its scenes when not), the file to save
its take as, marks stripped, each turn's reader named, each “quotation” set
apart with the `quotes.jsonl` record whose words hold it, and `/` at each
sentence end for a breath (not after an abbreviation such as `Mrs.` or `St.`,
the same list the take check reads out).

`render` opens the app's server, headless Chrome (`Browser`: tabs of the
process's one Chrome, `tools/chrome.ts`) and a pool of player pages (`Pages`, `tools/pages.ts`: the
one pool `check`, `look` and `render` open, bounded, a crashed page dropped
for a fresh one) in one scope; a failure in any page, or Ctrl-C, closes every
page, the browser and the server. The export page's handle is declared once
(`core/export-handle.ts`: each call's arguments and the schema its answer
crosses in): the player implements it (`player/render.ts`), the tools reach it
through one typed call (`FramePage.call`, `tools/browser.ts`), and the test
fake answers the same calls (`fakeRenderHost`, `tools/browser/testing.ts`), so a new
call is a type error in each until it is written there. Every frame the
page draws is rastered before its clock stops (a one-pixel read), so the
draw is timed apart from the encoder: each `render.progress` line and
`render.done` say how many ms a frame went to drawing, encoding and carrying
the chunk out of the page (`draw_ms=… encode_ms=… transfer_ms=…`), and a
perf script times the draw alone with `drawTimes(frames)`. A video's
frames to draw split into chunks (`segmentChunks`, never across a segment's
edge, below: about four per page, at least a second
and at most eight each, then a tail of `workers` chunks at half that size, a
quarter, and so on down to a second, so the last chunk each page pulls is its
smallest and the pages finish together) on a queue that idle pages pull from; each page draws
its chunk and encodes it with the browser's H.264 encoder through mediabunny
(`player/encode.ts`, a key frame every two seconds) into an MP4 of its own
(and, unless `--no-share`, a share copy from a second encoder in the same
pass; with `--share-only`, the share copy alone and no master, `Copies`
in `core/encoder.ts`), and a chunk whose page crashes is retried once on a new page. Which
encoder is data, chosen once (below). `Media.join` joins the chunks in order with the track cut from
`full.wav` under the range and encoded to AAC, and the captions (`main.vtt`) are written
beside the MP4 from `captionCues`, the same line timing the burned-in captions
use. A contact sheet is composed in one page (`player/contact.ts`). An
uncaught error in the page is a `PageError`, never a log line. A missing
browser is `BrowserMissing`, whose message is the install command.

**Reuse.** A video of the film, an act or a scene, of its scenes or its
Board, splits its frames into segments at its beats and wherever its frames
start or stop reading the film's own seconds (`beatSegments`,
`tools/segments.ts`), and keeps each under `out/<film>/cache/segments/<key>/`,
a folder no catalogue lists. Every frame the film draws reads its seconds
(its boil tick wobbles its lines and moves its grain), as does a review
copy's burn-in; a Board's panels read only their shots' times. The page
says which frames do (`Film.filmTimed`, its `filmTimed` call, asked once
by the render's first page). A segment's key (`segmentKey`) hashes the
render's settings (size, fps, scale, encoder, captions, picture, the
browser's user agent, the platform), how many frames it has and, where they
read the film's seconds, its first frame in the film; each beat its frames
read (the one they fall in, and each Board shot's) by its key wherever it
sits (`SceneKeys.beats`: its sources, the film's frame and the engine, its
layout and its take, and the beat a transition into it draws) and where it
starts; and for a Board render each shot its frames draw (`shotsSeen`: the
try shown and its image's sha256 as it is on disk, its motion, the span that
times its motion and its dissolves). Every time is keyed from the segment's
first frame in millionths of a frame. So a neighbour seen across a dissolve
at the segment's edge changes it and a panel elsewhere does not, and a
segment of panels moved by whole frames when an earlier beat changes its
length keeps its key: its kept chunks join at its new place
(`render.reuse segments=<n> unpinned=<k> drawn=<m>`, `unpinned` counting the
segments keyed wherever they sit). The key leaves out which copies a render encodes (the
master, its share copy, or both): each copy is encoded alike whatever is
encoded beside it (a share copy made alone is byte for byte the one made
beside the master, measured on In Its Order's Board), so the record says
which each chunk holds, and a render reuses a segment only when every chunk
holds each copy it writes. A `--share-only` render (the publish's) reuses
the share copies any Board render kept; a render with the master draws a
segment a share-only render kept again, both copies. A render draws only
the segments it finds no such record of (`<key>/segment.json`, written once
all the segment's chunks are there), its chunks cut at segment edges
(`segmentChunks`) and each kept as `<from>-<to>.mp4` (its share copy
`<from>-<to>.share.mp4`), named and recorded by its frames from the
segment's first, so two renders that cut a segment otherwise never write
one file, and a segment found at another place joins whole. It opens no
drawing page when it draws none, and joins every segment's chunks of each
copy it writes, kept or drawn, packets copied, each chunk's packets moved to
where its first frame plays (`Media.join`); `render.reuse` says how many it
drew.
The film's cache as a whole is `tools/segment-cache.ts`. A render that keeps
segments holds the cache's lock (`cache/.segments.lock`, a `ManifestLock`)
from before it picks them until it is done, so renders of one film take turns
(`render.cache.waiting`). Each segment it reuses or keeps is marked used
(`used` in its record, the render's start time, never moved back, a
`--fresh` redraw included; a record without one reads its mtime). Each video
render removes the records of its master's and its share copy's files before
it replaces them (`cache/renders/<id>.json`), and once done writes its own,
of its lead file (its master, else its share copy), with the keys it used
(none when it keeps no segments); a record that fails to write leaves the
render done. A render that keeps segments then deletes for good the
segments no render used for `PRUNE_DAYS` (7) that no record names, never a
folder still drawn (no record): `render.cache.pruned count=<n> freed=<bytes>`.
A segment the newest render of an output (the film, an act, a scene, the
Board, `board-review`, …) used is kept past the 7 days while that render's
record names it. `film cache <film> [--prune [--days n] [--dry-run]] [--json]`
(`tools/cache-cli.ts`) prints the cache's size and prunes it by hand: refused
(`CacheBusy`) while a render holds the cache, `--days 0` keeping exactly what
the newest render of each output used. `--days 0` is refused before any
render has recorded (`CacheUnrecorded`), and while a video the catalogue
holds has no record of its lead file (`CacheOutputUnrecorded`, naming it:
render it again).
A cache folder, its lock file, the segments folder, a segment, a file in
one, or a record that is a link is refused (`CacheEscapes`) before the lock
is taken or anything is read or deleted through it.
`--fresh` drops each segment's record and draws it again (`project render
--force` too), so a fresh render cut off leaves its segments to be drawn. A
short and a wedge's look (`--level`) draw every frame into a temp folder of
the render's own, removed once joined.

## Project folder

A film's renders live in its project folder, `out/<film>` (git-ignored, never
under `~/film-media`), one folder per address and one name per variant:

```
out/<film>/
  catalogue.json                  what every file here is (RenderCatalogue)
  film/main.mp4                   the whole film: .share.mp4, .vtt, .chapters.txt, .description.txt beside it
  film/main/stills/t0003.00.png   its stills; contact.jpg and lookbook.jpg in the same folder
  acts/<act>/main.mp4
  scenes/<id>[+<id>]/<variant>.mp4
  shorts/<id>/main.mp4
```

`--variant <name>` (default `main`) renders beside `main` at the same address:
a look or score option, a lab note's `lab-<id>`. `--out file` writes a video
outside the folder and is not catalogued. A video's `--from/--to` on the film
or a short needs `--out` (`FlagsConflict` otherwise, before a browser opens):
a stretch is not the film's render, so it never replaces the address's clip
or its record. A contact sheet over a range records the seconds it drew as
its span. Every file a render leaves (the clip, its share copy, captions,
chapters, stills, a sheet) is written beside itself and renamed into place
once whole, so a failed or interrupted render leaves the last good file.

**Board render.** `film render <film> --board` (with `--act`, `--scene`,
`--stills` or `--contact` as any render) draws the film as its Board
(`core/board.ts`) through the same pages, encoder, join and catalogue,
recorded as variant `board` unless `--variant` names another. Each frame
shows the shot the animatic holds there (`shotsOf`, `core/animatic.ts`),
on the film's clock: a beat's takes, or the estimate a beat with none is
laid out on, so a film with no takes renders silent. `core/board-render.ts`
decides the frame, pure: a picture panel is its kept try covering the
1920 × 1080 frame from its middle, pushing in 6 % or panning 4 % of the
frame's width (held 4.2 % larger, so no edge shows at its ends) over the
span it is seen, which of the three picked by a hash of the panel's id (`motionOf`), so a panel moves the
same way on every render; a cut dissolves over 0.5 s centred on it, at most
half of the hold on either side (`boardFrameAt`). A card or verse panel is
set by the film's card code (`paintText`); a beat with no panel, a picture
panel with no try and a full-screen card the film's scenes declare
(`Film.cardAt`) are the film's own frame (its storyboard card, its card).
Nothing else moves, and no captions are burnt in (the `.vtt` beside it
keeps the line). `--review` (variant `board-review`) burns in, small in the
bottom-left corner, the film time, the beat and the panel with its try
(`0:41.3 · name · name.sets · try 5`, `burnIn`), so a frame of the owner's
screen capture names where he is. A review copy is watched, not sent, so it
makes no share copy unless `--share` asks for one, which doubles its time:
a share copy is a second hardware encode of every frame, and the encoder is
the limit (In Its Order's Board, 13197 frames drawn fresh on the M4 Pro,
2026-10-26: 59.6 s without the share copy, 117.3 s with it). `--share-only`
writes the share copy alone, no master: one encode a frame, so the time of
a render without the share copy (59.2 s), and the share copy a render with
the master makes, its video packets byte for byte. `screening publish
<film> board` renders it.
The page (`player/board.ts`) reads the
board and every kept try from its server (`boardFile`,
`/films/<film>/board.json`, `/films/<film>/board/<file>`) and decodes them
before the first frame; one it cannot read fails the render
(`BoardUnreadable`). A short has its own page: `--board` with `--short` is
a `FlagsConflict`, as is `--review` without `--board`.

**The catalogue** (`core/catalogue.ts`, kept by `tools/catalogue.ts`) records
each render's address, variant, kind (video, stills, contact, look-book),
settings (scale, captions), files and **stamp**: the git commit (none outside
a checkout) and a content key. A render's slot is its address, variant and
kind; a new render of a slot replaces the record before it. **Stamps**
(`tools/stamp.ts`) keys each scene by what its frames are drawn from: its own
module and all it imports (relative and workspace imports; not packages under
`node_modules`), the film's frame (`film.ts`, the scene registry and all they
import, with the registry's imports of the other scenes cut, and
`@manna/film/player`), its beat as laid out and its take's timing, and, for a
scene entering on a transition, the previous scene's own modules. An
address's key hashes its scenes' keys. The key leaves out what a frame
fetches at run time, and the audio: a video's record says the sound it
carries instead (`sound`: the key of the plan its master was mixed from,
`mixKey`, and the pieces of the master it cut).

**`film project`** reviews a film scene by scene. `film project <film>
[--variant v] [--json]` prints the film's comments, then each act with its
comments and its scenes in film order: each scene's render `current`
(drawn from the sources as they are, carrying the mix the film makes now),
`stale` (its sources changed), `stale:sound` (only the film's mix changed: a
score pick, a level, a kept take, then `mix`) or `missing`; its approval
`approved`, `stale` (given on an earlier render) or `none`; and its comments,
each marked when it was made on an earlier render. `film project render
<film> [--scene id,id] [--scale s] [--variant v] [--force]` renders each scene
on its own into `scenes/<id>/`, every one through one probe and one pool of
pages (`Renderer.session`: 1 + workers page loads a run, not that a scene;
`pages.open` logs each), skips one whose render is current at the same
settings, and re-muxes one stale by its sound alone: its sound is cut again
from the master at the pieces it recorded (the renderer's master check
first), its pictures and its share copy's are copied, and no page opens
(`render.remux frames_drawn=0`, `remuxer`: media and the disk only). The run decides
every scene's need from the catalogue first; when it re-muxes any, the master is
checked and decoded once for all of them, and each scene cuts and encodes only its own piece.
Chrome starts with the first page a scene opens (`Browser.layer`), so a
run where every scene is current or re-muxed opens no browser. `film project
approve <film> --scene id,id | --act name | --all` approves the scenes'
renders, an act's current scenes, or every current scene. An approval is of
a render as it is now, so only a current one is approved: `--act` and
`--all` leave a stale or missing scene, and `--scene` naming one refuses it
and approves nothing (`VerbRefused`, 409 on the review's route, naming why it
is stale and the render that makes it current; `SceneNotRendered`, 404, for
one never rendered). Both name that render as a command to run,
`film project render <film> --scene id --variant v` (`renderCommand`). The rule is `approvalRefused` (`core/choice.ts`), which
the choices' say keeps too; `film project withdraw
<film> --scene id,id | --act name | --all` withdraws those scenes' approvals,
whatever version they were given on. `film project comment
<film> "text" [--scene id | --act name]` records a comment on a scene's render
as it is now (on the scene itself when it has no render yet), on an act, or
(with neither) on the whole film. With `--json`
each prints the project (`ProjectRead`) as one line, or its refusal as
itself (`SceneNotRendered`, `VerbRefused`, `UnknownScene`, `UnknownAct`, `CatalogueInvalid`:
a `FreshRefusal`), which is how the review runs it. Approvals and comments are keyed by address,
variant and the render's version (`renderVersion`: the stamp's key and the
mix it carries): a re-render or a re-mux leaves an approval in place, stale,
and a render that returns to the approved sources and sound is approved
again. The catalogue is a `ContentStore` manifest: each write reads the file,
changes it and writes it back whole, one writer at a time across processes
(the review, a `film project` child, a terminal's `project render`), so every
approval, comment and render record lands.

## Encoders

Segments are joined without re-encoding, so every chunk of a render must come
from one encoder. The platform names the candidates (`encoderCandidates`,
`core/encoder.ts`): the Mac asks for the hardware encoder and nothing else, a
box with no hardware path (Linux) for the software one, and `--encoder
hardware|software` for exactly the one named. The page tries them
(`encoderChoice`, `player/encode.ts`, `canEncodeVideo` with the settings of
each copy it encodes there: the master's, the share copy's, or both) and answers
`Hardware | Software | Missing{reason}` (`EncoderChoice`). The renderer opens
one page for that answer, logs `render.encoder kind=… workers=… encoders=…
cores=…`, and hands the same encoder to every chunk; `Missing` is
`EncoderMissing` before a frame is drawn. A Mac whose GPU encoder fails
therefore stops loudly instead of rendering a different look in software.
`film doctor` runs the same choice, and still prints its other lines when the
player server will not start (the encoder line then says so).

The Mac's hardware encoder lives in Chrome's GPU process, which Bun 1.4.3
turns off: it spawns every Chrome with `--disable-gpu`, hard-coded, which no
later flag undoes (the GPU process then runs with `--use-gl=disabled`, which
holds no hardware encoder). So on macOS a
Chrome whose flags ask for the GPU (`GPU_FLAG`, `--enable-gpu`) is spawned
through the GPU launcher (`tools/chrome-gpu.ts`, `gpuLauncher`): a shell script
written into the process's Chrome profile, which Bun spawns as its Chrome; it
drops `--disable-gpu`, keeps every other argument in order, and execs the real
Chrome in its own process, so Bun's DevTools pipe and its kill reach Chrome.
The real Chrome is `BUN_CHROME_PATH`, else the one Bun 1.4.3 would find,
searched here as Bun searches (`bunSearch`: the browsers it names on `$PATH`,
then its app bundles in `/Applications` and `~/Applications`, then
Playwright's headless shell), else Playwright's cached Chromium. Every later
view names the same launcher and profile, so a Chrome Bun spawns again after
the first one died runs its GPU too, in the same profile. The renderer asks
for it (`launchArgs`), so `render`, `doctor` and the lab's `look` and
look-book draw in one such Chrome; the browser tests do not. That Chrome
draws on the Mac's GPU: WebGL on Metal
(`--use-angle=metal`) and the 2D canvas accelerated, which renders RBF's
`cold` and `title` at 101 fps against 84 in software, with pixels the owner
judged the same (2026-10-25; under 1 level on average, most on the
anti-aliased edges of ink and text). Films render on the owner's Macs only.
`e2e/tools/renderer-chrome.dom.test.ts` reads the renderer's Chrome from `ps`
on macOS: no `--disable-gpu`, exec'd by the launcher, and spawned again the
same way.

|                  | Hardware (the default)                                         | Software (`--encoder software`)                                    |
| ---------------- | -------------------------------------------------------------- | ------------------------------------------------------------------ |
| Chromium flags   | `--enable-gpu --use-angle=metal`, through the GPU launcher     | the same (`launchArgs`, `tools/browser.ts`)                        |
| master           | quantizer 16 (~37 Mbps)                                        | 37 Mbps variable, 2-frame pre-roll (13.4 Mbps, 765 MB for 7.6 min) |
| share            | quantizer 26, in the page (~160 MB); alone with `--share-only` | none (`--share`, `--share-only` refused)                           |
| encoders at once | 14 (past it the encoder hangs)                                 | one per core                                                       |
| default pages    | 4                                                              | 8, or half the cores below 16                                      |

`SETTINGS` (`player/encode.ts`) holds both columns; the hardware one
(quantizer 16/26, prefer-hardware, a key frame every 2 s, latency mode
quality) is the look the films were made in.

The hardware encoder is one engine, whatever the sessions: on the M4 Pro it
encodes about 222 frames a second of 1080p in all of them together. In Its
Order's Board (13197 frames drawn fresh, draw about 4 ms a frame, 2026-10-26)
rendered with its share copy at 112.5, 111.5 and 111.2 fps on 4, 2 and 6
pages, and without it at 221.5 fps; so more pages buy a cheap draw nothing,
and a render's time is about its frames times the copies it encodes over 222. HEVC was no faster (206 fps for the share copy alone); a 720p share
copy was (346 fps), but changes the copy's pixels.

### Software master: the pre-roll

Chromium's software H.264 (OpenH264) refuses quantizer rate control
("Unsupported bitrate mode"), so it encodes to a bitrate. Its first I-frame of
a session is coded at a coarse fixed quantizer, whatever the target: 21 KB
where the key frames two seconds on take 144–161 KB, keeping 0.22 of the
paper's grain against 0.62–0.66 (mean |x − blur(x)| of the frame over the
lossless still's). Every chunk is its own session, so every chunk opened on a
soft frame, one flash of flatness every few seconds. Pre-roll 8 and a 60 Mbps
target gave byte-identical I-frames, so neither the rate nor more warm-up
changes it; only being the session's first does.

So the software master pre-rolls (`SETTINGS.Software.preroll`, 2 frames):
each chunk's session first encodes the chunk's first frame twice at negative
timestamps, into a `NullTarget` output, then the chunk proper with a forced
key frame at `from`. `onEncodedPacket` drops the packets before `from` and
copies the rest, with the decoder config, into an `EncodedVideoPacketSource`
on the segment's real output. A chunk's first frame then comes out a settled
I-frame (142–162 KB), as good as the stream's own 2 s key frames. Over all 52
chunks of righteousness-by-faith, frame 0 keeps on average what the chunk's
own key frame two seconds on keeps (mean difference −0.01; 48 of 52 within
0.05 or above it; the rest are a fade from black, where the still has almost
no grain to keep, and cuts inside those two seconds). Where the paper sits
around 0.62 at every key frame (the tablets, the dark rooms), frame 0 does
too: the encoder's I-frames keep no more there whatever the rate, so no
chunk start can pass 0.75 in those scenes, and 34 of 52 do. At four chunk
starts the grain kept went 0.27→0.66, 0.30→0.62, 0.48→0.80 and 0.42→0.81.
Frames after the first are P-frames on a better reference, and measured the
same or better. The hardware path is untouched (preroll 0, the same
`CanvasSource` as before).

### Software share: none

A software render makes no share copy: the in-page software encoder kept
the grain only at 24 Mbps (1.16 GB for 7 minutes), so `--share` or
`--share-only` with `--encoder software` is refused (`jobOf`, `tools/render-plan.ts`), and a
software render left to its default makes none. x264 (`tools/x264.ts`,
libx264 in-process through NodeAV, registered as mediabunny's `avc`
encoder) encodes the review's phone copies and the footage copies.

The software default of 8 pages is the knee of renders of two scenes of
`righteousness-by-faith` without the share copy, timed at each page count
(1325 frames, 16 cores, the median of 3 runs; the pages carry one encoder
each):

| pages | 4    | 6    | 8    | 10    |
| ----- | ---- | ---- | ---- | ----- |
| fps   | 62.4 | 84.2 | 97.9 | 104.3 |

With the fibre on the backdrop plane (the paper grain slides with the camera
instead of a fresh screen grain each frame) the film encodes far smaller than
the one-pass render timed above (6 pages, a fresh screen grain): righteousness-by-faith (457 s, 13712 frames) rendered in 293.5 s at
8 pages (pages and join about 142 s, x264 151.8 s), the master 765 MB at
13.4 Mbps and the share 126 MB at 2.2 Mbps, keeping 0.57–0.85 (master) and
0.56–0.80 (share) of the lossless stills' grain.

### Phone copies

On a phone the review plays a phone copy (`Media.phoneCopy`) in place of a
video it plays (a set's variant, a folder's video, a render's share copy or
master; never an image, captions or notes, which are never read for their
length) over 40 MiB or over 8 Mbps (`PHONE_RATE`, its bytes over its
length); a desktop plays the originals. 8 Mbps lies between what a phone was
seen to play and what it was not: of the looks study's 14.5 s cold opens
played as made on the owner's phone (2026-10-11), the 2D ones at 7.1 (cut
paper) and 7.8 Mbps (bold), both 1080p, were not reported choppy, and the 3D
ones at 14.0 (painterly, 540p) and 20.8 Mbps (ps1, 720p), both under 40 MiB,
were. The third 3D one, engraving (1080p, 27.4 Mbps, 50 MB), was already
copied.

The line is the rate, not the picture: a drawn 2D render over it plays as
its copy on a phone too. Decided for the owner's own concern, choppy phone
playback, on the five-up compare page and on a one-video page alike: a 21 or
28 Mbps master is the kind of file seen to stutter. On 2026-10-11 these
renders under 40 MiB crossed it (all 1080p): righteousness-by-faith's scenes
`declared` 8.07, `within` 8.52, `word` 8.66, `exchange` 10.06, `spoke` 10.16,
`cold` 10.37, `look` 11.50, `accuser` 12.60, `mirror` 13.38, `daily` 14.13,
`rain` 21.10 and `title` 28.10 Mbps, and `art3/declared.A-current` at 8.19.

A copy keeps a key frame every second at the video's own frame rate
(`PHONE_ENCODE`; at 25 frames a second, every 25). The review's player puts
a video that drifts 0.2 s from its clock back on it by a seek, and a seek
decodes from the key frame before it: the 3 Mbps copies before kept one every
145–250 frames (5–8 s), since NodeAV clears the picture type a frame carries
and mediabunny's key-frame requests never reached x264. x264 caps the copy
over a two-second buffer, and a copy asks under 8 Mbps by as much as that
buffer could add over its length (`phoneRateFor`: 7.0 Mbps for 14.5 s,
2.7 Mbps for 1 s), so even a short copy averages 8 Mbps at most. Where the
cap binds, x264 spreads the bits over every frame: no copy measured shows a
frame closer to the source's frame before it than to its own (luma PSNR
against the source scaled to the copy's size, still frames left out). A
copy's cache name carries every entry of `PHONE_ENCODE`, a `recipe` number
among them for what the code decides (the size rule, the rate and key-frame
sums), so a copy made any other way is never served.

The copies of the three study files over the rate and two drawn scenes
(x264 core 165, two threads, on a 16-core box at a load of 45–80 from other
work, so the times are loose):

| file          | source                | copy           | key frames | PSNR mean / min | encode |
| ------------- | --------------------- | -------------- | ---------- | --------------- | ------ |
| engraving     | 1080p, 27.4 Mbps      | 720p, 5.5 Mbps | every 30   | 38.4 / 29.8     | 75.7 s |
| ps1           | 720p, 20.8 Mbps       | 720p, 3.4 Mbps | every 30   | 42.6 / 36.6     | 50.4 s |
| painterly     | 540p, 14.0 Mbps       | 540p, 1.9 Mbps | every 30   | 40.2 / 35.3     | 26.3 s |
| scene `rain`  | 1080p, 21.1 Mbps      | 720p, 2.1 Mbps | every 30   | 44.2 / 41.6     | 77.9 s |
| scene `title` | 1080p, 28.1 Mbps, 3 s | 720p, 1.6 Mbps | every 30   | 43.2 / 41.3     | 18.1 s |

The 3 Mbps copy of the engraving was 2.6 Mbps at 36.2 / 27.5, a key frame
every 145 frames at most. A copy is never taller than 720 lines, and a
shorter video keeps its size.

A drawn film, copied for its size: righteousness-by-faith's share (1080p,
526 s, 185 MB at 2.8 Mbps) became a 92 MB copy at 1.4 Mbps, a key frame every
second, in 551 s; the 3 Mbps copy before was 68 MB at 1.0 Mbps, a key frame
every 8.3 s at most, in 624 s (one after the other, the box under other load).

## Shorts

A film's `shorts.ts` (optional; `Shorts` in `core/schema.ts`, decoded by
`FilmRepo`) declares vertical cuts: `{ id, title, spans: [{ scene, from, to }] }`,
each point a `ScenePoint`: a `{ mark }`, a named `{ cue, edge? }` or a scene
landmark `{ at }`, never a second. A span that opens on a word (a `{ mark }` or `{ at: 'speech' }`)
opens `SHORT_PREROLL` (0.1 s) before the word is heard, never before its
aligned start: the aligner gives a word the pause before it, and a short
opened on that pause starts on silence. A close stays where it is marked.
`core/shorts.ts` resolves a short against the layout on whole frames
(`resolveShort`: the spans back to back, each `{ scene, from, to, at }` in film
and short seconds), or fails with `UnknownScene`, `UnknownMark`,
`UnknownCue` (each `by: 'short "<id>"'`) or `ShortSpanEmpty` naming what the film has; `--short`
naming no short is `UnknownShort`. `shortPieces` maps a range of the short to
the film stretches under it.

The page is a `Film` of its own (`canvas/short.ts`, `createShort`), so the
player, the export handle and the worker pool serve it unchanged: the app
spreads `shortPages(name, load, shorts)` into its registry, one page per
short under `<film>/shorts/<id>` (`shortKey`). Each frame is the film's own
frame at the film time under it, drawn full size into a band and copied onto
a 9:16 page at the film's density (`shortPage(1920)`: 1920×3414), which the
encoder scales to 1080×1920 through the same `--scale` path; so a crop of the
band is, pixel for pixel, a `render --stills --no-captions` still at that film
time. The page is stacked by `SHORT_LAYOUT` (`core/shorts.ts`, 1080×1920 px,
data the checks and the lab read): the short's `hook` centred on y 445 at
most 800 px wide, set from frame 0 and faded out by 2.8 s (`hookAlpha`); the
band from y 620; the captions centred on y 1318. Round the band the page is
the film's paper under its own vignette, made once at the page's size, and
the film's grain laid over the paper only (`grainRect`), so nothing touches
the band. `Film.look` carries the film's paper, shade, finish and `short`
style (`ShortStyle` on `FilmSpec.short`: the hook's and captions' fonts and
colours, sizes in 1080×1920 px, checked by `createFilm`). The
renderer resolves the short again on the page's fps, cuts `full.wav` to its
pieces (`splice`, a `JOIN_FADE` of 10 ms each side of a join only), and
writes `out/<film>/shorts/<id>/main.mp4` and `main.vtt` (`shortCaptions`: the
phrases the page burns in, as it shows them).

A short's captions are phrases, not the film's lines (`core/phrases.ts`):
`shortPhrases` takes each span's words, timed by the voice (`heard`: a word
shows when it is heard, not when the aligner starts it), breaks them at
every sentence end (`.`, `?`, `!`) and voice turn, then at clauses (`,`,
dashes, `;`, `:`, `…`), and cuts each clause evenly into two to four words
(`PHRASE_MAX`). No phrase crosses a sentence end or a join, so a one-word
sentence ("Justified?") is a phrase of its own; a one-word clause joins a
neighbouring clause of its sentence unless the voice pauses over
`PHRASE_GAP` (0.3 s) between them. A phrase shows from its first word to the
next phrase's, or `PHRASE_HOLD` (0.6 s) after its last word, each moved half
a frame earlier so it shows from the frame nearest its first word. A word
between the script's “ and ” (which the take's words carry; `quotedWords`)
is quoted.
`canvas/short-captions.ts` (`burnedCaptions`) draws them centred on y 1318 in
the style's caption font, no plate, each phrase broken into as few lines of
at most 800 px as it needs and balanced (`breakLines`, so no word is left
alone); a quoted word gets a gold marker (`caption.highlight`) swept behind
it as it is read, so a quotation lights word by word. The phrases are set
once; a frame looks one up and draws it. The long film's captions are
untouched: they time each line by the aligner (`sceneCaptions`), and timing
them by the voice is one line in `core/captions.ts` (`filmCaptionTimes = heard`),
left for the owner since it moves burned-in pixels. `render --short --no-captions` leaves them out.

`film check <film> --short <id> [--zone default|ads|platforms]` holds a short to
`SHORT_RULES` (`core/shorts.ts`) instead of checking the film
(`tools/short-check.ts`, pure; `Checker.short` probes the page):

- `ShortUnsafeText`: a line of text past the safe zone, probed every half
  second and at each phrase's first frame. `SAFE_ZONES` (exported from
  `core/shorts.ts` with `safeRect` and `roomAcross`, so the lab draws the
  same zones) holds the margins in 1080×1920 px, and any column of buttons
  that takes more of the right from some row down: `default` top 270,
  bottom 520, right 140, left 65; `ads` the same with the bottom 35% (672);
  `platforms` the zone inside every platform's own, each edge the widest of
  YouTube Shorts', Instagram Reels' and TikTok's and every one's columns
  (`PLATFORM_ZONES`, each value with its source: top 288, bottom 672, left
  120, right 192, and TikTok's buttons 300 px from 840 px down), where a
  talk sets its words, a finding naming the platforms a line runs under. A
  line is held to the room across the rows it reaches (`roomAcross`): a
  caption reaching x 888 below y 840 runs under TikTok's buttons. The short's own lines
  (hook, captions; probed with the `caption` tag) are an error and fold into
  one finding per side; the film's lines in the band are a warning each,
  since the band is the film's frame and only another span moves them.
- `ShortHook` (error): the first word heard after 0.3 s; nothing in the picture
  moving by 0.5 s (probes of the open that hold still, the hook and captions
  left out, as `heldStill` does for holds); or the first frame showing the
  film's title (the film's page title, read from the film's own page). A logo
  drawn as ink is not told from other ink.
- `ShortLoop` (warning): the mean absolute per-cell luma difference on a
  64×36 grid (`SHORT_RULES.loopGrid`) of the band is over 0.08 between the
  last frame and the first (the export handle's `luma`: the frame drawn,
  then its band scaled down by the browser and read back as Rec. 709 luma),
  or more than 0.6 s of silence from the last word's voice round to the
  first's. The band is `bandOf` (`core/shorts.ts`) of the film's own page,
  the rectangle the short's page draws the film's frame into, whatever the
  film's aspect; a read with no value for every cell (no canvas to sample on)
  fails as `FrameFailed` (`lumaGrid`), never compared as clean.
- `ShortLength`: over 90 s is an error; outside 45–75 s a warning.

A talk is held to the same checks as a vertical film: its length is its
format's (`TALK_FORMATS`: over its most an error, under its least a
warning), and its open is still only while the take's frame holds too (the
probe records each footage frame a frame draws, `FootageMark`, so a talking
head is motion read from the edit, not the pixels).

A short resolves on its page's frame rate (`Checker.cut`: the rate the film
declares, read from the page's `info.fps`, as the renderer does), so
`check --short`, `cues --short` and the render cut the same frames.
`--static` runs only what the words tell (length, first word, the loop's
silence), probing no frames: it opens the page once, for its rate.
`film cues --short` prints `shortReport` at that rate. A short draws at about parity with the film per frame (~0.92× of the
same frames as a 16:9 render, measured against one contiguous range): the
9:16 page costs nothing extra, and saves nothing either.

## Lab

`film lab` is where the owner answers what an agent asks of a film: one
server for every film of the app, meant to run for days (on the laptop, port
8229). It prints its links (`LabLinks`: the local one, `localhost` where it
is bound, and the phone's when it listens there; logged `lab.ready`) and runs
until stopped, which stops the server and the routes with the command's
scope. The server is Effect's over `Bun.serve` (`labServer` and `serveLab`,
`tools/api-server.ts`): no route or development server of Bun's, so every
request reaches the gate. It knows two pages, the app's: the ask page
(`ask.html`, `mountAsk`), an agent's guided review; and the render page
(`index.html`, `mountRender(pages)`) at a film's export place, which the
easel opens (`film lab look`). Home (`/`) has no page of its own: it sends
the owner on to the newest ask still asking (a 302), and with none answers
one line, "Nothing waits on you" (`tools/lab-home.ts`). Its API is under
`/api/` (The HTTP API, below), and every other path a page serves is one of
the framework's places (`Places` in `core/api.ts`, each a `@manna/url-state`
Place; the app gives each page's HTML entry, `LabPageSpec.pages`, and its
server entry, `LabPageSpec.servers`), as **Pages and links** (below) lists
them. A path no place declares is a 404, never a page.
`LAB_HOST` (loopback by default) and `LAB_PORT` (8229) say where it
listens; `FILM_LAB_PHONE_URL` (a plain `http://` address by its IP, the
laptop's on the tailnet: the gate admits the bound IP, so a MagicDNS name
typed by hand would be refused) is a second listener with the same handler (`startLab`), logged
`lab.phone.unbound` and left out when it cannot bind. A loopback address it
cannot bind ends `film lab` with `LabUnbound`, whose message names the
address and Bun's words. A port is one lab's (`reusePort: false`): a second
lab started on a port another holds is refused, never served beside it.

**Pages and links.** Every view the owner would talk about is a URL, so a
pasted link opens what the sender saw and Back walks the views: the path
says what the view is about, the query how it is shown. Each page reads and
writes its place through `@manna/url-state`, and every link is printed by
`pageHref` over the same places. Whether a move is a step Back walks is the
place's declaration alone (`pageMove`, `core/api.ts`): a new path or a cited
key (a still opened full size) is a history entry; a refinement replaces the
entry. Every write enters history by that declaration (`Place.history`),
through either of two doors. A page that moves for a reason names only the
reason (`addressOn`, `browser/host.ts`): the viewer went somewhere (`go`,
entered as the place declares), or the URL follows what the page did on its
own (`follow`), which always rewrites the entry. The one traversal a page
makes is the bar's too (`dismiss`, a sheet's Close, Escape or swipe): it goes
Back over the entry the opening pushed only when that entry is on screen and
Back lands exactly where the Close writes (the same path, query and hash),
else it rewrites the entry; no page goes Back or Forward itself
(`film/history-through-host`).

| Place                  | Page   | Query                                    |
| ---------------------- | ------ | ---------------------------------------- |
| `/`                    | none   | (sent on to the newest ask still asking) |
| `/asks/<ask>`          | ask    | `still` (the Board panel open full size) |
| `/asks/page/<page>`    | ask    | `still` (the Board panel open full size) |
| `/films/<film>/export` | render |                                          |

A folder ref is one path segment (`manna%2Frighteousness-by-faith`), as is a
short's name.

**The pages are built in the lab's process** (`LabPage`, `tools/lab-page.ts`):
`Bun.build` with `@manna/film/solid-plugin` (the `PageBundler` service, with a
test layer that reads each entry as its own page; each page with a server
entry, `*.server.tsx`, is built beside its browser bundle from the same
sources, in the same build), about a tenth of a second, so
there is no build step and nothing to rebuild by hand. A page is built when
first asked and again when asked after a file the last build read has
changed: the folder of every file the last build read (outside
`node_modules`) is watched, the set following each build: the entries'
folders from the start, and after a failed build also the folders of the
files the bundler named, so a first build that fails still hears its fix. A
folder still read keeps its watch; a file read in a newly watched folder
or new to what it read, that changed from a second before the build began
counts as a change. Each change to a
file a build read is one more build (a render or a note is none). A film's
mixed track (`narration/full.wav`) is no source: once a page asks for one,
there or not (a film before its first mix gets a 404), its folder is watched
too, or the nearest folder there on the way to it until the mix makes it, and
a mix landing it (last and whole, by a rename, so the mix has finished) is one
more change, with no new build, that a wait with that film (`&film=`) hears
and no other film's; a take's timings, saved before its mix, wake nothing. A
wait arms the watch with its first ask on `&film=` (`filmWaited`). A write
that mixed answers the build its film's waits hear that very mix by
(`mixed`, `LabPage.heardAt`, from the track's mtime read under the writer's
lock). A page links its scripts and styles from the root (`/chunk-….js`,
`publicPath: '/'`), so a page served under a deeper path finds them; a
request is answered as a narration file when it is one
(`/films/<film>/narration/<file>`), then as a built file, then as the page
its path serves. Every page is stamped with its build and the server that
built it (`<meta name="lab-build">`, `<meta name="lab-server">`, an id made at
start), which `GET /api/review/build?since=&server=&film=` answers past
(`PageBuild`, long-polled, at most 60 s; another server answers at once). The
bundler resolves a workspace package's subpaths by the `exports` maps the
process read at start, so the lab reads every workspace `package.json`'s
`exports` as it starts and every 3 s after (`tools/exports-watch.ts`): once
one changes (a merge adds a subpath), the lab closes its servers and its
pages, ends their Chrome (`Bun.WebView.closeAll()`), and starts itself again
in the same process with the same command line (`relaunchOnExportsChange`,
`tools/relaunch-bun.ts`). An ask page does not reload itself (an answer in
hand is not lost); its next load is the new code. A page that does not
build answers 500 with the bundler's words and reloads once a later build
or another server answers, pausing 2 s after every other answer; a
failed build is tried again on each request and, while a page waits, by its
wait every half second (a fix may land in a folder no build read, or the
bundler may still hold what the failed build read; the failed page asks
nothing but its wait), and one that then builds is a new build its page hears; the server
keeps serving.

Every page is rendered on the server: its server entry
(`LabPageSpec.servers`, whose default export is a `PageRender`,
`core/page-render.ts`) runs in a worker of its build (`PageRenderer`,
`tools/page-render.ts`), retired once a newer build has rendered and its own
last render ends; the render's head, body class and markup are spliced into
the built HTML and streamed, and the browser's copy of the same components
hydrates them. A render's reads of the API come back to the lab's own
handler (`PageReads`), so they pass `admit` and the same handlers; they are
sent with the page and adopted (`ssrSource: 'server'`), never read twice,
and a value only the browser knows (the viewport, quality, the viewer's
keys) is `ssrSource: 'client'` with a server value (the server answers as a
phone). The server draws no film; a page whose faces do not load ends
(`PageEnd`, `lab/page-client.tsx`: the tree disposed and the keys with it)
and says why in its place, once. A build whose server entry reads
a film's or a scene's module or `player/stills.ts` fails, naming them
(`filmCode`). A render that fails before its head answers the page as built,
which the browser then renders. One that fails after its head, or still runs
`LONGEST_WAIT` and a few seconds after it (`END_WAIT`), is cut: the page ends
with what it wrote and `PAGE_CUT_MARK`, and the browser drops that markup
and renders the page anew (`mountPage`). A page's answer (its HTML, scripts and
styles) is compressed by the request's `Accept-Encoding` (br, else gzip;
`pageRoute`, `tools/api-server.ts`), a streamed page flushed chunk by chunk
(`NodeHttpCompression`), so its shell reaches the browser while its render
goes on. A build's scripts and styles are also compressed once at brotli's
best, in the background after the build, and sent so to a request that
takes br once made (`squeeze`, `tools/lab-page.ts`). A wedge's files are not: only the
easel's browser on the box asks for them, so each is compressed per request. A page's head preloads the UI faces' latin subsets (Geist's and Geist
Mono's) and declares every subset with `font-display: block` (`FACE_HEAD`,
`player/face.ts`), and keeps the page's root out of paint until the
preloaded faces have loaded, at most the hold's cap (1 s), past which it shows
in the fallbacks and logs `[lab] fonts.late` (`faceHold`): nothing on a page
moves when its faces land (`e2e/lab/touch-face.dom.test.ts`);
`tools/page-css-budget.slow.test.ts` holds each place's render-blocking CSS, as
the lab answers it, to 64 KiB. Only the lab's server bundles Solid; the
render's server (`film render`, `check`) serves the player alone.

The framework owns the routes (the lab API, below: `labHandler` in `lab.ts`,
one web handler over the script, the Board, a beat's attempts, the review's
files, the asks and the easel, with the pages behind the same gate). Notes
have no route: an agent reads and answers them through the lab's MCP
(`notes`, `resolve`) over NotesStore.

**A beat's attempts** (`tools/studio.ts`, over `Takes` and `FreshFilm`) are
listed and played for an ask's take block. The lab runs for hours and keeps
each film module as it first imported it, so it never loads the film in its
own process: it reads the script and each beat's line fresh (`film read
voice <film>`, `StudioReading` in `core/studio.ts`), kept under the film's
source stamp (`FilmFolder.stamp`: one fresh process after any file under the
film changed, none before), so a line fixed while the lab is open reaches the
list at once. A take is recorded and kept through the CLI (`takes import`,
`film options keep-voice <film> <beat> <file> [--accept-mismatch]`): every
keep is `keepVoice` (`choices.ts`), recorded by `SourceWriter.around` with the
take files the timings name and the track mixed from them (`Follows`), so it
holds the writer's lock and the lab MCP's `undo` walks it back: it brings back
the take it lands from `attempts/` and remixes (`film mix <film>`, fresh; a
failed mix is logged `lab.remake.failed` and the step stands). A step is
taken back only with the timings' takes brought back as the very files they
name: a take's copy is picked by the hash of its audio its name carries, and
a name from before takes were named by their audio, whose copies differ, is
refused (`TakeAmbiguous`) rather than guessed at. The routes are the lab
API's `studio` group, under `/api/films/<film>/studio/`, behind the same gate
and for any of the app's films (another name is a 404 `FilmUnknown`):

| Route                                                     | Answer                                                                                                                                     |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/films/<film>/studio/takes/:beat/attempts`       | `StudioAttempts`, newest first: each `transcript`, its word error, when, whether it is the take and whether it reads the line as it is now |
| `GET /api/films/<film>/studio/takes/:beat/attempts/:file` | the attempt's FLAC (`audio/flac`), to hear it again; a name the ledger does not hold is a 404 `AttemptUnknown`                             |

`:beat` is decoded and must be one of the film's beats before a route reads
a thing: any other name (an encoded `/` or `..` included) is a 404
`UnknownScene`. A body over `STUDIO_MAX_BODY` (64 MiB) is a 413
`BodyTooLarge`, counted as it streams (a Content-Length over it is refused
unread; one under it is not believed). The server keeps a connection open
with nothing sent for `LAB_IDLE_SECONDS` (255 s, Bun's longest). A critique
holds no request through its counsel's run (**The critique**, below). An
attempt plays back through `serveFile`, by byte ranges, as a phone's Safari
asks.

### Edits through the lab

No page edits a film: an agent edits it through the lab's MCP
(`tools/timeline-mcp.ts`), on a version whose files the lab holds (its own
folder, or the film's registered files), judged by `core/beat-edit.ts`
(pure):

- **`beat_move`** moves a beat before another (to the end when none). A move
  keeps every act and score movement on the beat it begins on, and one that
  would put a part before the part declared ahead of it is refused in words
  (`movedOrder`).
- **`beat_hold`** sets a beat's hold (`lead`, the time before its words, or
  `tail`, the time after them). The hold snaps to 0.1 s and stays between its
  floor (`MIN_LEAD`, `DEFAULT_TAIL`, or the beat's own when it already holds
  less, kept as it is) and 30 s (`heldWithin`); a tail on `DEFAULT_TAIL` is
  written as none. A hold that would change nothing the film plays (a beat
  with no words, a tail its `min` absorbs) is refused with `HoldUnchanged`,
  said in words (`holdUnchanged`). It answers the seams into and out of its
  beat as the version reads after it (`seamsAround`: from the end of a beat's
  take to the next beat's words).
- **`undo`** takes back the film's newest change (or, given `change`, that
  change alone, refused while another stands before it).

Each edit is one write of the version's `script.ts` through the
SourceWriter (`tools/source-writer.ts`), made by `BeatEdits`
(`tools/beat-edits.ts`): formatted, read back, and written only over the
text it read. No persisted format changes. Every write is on the film's one
history: the agents' edits, a scene written, a voice kept, each step its own,
and the lab's change feed tells each change and its undo as it lands
(`source.written`, `source.undone`; The lab's events, below). An edit of a
film with a production files the agents' work on its ledger while it stands
(`Re-time, re-check seams, re-render.`); its undo withdraws it.

**The tweak.** The lab's `tweak` command (`tools/tweak-mcp.ts`; MCP, and
`bun run lab tweak` from a terminal) sets one value of a scene's
`drawing({...})` literal: a `cue`'s timing (`offset`, `dur` or `until`,
`untilOffset`, `ease`, `stagger`, the fields of `CuePatch`) or a `knob`'s
`value` (a number or `[x, y]`), by SceneWriter, through the film's one
history (the `undo` command steps it). It answers
`LabWrite`: the change, the file, the cue's span and where it resolves (or
why it does not), or the knob read back, and `film check --static` run after
it. A scene that is not located, a value the lab will not rewrite (computed,
not a literal; a literal other scenes share) and a cue timing the scene's
timeline would not resolve with are refused, with the reason.
A cue write is judged, and answered with the cue resolved on its scene's
clock, as the film's files now declare it with the new spans in place, and
the write applied, as the file will hold it (`writtenPatch`: every number to
the millisecond, the writer's one rounding), to the cue's own span where its source computes part of it
(`until: MARK`, which no literal says)
(`film read cue <film> <scene> <cue> --spans <json> --patch <json>`, one fresh process,
before the file is touched): a line that moved or renamed a mark while the
lab runs moves the cue's answer and its judgement too. The lab's handlers run
with `LabContext` (`lab.ts`), which holds no `FilmRepo`, `SoundLibrary` or
`Mixer`, and SceneWriter's and SceneSources' layers are built on
none (`lab-context.types.ts`). No module the lab runs imports a film's module
by a function either (`importFilmModule`, `libraryModule`, a computed
`import()`): `lab.slow.test.ts` follows `lab.ts`'s imports and fails on one.

**SceneSources** (`scene-sources.ts`) finds each scene's drawing by identity,
not by name: the parser (oxc) lists every exported `drawing({...})` call in
the film's folder, the film's registry (`scenes/index.ts`) is imported, and a
scene belongs to the call whose exported `timeline` or `knobs` is the very
object the scene reads. A renamed registry entry or two files exporting the
same name cannot point a scene at the wrong literal; a scene built without a
literal (a spread, a function) is reported as not located, with the reason.
The lab locates in a fresh process (`film read sites <film>`, `locateHere` in
`read-cli.ts`), kept while the film's source stamp stands, so a scene added
or made to share a drawing while the lab runs is located as the files now
say; a CLI command, a process of its own, locates in itself
(`scenesLocatedHere`).

**SceneWriter** (`scene-writer.ts`, splices in `scene-source.ts`) re-reads the
file, replaces only the value's text (missing timing fields are added after
the fields before them), formats the new text with `oxfmt` and
reads the value back from it, all before the file is touched; then
`SourceWriter` writes it whole, only if the file is still the text the edit
was made from (`SourceChanged` otherwise). If oxfmt fails or the value does
not read back, the write fails (`FormatFailed`, `WriteUnverified`) and the file
is as it was. It refuses what
it cannot prove is a literal (`SourceRefused`: `GAP * 2`, a spread, a
computed key, a shorthand) and names it. Literal `until` objects (`{ cue }`,
`{ cue, edge }`, `{ at }`) are editable ends: a `dur` written replaces the
whole `until` property (and its `untilOffset`), keeping the rest of the scene
intact; a right-edge edit writes `untilOffset` after the `until` and keeps it.
An `untilOffset` of 0, or a new `until` without one, takes the key away; one
asked of a cue that runs no `until`, or one in code that would be taken away,
is `SourceRefused`. Their members must be literal and unique, and decode against `Until`; a
computed member, spread, duplicate key or conflicting anchor is refused.
A cue write is also refused
(`TimelineUnresolved`) when the scene's timeline, read back from the new text,
does not resolve on the clock the film's files give now (the fresh `film read
cue --spans` above): an `until` cue's offset typed past its point, or a point
moved since, would end it before it starts. A film that does not load in that run is not the write's to judge:
it lands, and answers why the cue could not be resolved. Writes run one at a time and are
uninterruptible; their undo is `SourceWriter`'s (below, "How a pick lands").

**The check after a write** is `FreshFilm.check(film, 'static')`
(`fresh-film.ts`): `film check <film> --static --allow-stale --json` in a new
process (this one imported the scene modules at start), its findings each
with its address (`FindingAddress`: the `part` it is about, an `Address`,
the film's when it is about the whole, an act's for a colour script, a
short's for a short; and the film second it starts at, when it has one),
which the lab answers with the write. A film that does not lay out (a cue on a mark its line
lacks, a cycle, a duplicate mark) or a part the check names that it lacks
is the one finding the check reports, at its scene (`laidOut` in
`film-check.ts`), not a failed run. The static leg never mixes or opens a
browser. A film that does not load prints its failure as the one error
finding, in its own words (`FilmModuleInvalid`: `film "…": sound.ts is
invalid: …`; `answeringCheck`), as `film read voice` and `film read cue`
answer it as `ServerFailed` (`answering`). A check that does not run
otherwise (a line that does not decode, a crash, 30 s gone) is itself one
error finding, `FreshProcessFailed`, in its words.

### Commands and keys

Every action a page offers past its at-rest buttons is a **command**
(`src/command/command.ts`): an `id`, a `label` (or `labelIn` the context), a
`group`, a typed `when` over the **context** and a `run` that answers an
`Effect<Receipt>`. A command that is not available is not shown: no dimmed
rows. Each command names its keys (`keys`, `keysIn` the focus scopes it
answers in: `page`, `field`, `studio`, `slider`; a focused button or link,
`control`, hears the page's), whether a key is `stepped` (Shift
coarse, Alt fine), and its `touch` path, so every key has a way in on a
phone. The context (`src/command/context.ts`, `contextAt`) is the page, its
selection (one `Selection` union, `src/command/selection.ts`), what has focus,
and what each section adds (`refine`).

One **hub** per page (`makeHub`, `src/command/hub.ts`, built at the page's
root: the ask page's, `lab/ask/page.tsx`) holds the registry, the context and
the **keymap**, and listens once through `Keys` (`browser/keys.ts`). A press
already handled, or inside an IME composition, is never read. The press's
focus picks the scopes: a field (an input, a select, a player, an open dialog
or menu) reads only commands that answer there, a slider (`role="slider"`)
reads its own arrows, Home and End first and owns them, then the page's, and
anywhere else is the page. A part that stands where the page's listener does
not hear hears its own presses (`Hub.listenWithin`). The last available
command bound to a chord runs; a key with no available command passes to the
browser. Chords are written `mod+shift+z` (`mod` is ⌘ on a Mac, Ctrl
elsewhere); a letter is read by its key in any case, Alt+letter by its
physical key, and a symbol by the character it types, so `?` and `]` work on
any layout. A command's keys are the ones it declares, the same for every
viewer: nothing rebinds them.

The ask page hosts the generated surfaces (`src/lab/command/`): the **command
menu** (⌘K) lists the commands available here, filtered by every word typed,
with their keys; the keys **sheet** (`?`) lists every command by group with
its keys and its touch path; the **context menu** (`TargetMenu`, one per page)
opens on a right-click, or a touch held still for half a second, on a thing
the page marks as a `Target`: its commands about that thing (a command's
`about`, in `src/command/target.ts`: the kinds of thing whose menu shows it),
the thing's own first, then Copy link and the command menu, which every menu
has; the **view menu** (the shell's `⋯`, `lab/command/view-menu.tsx`). A
stepped command also has a `×10` row, a finger's Shift (`steppedRows`); ⌘K and
the keys keep the one row. A touch that moves past @manna/ui's threshold first
never opens it (one owner per press, `claimPress`); a touch the menu took
first is the menu's to its end (`liftHeldByOther`); a field keeps the
browser's own menu. The menus' rows (and a chip's) are keyed by their command
(`rowKey`, `src/command/menu.ts`): a row keeps its element, so a press and its
release on it are one click. Every page has **Copy link** (⇧⌘C,
`src/command/link.ts`): the page's URL, or from a thing's menu that thing's
citation (`citeOf`), written whole through the host's `Clipboard`. Their rules
(`src/lab/command/style.ts`) read the house tokens (`player/tokens.css`)
directly; `COMMAND_TOKENS` names only what no token holds: the paddings and
heights the surfaces compose, and their own widths, heights and layer. `?` is
the keys sheet, the one place the keys are listed. No page keeps a line of key
hints at rest.

A **receipt** is one toast (`Receipts`, `src/lab/command/receipts.tsx`, on
@manna/ui's Toast) over the page, in place of a status line. The hub hears
every receipt (`hub.receipts`) in its slot: a command's own id when it runs
(`hub.invoke`), or a page's slot when a write says one (`hub.announce`). A
slot shows one toast, replaced in place: `busy` while its write is out, then
what it did, said once the write lands and never before, or why it was
refused. A receipt that can be undone carries the command that undoes it as
its button, bound to the change its write made (`Bound`: the film, and the
change by the id the lab's history gives it). Each kind of id is its own
brand (`ChangeId`, `RequestId`, `OpId`), made by `uniqueId(<brand>)` or
decoded where it arrives, so a target's words, a time or another kind's id in
its place is a type error (`lab/identity.types.ts`). A bound receipt's button
acts on that change alone: its command says whether it can (`Command.fits`),
and one that never can is retired (`Unfit.Never`, where a held one is
`Unfit.Now`). A done receipt shows 5 s, a refusal 10 s, a busy one until
replaced. The receipts showing as a page hides are kept in the tab
(`film-receipts` in `TabStore`) and shown again once it has loaded.

`.oxlintrc.json` refuses a raw `keydown`, `keyup`, `keypress` or
`contextmenu` listener (`film/keys-through-keymap`) outside the adapters and
`src/lab/command/`: a key is a binding in the hub. It also refuses a title
written with a key in brackets, and a read of the keymap (`keysOf`) outside
its followers (`film/keys-named-as-bound`): a title names its key as bound
now, through `hubKeys` in Solid,
so a command registered after the control reads with its key, as the
viewer's keyboard writes it.

**Terms**, as editing software uses them:

- **Header**: the shell's one row (`lab/page-shell.tsx`): the page's name, its
  tools and the view menu.
- **Timecode**: a time written `HH:MM:SS:FF`, hours, minutes, seconds and
  frames (`timecode`, `core/time.ts`; 30 fps, or a video's own rate: a
  1000/1001 rate such as 29.97 counts its whole rate's frames a second,
  non-drop-frame (NDF), and a rate that is neither, such as 12.5, counts
  the frame within its wall second), in a monospaced face so the
  digits never shift. A `#t=` in a link stays in seconds, as does
  a finding's message, the sentence `film check` prints too.
- **Command menu**: the searchable list of every available command (⌘K).
- **View menu**: the header's `⋯`: the page's `View` commands available now,
  then Keyboard shortcuts (`lab/command/view-menu.tsx`).
- **Context menu**: the commands for what is under the pointer, opened by a
  right-click or a touch long-press.
- **Sheet**: a panel over the page that holds a surface, not one fixed in
  the layout: on /ui's Sheet, swiped away or closed with Escape; the keys
  sheet, a Dialog, closed with Escape.
- **Receipt**: what a command answers when it runs: what moved, before →
  after, and Undo where it can be undone.

### The HTTP API

The lab's routes are declared once, as one Effect
`HttpApi`, in `core/api.ts`: every path, its params, query, body and answer, and every
failure with its status. Both ends derive from that declaration: the
server's handlers (`HttpApiBuilder.group` in `tools/lab.ts`, `studio.ts`,
`review-http.ts`, `asks-http.ts`)
and the pages' one client (`LabClient`, an `HttpApiClient` of `LabHttpApi`
in `lab/api.ts`, which `lab/ask/api.ts` calls through) with the URLs a page puts
in an `<img>` or `<audio>` (`attemptUrl`, `reviewFileUrl`,
`reviewPhoneUrl`, `reviewFrameUrl`, from
`urlBuilder`).

| API          | Served by                 | Groups                                                                                                                                                                                                                                                            |
| ------------ | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LabHttpApi` | `film lab` (`labHandler`) | `script` (beats, voice, take, marks), `series`, `board` (read, stale, file), `studio` (attempts, attempt), `review` (index, file, phone, frame, duration), `asks` (read, page, answer, shown), `looks` (take), `matches` (take), `page` (wait: the build counter) |

**A HEAD of a GET route** answers as the GET does, with its status and
headers and no body.

**Failures cross as themselves.** A failure a route answers is one of
`Refusals` (`core/api.ts`; the classes are `core/refusals.ts` and
`core/errors.ts`), each annotated with its status (`HttpApiSchema.status`):
the one status table (`statusOf` reads it). It crosses as its JSON with its
`_tag` (`{"_tag":"SourceRefused","file":…,"target":…,"reason":…}`), and the
page's client decodes it into the same class, so its `message` reads the
same on both ends. Existing failure fields remain wire contracts:
`TakeMismatch.heard` is the transcript, `SttUntimed.heard` the transcript's
word count, and `BeatUnplaced.heard` the fraction of a beat's words matched.
Changing their keys requires a compatible codec or a coordinated migration.
A handler's failure that is not a Refusal answers 500 as
`ServerFailed` (its tag and words), logged `api.request.failed`; a param, a
query or a body that does not decode is a 400 `RequestInvalid` naming the
part and the schema's words (`{"_tag":"RequestInvalid","part":"Payload",
"reason":"Expected \"pick\" | \"unpick\" | \"reject\" at [\"verb\"]"}`),
answered by the gate (HttpApi itself would answer an empty 400); an answer
that does not encode (a handler's value its schema refuses) is the server's
failure, a 500 `ServerFailed` tagged `AnswerUnencoded`; a path under
the API's own prefixes that no route declares is a 404 `RouteUnknown` naming
the path, so a page calling an endpoint the server does not have reads a
refusal, not "no answer". A refusal names a film's file relative to the film's
folder (`scenes/hand.ts`), never a path on the box. On the page a call
fails with `LabFailure`: the server's Refusal, or `LabUnreachable` (no
answer, or one that does not decode).

**One gate.** `serveApi` (`tools/api-server.ts`) composes an API's routes
behind one global middleware, the only place a request is admitted
(`admit`): the Host must be the listener's own name or a loopback one at
its port, a browser's `Sec-Fetch-Site`
same-origin or none, a write's Origin none (a tool) or `http://` one of those hosts, with a JSON body
when it carries one (a POST always: a form or a no-cors fetch posts one with no
preflight; `WriteNotJson`, 415) of at most `STUDIO_MAX_BODY` bytes, counted as it
streams (`BodyTooLarge`, 413). A DELETE, PUT, PATCH or OPTIONS with no body
meets the Host, `Sec-Fetch-Site` and Origin checks alone, with no body to judge,
as an MCP client's session end does (`carriesBody`). Anything else is a 403 `RequestRefused`,
logged `api.request.refused`. A new route is behind the gate by being a
route; every route answers a foreign Host 403 (`lab.slow.test.ts` walks
`routesOf(LabHttpApi)`). Every film route names
its film, one of the app's films (`filmNamed`), and any other name is a 404
`FilmUnknown` before a handler reads a thing. The pages (`LabPage`) answer
every path outside the API's own prefix (`/api/`), behind the same gate, to a
GET or HEAD only (any other method is a 405, `Allow: GET, HEAD`). One
cross-site request passes: a link opened on another site (a GET or HEAD with
`Sec-Fetch-Mode: navigate` and `Sec-Fetch-Dest: document`) to a path of the
page table; never the API, a script or a file. A fixture's own routes beside the API's
(`labHandler`'s `beside`) sit behind the same
gate. A page rendered on the server (`PageRenderer`, a worker per build)
reads the API through the server's own handler on the page's connection
(`PageReads`), so the gate admits its reads as it admitted the page.

**To add an endpoint:**

1. Declare it in its group in `core/api.ts` with `HttpApiEndpoint.get` or
   `.post(name, path, { params, query, payload, success, error: Refusals })`.
   A write takes a JSON `payload`. A new
   failure class goes in `core/refusals.ts` and into `Refusals` with its
   status. A new group is `HttpApiGroup.make(name).add(…)`, added to
   `LabHttpApi`.
2. Handle it in the group's `HttpApiBuilder.group(api, name, …)` in tools:
   `.handle(name, ({ params, query, payload, request }) =>
   answered(Effect.gen(…)))`, naming the film with `filmNamed(params.film)` (`tools/film-repo.ts`).
   Return the success value (the API encodes it), or an
   `HttpServerResponse` for a file (`serveFile` answers byte ranges). A new
   group's layer joins `labHandler`, and a service its handlers need joins
   `LabContext` (`tools/lab.ts`), its layer built in the composition root
   (`tools/film-services.ts`), which the CLI runs on.
3. Call it from the page through the derived client
   (`client.<group>.<name>({ params, payload })`, wrapped in `called` for
   `LabFailure`), or put its URL in an element through `urlBuilder`.
4. The foreign-Host test covers it by itself; add a test of what it answers.

For example, the asks' routes (`GET /api/asks/:ask`, `GET /api/asks/:ask/page`,
`POST /api/asks/:ask/answer` and `GET /api/asks/:ask/shown/:file`) are one
group: `AsksGroup` in `core/api.ts`, added to `LabHttpApi` (its paths fall
under the API's prefix by themselves). Its handlers (`tools/asks-http.ts`)
read and answer through `AskStore`; its layer joins the `Layer.mergeAll` in
`labHandler`, and the ask page calls `client.asks.<name>` (`lab/ask/api.ts`).

### Script

An ask's script block reads a film's script
as its `script.ts` stands: each beat's line as it says it (its `{mark}`s and
cues in braces), its picture and its sources, through a fresh process (`film
read script <film>`, `FreshFilm.script`) kept under the film's source stamp,
so a line or a brief fixed while the lab is open is read again once. The
reader shows each line's spoken words with their delivery marks (`lineRows`,
`lab/words/line.ts`): its `{mark}`s are kept by the word each stands before
and drawn as no chip, and its cues are not shown. A word's time is its
staging take's (`Ready`), lit while the take plays.

| Route                                      | What it does                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/films/<film>/script`             | `ScriptBeats`: each beat of `script.ts` in order, its line (`say`, when it says one), its `picture` (when it has one) and its `cite`; none for no script                                                                                                                                                                                                                                                                    |
| `GET /api/films/<film>/script/voice`       | `ScriptVoice`: each spoken beat's staging take in the voice and marks it has now (`Ready` with its words' times, `Voicing`, `Unvoiced`, `Refused`), and the day's spend against its cap                                                                                                                                                                                                                                     |
| `GET /api/films/<film>/script/takes/:file` | a staging take's audio, by the name `Ready` gives it (immutable: named by its request's key); any other name a 404                                                                                                                                                                                                                                                                                                          |
| `POST /api/films/<film>/script/marks`      | `MarksPost` (`{ beat, marks, read: { spoken, marks } }`): the beat's delivery marks rewritten in its `say` as one write of `script.ts` (`LabWrite`), its words unchanged; `read` is the line as the page read it, words and marks, and a write whose line says other words or carries other marks now (marked elsewhere), a mark that does not fit, or a post with no `read` (a tab older than the lab: reload it) is a 422 |

Every spoken beat's staging take is kept ready (`tools/script-voice.ts`) in a lab started with `FILM_STAGING_FILL=true`, the owner's (off by default: the fill spends ElevenLabs characters, so a spare lab spends none). That lab voices each beat the staging cache keeps no take for, the films a reader has open first, two at a time, each charged against the day's cap (`FILM_STAGING_DAILY_CAP`) before it is sent; with the fill off a beat reads `Unvoiced`. A take that misread its line is read again only once the local day it was made (its record's `at`) has passed, so a restart or a second lab pays no more that day. A fill that dies is logged (`staging.fill.died`) and leaves the lab up. No film's timings or takes are written: `film narrate` makes a cached take the film's own at no cost.

### Series drafts

The app's series drafts (`series/<series>/scripts/<draft>.md`, the folder
`FilmApp.series` names) are read in the same reader beside the films:
`core/draft.ts` reads a draft's beats out of its Markdown (a talk's table, a
film's beat list) and writes a mark back byte for byte, `tools/series-drafts.ts`
(`SeriesDrafts`) lists, reads and marks them, and an ask's `script` block
shows one, its staging voice the film reader's (`lab/script/voice.tsx`,
`VoiceOver`).

A new script that is no film's yet goes into an ask the same way: write it
as a series draft first (a Markdown file in the series' `scripts/` folder),
then name it in the ask's `script` block (`{kind: 'script', series, draft}`),
never a `document` of its Markdown nor a set.

| Route                                          | What it does                                                                                                                                                                                                                                          |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/series`                              | `SeriesList`: every series by its folder and its plan's title, each draft by its file and its title; none for an app with no series                                                                                                                   |
| `GET /api/series/<series>/<draft>`             | `DraftRead`: the draft's beats as its Markdown reads now (each line with its marks and cues, its brief, its sources); 404 `DraftUnknown`, 422 `DraftUnread`                                                                                           |
| `GET /api/series/<series>/<draft>/voice`       | `ScriptVoice`: each spoken beat's staging take in the staging voice (`stagingVoice`) and the marks the draft has now, and the day's spend, as a film's                                                                                                |
| `GET /api/series/<series>/<draft>/takes/:file` | a staging take's audio, by the name `Ready` gives it; any other name a 404                                                                                                                                                                            |
| `POST /api/series/<series>/<draft>/marks`      | `MarksPost`: the beat's marks written into its line (refused, as a film's, once the line is not `read`: other words, or other marks) in the Markdown (that cell changed, not another byte; only over the text it was read from), answered `DraftRead` |

The fill voices every draft's spoken beats in the background, as it does
every film's, so a draft opened has its takes ready.

`film drafts` reads every draft as the reader does, through `SeriesDrafts`:
each one's spoken beats, words, marks and time at 155 wpm, or why it does not
read (`DraftsUnread` when any does not). The app's tests run it, so a draft
that stresses a word the Markdown way fails before the lab says so.

### Board

A film's storyboard (`core/board.ts`): the record, `src/films/<film>/board.json`
(committed), and its images in `src/films/<film>/board/` (git-ignored, each
recorded with its sha256). `film board` makes and keeps it from the terminal
(`tools/board-cli.ts`); the lab's MCP reads it and writes a keep, an
approval or a withdrawal through the same store (`BoardStore`: `keep_try`,
`approve_beat`, `withdraw_beat`), so neither writes over the other, and an
ask's `board` block shows it. A note on a panel is a lab note carrying its
`panel` and its `sketch` (an agent's `request_tweak`, the terminal's `film
board`). A panel's call sends
the style's reference, then the beat's first panel or a tweak's try and its
sketch, then the library record of each member the beat's `cast` names
(`tools/cast-library.ts`, a film's own role before the library's), each once:
its kept sheets (its own views of a sheet that draws other members too),
else its record's references, which the prompt says win over every
other image on the person (a sheet of heads, the face and hair alone), the
brief saying what the member wears and does. Each cast file is read once
and its bytes copied beside the image for the call, and the try records
what each held (`cast`: member, path, sha256 of the bytes sent) and the
words of its own picture its prompt carried (`words`, `pictureWords` in
`tools/board-prompt.ts`: the beat's brief with its marks read as their
words, and the words the panel holds from). A try changed when the words a
run would send for its picture now differ (a try from before `words`: its
prompt no longer carries each of them verbatim; the style, the house rules
and other beats are not its words), when a cast file it recorded holds
other bytes now (a try from before `cast`: a kept sheet its member's
`replaced` history says was replaced since), or when the cast a run would
send now names a file it did not carry (a member first kept a sheet
since, or a beat names a member it did not). Words and the files sent are
held only against tries the board drew itself (`generate`, `tweak`): an
imported keep is never stale. A kept panel whose kept try changed, or a
picture panel that keeps none and none of whose generated tries is
unchanged, is stale (`tools/board-stale.ts`, `stalenessOf`, judged against
the script as it stands): a run draws it new tries, numbered on, until it
has `--tries` unchanged, printing `stale <panel> why="…"` (its picture's
words, a member's cast sheet, or a library sheet it was drawn before), and
the keep stays until the owner keeps a new try; the beat's later panels
ride along by the first try the run drew of its first panel, not by the
keep it draws again over; the board read (`film lab board`, the lab MCP's
`board`) gives the panel a `stale` naming which (`members`, `added`,
`words`, `why`), and an ask's board block shows its `why` under the
panel (`GET …/board/stale`), the lab reading the script
fresh (`tools/board-stale-read.ts`): a script it cannot read names no panel
stale and logs `board.stale … unread=`.

| Route                                      | What it does                                                                                        |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `GET /api/films/<film>/board`              | `BoardFile`: the style, every panel in film order with its tries and the one kept, the approvals    |
| `GET /api/films/<film>/board/stale`        | `BoardStale`: each panel `film board` would draw again, and why                                     |
| `GET /api/films/<film>/board/files/<file>` | A board image the record names; 404 `BoardFileUnknown` for one it does not, or not in this checkout |

### Timeline

A film's timeline is one read model (`core/film-timeline.ts`, pure:
`timelineOf`), the one the lab's MCP answers (`timeline`). It reads one version of the film: the production's open one,
or one asked by number. A version kept in its own folder
(`<film>/v<n>/`, a `script.ts` in it) is read wholly from that folder with
the film's own loaders: its scenes, takes, acts (`acts.ts`), score, shorts
and Board (`FilmRepo.load(film, folder)`, `BoardStore.read(film, folder)`),
the film's voice and palette where it keeps none. The newest version without
a folder is the film's registered files; an older one without a folder is
refused (`FilmVersionUnkept`), and a number past the ledger too
(`FilmVersionUnknown`). Its clock is read fresh (`film read clock <film>
[--folder v<n>]`, `FreshFilm.clock`), kept under the film's source stamp
(`tools/film-timeline.ts`, `FilmTimelines`), so a script or a take changed
while the lab is open is read once after the change.

- **Lanes.** Each stage of the flow with material on the clock is a lane of
  clips: the script's beats, the Board's panels, the takes, the scenes
  drawn, the score's movements, the renders. A panel sits where the
  animatic shows it (`core/animatic.ts`, `shotsOf`, the one rule for
  when a panel shows): a beat's first panel from the beat's start, a later one from its
  mark, each held to the next panel of its beat or the beat's end. A clip
  says its state (made, kept, approved) and its clock: `estimated` while
  its beat has no take (words at the reading pace), `measured` once it has.
  A render records no version, so the catalogue (renders, scene approvals,
  shorts) shows on the registered files alone, and the notes too, timed on
  their clock.
- **The flow.** The nine stages (script, concept, Board, voice, animatic,
  Rive scenes, sound, render, shorts), each `reached`, a `gap` or `ahead`.
  The concept frames keep no record of their own yet, so the concept is
  reached when a decision filed in the version answers an ask that showed
  pictures alone, and a gap otherwise (the script is kept the same way, by
  an ask that showed it). The Next row is the first stage ahead and what
  starts it; when the stage before it is a gap, it names the gap and says
  so (`Board starts from kept concept frames, and none is kept yet`).
- **The stage.** The header's stage is the first, in the flow's order, whose
  "done when" is not met: the script and the concept once a later stage has
  material or a decision keeps them; the Board when every beat is approved;
  the voice when every spoken beat is the owner's take; the animatic and
  the sound once a later stage has material; the scenes when every beat is
  drawn and approved; the render when a render of the film is approved.
- **Bands and markers.** The version's acts are `bands` over the clock. A
  marker is something that waits on the owner, at its
  time: an open ask at the first beat its material names, and a note of his
  not yet done.
- **The header.** The stage; what waits on the owner, counted: the asks
  open about the film or its production (less one whose set and choice a
  decision filed since has answered), the notes an agent replied to, and
  the beats the open version's Board holds ready (every picture kept, not
  approved as it stands), whichever version is read.

### Notes and the browser tests

**Notes** live in `lab/<film>/notes.json` (`NotesFileJson`) with their stills
in `lab/<film>/stills/` (`FILMS_LAB` moves the root; the app ignores it in
git). The file is the source of truth: the lab server and `film lab notes` both
go through NotesStore, so either works without the other. A note is `{ id,
film, scene, T, local?, frame, cue?: { name, edge }, mark?, range?: { from, to },
box?, ink?, text, status, still, thread, createdAt }`, plus `seq` (the change that made it) and
`changed` (the last change to touch it). `T` and `frame` are film time as
the film was laid out when the note was made; `local` is scene-local time,
how far into `scene` it was made. The film's timeline places a
note at `local` into its scene while the film has that scene (`noteT`,
`core/notes.ts`; held on the scene's last frame if a re-take made it
shorter), so a re-take of an earlier beat does not move a later note off
its frame. `local` is an additive, optional field: notes made before it
have none and read at `T`. `range` (`NoteRange`, scene-local seconds, `to`
after `from`) is the stretch of its scene the note is about, cut to its
scene; additive and optional (a note without one is about its frame). `cue`
is the named-cue edge nearest the note in its scene. A note written on words of a beat's line carries them:
`words?: { beat, from, to, text }` (`NoteWords`: the beat, its first and last
word's index in the line, inclusive, and the words as they read), `kind?:
'note' | 'correction' | 'removal'` (`NoteKind`, what it asks of them; a note
on words without one is a `note`, `kindOf`) and, on a correction, `replace?`
(the words to say instead). All three are additive and optional; the frame's
still is taken where the first word is said. A correction or a removal whose
writer wrote nothing says what it asks (`say “…” for “…”`, `remove “…”`).
None of it writes `script.ts`: the agent reads the ask and edits the script.
Every change takes the file's next `seq`, so `eventsSince(file, n)`
(`core/notes.ts`) returns each new note, reply and resolve past a cursor,
once each (a file reset below the cursor, trashed or restored, replays its
log at its own `seq` and a wait over it answers at once, even when the log is
empty, so an events follower keeps hearing); `wait` polls the file for them (every 200 ms), so it sees a reply
the CLI wrote while the server was waiting. Each change is one
`ContentStore.transact`, as every manifest's is: written whole, one writer at
a time across processes (the operating system's lock on `.notes.json.lock`,
which the kernel lets go the moment its holder's process ends, a crash too,
and which a running holder keeps however long it holds it; a change that
waits past about 5 s fails with `StoreLocked`, and the log says so,
`store.lock.held`). A
note's still is written under the same lock, before the note that names it.

**The browser tests** (`e2e/lab/**/*.dom.test.ts`, and
`e2e/player/` for the render page) open the real
page over a probe film in headless Chrome with the lab API faked
(`lab/fixtures/harness.ts`), or served (`openServed`: the page's server
entry rendered, failing any render that writes a signal or a store, then
hydrated with no mismatch; `e2e/lab/fixtures/served.test.ts` proves a
writing render fails), and the page's clock the test's
(`lab/fixtures/clock.ts`): a retry or a loop's playback is moved
on with `page.clock`, not waited out, and `canvas.toBlob` encodes at once
(Chromium's waits for idle time a busy page may not leave, up to 5 s). The
page is a tab (`lab/fixtures/tab.ts`) of the one Chrome Bun.WebView spawns
per test process (`lab/fixtures/browsers.ts`, with `tools/chrome.ts`). A
case's tab is a view lent from a pool and given back when the case ends, so
a case pays for a page load, not for a new renderer process and a cold
compile of the page's script (three to four times the CPU of the load): the
scripts load from one origin for every case (`asset`), so a view's renderer
compiles them once. Every tab is on an origin of its own, so cases share no
storage and no permission; between cases the view waits on an empty page,
its history, scripts for new pages and listeners dropped
(`e2e/lab/fixtures/browsers.dom.test.ts` dirties each and proves the next case
sees none of it). One fake microphone (a 440 Hz tone on input 1) every tab
hears, allowed or refused per tab. A tab opened `coarse` has a phone's pointer
(touch emulation, so `(pointer: coarse)` matches), set in the same
uninterruptible step that lends the view and put back before the view is
given back; a view whose pointer cannot be put back is discarded, never lent
again (`lab/fixtures/lease.ts`, its own test over a fake view); a view
leaves the pool only inside that step, so a case interrupted before it
takes none. A view two fingers were down on at once is retired and closed
when given back: Chrome hears no touch on it after. Every other tab has a mouse's pointer (Blink's fine pointer and
hover, set as Chrome starts: headless Chrome has none, and `(pointer: none)`
would give a desk the phone's density). The
touch-target guard (`e2e/lab/touch-targets.dom.test.ts`, its states in `studio-states.ts` beside it) opens every lab page
at rest and with what it discloses open (an ask with its view menu, its
command menu, its context menu, its keys dialog and a receipt; a page of
asks, the first answered and folded), over a synthetic film (`lab/fixtures/studio-film.ts`), on a phone
(390 × 844, a finger, `--hit` 44 px) and on a laptop (1440 × 900, a mouse,
`--hit` 28 px), and fails naming each control whose usable hit area holds
no `--hit` square. The area is what a tap reaches (`lab/fixtures/touch-targets.ts`:
a 2 px grid of `elementFromPoint` over the control and a margin round it,
so padding and a hit-slop count and a covered part does not; a point is the
control's only when no other control is nearer, so a link inside a label is
the link's, never the label's field's); a layer is
measured within itself. The exceptions are WCAG 2.5.8's: a backing input
nothing of which can be seen or pressed, a link on a line of text, and a
target 24 px or more whose `--hit` circle reaches no neighbour's area
(`e2e/lab/fixtures/touch-targets.dom.test.ts` holds the measure to synthetic
shapes). Every page also fits a phone (`fitsPhone`,
`lab/fixtures/phone-fit.ts`): no sideways scroll, each control inside the
width, its chrome at most a quarter of the height
(`e2e/lab/fixtures/phone-fit.dom.test.ts` holds the measure to synthetic
pages). Every design-language mock wears `tokens.css` and the kit, writes no
token, and sets each space, type size, line height and radius on its scale
(`e2e/design-language/mocks.dom.test.ts`, one case a mock, and planted pages
of each shape; the reader is `e2e/design-language/mock-lengths.ts`
`mockLengths`). The page is read as the browser lays it out and resolves
it, at 390 and 1440 px and each width from 200 to 4000 px its media queries
name (px, em or rem; `min-`, `max-` or a range; a `media` attribute is not
read), on a phone's pointer and a desk's: a red on
either is a red. A variable is read on each element and pseudo-element its
declaration applies to, so the cascade (nesting, `:is()`, a compound, a
media or container query, an alias, a losing declaration) is Chrome's; the
reader shadows each local with a variable of its own, beside it, and never
touches a property the page lays out by. Each selector of a list that gives
or reads a variable is reached on its own (a nested query's declarations
too): one that reaches no element on either pointer (a hover, a
colour-scheme query) is named, never passed unread, and a selector of
kit.css or lab.css is named only when no mock that links the sheet reaches
it. The tab answers the page's requests itself (the
protocol's `Fetch`), types and clicks with native input events, and waits in
the page on its real timers, so a file's cases run at once (`concurrentTestGlob` in `bunfig.toml`), three at a time per
worker (`--max-concurrency=3` in the E2E script: at most eight workers, one
per core on smaller hosts, and a case's timeout counts its own work, not its
siblings'). The E2E runner compiles and minifies each page's script once
per invocation, then workers read those immutable temporary files. The files
are removed after the workers exit; a direct `bun test` builds its own scripts.

`film lab notes --film <film>` (the `notes` command, `notes-mcp.ts`; its
line is `notes-lines.ts`) prints each unresolved note as one line (`--status
all` every note), then `seq=<N>`, the note log's last change:

```
note id=n1 seq=1 status=open scene=hand T=230.38 local=4.12 frame=6911 cue=topple:end mark=hand box=760,560,400x400 replies=0 still=/…/lab/<film>/stills/n1.png text="…"
```

`T=` is film time when the note was made; `local=` (on a note that has it) is
seconds into its scene, which an earlier scene's re-take does not move: the
note's frame now is the scene's `start=` (`film cues <film> <scene>`) plus
`local`. `range=3.20-4.00` (on a note that has one)
is the stretch of its scene the note is about, in the same scene seconds.
`source=scenes/hand.ts:118 line="…"` (on a note about a line of its scene's
file) is the line of the scene's file the note is about, with its
text as it stood, so the line is found after the file moves.
`words=cold:3-4 said="a courtroom." kind=correction replace="a court of law."`
(on a note written on words of a beat's line) names the beat, its words' first
and last index in the line, the words as they read, what the note asks of
them, and a correction's words to say instead.

A note replied to or done arrives as an event (`tweak.requested` for a
note on a Board panel that asks for a new try, `note.replied`,
`note.resolved`) on `film lab events --follow --film <film> --name notes`:
run it under a Claude Code Monitor and each arrives as a notification ("The
lab's events", below). `film lab resolve --film <film> --note <id>` closes
a note. An unknown id fails with `NoteNotFound`, listing the film's notes.

### The look-book, light and chapters

**The look-book** (`player/lookbook-sheet.ts`) is one sheet of the whole film:
the palette (`createFilm({ palette })`) as swatches, then per scene a row of
stills at every cue's start and end and its 60% point (`sceneMoments`, the
moments `film check` samples, less the marks), each labelled with the cue
and timecode. Its stills come from the one source of stills
(`player/stills.ts`), and
`film lookbook <film> [--captions] [--variant v]` asks one export page for the
same sheet (`ExportHandle.lookbook`, `RenderJob.LookBook`), writes
`out/<film>/film/<variant>/lookbook.jpg` and records it in the catalogue. A sheet
laid out past Chromium's largest canvas side (32,767 px) is drawn scaled down
to fit it. It is the first page to read for a new film
and the consistency reference while its scenes are built. The command then
runs the look pass (below) and prints one line per scene (held share and
longest held run, largest face, mean luma, dark share, saturation and top
five colours), one per declared act against its target, and one for the
film.

**Light.** A scene brings its act's light into band with `light` on its
drawing (`scenesOf` lights a scene whose drawing brings none by the film's
`light(id)`, its act's), not by repainting its page: `{ color, edge?, amount? }` multiplies
the page and all drawn on it by `color` over the middle of the frame,
falling to `edge` at the corners (a pool keeps the subject lit while the
page around it dims), at `amount`. A function `(f) => Light` reads it each
frame, so dusk can deepen or dawn come up on a cue. It is laid per sheet,
before the vignette and grain, so a fade between two scenes crosses their
lights; each `color`/`edge` pair is drawn once and kept (the last
`SHEETS_KEPT`, so a light whose colour moves every frame never grows the
page), and it never reaches the probe (light is no ink). Outside a
transition a fixed light and the vignette go on as one multiply by their
product (`makeProduct`, kept by colour, edge and amount); a light read per
frame and the vignette go on in turn. A light's `vignette` is the share of
the film's vignette its scene takes (1 when it names none; 0 for a look whose
medium has none, a print), and a transition eases from the outgoing scene's
share to the incoming one's (a pan gives each side its own), as it does out
of a card, which takes none.

**Chapters.** An act of the film's `look` that names a `chapter` (the
narrator's question, in the viewer's words) starts a YouTube chapter at its
first scene. `film chapters <film>` prints them, `mm:ss title` a line, and a
whole-film `render` writes them beside the video as `main.chapters.txt`.
Fewer than three, a first past 00:00, or one under 10 s fail with
`ChaptersInvalid` (a render logs the reason and writes none). The whole film
also gets `main.description.txt`, the video's description: its chapters, then
one "Sound:" line, then a line for each CC BY recording it places, its pages
linked (`videoDescription`); none when it has neither.

### The lab's commands: `film lab <command>`

Every action an agent or a terminal takes on the lab is one command, defined
once (`labCommand`, `tools/lab-command.ts`: an Effect `Tool`, its parameters,
success and failure schemas, and the effect it runs), and both transports are
made from the one list (`tools/lab-commands.ts`): the lab's MCP serves each as
a tool (`tools/lab-mcp.ts`), and `film lab <command>` (`tools/lab-cli.ts`) as
a subcommand with a flag for each field of its parameters, by the field's own
name, read from the JSON Schema the tool is listed by: a word, a number, a
switch, a repeated flag for a list (`--at mark:a --at 2.5`; numbers also
comma-separated, `--crop 0,0,400,300`), and JSON text for the rest
(`--blocks '[…]'`, `--levels '{"ground":"light"}'`). `--input '<json>'` gives
the whole input as one object, a flag beside it winning; `--json` prints the
answer as its success schema encodes it, one line, and without it the
command's plain lines. The input is read by the command's own parameters on
both transports, so a terminal is refused in the words an MCP client is
(`Invalid parameters for tool '<name>': …`, or the command's refusal).
In `apps/animations`, `bun run lab <command>` runs it; `look`, `match`,
`critique`, `journal` and `notes` have scripts of their own.

Where a terminal runs a command follows from what it needs, and the types
hold it there:

| Where      | Commands                                                                                                                                                                                                                                           | Why                                                                                                                                                                                             |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| here       | `notes` `board` `reply` `resolve` `request_tweak` `keep_try` `approve_beat` `withdraw_beat` `catalogue` `sets` `set` `publish_set` `record_render` `ask_read` `asks` `close_ask` `decide` `note` `forward` `check` `cues` `journal` `journal_note` | over the lab's files alone, through the stores the lab writes through; each write holds its file's lock across processes (`ContentStore`), so no lab need run                                   |
| in the lab | `overview` `changes` `ask` `timeline` `working` `beat_move` `beat_hold` `tweak` `undo` `look` `match` `critique`                                                                                                                                   | over what only the running lab holds: its change feed, the agents' lines, the film's one history of edits, the asks' page lock (held in memory), the easel's warm page and the critic beside it |

An in-lab command is the lab MCP's own tool asked at `FILM_LAB_URL` (else
`http://127.0.0.1:8229/`, `tools/lab-client.ts`): its input checked here
first, its structured answer read back by the command's success schema, so a
lab that answers another shape is refused (`LabAnswerUnread`) rather than
misread. The test `tools/lab-command.test.ts` holds the two transports to one
set: every tool the lab lists is a `film lab` subcommand with the same fields
and the same required ones.

### The lab's events: `film lab events` and MCP Events

What happens in the lab is one catalogue of events (`LAB_EVENTS`,
`core/lab-events.ts`: 22 names, `note.replied` to `source.undone`), each
with one payload (`LabChange`: what it is about, its words, a one-line
summary, its links, and `read`, the lab command that reads its whole record),
read off the lab's files by its change feed (`tools/lab-events.ts`). A change
to a film's source (`source.written`, `source.undone`: a beat
moved, a hold trimmed, a cue or a knob set, a pick written or a take kept,
and each undo)
is read off the lab's writer (`SourceWriter.landings`), which every writer
writes through. `changes` reads the feed by the catalogue (`name`,
globs over its names or the name of a record, which names every event that
record tells: `notes`, `board`, `catalogue`, `set`, `ask`, `production`,
`source`; `film`). The records tell: `notes` the `note.*` events and
`tweak.requested`; `board` `board.tried`, `board.kept`, `beat.approved` and
`beat.withdrawn`; `catalogue` the `render.*` events; `set`, `ask`,
`production` and `source` the events named for them.

`film lab events` (`tools/events-cli.ts`) prints them from the running lab.
With `--follow` it keeps running and prints one line per event as the lab sees
it, so a Claude Code Monitor wakes on each without polling:

```
ask.answered cursor=k3x.12 at=… id=3f0c… film=f ask=a1 summary="…" read="bun cli.ts lab ask_read --ask a1" link=http://…
```

`id=` is the change's own id, made from its kind and the record it was read
from (a note's id, its time made and its log number; a try's number and
time made; an ask's step), so two labs that read one change give it one id, a
reader told it twice knows it, and a note made after its file was reset never
takes an older note's id. A kept try's id is made from the board file as the
lab read it, so two labs that read it across a later write give one keep two
ids. A word on a production's ledger is told by whoever said it: an ask and a
note with no quote of the owner's are `agent`'s. `--name` (repeated;
`--name notes` follows a film's notes, tweaks among them) and `--film` narrow it: the
lab narrows, and the follower narrows only a change with no `id` (an older
lab's, which reads no filter); a `--name` no event of the catalogue matches, or a film the
lab does not have, is refused before anything is followed. `--since <cursor>`
reads on from a line's cursor, and `--json` prints `{"cursor":…,"event":…}` a
line. An event of a kind this checkout does not know (a newer lab's), or of a
known kind in a shape it does not read (an older lab's, with no `id`), is
printed from the fields every event carries, and said once on stderr. What is not an event goes to stderr. The stream
(`tools/lab-stream.ts`) is what `film ask wait` and `film channel` read too: a
lab that stops answering is said once and asked again with backoff (250 ms
doubling to 10 s, started over after each session that answered), and the new
session reads on from the last cursor seen, so while the same lab runs nothing
is missed, unless a reader falls more than the 1000 changes the feed keeps
behind (its cursor comes back `reset`, the older ones gone), and a notes file
trashed or restored is told whole again (each change with the `id` it had); a
restarted lab no longer knows the cursor, which comes back `reset`,
and the stream prints every event that lab kept (one told before comes again
with its `id`); a change made while no lab ran is in the new lab's first read
and is never told. Only `--gone-after <dur>` (counted from
the first loss since the lab last answered), a refusal of the lab's, or an
answer this checkout cannot read (`LabAnswerUnread`) ends it, with a non-zero
exit and, with `--json`, a last `{"_tag","message"}` line on stdout.

The lab's MCP serves the same catalogue as MCP Events (protocol 2026-07-28,
OpenAI's MCP Events profile; `tools/mcp-events.ts`): `server/discover` says
`events`, `events/list` lists the catalogue, `events/subscribe` takes a
webhook and its `whsec_` secret, verifies the callback with a signed challenge
it must echo, and posts each event to it as it happens, signed as Standard
Webhooks signs, retried with the same `webhook-id`, until `events/unsubscribe`
or its `refreshBefore`. The subscriptions are kept in one file in the lab's
folder, each with its cursor, so a lab started again delivers on. Effect's McpServer serves none of this, so the lab serves it in a
middleware in front of its MCP route; [plans/lab-mcp.md](../../apps/animations/plans/lab-mcp.md),
"MCP Events", has the methods, codes and limits. ChatGPT reaches a server only
over public HTTPS, and the lab provides no public route: a ChatGPT subscriber
needs one made for it.

### The easel: `film lab look`

A look is a still of a scene as its sources stand, drawn in about a second
with no render: the painter's step back from the easel after a passage. The
lab holds one export page per film open in its own process's Chrome
(`Easel`, `tools/easel.ts`, over the `Browser` a render uses: no second
launcher): the app's render page (`LabPageSpec.pages.render`, its
`index.html`), at the film's export place (`/films/<film>/export`,
`pageHref.export`) on the lab's own address, and a look seeks it to the frame and takes the canvas through the view
(`ExportHandle.still`, composed by `player/still.ts`). `film lab look` is
the lab MCP's `look` asked of the running lab (`tools/lab-client.ts`, at
`FILM_LAB_URL`, else `http://127.0.0.1:8229/`; The lab's commands, above);
the judge and the review ask the route itself (`tools/easel-client.ts`, an
`HttpApiClient` of `LabHttpApi`).

| Route                          | What it does                                                                                                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/films/<film>/looks` | `LookPost` `{scene, at: [place, …], view: {crop?, size?, mode, captions, format}, from?, levels?}` → `LookTaken` `{build, looks: [{file, scene, at, frame, time, width, height}]}` |

**Never stale.** Every look first asks the pages' build as it stands
(`LabPage.built`), judged by content, never by mtime: a build under way is
waited out, then the build about to be answered, kept or just made (its
watches and checks set), is judged last, at the moment it is answered: its
files must have printed alike before and after it read them, and print so
still (length and hash). A save no watch has heard yet, one in the build's
own second, one made while the build read, or one landing after it printed
what it read, is built first; files that keep moving through three builds
are a `PagesBroken` asking to look again once the saves settle. A failed
build is a 422 `PagesBroken` with the bundler's words and no still. The
answer names the build by its own number among those kept
(`PagesNow.kept`), and the look opens that build's export page
(`/films/<film>/export?build=<kept>`, or `?wedge=<id>` for a wedge, served
as it was made, unstamped, so it never
reloads itself), never one built after. The page is held per build
(`<server>.<kept>`): a new build closes it and opens a fresh one, so the
page always runs the code on disk; a page that fails a frame is closed too,
and the next look opens another. Looks run one at a time.

**Places and views** (`core/easel.ts`, pure). A place is seconds into the
scene (`2.5`), `mark:<name>` (the mark's word, as `scenesOf` places it) or
`cue:<name>[@<share>]` (0 the cue's start, 1 its end); it resolves to the
nearest frame inside the scene's own frames (`momentOf`) and answers that
frame's time. A mark or cue the scene lacks is a 404 `LookPlaceUnknown`
naming the ones it has, seconds past the scene's end a 422
`LookOutOfRange`, a scene the film lacks a 404 `UnknownScene`, words that
name no place or a crop off the frame a 400 `LookInvalid`. The view crops
(corners in canvas pixels, held to the frame, shown at 1:1), scales the long
side (`size`, 16 to 4096), and draws `plain`, `value` (greys) or `squint`
(greys blurred by 1.2% of the long side, at least 2 px, over the region's
edges stretched outward so the frame's border blurs into itself). A crop is
PNG and a whole frame JPEG at 0.95 unless the format is named
(`formatFor`): a 1920×1080 PNG of the paper is about 4 MB.

**Files.** Each still is written once, under `out/<film>/look/<scene>/`,
named by its time, mode, crop, size, captions and build
(`t0002.33.squint.crop0_0_700_500.b<build>.png`), so a path an agent was
handed keeps its pixels. `from`, the asker's films folder, guards a lab
serving another checkout: it refuses with a 409 `LabElsewhere` instead of
showing its own files. A look whose page fails is a 502 `LookFailed` with
the page's words. The CLI adds `LabDown` (no lab answered, or one too old to
know the route) and checks the request before sending it: one the route
would refuse unread (a `--size` under 16) is `LookInvalid`, asked of no
lab. A failure prints (`--json`, and `film judge --json`) exactly as the
route answers it, decoded by one schema, `ToolFailure` in `core/api.ts`:
the route's refusals, `LabDown`, the judge's own, and `ToolFailed`
(`{failed, reason}`) for any other. Each look logs `easel.look … ms= built_ms= page_ms=
draw_ms=`: the build asked, the page opened (0 when held), the frames drawn
and written.

**Wedges.** `levels` (`{ground: 'light'}`, `film lab look --levels '{"ground":"light"}'`)
draws a wedge, the printer's strip at several grades: each look named at
that level in place of the one it plays, the pick unwritten. The easel reads
the film's `palette.ts`, checks each look and level against the ones it
declares (`lookLevels`, `tools/choice-source.ts`; a 404 `LookLevelUnknown`
names them), and edits `play` exactly as a pick would (`editPick`), in
memory. `LabPage.wedge` builds the pages once more with that text in place
of the file (`PageBundler`'s `swaps`, a Bun plugin that also refuses a swap
the build never read), once per build and swap, the last few kept; the
wedge's page is answered at its usual path with `?wedge=<id>` and its files
under `/wedge/<id>/`. Its page is held beside the film's own (four at
most), and its stills carry the levels in their names
(`….wground-light.b<server>.<build>.<wedge>.jpg`).

### The match: `film lab match`

`film lab match --film <film> --scene <id> --at <place> [--figure <name>] [--json]`
holds each figure a frame draws against the concept it was painted from.
A rig declares its concept beside itself (`RivePropSpec.concept`, a
`ConceptRef` in `core/match.ts`: a set's image, `{set, file}` under
`out/<set>/`, or a Board try of the film's own, `{board}` under its
`board/`, and the figure's box in it, in the image's pixels); drawing the
rig declares its figure on the frame (`probeFigure`, `canvas/probe.ts`: its
key, its box on screen, its concept), and the export handle's `figures`
answers a frame's (`ExportHandle`, drawn under a probe like `probe`).
The easel draws the place as a look does (its never-stale build, its held
page), takes the frame plain, uncaptioned and as a PNG, crops each figure
with its own hands (`sceneBoxOf`) and its concept by its box, and measures
both (`measureFigure`, `core/figure.ts`, pure: RGBA in, numbers out).

| Route                            | What it does                                                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /api/films/<film>/matches` | `MatchPost` `{scene, at, figure?, from?}` → `MatchTaken` `{build, scene, at, frame, time, figures: [{figure, key, concept, rows, side, table, crops}], unmatched}` |

**The measure.** Every length is a share of the head's outer width, so a
concept and a scene compare whatever their sizes: the head's height, the
outline, the jaw, the body's width under the chin, at 0.35 and 0.7 of a
head under it and at the hem, the height in heads, the hand, the eyes'
spacing, the feet's width and height. The face's marks (the eyes' width and
height, the brows and the mouth) are shares of the eye spacing, centre to
centre (`FACE_MARKS`): the outer width holds the outline's ink, so a line
heavier than the concept's (27 px on RBF's Christ against 16) would shrink
every mark about 9% on a face drawn the same. The head's sides are the
silhouette ink's outer edge on its rows (`outerSides`), walked out from the
head's own regions through at most one outline's width of ink: a part is
classed by its paper, so dark hair round the face is the head's fill
however far its brown lies from the ink, a lit band painted on it is hair
and moves neither side, an ear stops the walk, and a line the outline runs
on into (a chair's frame) is not the head. The interior ink (a line
of the hair's own between it and the skin: the owner's rule is none); the
inner rim (a light band just inside the edge of an inner part of the head,
an ear or the hair, where that edge is not the silhouette; the owner's
rule is the concept's); the head's and the body's shading (each lit and
shaded half's hue, saturation and value, the edge between them, colour or
grey; the head's is its skin's alone, from under the eyes to the chin read
from them, so a headcloth its face runs on into with no line is never its
shade); the face's pose as its mouth shows it (`mouth`: open, a filled
shape whose stroke is over 0.8 of the head's line, or closed, a line); and
the outline (`FigureSilhouette`): the head's outer radius at 72 angles from
its centre, the body's sides row by row, the feet's box. The head's top and
its outline are where the ground stops at its ink (`outerOf`): what the
ground off the head, walled by the ink and the dark masses, does not reach,
opened by a line and joined to the face, so dark hair whose grain specks it
with ink (no region of its own) is the head's still; a light fill larger
than an ear that is not the head's (a robe or a chair the ink walls in) is
ground however it is walled. A face whose fill
runs on down the neck with no line at the chin (`chin: 'open'`) is read
down to the chin, the first row of the neck within 1.15 of its width (the
neck under 0.8 of the face's width and at least 0.15 of it, widening again
to the face's width within 1.2 of it); the neck is shut from the ground, so
the head is not the shirt or the paper the fill runs on into. An open chin
(the face meets the neck by a shade step, as the owner's B2 lead is drawn)
is a design the owner may pick, never a fault: it is only said, in the
sheet's table and its lines (`said chin=open`), and it flags no try and
sends no redraw. A ratio the crop does not show is left out with why
(`missing`: a hem behind a rail, whose line runs on past the body; feet a
rail hides; feet that would lie past the crop's edge). The line is the
longest run of dark ink that holds half the ink of the most-inked run, and
no longer than a twelfth of the crop, so a wall's thin lines or a long
dark band behind the figure do not stand for it.

**Facing and artifacts.** The head's facing (`facing`): its `turn`, the
eyes' midpoint off the middle of the face's opening on the cheek row just
under them (a share of that opening, + to the viewer's right; the opening
is the skin, from between the eyes to its last pixel, lit or shaded, before
the hair, the ink, the head's edge or a fill that is not skin, such as a
headcloth: a light rim at the head's edge is the skin's own), its `roll`, the eye
line's slope in degrees, and `eyes`, the eye line's length, which says how
coarsely the roll was read. The render's artifacts on the head
(`artifacts`, `core/render-artifacts.ts`), at 1:1 only: a pixel whose
colour lies off the blend of its neighbours two or three pixels across it
is a thin line of a third colour (an antialiased edge is a blend and reads
as nothing), classed by what lies either side: a `seam` (two fills), a
`sliver` (the outline's ink and a fill, the fill's luma off the line's by
more than the house rim's lift), or `weather` (one fill, over the face's
box from the eyes to the chin: rain across the face). Its pixels join into
marks, and a mark shorter than two of the head's lines is grain. Where
the hair meets the beard (`hairBeard`, left out where no beard reads): each
part's median colour, and the edge, the darkest band a beard row walks
through from the eyes' outer edge out to the fill past it, as a value drop
under the darker side.

**The table** (`compareFigures`, `matchTable`). A row per measure, the
concept's and the scene's numbers and their difference: a ratio is flagged
past 5% of the concept's; interior ink past 0.02 of a head; an inner rim
0.1 of a head longer than the concept's; the head's outline past a mean
gap of 0.03 of a head from the concept's (the widest gap named by its
side), the body's past 0.05; feet the concept shows and the scene does not
(or the other way); a shade's drop, turn, kept saturation and edge past
their tolerances, and a grey shade; the head's turn past 0.1 of the
face's opening from the concept's, and its roll past 6° and the grain of
each side's eye line (a concept's head angle is design, never information:
owner, 2026-10-17, ask `aab16c0cb70`); and any seam, sliver or weather on
the scene's head (the owner's rule is none; a concept is painted, so its
side is not read); and `hair/beard: parted`, where either side reads a
beard, flagged when the concept parts the hair from the beard (an edge or a
value step of 0.1 or more) and the scene, reading a beard, does not (owner,
2026-10-18, on Christ's render), its note each side's edge and step, beside
the edge, step and hue rows, never flagged alone. Two kinds of row are information,
never flagged: the height in heads (a figure's height comes from the cast's
height band, and a concept is a design sketch:
`.claude/skills/film/reference/character-design.md`, "One height band for
the cast"), and, where the two mouths' poses differ (a shout against a
closed mouth), the marks an expression moves: the eyes' height, the brows
and the mouth (a row `face: its mouth` names both poses). It guides; it is
never a gate: a concept is painted.

**Files.** Under `out/<film>/match/<scene>/`, each figure's side-by-side
(`<figure>.t<time>.b<build>.png`: the concept, the scene at one head
height with each artifact ringed (a seam red, a sliver blue, weather
green), and the scene again under the concept's outline in magenta, laid
by the head's centre and width), its table (`….md`) and its two crops at
1:1 (`….concept.png`, `….scene.png`, the critique's input), written once, so
a path handed on keeps its pixels. A figure with no concept declared, one whose
box lies past the frame's edge, a concept not on disk or unreadable, or a
crop where no figure reads is
`unmatched` with why; a `--figure` the frame does not draw is a 404
`MatchFigureUnknown` naming those it does. The CLI prints a head line, then
per figure its files and its flagged rows. The match is the scene
painter's step after a passage that touches a figure
(`.claude/skills/film/reference/scene-painter.md`). Each match logs
`easel.match … figures= unmatched= ms=`.

### The critique: `film lab critique`

`film lab critique --film <film> --scene <id> --at <place> [--figure <name>] [--json]`
(`tools/critique.ts`, its words pure in `core/critique.ts`; the lab MCP's
`critique` tool beside `match`) takes the match, then shows each figure's
two crops at 1:1 to a fresh Opus (`Counsel`, as `film judge` asks it:
headless Claude at max effort, Read its one tool, sandboxed) beside the
match's flagged rows and the app's figure rules (`FilmApp.critique.rules`:
sections of its rule files, each by its heading line). It asks for each
difference in head angle and turn, face shape and features (and where the
hair meets the beard: the owner, 2026-10-18, on Christ's render), pose,
proportion (never the height in heads, which is the cast's band), palette
and artifacts, and reads the findings (`CritiqueFinding`
`{figure, aspect, what, where?}`) from the answer's last `json` block. Its
sheet mode (`Critic.critiqueSheet`, `film concept critique`) asks the same
of a cast sheet's views, each beside the concept it faces as.

- **Staged.** A concept is a model sheet, so a scene's figures are held to
  it in design (face, proportion, palette) and to where the film stages
  them in state (what each wears, holds and does): the Board panel shown at
  the match's time (`panelStagedAt`, by the scene's marks; its image copied
  beside the packet as `board.<ext>`) and the script's picture of the
  beat (`stagingAt`). A staging that cannot be read is left out, logged
  (`critique.unstaged scene= at= part= reason=`), never a refusal. Each
  figure's line names where its hair meets its beard as the match measured
  it (`hairBeardLine`).
- **Batched.** One counsel run answers every figure at the place.
- **A job.** The counsel's run takes minutes, and Claude Code's MCP client
  cuts a tool call at 60 s, so the critique runs as a job in the lab
  (`Critic.start`, `Critic.job`) and a call answers by `CRITIQUE_DEADLINE`
  (50 s from its start: the match and the staging read come out of it, and
  the job is waited on for what is left; a match and read that outrun it
  answer as they end). Not done by then, the answer is
  the job's `handle` and no `critique`: call `critique` with `handle` alone
  (the CLI: `film lab critique wait <handle>`, which asks again until it is
  done) for its answer. A start of the same figures over the same packet
  while one runs answers that job's handle. At most 4 counsel runs go at
  once (`COUNSEL_RUNS`); a job past them waits its turn, and its handle
  answers meanwhile. A running job is kept until it ends; the lab keeps the
  last 32 finished jobs for an hour after each ends. A handle it no longer
  keeps is refused (`CritiqueJobUnknown`): start it again with the scene and
  the place: an answer the counsel gave is kept on disk (below), and
  answers it with no second run.
- **Cached.** The answer is kept at `out/<film>/critique/<hash>.json`, the
  hash over the packet's words as sent (its place left out, which names the
  build), each crop's bytes and the Board panel's: the same prompt over the same crops is never
  asked twice, and a prompt reworded is asked again.
- **Rules read once.** The rule sections are read when the critic is
  built: a heading its file lacks fails the build (`CritiqueRuleMissing`),
  as the judge's run does (`JudgeRuleMissing`). The app's
  `apps/animations/rules.test.ts` holds every heading to its file.
- **Fails open.** A counsel that fails, an answer with no `json` block or
  one that is not `{"findings": [...]}`, crops that cannot be read, or a
  defect is a skip: logged (`critique.skipped scene= at= figures= reason=`;
  a sheet's `sheet=` for `scene= at=`),
  said in each figure's file and in the answer's `skipped`, never a
  failure. Each finding is read on its own: one that does not read, or names
  no figure asked about (names match in any case), is rejected and said in
  the answer's `rejected` and the files, never dropped in silence. A
  critique logs `critique scene= at= figures= findings= rejected= cached=
  ms=`.
- **Files.** Each figure's findings are written beside its match table, as
  `<stem>.critique.md`.

The critique is the scene painter's step before a figure is called done,
and its findings are what `film review` records before an owner look
(`.claude/skills/film/SKILL.md`, the review gate).

### The cast sheet's measure: `film concept`

A cast sheet is one painted image of a cast member in the house look: a
turnaround (six views, left to right: front, three-quarter and profile to
the viewer's left, the back, profile and three-quarter to the right), a
pose sheet or a heads sheet. `film concept brief (--member <film>/<member>
--kind turnaround|poses|heads | --look <file> --references <file>
(--turnaround <who> | --layout <file> --kind poses|heads)) [--house <file>]`
prints the prompt one try is painted from (`tools/cast-sheet-brief.ts`).
With `--member` it reads the member's `cast-sheet.json` and `look.md` and
prints the prompt `film concept cast` paints its first try from
(`castRequest`); the files name a sheet with no record yet, a grown member
of the canon's heads whose hair shows. The prompt is the house
block made a sheet's by two swaps (a model sheet, no place behind), each
refused as `HouseBlockMoved` when the block no longer says its phrase, then
the references' note, the member's look, the layout and the sheet rules (the
member's height in its own heads, in words: the canon's three and a third
unless its record names its own `heads`, and each smaller figure a pose
sheet draws at its share of the grown height and its own heads; one outline
round each figure's silhouette with the head's outline
the one line inside it, the hair a shape behind the head and
the beard parted from it only when its record's `hair` and `beard` show, each circle hand at the end of its arm in its
sleeve and never a bare arm, the glide, no lettering). A layout or a look
with a clause that names a hand and says it floats is refused as
`HandFloats`, naming the clause, so a prompt never asks for a sleeved hand
and a floating one at once; a test reads every cast record's layouts and
look, the library's and each film's, through it.

`film concept measure <try.png> --kind turnaround|poses|heads (--member
<film>/<member> | --count <n> --anchor <view> [--slot <slot> ...] [--standing
<view> ...] [--level <view> ...] [--headgear]) [--concept <crop.png>:<view>
...] [--out <dir>]` measures a try. With `--member` the options are the
record's plan for the kind (`castPlanOf`, as `film concept cast` measures a
try: its heads, its smaller figures, its kept concepts held to their views);
a member and the sheet's flags together, or neither, are refused as
`SheetUnset`. The measure is `measureSheet` (`core/cast-sheet.ts`, pure; its
pixel reads in `core/cast-sheet-pixels.ts`). It finds the figures (ink rings at least 0.15
of the largest's box, each with its hands and feet) and reads the `count`
largest; a sheet that draws more says "N figures found, the sheet names M".
It reads each view's face with `measureFigure` where a `--concept` crop is held to
it, and with `readFigure` (the same numbers less the light rims, the shading
and the render artifacts, which the sheet's checks never read) where none is,
and checks, facing first:

| Check                                                   | Flags                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `facing`, `sameWay`, `profileWay`, `roll`               | a head that does not face its slot (a turn past 0.06 off the front, or under 0.04 toward its side); a pair of partner views that face one way; a profile that faces away from the three-quarter on its side (it reads no face, so its head band, the top 0.3 of the figure, is held to that three-quarter's: it matches better flipped than not); a turnaround head tipped past 5°                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `squash`                                                | the anchor's trace to its heads (the canon's 3.36, or the record's own `heads`) would squash or stretch the body past 10 %; not read on a heads sheet, nor under headgear (the canon is read on the lock), nor when the anchor stands and its head reads over half its figure (under 2 heads tall: not a head, so the canon and the anchor's head are said unread, and no view is held to its head)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `height`, `head`, `hand`, `width`, `hairFall`, `ground` | a standing view's height, any view's head or hand (in head heights) off the anchor's past 5 %, a smaller figure a pose sheet draws (its record's `figures`) held to its share of the grown height and its head to its own heads (a 2.2-heads child at 0.75 of the height has a head 0.75 × 2.6 / 2.2 of a 2.6-heads anchor's), but a view the sheet stands (each its `standing` names, or every view when it names none) whose head reads over half its figure (under 2 heads tall, not on a heads sheet) is said unmeasured for its head, and its head, hand and hair's fall are held to nothing, while a low pose it does not stand keeps its head; on a heads sheet, the head's height on the level heads, held to the anchor's, and the eyes' spacing among the heads of one turn, held to that turn's first level head (a lock of hair widens a head's box, never its eyes), and no hand; partners' body widths (the median row from 0.76 to 0.9 of the height, read on each row inside the span of the view's own body ring, so a neighbour's ink in its crop or its box and a hand floating beside it are left out) past 5 %; the hair's fall on level heads past 0.1 head; soles off the anchor's ground line past 2 % of its height |
| `papers`, `grey`, `lit`                                 | a paper farther than ΔE 12 from the anchor's; a grey paper (CRAFT 12); a view lit on its right (the key light is upper left)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `mirror`                                                | a partner view that is the other flipped (a mean difference under 6)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `sleeveReach`, `bareArm`                                | a hand that floats free: once its disc is cut out, no sleeve or arm crosses the circle round it, from any angle, met as flat colour or across the hand's ring, past a touch (half its radius), so every hand is a circle at the end of an arm in its sleeve (the owner, 2026-10-18, the look's v5 decision: "I actually like the style when they have sleeves and like arms, kind of like we have with Jesus and a lot of the characters so far in the cast. Let's make that kind of a standing role for the concept"); a joined hand held out (its middle past its radius from the body's side under it) or raised (above the shoulders, held out from the head's side) records the gap its sleeve closes as `reach`; skin below the neck that is not a hand, a hand being round (its sides within 0.75 to 1.33 of each other, filling 0.8 to 1.1 of its ellipse, 0.4 to 1.3 of the anchor's hand) or one clipped behind the body, hand-sized and meeting the robe's fill on under 0.35 of its ring                                                                                                                                                                                                                                         |
| `hairBeard`                                             | a beard (the first dark fill under the mouth, inside the head's line) that runs into the hair past the eyes with no line between them (the owner, 2026-10-18, on Christ's render); not read under headgear, which hides the hair                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

The face is found by its own read: the skin that holds the eyes, or lies
in the head's box down to the chin or under the mouth, is the face; the
neck is narrower than 0.6 of the head and shorter than 0.5. Where a check cannot be read it is
said, never passed: a view with no face (the back, the profiles, a figure
lying on a bed, a head bowed far) is unmeasured for facing, the sleeve, the
bare arm and the beard; a joined hand at rest against the body (or held
out from its side by under a tenth of its diameter, as a bare hand whose ring
touches the body's line is), raised in front of the head, or under the body's
last rows is unmeasured for the sleeve, since a sleeve to it is not told from a
touch; a round hand whose middle lies in the face's window (the
head's box widened by 0.1 of the head on each side, down to the chin or 0.3
of the head under the mouth) but which runs past the head's box, or one whose
middle lies in the neck's window under the chin (narrower than 0.6 of the
head, shorter than 0.5), its ring over the chin line or not, is unmeasured for the sleeve and the bare arm, never passed as a part
of the face or the neck; a view with no round hand, a head
with no dark hair at its crown and a face with no beard under its mouth
say so; a heads sheet says it draws no hands, and the canon, as a turnaround
under headgear does. Under headgear the head's box runs down the cloth, so
the face, the neck and the shoulders are read on the face opening's frame:
its chin the opening's foot, its width the silhouette's across the eyes.

Known gaps:

- A bowed head on a pose sheet can flag `facing`: the pose band is
  calibrated on the first kept pose sheet.
- `measureFigure` reads no face on a head rolled past about 7°.
- A round hand held wholly inside the head's box is not told from the
  face's skin, so it is read as a part of the face.
- An inked cuff on a hand at rest is not told from a touch, so it is
  unmeasured, never flagged.
- Under headgear with no face opening read, the head stays the cloth's
  box, so a hand hanging beside the cloth can be said as in front of the
  head or the neck: said, never passed, but its sleeve and arm go unread.

Each `--concept` crop is held to its view by `compareFigures`. It prints a
line for the sheet and one per flag, and writes `<stem>.measure.md`,
`<stem>.measure.json` (`SheetMeasure`) and `<stem>.overlay.png` (each view's
box, the anchor's top and sole, and where the canon puts a figure's top).
It guides the retry and the ask, as the match does; it keeps or drops
nothing.

### A cast member's sheet drawn: `film concept cast`

`film concept cast <film> <member> --kind turnaround|poses|heads [--tries 3]
[--lanes 3] [--dry-run] [--house <file>] [--house-image <png>]`
(`tools/cast-sheet-make.ts`) draws tries of one kind of the member's sheet
on the image route. The member's folder is its film's own role's,
`src/films/<film>/cast/<member>/cast-sheet/`, else the library's,
`src/library/cast/<member>/cast-sheet/` beside the films; neither is
`CastUnfound`. It holds `cast-sheet.json` (`CastSheetRecord`,
`core/cast-record.ts`, pure: the member's pronoun, its scope, each reference
image and what it is for, whether its hair shows (`hair`: `shown`, the
default, `covered` under a headcloth, or `none`), whether it has a beard
(`beard`: `shown`, or `none`, the default: the brief parts the beard from the
hair only on a member whose hair and beard both show), its own height in heads
when it is not the canon's (`heads`, a member of its own design such as the
plain figures at 2.6), and per kind the anchor view and, for poses and
heads, the layout in words and each view's slot, the standing views and
the level heads (as `--standing` and `--level` name them), on a pose sheet
each smaller figure (`figures`: its view, its share of the grown height and
its own heads, a child or a baby beside the grown member), and the kept concepts its
views are held to: a reference's file, the member's box in it and the views
that face as it does), `look.md` and the reference images; the record is
written as the repo's formatter leaves JSON (`repoJson`, `core/schema.ts`:
a short array on one line, a long one of numbers filled to the line), so a
write leaves no diff for `bun run fmt`; the references
stay out of git, as a board's images do. A kind the record does not set up
is `CastKindUnset` before any draw, a concept whose box shows no figure is
`CastConceptUnread`, and the brief is built once before any draw, so a
house block that moved stops the run. Each concept is measured once and
held to its views (`compareFigures`, as `--concept` is).

Tries run `--lanes` at once (three at most, the route's own limit). Each
lands in `out/<film>/cast/<member>/` as `<kind>-<n>.png` with its
`.measure.md`, `.overlay.png` and `.preview.png` (`sheetPreview`,
`core/cast-preview.ts`, pure: each view cut out at one head height, a
standing view's body under the chin drawn to its own heads (the canon's,
the record's, or a smaller figure's) with its head held, as the trace will
make it, the anchor's band across), and is recorded in `cast-sheet.json` under
the record's lock (`ContentStore.transact`): its prompt, its references (as
the sheet's folder reaches them), whether the underlay rode along, the try
it draws again, the measure's flags and the anchor's squash. A flagged try
is drawn once more with each drift named in a sentence (a head, hand or
papers drift held to the anchor view as the try measured it, in numbers and
words: its head's pixels and share of its height, its hand's share of the
head, its papers' colours by name and hex, `colourWords` in
`core/cast-sheet-pixels.ts`; on a heads sheet a head is held by its eyes'
spacing, in pixels, to its turn's first head; a smaller figure's height,
head and hands are held to its own size, a share of the anchor's, never the
anchor's own); on `facing`,
`sameWay`, `roll` or `squash` the retry also sends the underlay as its last
reference (`mannequinUnderlay`, `core/cast-underlay.ts`, pure: a blank
mannequin per standing view, their soles on one row with no line drawn
under them (a drawn line came back as a rule under every figure), each its
own height and its own heads tall (a smaller figure at its share of the grown
one's height, the grown one the record's heads or the canon's) and turned to its slot by its eyes, its nose and its feet, each hand a circle at the end of its arm in its sleeve (a profile draws its near arm alone); a view that
does not stand leaves its column empty; a turnaround's profiles are its
third and fifth views), written fresh as `underlay-<kind>.png`. A sheet with
no standing view, as every heads sheet, is redrawn with no underlay. A retry that still drifts is recorded with its flags,
never dropped; a try that draws nothing is a line and the run goes on. A
try the measure cannot read is recorded with why (`unread`), said on its
line, and drawn once more. A sheet the route paints with no paper (its
ground transparent) is read on white (`opaqueOf`), as the CLI's measure
reads one.
`--dry-run` prints the prompt and the references and draws nothing.

`film concept critique <film> <member> --kind <kind> --try <n>`
(`tools/cast-sheet-critique.ts`) cuts each view a kept concept faces from
the try at 1:1 beside the concept's crop, and asks one counsel run of them
with the measure's flags on each view (`Critic.critiqueSheet`: the scene
critique's packet, its figures said to be a cast sheet's views, the face
aspect naming where the hair meets the beard). Each view goes with what the
layout asks of it (its numbered clause, "one, …; two, …", after the words
its group shares, as "One to three are turned …: one, …", or the whole
layout when it numbers none), and the packet holds a sheet's head angle and
gesture to those words, not to the concept: a bow or a raised hand the
layout asks for is never a finding. A view no concept faces is said, never
critiqued against another's. The crops and each view's `.critique.md` land
in `out/<film>/cast/<member>/critique/<kind>-<n>/`.

`film concept keep <film> <member> --kind <kind> --try <n> --why <words>
[--ask <id>] [--replace]` (`tools/cast-sheet-keep.ts`) files the owner's
keep: the try as `kept/<kind>.png` in the member's folder, each view cut
from it as `views/<name>.png` (a turnaround's by the house's names, `front`
… `threeQuarterRight`; a poses or heads sheet's as `<kind>-<n>`), both
committed, and `kept.<kind>` in the record with his why and the ask. A kind
kept already, or a try the record does not hold, is `SheetKept`. The
owner's answer on an ask is the one authority that replaces a kept kind:
`--replace` with `--ask` (`tools/cast-sheet-filing.ts`) copies the kept
sheet and its views into the member's history,
`kept/replaced/<date>-<kind>-<try>/` (`<kind>.png` and `views/<name>.png`
beneath; `-2`, `-3` … after it when the history names it already), writes
the new try in their place, and last appends to the record's `replaced` the
keep replaced, the try kept for it, the history folder, the ask, his why and
when. A replace stopped at any write leaves the record and every file it
names in place, and the same command run again finishes it. A member that
keeps some views of a sheet it shares keeps the same view numbers of the new
try. `--replace` with no `--ask`, or on a kind not kept, and a new try
missing or unreadable, are `SheetKept`, and write nothing. The Board's lock
reads the new `kept/` and `views/` as before.

### The review: `film review`, and keep needs evidence

`film review <film> --set <name> --scene <id> --at <place> --at <place>
[--figure <name>]` (`tools/review-cli.ts`, its record pure in
`core/review-record.ts`) takes the evidence a keep is asked on. It reads the
scene's source key as `film project` reads it, then at each place (two
distinct or more, up to four at once) matches and critiques the scene's
figures and copies each figure's crops and side-by-side into the set
(`review/crops/<review>/<scene>.<place>.<figure>.{concept,scene,side}.png`),
then reads the key again: a scene changed between the two reads is
refused ("the scene changed during the review"). The run is appended to the
record (`review/evidence.json`: a list of reviews, each its id `r<n>`, the
film, the scene, its key, the figure it was narrowed to, when, its places,
the crops, every finding and each skipped critique), never written over
another, and the page (`review/evidence.md`, every review, newest first) is
written from them all; both are listed in the set's manifest. A finding's id
(`f` and eight hex digits) is the hash of its film, scene, place, figure,
aspect and words, so a finding read again keeps what was done about it.
`film review <film> --set <name> --done <id> --did "<what>"` answers finding
`<id>`: the fix made, or why it stands. A record that does not read is
refused, with its error. Each writes `review.written set= reviews= findings=
open=`.

The gate (`AskMaterials.evidence`, run by `AskStore.make`) reads an ask on a
production by its types, never its words (`core/review-record.ts`):

- **Typed.** An ask that shows scenes or figures (a `video`, an `image`, a
  `board`: `showsFigures`) gives every option an `outcome` (`keep`,
  `revise` or `other`) and every keep its `keeps` (`{film, scenes: [{scene,
  figures?}]}`, `scenes: []` for a script, a concept or a Board), or it is
  refused naming what to add (`untypedKeeps`): leaving the types out lets
  nothing by. A keep of another film than the production's ledger names is
  refused (`typingProblems`).
- **On the recommended way.** The keeps read are those on the way the
  ask's recommendations take (`recommendedPath`: from its start, each
  step's choices answered by their recommended options, on by the first way
  whose guard holds), whose `outcome` is `keep` and whose `keeps` names a
  scene (`keptOn`). A script keep, a revise and a keep only another answer
  reaches are not gated.
- **Evidence.** Each scene and figure kept needs, in the record its `set`
  lists, the newest review of that film's scene that crops the figure (a
  scene kept with no figures named: a review over every figure), its key
  the key `film project` reads now, every finding on what is kept answered
  (`evidenceProblems`). Otherwise the ask is refused, `AskInvalid` naming
  each missing review by the `film review` that takes it.

The one way past the evidence is the ask's `override: {quote}`, the owner's
own words verbatim, kept on the ask (`asks.evidence override production=
chars=`); it never passes an untyped ask.

### The judge: `film judge`

`film judge <film> --scene <id> [--point <id>]` (`tools/judge.ts`, its
words pure in `core/judge.ts`) is a blind second opinion on one picture
choice. A version is what an ask's picture choice picks between:
a look point's levels (`look:<name>`, each drawn as a wedge through the look
route, so the lab at `FILM_LAB_URL` must run) and a render set's variants
(`render:<address>`, the catalogue's videos at an address that holds the
scene, each cut by `Media.still` at the same film seconds). A sound point
is `JudgePointUnjudged`; unnamed, the scene's one picture choice with two
versions or more is judged, several are `JudgePointAmbiguous`, none
`JudgeNothingToCompare`. The moments are the scene's marks and its cues'
middles, one per frame as a look resolves it (`momentOf` at the film's fps,
counted from the film's start), at most `JUDGE_MOMENTS` (12) spread evenly
(`judgeMoments`); stills are 1280-pixel JPEGs, drawn straight to
`stills/<label>-<nn>.jpg` in a folder of their own under the system's temp
folder, beside `packet.md` and nothing else (a look's stills are copied
there from the lab's own files, which stay the lab's, so judges at once
never take one another's). The labels are drawn
by `Random.shuffle`; the key (`JudgeKey`) stays in memory until the counsel
has answered, and is never in `packet.md` (`packetOf`): the beat's words, its picture's brief,
its register (`registersOf`, the head of the brief) and act, the app's rules
that bear on it (`FilmApp.judge.rules`, each a heading of a file, for every
beat or for a register; a heading its file lacks is `JudgeRuleMissing`),
the stills by label and moment (each by its path beside the packet), and
the form of the answer; it names no place (a rule's file by its name
alone). The counsel is a seam (`Counsel`, `tools/counsel.ts`) with two
adapters. `Counsel.layer` runs headless Claude Code (`claude -p --model
opus --effort max --safe-mode --restricted --tools Read --strict-mcp-config
--no-session-persistence`, `claudeRun`), the packet on its stdin, from the
packet's folder, under macOS's sandbox (`tools/sandbox.ts`, `sandbox-exec`
with a Seatbelt profile, `profileOf`): every home, the system's temp
folders and other volumes are closed to reading, then an allow-list is
opened: the packet's folder, Claude's install (the native installer's
`…/claude`, its program's real path a version under `versions/`; any other
program, a wrapper script among them, is `CounselFailed` before anything
runs, `installOf`) and the user's keychains (its
sign-in) to read, and a scratch folder of the run's own to read and write,
which holds Claude's temp files (`TMPDIR`, `CLAUDE_CODE_TMPDIR`) and a
fresh state folder (`CLAUDE_CONFIG_DIR`; `CLAUDE_SECURESTORAGE_CONFIG_DIR`
empty keeps the keychain item of the default one, so the sign-in is
found). Nothing else is written, and none of `~/.claude` or
`~/.claude.json` is readable: no earlier run's folder, no look file, no
repo, no cache, no other session or transcript. What stays readable is the
system's own files outside the homes and temp folders. The environment is
`HOME`, `PATH`, those four and `DISABLE_AUTOUPDATER`, `LANG` and `USER`
alone, and the host's `ANTHROPIC_BASE_URL` when it has one (the owner's
teamclaude proxy), so the counsel asks the way the host's Claude does; its
`counsel.start` line names that route by the proxy's scheme and host alone
(`route=http://localhost:3456`; never its login, path, query or fragment,
where a token can sit), `route=proxy` for a value that is not an `http`
or `https` URL, or
`route=direct` with none, so a lab started without the proxy says so. The network is shared (the counsel needs the internet), so the
lab's loopback port stays reachable, though nothing names it. Its stdout
is the answer and its stderr the run's words, written as they arrive to
`claude.md` and `claude.err` in `<run>/counsel/` (a non-zero exit, or a
run past `COUNSEL_LIMIT`, 30 minutes, stopped with SIGTERM and killed 10 s later if it still runs, `COUNSEL_BOUNDS`, is `CounselFailed`, naming that
folder once the run printed there; off macOS the counsel fails so too); `Counsel.sandboxed` runs any command
so (the tests probe the sandbox with one); `Counsel.layerTest` answers
from a function of the packet. Its last `RANKING:` line is read (`rankingOf`: a
whole expression, every label once, `>` between tiers, `=` a tie, nothing
after; or exactly `no preference`; else `CounselUnreadable`) and unblinded
into `verdict.md` (`verdictOf`) in the run's own folder,
`out/<film>/judge/<scene>-<stamp>-<draw>/` (made by an exclusive mkdir, so
two runs never share one), beside the stills, the packet (as it was read)
and `key.json`: the ranking in real names beside the owner's pick
(the level the look plays, the render set's approved variant), the key, the
reasons with each label's heading named, and the counsel's answer and
packet by path. The judge writes no choice. It logs `judge.drawn label= stills=` per version and `judge.done
… ms=`.

## Review

The review is what the owner judges, shown to him in an ask: every render
under the review's roots as sets of variants, each film's options, and each
production's ledger. No page lists them: an agent publishes a set
(`publish_set`), shows its renders in an ask's section, and writes the
owner's pick through `film options`. It is the lab's server's
(`tools/review.ts`, `review-http.ts`, `choices.ts`).

**Terms.** The code keeps its own names, and the stored and wire words stay
as they are.

- **Production** (Kitsu's word, a film's or a track's): what the owner
  follows from start to finish, a film or a track such as the house look. It
  has **versions** (v1, v2, …), each with what it is for and the decision
  that opened it, and in each the sets published into it, the owner's words
  given outside the lab, and the questions asked of him (an ask made by the
  lab's `ask`, `film lab ask` or its MCP, that no pick in its choice, no later
  decision on it and no close of the ask has answered). Only the versions,
  the owner's words and the questions are kept (an ask on the production
  files its question as it is made and, closed, his decision: his answers in
  a line, his words as its quote and each choice's value as his picks, which
  an override may cite; `ProductionStore`: a ledger a production,
  `apps/animations/productions/<production>.json`, committed text, every
  image and render it reaches named by path, never copied;
  `FILMS_PRODUCTIONS` moves the folder); the rest is read from the sets. `forward` moves a production to its
  next version on a decision of the owner's filed in the version. A set lands
  on a production when its `review.json` names it (`film publish`, or
  `publish_set` given `production` and `version`, both stamped by
  `ProductionStore.stamp`, which refuses a production with no ledger as
  `ProductionUnkept` and a version it has not opened as `VersionUnknown`); an
  older set is filed by hand (`film production file`).
- **Set**: the renders of one address, each a **variant** (`ChoicePoint` of
  kind `render`).
- **Comment**: a note on a version, kept in the catalogue (a `say`).
- **Out of date**: a version made for earlier sources or an earlier mix (the
  state `stale`).
- **Proxy / Original**: what a video plays. The proxy is a light copy (720p at most)
  of a video too big or too dense for a phone to play as made (over 40 MiB, or
  over 8 Mbps, a drawn 2D render too: the quality `phone`); the original is the file itself
  (`full`). An ask plays the proxy on a phone while it is made, and the
  original once asked.
- **Needs review / Approved**: a version's approval (`none` / `approved`);
  "needs review: an earlier version was approved" is `stale`. There is no
  "Needs changes" status yet: a comment carries it.

**A choice point** (`ChoicePoint`, `core/choice.ts`) is the one shape:
at an address in the film, variants to compare, pick, comment on and
approve. Which point it is is data (`ref`, a `PointRef`): decoded from its
id once, where the point crosses the wire, and encoded back as the id alone,
so a verb reads the ref and never parses the id back. Each variant has a state (`current`, `stale`, `missing`), whether
it is picked, the verbs its state allows (`pick`, `unpick`, `reject`), its
media (`Seen`: a video; `Heard`: alone and/or in the film's whole mix;
`Unseen`), the key the owner's say is given on, and that say (approval and
comments, from the catalogue). A sound layer's level is no choice point:
the agents set it in `sound.ts`, as every other literal. One adapter per kind lists them (`tools/choice-points.ts`, render
sets in `tools/review.ts`), and one dispatch lands each verb
(`tools/choices.ts`):

| Kind     | Id                 | Variants                                                                                                                                                                           | A pick lands in                                               |
| -------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `render` | `render:<address>` | an address's renders in the catalogue, or a montage's `review.json`                                                                                                                | nothing: approved and commented only                          |
| `score`  | `score`            | `sound.ts`'s `score.options`, each heard as the whole mix                                                                                                                          | `play` in `sound.ts`                                          |
| `take`   | `take:<sound>`     | a library sound's kept takes and candidates, at the scenes it plays; a code sound's seeds (all play) and a code trial's (none does), which no verb reaches (`ChoiceVariant.fixed`) | the library's keep, unkeep, reject (`library.lock.json`)      |
| `voice`  | `voice:<beat>`     | a beat's recorded attempts, newest first; the timings' take picked                                                                                                                 | the timings, kept by `film options keep-voice` (then remixed) |
| `look`   | `look:<name>`      | `looks.<name>.options` in `palette.ts` (`ground`: now, light, …)                                                                                                                   | `looks.<name>.play` in `palette.ts`                           |

A look's options are levels a scene reads (`ground`: the paper's ground, `now`
at 0 drawing today's film); a render of another level is a render variant
(`--variant light`).
A score's pick changes what `full.wav` is mixed from, so
once the write of `sound.ts` lands the track is mixed again (`film mix
<film>`, fresh), and again on its undo, as a kept voice's is (the
rewrite's `follows`, `Follows.remake` in `tools/source-writer.ts`, which
answers when its track landed, `Remade`); a failed mix is logged
`lab.remake.failed` and the write stands, naming no mix.

**Sets are found by record, never by name.** A folder is listed only when a
record says what its files are. A film's project folder (`out/<film>`) holds
`catalogue.json`: each address the catalogue has renders of is a set, its
variants that address's renders (`main` first, a share copy in place of its
master), each with its stamp, the owner's approval, and its state as the
record says it (`recordedNow`): stale by its `sources` when a newer render at
its address drew other sources, by its `sound` when a newer video carries
another mix (`ChoiceVariant.staleBy`; whether the newest is current against
the sources now is `film project`'s). An approve's write judges each
option again: in the checkout's own folder for
the film (the project's `folder`, the server's ref of its out folder, names
the set's; that alone decides, never the folder's name, so the film's own
folder under a root of another label is judged by it too), against the
film's sources now (the rule `renderState` keeps). Anywhere else, a copy of the film's
folder under another root among them, it judges as the record says. The CLI
writes without telling the server, so the index shows a CLI change once the
server's last index read is older than its 15 s cache (`INDEX_FRESH`;
`?fresh` walks every root again). A montage folder (say a
look explored by hand) holds `review.json` (`ReviewManifest`), which names its
files: `videos` and `images` (loose files to show), `docs`, and per set a title,
order, start, moments, and each variant's label, tag, verdict, notes and
`file` (by default `<clip>.<variant>.share.mp4`, then `<clip>.<variant>.mp4`).
Montage images follow their manifest order so staged scenes read in sequence;
missing images are skipped and each file path appears once. Videos and docs
remain newest first. A folder's `blurb` renders as escaped Markdown, like its
notes and docs, so scene lists and judging instructions stay readable.
Optional `downloads` names file links relative to the montage, in authored
order. Use it for a native master or another artifact to save: explicitly
declared downloads are served with byte ranges even above the 600 MiB
inline-video limit. Downloads alone get no player, poster or phone copy;
inline video declarations retain the existing video and phone-copy limits.
Missing downloads are skipped, duplicate paths appear once, and links retain
the review's root and symlink checks.
A file neither record names is not listed; nothing reads a file name back.

**The roots.** `FILM_REVIEW_ROOTS` (comma-separated, each `label=path` or a
bare path) replaces the app's own roots (every checkout's `out/`);
`FILM_REVIEW_EXTRA_ROOTS` adds to them. Every route names a file by its ref
(its root's label, then its path under the root), never a path on the box.
Cached files (frames, phone copies, option mixes) are
kept in `FILM_REVIEW_CACHE` (`~/.cache/film-review`); `FILM_REVIEW_PHONE=off`
makes no phone copies.

| Route                                                           | What it answers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/review/index[?fresh]`                                 | `ReviewIndex`: every folder with something to review, newest first                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `GET /api/review/files/<ref>`, `/api/review/phone/<ref>`        | the file, or its phone copy, byte ranges answered 206                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `GET /api/review/frame?ref=&t=&w=`, `/api/review/duration?ref=` | a JPEG of a video at `t` s, `w` px wide; its length and its frames a second as its packets give them (`fps`, never rounded; none for a file with no video)                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `GET /api/asks/<ask>`                                           | `AskRecord`: an agent's ask (`AskStore`, `FILMS_LAB/asks/`): its machine, where its run is and every answer; `AskUnknown` (404)                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `GET /api/asks/<ask>/page`                                      | `AsksPage` `{page, asks}`: the page of asks that ask is on (`AskStore.page`), its asks in the order made; an ask kept before pages is a page of one; `AskUnknown` (404)                                                                                                                                                                                                                                                                                                                                                                                                              |
| `GET /api/asks/<ask>/shown/<file>`                              | the copy of an image the ask's page shows (`AskStore.shownFile`), by the receipt rule: an image whose src the receipt names is served only as its copy. Each file-served image of an image block or an option is copied as the ask is made, or the make is refused (`AskRefused`, naming the src). A board block's panels and a video's poster or frame show live and bind nothing. Each copy is kept in `FILMS_LAB/asks/shown/`, named by its bytes' SHA-256 and extension, and served only while it holds its hash (else `AskRefused`, 409); a name no image of the ask holds, 404 |
| `POST /api/asks/<ask>/answer`                                   | `{sections: [{step, values}, …]}` (the page's every section, in order, kept all or none; an older page's one `{step, values}` is one section; an empty `sections`, 400) → the `AskRecord` its machine leaves: each step's answers, typed; the same answers again answer it as it is; another answer to a step answered, one to a step the ask has left, past its deadline or closed, `AskRefused` (409)                                                                                                                                                                              |
| `GET /api/review/build?since=&server=&film=&timeout=`           | `PageBuild`: the pages' build, once past `since`, a mix of `film` among the changes (at most 60 s)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

**How a pick lands.** Every write goes through the one `SourceWriter`
(`source-writer.ts`), the lab's knob and cue writes included: it reads the
file, makes the new text, formats it with oxfmt through stdin, verifies it
(the edit reads back as meant), and swaps it in only if the file is still as
it was read (compare and swap, under the file's store lock, so another
process's store write, `sfx make` on the library's lock say, never lands
between the comparison and the write and is lost), then runs
`check --static`. A score or look
pick splices the one `play` string literal, and a knob its one level
literal (`choice-source.ts`, through oxc); a
take's act runs the library's own `keep`, `unkeep` or `reject` on the lock,
the writer recording the lock's bytes before and after and leaving the lock
as oxfmt does (the library's own JSON writer spreads short arrays the
formatter keeps on one line), so the diff is only the pick; when another
writer changed the lock after the act, its write stays and the lock is left
unformatted. A write that
changes nothing answers `(already so)` and records nothing. Each film keeps
its own undo stack (50 deep): Undo puts the newest change back byte
for byte, only while the file is exactly as that change left it (else
`UndoUnavailable`, a 409, touching nothing: the check, the takes brought
back, the write and the takes put away all hold the file's store lock). The file a change
touched is named relative to the film's folder (`sound.ts`,
`../../../sounds/library.lock.json` in the app).

**No per-placement pin.** A take is chosen for the whole sound, not for one
placement: the library's kept variants are the picks, and they rotate
through the sound's placements. Pinning one take to one placement would put
a second pick for the same sound in a second file (`sound.ts` beside the
lock), and the two could disagree: a take rejected in the lock while a film
still pins it. When one moment needs its own take, it is its own library
sound (`paper.page.hush`), placed there, and picked the same way.

**Mixes.** An option's mix is the film's whole mix (`Mixer.render`) with
that option playing (a score) or only that take at every placement of its
sound (`RenderOptions.take`), encoded AAC and cached under a key of the film,
the option, the take and the film's source stamp (the newest file under its
folder, the library's module and its lock). A mix renders the whole film (45–55 s for
righteousness-by-faith on the box under load), so mixes are made one at a time. The review imports no film itself: a process keeps the modules it
imported as they were, so each read of a film's options or checks, each mix,
and each keep, unkeep or reject of a take runs the film CLI again (`film
options list [--check]|mix|take|keep-voice`, `film check --json`, `film
project --json`: `FreshFilm` in `fresh-film.ts`, through the app's `self`),
and a hand edit to `sound.ts` or to a prompt in the sound library shows on
the next read. The type says so: the lab's handlers run with `LabContext`
(`lab.ts`) and `Choices` is built on `ChoicesNeeds`, neither of which holds
`FilmRepo` or `SoundLibrary` (`lab-context.types.ts` fails the typecheck if
one joins). The film's folder (`FilmFolder`: its paths, the
app's films, the sounds folder) is all the review reads of a film in
process. The points a film read at its source stamp are kept (`Choices`,
a cache keyed by film and stamp), so a pick checks its point against them
and a pick costs one fresh run, `options list --check` for its answer,
not three. A film is named in a route as one of the
app's films (`filmNamed`): any other name is a 404 listing the films, never
a path. `/api/review/files/<ref>` answers only what the index lists (a video, an
image or a doc where a walk looks, or a file a manifest names). Lengths,
frames and phone copies are the Media service's (`duration`, `still`,
`phoneCopy`), and a mix is written as an m4a by `writeAac`.

**The remote surface.** The lab is served where the owner reaches it from
a phone over the tailnet, so `LAB_HOST` defaults to loopback and the
lab listens at `FILM_LAB_PHONE_URL` itself (the laptop's Tailscale address,
`http://100.92.183.50:8230/`), the same handler on both. Every request passes the API's one gate (The
HTTP API, above), the pages and their scripts included: the app's server has
no route of its own, only `labHandler`, which admits first and then hands what
is not `/api/*` to the pages (`LabPage`, above). A Host
that is not the listener's own is a 403 (DNS rebinding),
and so is any request a browser marks cross-site (`Sec-Fetch-Site`), but a
link opened on another site to one of the pages. A write
must also carry an `Origin` of one of those hosts (`http://`)
and, when it carries a body (a POST always), a JSON one: another origin is a
403, a text/plain body a 415 (so a form on another site cannot post), a bad
body a 400. A DELETE, PUT, PATCH or OPTIONS with no body is the one write
with no JSON body, as an MCP client's session end is. An ask's answers are
behind the same gate: a write from the phone at its address is the lab's
write.

## Check

`film check <film>` fails (after reporting every finding, not the first) on
what a review used to find by eye. It runs in legs (`tools/film-check.ts`),
each typed by what it needs: the static leg (`staticLeg`: the film's files,
FileSystem and Media, and SoundRender for the derived sounds it places), the
cast leg (`castLeg`: the cast library, FileSystem and FilmFolder), the
sound leg (`soundLeg`: the mix, Mixer), and the
layout and look legs (`layoutLeg`: the browser, Checker and Looker), and the
draw leg (`drawLeg`, `tools/draw-check.ts`: the film's `film.ts` built from
its committed timings and each scene drawn in this process into the stand-in
context at its moments, as `tools/talk.slow.test.ts` runs it in `test:slow`).
`--static` runs the static leg alone, with no mix and no browser: it is what
the lab runs after each write; with `--folder v<n>` it checks that version
folder's own files (its scenes, takes, sound and credits). `--sound` adds the sound leg, still with no
browser. `--draw` adds the draw leg instead: `DrawThrew` (a scene that
throws), `FrameImpure` (a cue start or 60% point that, drawn after the frame
after it and after the frame before it, leaves different calls), and the
warning `InkOverFace` (a visible stroke or line of text drawn after a face the
viewer sees, `seenFace`: its scene's own, mostly opaque, centred on the frame,
the one rule `FaceSmall` measures by too; through `FACE_CORE` of its radius; a kit declares a face with `probeFace`
once its person is drawn, so the person's own features, headwear and hands
come before it; fills, the caption and a stroke that `marks` a line are not
read, and a gradient glow is invisible to the probe). With neither, all of them run. Every finding comes back in one
`Report` (`tools/findings.ts`): levelled by `levelOf` (one exhaustive
table, `--allow-stale` included) and addressed by `addressOf` (its scene and
the film second it starts at; a finding about the whole film has neither).
`--json` prints each as a `CheckLine`, `{ level, tag, message, address? }`.

- **Static** (no browser, `--static`): a named cue that ends after its scene
  (`CueLate`); a sound cue naming an unknown scene, cue or mark; a score movement
  out of film order or under 3 s (`MovementTooShort`); a take that is missing or
  was recorded for other text or another voice (`TakeStale`); a generated
  sound whose request hash has moved (`AssetStale`); once every take is
  recorded, an audio master that is missing (`AudioMissing`), not the
  film's length or mixed for another plan than the film's now (`AudioStale`:
  a score pick, a re-take or a moved effect since the last `mix`). A cast member a beat's `cast` names that the board cannot draw from (`CastUnreadable`, one per member, naming its beats: no `cast-sheet.json` in the film's cast or the library, a record that does not decode, or a reference file not on disk; the cast leg, `castLeg`, reads each member once through `castReference`). `--allow-stale` reports stale takes, sounds
  and master as warnings. `--scene id,id` or `--act name` limits the
  layout leg to that address's scenes. Every command that takes a part of
  the film (`render`, `check`, `cues --short`, the look pass) names it as
  one `Address` (`core/address.ts`: `Film`, `Act`, `Scenes` or `Short`;
  `addressOf` from the flags, two at once an `AddressConflict`) and resolves
  it once with `resolveAddress` into a `Scope`: its placed scenes, its span
  in film seconds (an act or scenes; none for the film or a short), the acts
  it covers whole, and its short. A name the film lacks fails there with
  `UnknownAct`, `UnknownScene` or `UnknownShort`, and scenes the film does
  not play one after another (`--scene a,c` with `b` between) with
  `ScenesApart`: a part is one stretch, so its span, its render and its
  stamp cover exactly the scenes named. `sceneIndexAt(placed, T)`
  (`core/layout.ts`; `sceneAt` its scene) is the one rule for the scene
  playing at a time: the last to have started, within `CLOCK_EPSILON`, and
  the first before the film starts. A sound never generated
  (`AssetMissing`) is always a warning: the mix plays without it.
- **Layout** (headless pages, like `render`): each scene is sampled at every
  mark, every cue's start and end, and its 60% point, pulled after its
  entering transition (mid-transition two scenes cross by design). The player
  draws each sample with the **probe** on and returns every line of text as
  a box in canvas pixels, turned with its transform, and every mark of ink
  (a brush stroke's centre line and width, a fill's outline, a declared
  plate) with its opacity and its place in the drawing order. Two different
  lines both above 0.3 opacity that overlap by more than 4 px either way are
  a `TextOverlap`; a visible line cut off by the frame's edge is a
  `TextOffFrame` (a line wholly outside the frame has slid away and is not).
  A visible stroke whose centre line runs through a visible line's box for
  more than 4 px, where no opaque plate drawn after the stroke covers it, is
  an `InkOverText`, measured along the crossing (a segment-versus-box
  clip, not the bounds). A line on a plate that the frame cuts off, and that
  sits still there, is a `PlateOffFrame`. A line drawn on a declared plate
  (`probePlate`) whose box leaves the plate's box by more than 4 px is a
  `TextOffPlate` (a brief overrunning its card). Findings merge per scene and
  text (or pair), at the worst sampled frame.
- **Holds** (a warning, found in two steps): the static step (`holdCandidates`)
  finds each stretch of a drawn scene over `HOLD` (4 s) inside its voice's
  spoken span (first word's start to last word's end, from the take's word
  timings) where no cue starts, ends or runs and the scene is not arriving.
  The layout leg then looks inside each candidate at one frame per boil tick
  (`holdTicks`, `BOIL_FPS` a second, so a sway slower than the boil is seen
  at more than one phase). It probes a grid tick every `HOLD / 2` first
  (`holdGrid`): a still run over `HOLD` spans two grid ticks in a row, so
  only where two in a row hold still does it probe the ticks around them,
  growing the run each way until a tick moves. Motion no cue declares ends a
  run; the still stretch after it is still found. The longest run over
  `HOLD` is a `StaticHold` with its scene and film `from`–`to`. A mark is at
  rest when its box moves no more than `STILL_DRIFT` of its own units (the
  screen drift over the `scale` the probe records, `sqrt(|det|)` of the
  transform it was drawn under) and its opacity no more than `STILL_FADE`
  (0.02). `STILL_DRIFT` is twice `STROKE_JITTER` (1.1), the most one boil
  tick moves a default stroke's box edge, so a boiling stroke is still at any
  zoom and a walk loop or drifting snow is motion. Glyph and torn-edge boil
  never reach the probe: `write` records its box from the unjittered glyphs,
  `cutout` the shape it was given. The caption line and its plate are the
  voice, not the picture: the caption probe tags them `caption`, and the diff
  leaves them out, whatever they say. Known limits: the diff sees boxes and
  opacity only, so a colour change (a dawn warming, a stain fading by
  `fillStyle`) and anything the probe does not see (`unprobed`, `drawImage`
  textures, raw canvas paths) read as still, giving a warning that asks for
  a look; a stroke drawn with a `jitter` over the default boils past
  `STILL_DRIFT` and reads as motion. `film check` stays
  green on it; `--static` skips it, since telling a still picture from
  undeclared motion needs the frames.
- **The ending and the air**: the stretch after the last word under 20 s, or
  an end card (a last scene that speaks nothing) under 5 s, is an `EndShort`
  warning (static). Once every take is recorded, the sound leg renders the
  mix the film makes now in memory (not read from `full.wav`, which may be
  stale) and reads it in 50 ms windows, its sides' power summed as a listener
  hears it (`windowPowers`): a run under −60 dBFS longer than
  1.5 s is `DeadAir`, an error, less any span a cue declares with
  `silence: true` (`{ at: 'start', offset: 2, dur: 3, silence: true }`),
  the designed silences the script means. The same mix is held to the
  balance, as warnings: a master more than 3 LU off −18 LUFS
  (`MasterLoudness`: a hot peak held the mastering lift back), and an effect
  whose loudest 50 ms comes within 3 dB of the voice around it (`EffectHot`).
- **The look pass** (headless pages, `looker.ts`, measures in `look.ts`):
  every scene drawn at 2 fps and shrunk to a 64×36 thumb (the research's
  measure). A second holds when both its half-second steps change the mean
  grey by under 2 (paper grain and boil alone score 0.5–2); a spoken, drawn
  scene held for over 40 % of its seconds is a `HeldShare` warning naming
  its longest held run. A kit's person declares its head with
  `probeFace(ctx, x, y, height)`; a spoken scene whose largest face (seen at
  over 0.5 opacity, its centre on the frame) never reaches a third of the frame's height is
  `FaceSmall`. A floating hand declares itself every frame, at rest or at
  work: `floatingHand(ctx, root, g, style, hand, { over, body })`, given
  whether it is drawn over its figure and the figure's silhouette (`HandBody`),
  calls `probeHand(ctx, { side, shoulder, at, to, size, radius, reach, grip,
  formed, over, body })` from what it knows (its side from `root.away`, where it is, where
  it works (its rest, with no work), its mitten's size, the figure's reach
  radius, how far it has travelled, the grip it works with as shares of each
  grip (`GripShares`: `grip`, or `was` changing into it) and how far that
  grip is formed from the open rest), so any film's hands are checked; it
  is declared even while its alpha hides it. A kit builds the body only
  while `probesHands(ctx)`, so an unprobed frame pays one lookup. Then the hands pass: between two samples of a scene across
  which any hand travels to or from its work, changes its grip at work, or
  comes or goes at work, every frame is drawn again (`handSpans`); a hand
  (found a frame on by its shoulder, within 24 px) that moves about its
  shoulder by more than 1.5 of its length, changes size against its reach
  by more than a quarter, or, formed, swaps more than half of its grip
  (`GRIP_JUMP`: a grip written `raised < 0.5 ? 'hold' : 'palm'`, where
  `was` and `change` on a named cue would morph it) between adjacent frames
  while seen is a `HandJump` warning; each is measured in the figure's own
  reach, so a pan, a zoom or the whole figure scaled is no jump. A hand sent to a target farther from its shoulder than
  the reach, seen, is `HandFar`, one per scene and side. A hand at work
  (travelled 0.9 or more, seen at 0.5) inside its own body's silhouette and
  drawn behind it is a `HandHidden` warning, one per scene and side; a far
  hand passing behind the body on its way to work in front is travel, not
  hidden. `film.ts` may export a `look` (`Look`: acts in film order, each
  `from` a scene, with a `name`, a `chapter`, and `luma`, `saturation` ranges
  and a `dark` share ceiling); over the whole film each act's measure outside
  its target is a `ColourScript` warning. Which scenes an act holds is one
  rule in `core/acts.ts`: `membersOf(parts, ids)` gives each part its scene
  until the next part's, the first reaching back to the film's first scene,
  and fails with `UnknownScene` or `PartOutOfOrder`; `stretchesOf` adds their
  seconds (the first starting at 0), which the score's `movements` read too,
  so a misnamed or out-of-order movement fails as an act does. A film lights its scenes from the same
  acts. The look pass judges only the acts its address covers whole (the
  film: all of them; `--act`: that one; `--scene`: none): an act measured
  on part of itself is not the act.

The probe lives in `canvas/probe.ts`. `write`, `block`, right-to-left text
and the captions record their text through it; `stroke` records its drawn
centre line and `cutout` its outline. A Rive rig declares its figure
(`probeFigure`: its key, its box on screen and its concept), which a
match crops by. A drawing declares the plate its text
sits on (a torn tag, a word card) with `probePlate(ctx, shape, () => write(…))`:
the shape it drew the plate with, and the lines on it drawn inside. A plate
hides what is under it as the text does, so it is measured as text too; the
lines drawn inside carry the plate's `order` (`on`), so a card never collides
with its own lines, while any other text over it does. The kit declares one
plate itself: a storyboard scene's card (`canvas/storyboard.ts`), so its id and
brief are checked against the card (`TextOffPlate`) and against each other
(`TextOverlap`). The films declare the rest (righteousness-by-faith: heaven's
banner, the court and cold labels, the thesis, message and word boards, the
declared card).
With no probe attached a draw costs one WeakMap lookup, and a probed frame
is pixel for pixel the same (it only reads the transform, `measureText` and
the path it was going to draw). The export handle exposes it as `probe(i)`.

What the rules leave alone, and why:

- A fade-out under a fade-in is not a collision (the 0.3 opacity floor), so
  there is no per-drawing allow-list.
- A stroke drawn **under** a line at no more than 0.5 opacity is page texture
  the words read over (greeked copy on a newspaper); drawn over the line, or
  heavy, it strikes it.
- A stroke that marks a line on purpose (an underline, a highlighter swash,
  a ring, a strike) says so with `marks: '<the text>'` in its style; it may
  cross that line and no other. It changes nothing drawn.
- A plate's "plate" is the topmost fill under the line's centre, drawn before
  it. One half the frame wide or high is a backdrop or a panel (a sky, a
  split page) and may bleed; a plate whose line is itself past the edge, or
  that has moved by the next frame (the check draws that frame only for a
  candidate), is entering or leaving.
- A hold leaves out the caption line and its plate, by the `caption` tag the
  caption probe puts on them, not by their words: they are the voice, and
  change over a still picture, while a card writing the same words as they
  are heard is the picture and moves. A storyboard
  card (`storyboard: true` on its scene, set by `storyboard()`) holds still
  over its words by design and is never a candidate.

## Named cues

A moment is declared once. A drawing names the moments something else reads
(a sound, another cue) in its `timeline`, each anchored to a narration
`{mark}`, another cue (`after` its end, `with` its start) or a scene landmark,
never to an absolute second:

```ts
export const justified = drawing({
  timeline: { slam: { mark: 'fiction', offset: 0.9, dur: 0.35, ease: 'inQuad' } },
  draw: (f) => {
    const slam = f.at('slam'); // progress(t, cue.start, cue.dur, ease.inQuad)
  },
});
// sound.ts: the thud lands where the stamp lands.
{ scene: 'justified', cue: 'slam', edge: 'end' }
```

`layout()` resolves every timeline once (`Placed.cues`, scene-local
`{ start, end, dur, ease }`) and returns a `Result`: a film that does not lay
out fails as a value (`LayoutError`) naming the scene and the cue:
`UnknownMark` or `UnknownCue` (with `by`, the cue that named it, and `known`,
what the scene has), `CueCycle`, `UntilBeforeStart`, `WordMissing`,
`DuplicateScene`, or a line that does not parse (`DuplicateMark`,
`TurnInvalid`; `parse(scene, text)` returns a `Result` too). The browser
turns it into a thrown error once, at load (`createFilm`). Every point in a
scene resolves through one function: `pointOn` in `core/timeline.ts` (on a
`SceneClock`), and `pointIn(placed, point, by)` in `core/layout.ts` over a
placed scene. A timeline anchor becomes a `ScenePoint` (`anchorPoint`:
`after` a cue is its end, `with` it its start), as a short's span and a sound
cue already are. A span that `ends: true` ends at its anchor and starts its
`dur` before it. A mark anchor may pin to a word instead of the mark:
`{ mark: 'gift', word: 'faith', dur: 0.6 }` starts on the first word said at
or after `{gift}` that reads `faith` (`wordAfter`/`readsWord` in
`core/narration.ts`, normalised by `normalizeWords` as the take check's word error is: any case, apostrophes dropped, each hyphenated part, accents kept, NFC). `film check` warns `WordPinFar` when the pin lands more than `PIN_REACH` (one) sentence past its mark, where a re-take that lost the word would have moved it. It warns `DurOnWord` (`durOnWords`) where a `dur` of `DUR_MIN` (1 s) or more puts its hand-sized edge (its end, or with `ends` its start) within `DUR_ON_WORD` (80 ms) of a phrase edge of its take (a word heard after, or before, a pause of `PHRASE_GAP` or more, or the take's first or last word): a length sized to this take. It is a report only; the fix is `until` a mark or a word pin. It warns `CueTwin` (`cueTwins`) where a scene declares one moment twice: two cues with the same edges on the same anchors (each `with` and `after` followed to the mark or landmark under it, so `{ with: 'dark', dur: 0.9 }` at `dark`'s length and ease is `dark`) and the same ease, stagger and silence; read the first where both are read. A line that never says it
there fails the layout with `WordMissing` (`core/errors.ts`), which the tools'
`placeFilm` fails with as itself (`PlaceError = LayoutError`),
so `film check` and every tool refuse the film by name; there is no fall back
to the mark. `f.cue(name)` reads a resolved cue and `f.at(name)`
its eased progress. A span declares its easing as data, `ease: 'inQuad'` (one
of the names in `ease`, `EaseName`), and a span without one eases
`inOutCubic`, as `progress` does. `f.at` takes no ease of its own: the ease
lives in one place, so a cue's `ease` written always changes the frame. With `drawing(...)`, a name the timeline lacks, in
`f.cue`, `f.at` or a span's `after`/`with`, is a compile error
(`canvas/drawing.types.ts` holds the checks). The sound plan's `cueTime` reads the same map, so picture and
sound cannot drift apart. Ornament (wobble, idle motion) stays inline.

The lint rule `film/no-hand-timed-seconds` (`lint/no-hand-timed-seconds.ts`)
holds a film to it: it refuses a literal second in a draw (`clamp(t / 2)`,
`(t - cue.end) / 1.5`, `progress(t, 1.2, 0.5)`, `keys(t, …)`,
`cue.end + 0.5`, `f.mark('x') - 0.4`, `f.dur - 1.5`, `t - 4.2`, `t > 3.5`,
`t - cue.start > 0.5`, and the same second held in a module `const`) and a
span offset over 1 s from its `mark` or the scene's `start`/`speech`, which
stands in for a word (pin the word) or for a pause (anchor it to `speechEnd`
or another cue and say why). A rate (`Math.sin(t * 7)`) is not a time. The
rule reads syntax only, so a product is taken for a rate and a local alias of
the clock or a helper hiding the subtraction pass; its doc comment lists the
limits.
`film/span-ends-on-anchor` (`lint/span-ends-on-anchor.ts`) refuses a span
that lands on its anchor written as `offset: -0.5, dur: 0.5`: it is
`{ mark: 'true', dur: 0.5, ends: true }`, its length written once. It refuses
too a part that ends on another cue's end only because the numbers add up,
`{ with: 'speck', offset: 0.49, dur: 0.68 }` beside a `speck` of `dur: 1.17`
(a drag of `speck` leaves it behind): it is `{ after: 'speck', dur: 0.68,
ends: true }` (it keeps its length) or `{ with: 'speck', until: { cue:
'speck' } }` (it keeps its start).
`film/no-ease-on-cue` (`lint/no-ease-on-cue.ts`) refuses `ease.X(f.at(cue))`
(or a const bound to one): `f.at` is already eased by the span's `ease`, so a
second curve is one the lab's picker cannot change, and a push whose zoom
takes it runs on another clock than its x and y. A push is a `shotPath` stop
with `pushInto`; another curve is its own cue or `f.keys`.
`film/no-cue-remap` (`lint/no-cue-remap.ts`) refuses a cue split by a
fraction written in the draw, `clamp(x * 4)`, `Math.min(1, x * 4)`, `clamp(x / 0.6)`,
`clamp(3 * x - 2)` or `clamp((x - 0.75) / 0.25)` over a cue's progress `x`
(`f.at(cue)` or a const bound to one): the part is a cue of its own,
`{ with: 'answer', dur: 0.4 }` or `{ after: 'into', dur: 0.1, ends: true }`,
which the lab can reach; a part that runs to the cue's end, `(x - a) / (1 -
a)`, is told to land there, `{ after: cue, dur, ends: true }`. It refuses a step part way through a cue the same
way, `x < k` (`<=`, `>`, `>=`, either way round) with `k` between 0.02 and
0.98: the instant is a cue of no length, `{ with: 'sit', offset: 0.056, dur:
0 }`, read as `f.at('colour') > 0`. A comparison nearer 0 or 1 asks whether
the cue has begun, is seen or is done, and passes. An instant the drawing's
own shape makes (a card that flips shows its other side once edge on) is
read from the shape, `Math.cos(f.at('flip') * Math.PI) < 0`, which no
comparison of a share refuses and a drag cannot leave behind.
`film/framing-is-a-knob` (`lint/framing-is-a-knob.ts`), on a film's scene
files, refuses a framing written out (`{ x: 1060, y: 580, zoom: 1.18 }`) or
blended by hand (`zoom: lerp(1, 1.12, f.at('hold'))`, `cam.zoom = lerp(…,
ARK_IN, …)`, a camera spread from another with a field blended over it,
`{ ...cam, zoom: lerp(cam.zoom, 1, roof) }`): a framing is knobs read with `knobCamera`, a move a
`shotPath` of them, a held push `pushOn` with a number knob. The unmoved
frame (`UNMOVED`, `canvas/camera.ts`, whose numbers the rule reads) and a framing derived from the scene's geometry (a point that is not
two numbers) pass; one shared across scenes lives in a set file.
`effect/noPointFreeLog` (from `oxlint-plugin-effect`) holds the tools too,
over all of `packages/film` and `apps/animations`: a variadic logger
(`Console.*`, `console.*`, `Effect.log*`) handed point-free to a callback that
is passed an index (`Effect.forEach(lines, Console.log)`, `xs.map(console.log)`)
prints the index after each line, so a reader of `film lab events --follow` gets a
field that is not there. Write `(line) => Console.log(line)`.
`film/no-read-once` (`lint/no-read-once.ts`) holds the lab's browser tests
(`*.dom.test.ts`): a test waits for the value it asserts through
`src/lab/fixtures/settled.ts` (`textIs`, `textHas`, `countIs`, `evaluates`
for a script's answer, `waitFor`, `until`), and a read that times out
fails naming what it wanted and what the page last showed. A one-shot read
(`textContent()`, `$eval`, `$$eval`,
[`isVisible()`](https://playwright.dev/docs/api/class-locator#locator-is-visible),
`getAttribute()` or `count()` on the page or a locator, and an `evaluate(…)`
whose answer `expect` asserts or a matcher compares with, followed through a
`const` bound to it, a local helper that answers it, a part of it, a
literal that holds it and a value computed from it, as `after - before`)
takes whatever the page had drawn at that instant, and
is refused. An `evaluate` run for what it does is an action, and so is one
whose kept answer only a wait reads (a baseline the page keeps).
`effect/requireSpawnBudget` (from `oxlint-plugin-effect`) holds every test of
`packages/film`: a test whose body spawns a process (effect's
`ChildProcess.make`, the global `Bun`'s `spawn` or `spawnSync`, `spawn`
imported from `bun`, `node:child_process`, or a function of the same file
that does) gives its timeout in milliseconds as its last argument, its
spawn budget, at least 20 s (its `minimum`): a cold start's time is the
machine's, and a shorter budget fails a loaded one sooner than none.
A spawn inside a service the test provides is not seen.
`film/tests-keep-their-strength` (`lint/tests-keep-their-strength.ts`) holds
every test, fixture and preload of the repo: a test runs every time at its
full strength. It refuses a runner member that runs a test less (`.skip`,
`.only`, `.todo`, `.failing`, `.skipIf`, `.todoIf`, `.if`, `.runIf`, and the
`x`- and `f`-prefixed runners), a `retry` in a test's options, a timeout of
a test's own over bun's 5 s or of 0, which sets none (or one it cannot read),
unless the test starts a process (its body, a function or a module `const`
of the file it reads, the same starters as above), and a `setDefaultTimeout`
over 5 s or of 0. oxlint's own
jest and vitest rules see no runner imported from `bun:test` or
`effect-bun-test`, so they are not used. The browser suite (`e2e/`) sizes
its own timeouts (`{ "timeouts": false }`). A spawn the rule cannot see (one
inside a provided service) is said where it stands, by a disable comment
that names it.
`film/no-lazy-test-fixture` (`lint/no-lazy-test-fixture.ts`) holds every
test file of the repo: a fixture the file's cases share is not a memo made
as the file loads (`Effect.cached` and its TTL forms, outside every function
but a `describe` body), which the first case to ask builds inside its own
time limit, so the case that pays moves with the order the cases run in. It
is built as the file loads (`const x = await Effect.runPromise(…)`, beside
an `effect/noAsyncFunction` disable that says so), or in each case.
`film/test-git-config` (`lint/test-git-config.ts`) holds every test file of
the repo: a test repository's git takes no `-c key=value` written in the
file (in an array that starts at `'git'`, that a call is handed beside a
`'git'` argument or by a name that says git, or that such a name holds); it runs with `TEST_GIT` (`packages/scripts/src/testing.ts`) ahead of
its arguments, which keeps the machine's name, mail, signing, hooks and
editor out and turns git's automatic maintenance off. Git starts that
maintenance detached after a commit, and its `.git/objects/maintenance.lock`
comes and goes while the test's scope deletes the folder, so the delete
fails (ENOENT) and the case with it.
`film/touches-serial` (`lint/touches-serial.ts`) holds the browser tests
(`e2e/`): a finger (`page.finger`, one or two) is read, and the touch gesture
(`touch`, `lab/fixtures/gestures.ts`) called, only inside a `test.serial(…)`
body, since while one tab's touches are under way Chrome drops, or lands as a
bare click, the touches a file's other cases send their own tabs at the same
time.
`film/told-after-answer` (`lint/told-after-answer.ts`) holds the browser
tests (`e2e/`): a fake route tells the case it was asked only through the
harness's `told(tell, then)` (`src/lab/fixtures/harness.ts`), which runs the
tell once `then` is made: a `madeBy` once its effect has run, a `later`
before its gate. A completed `Deferred` runs the fiber waiting on it at once,
inside the call, so a case told before the answer is made runs its next step
(another hand's write, a line put back) first, and the answer made after
reads what that step changed: the read the case was told of never reaches
the page. Refused is a call of effect's `Deferred` that completes one
(`done`, `doneUnsafe`, `succeed`, `fail`, …) anywhere in the answer handed to
the harness's `route(…)` (a condition, an expression body, an effect it
makes), but inside `told`'s first argument, or on a `Deferred` the answer
makes itself; `route`, `told` and `Deferred` are read by their bindings.
`film/no-history-comment` (`lint/no-history-comment.ts`) holds every comment
in `packages/film`, `apps/animations`, `packages/ui`, `packages/url-state`
and `packages/atom-solid`: a comment says what the code does now and why, and
how it got here lives in the ledger and `git log`. It refuses only the forms
history takes on its face: a loop pass by number, a batch id, a ledger id and
a commit hash, each outside a quoted literal and a URL. History told in words
(what the code used to do, which pass changed it) is a review finding
(`CLAUDE.md`, **Comments**), since no pattern can read it.
**A mistake found once** becomes a check when the check is cheap, so the
gate (`bun run gate`: oxlint's deterministic rules and the unit tests) finds
it the next time: a mistake a syntax tree shows is a deterministic rule; one
a small fast test shows is a unit test; one only a reader can see is a
judged rule with its labelled corpus, run by `bun run test:slow`; one of
taste or process that no item shows is a line in a skill. A mistake with no
cheap check gets none: its review finding is classed `none`, and the ledger
needs no entry for it. For example, a review found a `describe.skip` and a test's timeout
raised to 120 s, which a tree shows, so `film/tests-keep-their-strength` is
a rule of the house plugin (`lint/tests-keep-their-strength.ts`, its cases in
`lint/fixtures/` held by `lint/plugin.slow.test.ts`, on in `.oxlintrc.json`). The
owner twice took Ellen White, the pioneers and 1888 out of a film's
narration; no pattern tells a pioneer named from his idea told unnamed, so
`judged/scriptSpeech` is an entry in `.oxlintrc.json`, its corpus of the
removed beats and their clean rewrites in
`packages/scripts/src/judged/fixtures/script-speech.json`, its threshold set
from `judged:measure`. A film that ended somewhere else than it opened is no
item of any file, so it is a line of the film skill
(`.claude/skills/film/CRAFT.md`, **Bookend the setting**). A check's doc
and each ledger guard that names it
name what it reads as one closed list, and nothing wider: no clause that any
rule "fails it" (`apps/firsttheblade/scripts/computed.ts`, its leaf).
**Judged rules** are the rules a pattern cannot decide, decided by a model
and reported by oxlint. Each is an entry `judged/<id>` in `.oxlintrc.json`,
its options its whole definition (`packages/scripts/src/judged/rule.ts`): a
selector (which items it reads), the subject, the classify instructions and
criteria, the label that reports, a threshold and a message;
`settings.judged` names the model by its exact id (`jev-1.13.0`), whose
measurements set the thresholds, and where the answers are kept. Its
severity is its gate: `warn` reports, `error` fails the lint, `off` judges
nothing. The rules are `historyComment` (a comment's history), `testOracle`
(a test whose oracle is its code), `silentDrop` (a function that drops what
it cannot handle unsaid), all at `warn`, `scriptSpeech` (a film beat that
names its sources or church history), at `error`, and `commentClaimsCode` (a
comment that claims more than its code), `off`: reviewers found none of its
findings over the repo true (`docs/lessons.md`); over each,
`.oxlintrc.json` says what its corpus measured. To add one: write its entry
in `.oxlintrc.json` (at `warn`), add its id to `RULE_IDS` in
`packages/scripts/lint/judged.ts` (the plugin defines each rule by name, and
`packages/scripts/src/judged/config.test.ts` holds the two lists equal, an entry at `off` too), write its labelled
corpus in `packages/scripts/src/judged/fixtures/`, and measure it. `bun run
lint` (and so `bun run test:slow`; the gate's lint leaves the judged rules
out) runs the runner (`packages/scripts/src/lint-judged.ts`,
`bun run lint:judged`) first and oxlint after it. The runner reads every item
of every rule in the working tree, tracked or new (git's ignored files and
the config's `ignorePatterns` aside; a series script's Markdown in its tables
and its `**say:**` and `**picture:**` paragraphs), and asks TypeSafe's model
about all those the store does not answer in one request, split past 200
items, about 60,000 estimated input tokens, or 30,000 for the state and any
one question (TypeSafe holds a question to 32,768; each rule's
`charsPerToken` is what Jev counted over its items), a part the model still
refuses as too long asked again in halves. The store (`settings.judged.store`, in
git's common dir, which every checkout and worktree of the repo shares, a
`redfirst` scratch worktree too) is keyed by content: a hash of the words the
model reads for the rule (subject, instructions, criteria), the model, and
the item's key: what of it a formatter does not change, code by its parsed
form (each node's type and fields, not where it stands or how a number or
a string is spelt; a template's raw text stays) and comments and prose by their words, each run of whitespace one
space (`packages/scripts/src/judged/items.ts`). So a rerun asks only for an
item or rule words it has not seen, an edit a parser sees or to a rule's
words asks again, a threshold or a message changes no
answer, and a moved, copied or re-indented item keeps its answer; a run
marks each answer its tree reads seen that day, and drops an answer no
checkout has read for 30 days (`MAX_AGE_DAYS`), never one another tree reads.
Two runs that ask one item at once keep the answer kept first, and each
reports by the store's answer.
The checkout keeps its own two files beside (`settings.judged.checkout`,
`tmp/judged`): a memo of each file's items and their keys by the file's
hash (`items.json`), so a run parses only the files changed since, and the
run's findings by file (`findings.json`). The plugin (`packages/scripts/lint/judged.ts`)
reports a file's findings from the last run when the file hashes as it did
then, the rule's words, selector, label, threshold and model are the same,
the code that makes the items is the run's, the run read the store the
settings name now, and the run is no older than `MAX_AGE_DAYS`; otherwise it hashes each item of the file the same way the runner does and
reports the kept answer at or over its rule's threshold at its line,
wherever the text now lives. It asks no model, so a checkout with no store
reports nothing. The runner
prints, and gates on, only the findings oxlint cannot report (a Markdown
series script, an answer the store could not keep), and one line a rule;
`--strict` prints every finding and fails on any. It never fails on its
model or its host: no key (`TYPESAFE_API_KEY`, else the keychain item
`typesafe-api-key` within 2 s), a part past 5 s, an account with no
credits left, a rate limit or an overloaded host (a 429 or a 529, each sent
again up to three times inside the part's 5 s, after the wait the refusal
names or a backoff from 250 ms), an HTTP error, one item alone past the
input limit or an answer that misses items passes (after no key, no
credits, a rate limit or an overloaded host past its retries, or a part
past 5 s, no part not yet sent is sent), and prints
`[judged] skipped rule=<rule> reason=<reason> items=<n>`; any other failure
(git, the lint config, a defect) is `rule=* reason=error` with
`detail=<tag>`, a store that does not decode is read as empty with one
`[judged] store unread` line, and answers the store cannot keep are asked
again next run. Two runs keep their answers under one lock, SQLite's write
lock on a file beside the store (`.store.json.lock`, never removed), held
from the read to the write: the kernel lets it go when its run ends, so a
run that dies leaves none to take. The store is written whole through a
temporary file, removed if the write fails, so neither run loses the
other's answers. The key goes only to
TypeSafe's own host, and the runner reads no `.env` file (`bun
--no-env-file`): none in a checkout sets its key or a proxy. A rule stays at
`warn` until its labelled corpus shows the precision a gate needs; `bun run
--cwd packages/scripts judged:measure --rule <id>` measures it there and
prints its precision and recall at its threshold and at others. Before a
change of the runner's request form, its packing or its model lands, `bun
run --cwd packages/scripts judged:quality` asks a seeded sample of the
repo's answered items again as the runner now asks (300 drawn at random and
100 kept findings a rule, about 0.7M input tokens) and prints, a rule, how
many kept their label and their finding and how far the answers moved; it
keeps nothing, and no gate runs it.
`film/drawing-literal` and `film/no-unprobed-ink` hold a film's scenes to
what the lab can locate and what `film check` can probe; the films' README
(`apps/animations/README.md`, **Lint**) says what each refuses.
`film/one-breakpoint` (`lint/one-breakpoint.ts`) holds the pages' TypeScript
(`lab/`, `player/`, `browser/`, `command/`) to the studio's one breakpoint: a
media query width written out
(`(max-width: 899px)`, `(width >= 900px)`, in any unit, or built from a number
in a template) is refused, and the window is asked through `PHONE` or `WIDE`
(`lab/viewport.ts`). A feature query (`@supports (width: 900px)`) passes.
`film/booleans-through-pressed` (`lint/booleans-through-pressed.ts`) holds
the lab's components: a boolean a control shows (`aria-pressed`,
`aria-expanded`, a `data-*` flag the source proves a boolean) is written by
`pressed(on)` (`lab/pressed.ts`), never by hand as `String(x)`,
`x.toString()`, `JSON.stringify(x)` or `` `${x}` ``. The player, which may
not import the lab, is outside its reach.
`film/one-clock-epsilon` (`lint/one-clock-epsilon.ts`) holds the code that
computes times to one owner of the grid, `core/time.ts`: a nudge written
beside a time (`Math.ceil(t * fps - 1e-6)`, `m - 1e-3`, a const holding one)
is refused, and so is `CLOCK_EPSILON` inside a rounding call, which judges two
times one and puts none on a grid (`frameAtOrAfter`, `frameAtOrBefore`,
`onTheMs`, `heardAtOrAfter` and `justBefore` do).
`film/lock-through-sqlite` (`lint/lock-through-sqlite.ts`) holds all of `src`
but the lock itself, the tests and the fixtures: a manifest's lock file is
opened by SQLite alone
(`tools/manifest-lock-bun.ts`), so its `lockFile` is called, and a lock
file's name (`.catalogue.json.lock`) written, nowhere else; closing any other
handle on the file lets go of the process's lock.
`film/no-test-seam` (`lint/no-test-seam.ts`) holds every package's `src`: a
package's test-only doubles live in its `testing.ts` seam (`core/testing.ts`,
`tools/<area>/testing.ts`, `@manna/url-state/testing`, `@manna/core/<area>/testing`),
and product code imports none, by a relative path, a package export, a type
import, a re-export or a dynamic `import('…')`. The tests, the fixtures, the
seams and the type tests are let off.
`film/synth-own-math` (`lint/synth-own-math.ts`) holds the sound graph
(`core/synth/graph/`) to the same samples on every host: a host's `Math.sin`,
`exp`, `log`, `pow` and `tanh` are approximations its engine chooses, so the
graph's are its own (`core/synth/graph/math.ts`), built from + − × ÷ and
`Math.sqrt`, which IEEE 754 rounds alike everywhere. It refuses a read of the
global `Math` but its exact members (rounding, sign, comparison, `sqrt` and
the constants), `**` and `**=`, and a value imported from outside the graph's
folder but the seeded generator (`core/random.ts`) and `effect`'s
`Predicate`, `Schema` and `Match`, so no helper brings the host's maths in.

Every name a rule reads a meaning into is read by its binding where it is
written, through one reader, `lint/nodes.ts` (`bindings`: `definitionOf`,
`importsAs`, `readsImport`, `callsImport`, `isGlobal`, `framePart`,
`readsCue`, `takenFrom`, `readsOf`, `isRunner`): an import
under an alias or read off its module imported whole (`clamp as cap`,
`Core.clamp`) is the import, and a parameter or a local of the same spelling
(`Math`, `t`, `window`, `test`) is its own name. A module is told by the path
a relative specifier resolves to from the importing file, so core's own
`./time.ts` is `core/time.ts` as `../core/time.ts` is. A global is the global only
where the file binds that name nowhere; the frame's `t`, `T` and `at` are the
frame's only when read off the parameter a drawing's `draw` or `light` is
handed, or one typed `Frame`. A member read off
a value handed in (`page.finger`, `page.evaluate`, `hub.keysOf`) is read by
its member's name, since the rule cannot type the value. `.oxlintrc.json`
refuses the scope tree's own readers to every module of `lint/` but
`nodes.ts`: the imports (`Scope`, `SourceCode`, `Variable`, `sourceCode` and
their kin, from `oxlint-plugin-effect/rule-bindings` or from the package root,
whose `ruleBindings` is refused too) and, through a rule's own context, the
properties `getScope`, `getDeclaredVariables`, `scopeManager`,
`isGlobalReference` and `markVariableAsUsed`, so a rule cannot grow a second
reader.
`lint/plugin.slow.test.ts` runs oxlint over the marked fixtures: every RED
location must report its rule, with no extra findings. Each of the plugin's
twenty-eight rules (`lint/plugin.ts`) also has a diagnostic whose corrective
message is asserted, including the distinct anchor-end and cue-part repairs,
so a rule that fires but gives the wrong advice fails the fixture suite; the
test holds that list to the plugin's rules.

The package's `test` script runs the unit tests under `src/` and `lint/`.
The root `test` and `gate`, including the CI gate, run this browser-free
suite. Each run writes its files' times to a timings file in the package's
installed modules (the script's `--timings` and `--update-timings`), and the
next run starts the slowest files first, so a long file does not begin last
and run alone. A fresh checkout, CI's among them, has no times yet and runs
the files in their usual order. The suite stays inside the repo's ten-second
budget (`bun run test:budget`). E2E files live separately under `e2e/`, so
those paths do not discover or execute them. Their source remains linted and typechecked.

Run `bun run test:e2e` from the repository root or this package to exercise
the real browser workflows and canvas pixel checks. The E2E script uses
`src/lab/fixtures/run-suite.ts` to compile fresh browser bundles and run
`bun test --parallel --no-isolate --max-concurrency=3 --preload ./e2e/preload.ts --timeout 20000 e2e`.
Its folder (the bundles, the workers' Chrome profiles) is removed once every
process whose command line names a path in it has ended
(`src/lab/fixtures/run-folder.ts`): Bun's recursive remove fails when an
entry goes from under it.
A browser-free film test that sets no timeout of its own has bun's own 5 s,
so the `test` script names no `--timeout`, and a browser test has 20 s
(`E2E_TIMEOUT_MS`, `src/lab/fixtures/test-timeout.ts`);
`test-timeout.test.ts` holds the scripts to both. The preload `bunfig.toml`
names (`src/lab/fixtures/preload.ts`) passes the first to effect-bun-test's `setDefaultTimeout`: the
deadline its runners hold for the whole process, at which they interrupt a
concurrent case, since a test cannot read `--timeout`. So a runner case that
times out has its scope closed, its tabs and its lab, at its limit. The
`test:e2e` script preloads `e2e/preload.ts` after it (bun runs a
`--preload` after bunfig's), which passes the second, and passes it as
`--timeout 20000` too: bun keeps a preload's default for a process's first
file only, and the script runs several files in one process
(`--no-isolate`), so plain `test(...)` calls and hooks in the later files
take theirs from `--timeout`. A browser-free test is never given more time
than bun's 5 s, but a test that spawns names its spawn budget
(`film/tests-keep-their-strength`, `effect/requireSpawnBudget`): a slow test
is made fast. A file whose cases each work on the CPU (an encode, a decode, a
make) runs them one after another (`describe`, not `describe.concurrent`):
at once, each case's limit holds its siblings' work too. A browser test given more time gives it a timeout of its own: a
different `--timeout` on the command line reaches only plain tests and hooks
in files after a process's first, never
the runner cases. On CI the runner takes eight workers, or the host's core count when smaller;
on a shared machine (the laptop, the workbox) it takes the cores free when it
starts, the core count less the one-minute load, at least two and at most the
cores (`src/lab/fixtures/workers.ts`), and prints the count it took. Each
worker keeps its module registry and Chrome across files. Test files restore
the global state they change. E2E cases retain native input, actual browser
recording and pixel assertions. Neither the gate nor CI runs it: a unit runs
it by hand, through `test:e2e:check`, when its change touches the pages. The fake server answers
only paths `LabHttpApi` declares (`declares`, `core/api.ts`): a fake matching
any other path answers a 500 naming it, so no case passes over a route the
real server does not serve.

`bun run test:e2e:check [--base <log>] [--log <log>]` runs the same suite
and says what the change under test caused. It takes the host's e2e lock
itself for the whole run (`lockf -k /tmp/manna-e2e.lock`), so two
workspaces on one machine queue; it says so before it waits. Do not wrap it
in `lockf`: run
inside an outer lock on that file, it sees the lock in its ancestors and runs
in that hold rather than wait on itself. Holding the lock, it waits for the
host's one-minute load to fall to its core count, at most twenty minutes,
saying each minute how long it has waited; then it runs, and the verdict
records the load it started at and the wait.

The suite's output prints as it runs and is kept in `<log>` (by default
`tmp/e2e/<time>.log` at the repository root). The check reads three kinds of
failure from it: a failed case, a worker that crashed with its file, and an
error bun caught between tests, under the file printed above it (bun's
` N error` count beside them: an error the log does not place is a failure
of its own). It also reads whether the suite finished, by bun's
`Ran N tests across M files` line. Every failure reruns alone three times
(a case by its name, a file's failure as the whole file) in one worker, at
the suite's own `--max-concurrency`, its output in `<log>.alone.log`. Bun's
own summary of a rerun (` N fail`, ` N error`) says whether it passed: an
exit that is not 0 after bun passed the case is the runner's, not the case's.

`<log>.verdict.md` then classes each failure:

- **green-alone**: green in all three reruns. The suite failed it only beside
  the rest of the suite. That is load, or order (a case another case left
  running, since `--no-isolate` shares a worker); the reruns do not tell which,
  and do not rule out a slowdown the change caused that shows only under load.
- **base**: red alone, and the base's own check saw the same failure (same
  file, same name) red alone too.
- **unit-caused**: red alone, where the base passed it: the base's suite
  finished without failing it, or its check saw it green alone.
- **unresolved**: anything else. It was red alone with no base given, or the
  base's log failed it with no rerun to say why (a loaded base proves nothing),
  or a rerun ran no test (its filter matched none), or the log placed it in no
  file.

The base (`--base`) is a log of the suite on the change's base: an earlier
check's `<log>`, or a plain `bun run test:e2e` log. A check also writes `<log>.verdict.json`,
its reruns as data, and a later check given that `<log>` as its base reads it
from beside the log. So to resolve a failure red alone at the head, run the
check at the base and pass its log. The check exits 1 when a failure is
unit-caused or unresolved, when the suite never finished, or when it failed and
named no failure; otherwise 0. `src/lab/fixtures/e2e-verdict.ts` holds the
reading and classing.

A case that fails only on a loaded runner is a race: something it waits on
lands in another order there. `FILM_E2E_CPU_THROTTLE=<rate>` slows every tab's
page that many times (Chrome's CPU throttling, set as `openTab`
lends the tab and set back before the view returns to the pool; read once
from the process's environment in `src/lab/fixtures/browsers.ts`), as a slow
phone or a loaded runner runs it. Throttle one case, by its file and `-t`,
under the e2e lock the check takes, never bare and never the suite: at 20 the
page's own work takes seconds, and a suite of them only times out. From
`packages/film` on a Mac:

```sh
FILM_E2E_CPU_THROTTLE=20 lockf -k /tmp/manna-e2e.lock \
  bun src/lab/fixtures/run-suite.ts --max-concurrency=3 --preload ./e2e/preload.ts --timeout 20000 <file> -t '<case>'
```

## Knobs

A value a note might ask to tweak (where a hand rests, a tag's angle) is a
knob: declared once on the drawing, read by name.

```ts
export const hand = drawing({
  timeline: { ... },
  knobs: { palm: [960, 800], tagAngle: 0.12 },
  draw: (f) => {
    const [x, y] = f.knob('palm'); // a point
    const rot = f.knob('tagAngle'); // a number
  },
});
```

A knob is a number or a point (`Knob` in `core/schema.ts`, decoded with the
scene); `layout()` carries them into `Placed.knobs`. With `drawing(...)`,
`f.knob` names only declared knobs and returns the declared kind (a number
stays `number`, a point `readonly [number, number]`). Promoting a constant to
a knob draws the same frame; it is what lets the lab tweak it.

## Plates at depth

A shot can be plates at depth in a `multiplane` with a slow eased camera
through them, rather than a flat cutout.

- `canvas/camera.ts`: `planeView` is the view a plane at `z` sees through the
  shot. A `multiplane`'s
  `haze` takes a sky of stops as well as one colour.
- `canvas/grade.ts`, through `finish` in `createFilm`: `bloom` (bright parts
  bleed light) and `grade` (an S curve, split toning of the shadows and the
  highlights, and saturation), applied before the grain.

## Rive

A figure can be a Rive rig: bones, skinned paths, constraints and a view
model built in Rive and drawn in our frame, under the frame's own transform.
Rive draws the picture; the clock, the narration, the cues, the probes and
the checks stay ours.

- **Declared by its drawing.** A drawing names its rigs as it names its knobs
  (`drawing({ rigs: { accused: spec }, draw: (f) => f.rive('accused', pose) })`).
  A spec (`RivePropSpec`, `@manna/film/rive`) is the rig's built file
  (`import riv from './x.riv' with { type: 'file' }`), its artboard, the
  timelines and view-model numbers a pose may name, its engine, which
  artboard point stands at our origin, its
  face node, and how it follows the shot (`ink`: the number `ink` at the
  shot's scale, frame heights per unit, set each frame before the pose's
  numbers, so a pose that names `ink` sets it itself). `f.rive` takes only a declared
  name, and a pose (`timelines`: each `[name, seconds, mix?]`; `numbers` by
  name; `size`: how many times the space it stands in it is drawn, its shot
  read before it, so a hand drawn larger than the hand rig follows its
  figure's shot) names only that rig's timelines and numbers: anything else
  does not compile (`canvas/drawing.types.ts`).
- **Loaded by its film.** The film's rigs are the ones its drawings declare
  (`film.rigs.declared`), never listed a second time. `loadRigs`
  (`src/rive/load.ts`) loads them through the `RiveRuntime` service before
  the first frame and stands them on that film value: `narratedFilms` with
  the page's layer (`rive/runtime-browser.ts`: each engine's wasm from the
  package's asset URL, the `.riv` through the page's `HttpClient`),
  `check --draw` with Bun's (`rive/runtime-bun.ts`: the wasm and the `.riv`
  from the filesystem; the stand-in document stands only while the runtime
  starts). A loaded rig is its file, parsed once; every wasm object it holds
  (the file, the artboard its names were checked on, the scratch matrix,
  renderers, GL targets) belongs to the load's scope. Two films never share
  a rig.
- **Owned by whoever loaded it.** The consumer that loads a film owns its
  rigs and closes them: a film's load is a scoped Effect (`Films`,
  `player/main.ts`: `Effect<Film, FilmUnloadable, Scope>`; `narratedFilms`
  loads the rigs into the scope it runs in, a short's page into its
  film's), run on the consumer's own fiber, so no lifetime crosses a
  Promise and stopping the consumer stops the load where it is. The
  player's page (`stageFilm`) runs it in the page's own scope, which lives
  as the page does. `loadRigs` holds what it acquires in a
  scope only it can close while it runs, and hands that scope to the
  caller's once done: a load that fails or is stopped frees what it had
  made, with the caller's scope still open (`player/narrated.test.ts`), and
  a caller's scope closed mid-load frees the load's objects only after the
  load is done with them, standing no rig (`src/rive/rive.slow.test.ts`, which
  counts every call on a file after its unref). A film value loaded into
  two scopes draws with whichever load still stands, in any order of
  closing.
- **One GL budget.** A `webgl2` rig's targets are held in the page's
  context budget with `glCanvas`'s keys (`holdGl`, 8 live; `dropGl` when the
  rig's scope closes), so rigs and a 3D look never pass the browser's cap
  between them. A target whose context is lost (the budget let it go, or the
  browser did) is made anew and primed before the frame draws on it; where
  no context can be made the draw fails, naming why, and is never a blank
  frame (`e2e/canvas/rive.pixel.test.ts`: past Chrome's cap and past the
  budget, every frame's pixels are a fresh page's). A name the file lacks fails the load (`RigNameMissing`, listing
  what the file has; a rig that follows the shot lacking the number `ink`
  among them), a file that cannot be read fails it (`RigUnloadable`),
  and a frame that draws a rig its film has not loaded throws: there is no
  fallback picture.
- **A frame of its own.** A frame is a function of its pose, whatever was
  drawn before it, by construction (`canvas/rive.ts` `drawRig`): each frame
  makes an artboard instance of its own from the loaded file and a
  view-model instance of its own (the model's defaults), binds them, sets the
  pose's numbers, applies the pose's timelines in order (an instance of each,
  made and deleted), advances the artboard by no time (which applies the
  binds, with no state machine) and draws, then deletes both. No instance
  outlives its frame, so nothing an earlier frame did reaches it:
  - Rive keeps a shape's paths in the shape's own space and remakes them only
    when a path's geometry changes or the shape-to-path transform moves past
    16 float epsilons
    ([`PathComposer`](https://github.com/rive-app/rive-runtime/blob/main/src/shapes/path_composer.cpp)
    in rive-runtime), so an instance posed
    again keeps the paths an earlier frame made, with that frame's rounding
    (rigs with no boil too: the fixture arm 22 of 60 shuffled frames, the
    cold-studies accused 59 of 60);
  - a state machine keeps its state and a transition in flight, so the rigs
    have none: the binds apply on the artboard's own advance;
  - a constraint never solves from the last frame's bones, and a bind that
    writes back into the view model never reaches the next frame.

  `src/rive/rive.slow.test.ts` proves it number for number: Rive's Canvas 2D
  runtime draws the arm into a context that writes down every path's
  commands, and through 60 shuffled times, each after poses with the IK held
  full on and let go, every frame's paths are a newly loaded rig's. The same
  test, run on the earlier design (one instance posed from rest, made afresh
  by an authored `fresh` timeline) with that timeline emptied, has 60 of 60
  frames off. Cost (this Mac): posing a frame in Bun, 9.2 µs for the fixture
  arm and 89 µs for the cold-studies accused; a page's draw of the accused,
  0.60 ms a frame on `canvas` (0.35 ms posed from rest) and about 19 ms on
  `webgl2` under SwiftShader, either way. The draw path allocates the frame's
  own Rive instances (made and deleted within it) and, on `webgl2`, the one
  `getTransform` it reads. Every instance a frame makes is held in the rig's
  in-flight slot until the frame ends: the draw path runs no Effect and no
  try/finally, so a frame the runtime throws in leaves its instances there,
  and the rig's next frame deletes them as it starts, or the rig's scope as
  it closes (`rive.slow.test.ts` injects the runtime's own throw three frames
  running and counts nothing left).

- **Two engines.** `canvas` (`@rive-app/canvas-advanced`) draws with Rive's
  Canvas 2D renderer on our own context. `webgl2` (`@rive-app/webgl2-advanced`)
  draws with the Rive Renderer on a WebGL 2 canvas off the page and
  composites its box in: a 512 px tile where the box fits, else the frame's
  size, each primed with the rig at rest before its first real frame, so no
  buffer is sized by the frames before. A page with no WebGL 2 fails the
  `webgl2` load, naming why. The browser tests draw WebGL 2 on SwiftShader
  (`--enable-unsafe-swiftshader`, `lab/fixtures/browsers.ts`), which Bun
  spawns with `--disable-gpu`; the renderer's Chrome on macOS draws it on
  Metal (`--use-angle=metal`, "Encoders").
- **In Bun** nothing is drawn (`paints: false`): the rig is posed for real and
  its face node declared to the probe (`probeFace`), so `check --draw` finds
  ink over a rig's face and a frame that is not pure.
- **Written in the house look.** A film's figure rigs are TypeScript that
  the house prints as RML: the film lays its figures in one file
  (`figuresFile`, `@manna/film/style`), drawn by the generator's parts
  (`src/style/rig/`, the house's alone: no package export reaches it) in
  the house's line, compiled offline and unsigned by the Rive CLI
  (`compile`, `@manna/film/style/build`) into the film's committed `.riv`.
  RBF's build (`apps/animations/src/films/righteousness-by-faith/rigs/build.ts`)
  writes its `figures.riv` and the stamp of what it was built from, and its
  test holds the file to the rigs through that stamp (`unbuilt`) with no CLI;
  both hold first each override on a figure to the owner's word on that
  figure, a decision on his production's ledger filed at the point
  `item:<item>`, after the lock it frees, in its words or with the pick it
  cites (`unsaid`), then each figure he locked to its lock and the lock to
  the decision it names (`unlocked`). An override in words he never said, in
  his words on another matter or citing a pick he never made stops them, and
  so does a locked figure whose print is not the one its lock file holds:
  the hash is the lock file's alone, so a review reads every change to one;
  cold-studies' file
  (`apps/animations/src/films/cold-studies/looks/rive/figures.riv`) is frozen,
  never rebuilt.

The fixture rig is `src/rive/fixtures/arm/arm.rml`, built to
`build/arm.riv` with `cd src/rive/fixtures/arm && rive . --once` (Rive CLI
1.5.1); `canvas/fixtures/arm.ts` declares it, `src/rive/rive.slow.test.ts` and
`e2e/canvas/rive.pixel.test.ts` prove the invariants above. The ink
fixture, `src/rive/fixtures/ink/ink.rml` (built the same way), is a stroke
bound through a range mapper to the number `ink` over a light core and a
centred one: `src/rive/rive.slow.test.ts` draws it with Rive's Canvas 2D runtime
and reads each stroke's width, as cut at 1, three quarters of the ink past
the core at 0.75, and set from the shot's scale for a rig that follows it.

## The purity rule

`src/core` never touches the DOM at runtime (type-only DOM references are
fine) and never imports from `canvas`, `player` or `tools`. Bun scripts,
tests and the browser all read it; `tools` is Bun-only. `canvas` may import `core`; `rive` (the Rive loader and its runtimes) may import both; `player` may import all three. `style` (the house look: its numbers, the figure generator and the rig build) may import `core` and `canvas`, and a film's scenes and rigs import it. `.oxlintrc.json` holds the import direction with `no-restricted-imports`: `core` imports no `canvas`, `rive`, `style`, `player`, `tools`, `lab` or `browser`, `canvas` no `rive` (its fixtures, which load a rig to draw it, excepted), `style`, `player`, `tools`, `lab` or `browser`, `rive` no `style`, `player`, `tools`, `lab`, `browser` or `command`, `style` no `rive`, `player`, `tools`, `lab`, `browser` or `command`, `player` no `tools` or `lab`, `browser` (the host's adapters) no `player`, `tools` or `lab`, and `command` (the commands, the keymap and the selection, shared by the player and the lab) no `player`, `tools` or `lab`. Each block reads a layer's `.ts` and `.tsx`, and keeps a folder out whether a path names a file in it (`../tools/index.ts`) or the folder itself (`../tools`). An app reaches the film through its package exports (`@manna/film/rive`); lint refuses a relative path into `packages/film/src/` from `apps/animations/src/` (an app file outside `src/`, or another app, is not checked yet).

**The host** (`src/browser/`): every browser API a page reaches goes through
an Effect service there, each with its live adapter (`*-browser.ts`) and a
test layer beside it. A page's root (`mountRender`, `mountAsk`) builds the
page's host once from `BrowserHost.layer` (`browser/host-browser.ts`,
`hostOf` in `browser/host.ts`) and hands it on: the ask page's runtime
takes it as a layer (`hostLayer`). A page the lab
renders on the server gets `ServerHost.layer(url)` instead
(`browser/host-server.ts`, through `ServerHosted` in `lab/page-server.tsx`):
the request's URL, read only and with no hash, and every other service
inert, answering as a phone held upright (`Viewport.layerPhone`). `browser/` is
framework-free, so the player may import it. Per-viewer settings go through
Effect's `KeyValueStore` (`browser/storage.ts`): `TabStore` over the tab's
session (the receipts, `film-receipts`, a `keptJson`) and `ViewerStore` over
local storage (`film-review.quality`, a
`keptText` stored as plain text), each a store
in memory when the page may not use its storage. Every drag follows its press through `Pointer`
(`browser/pointer.ts`), which ends it once: lifted, or ended by the browser
(`pointercancel`, `lostpointercapture`, or the page left mid-press: the
window's `blur`, the tab hidden). A surface follows one press at a
time (`Pointer.press`): a second finger's press on it does nothing. The
lint refuses a press's end heard, or its capture taken, anywhere else
(`film/host-events-through-adapter`). Every key goes through one listener
per page, the hub's (Commands and keys, above), over `Keys.listen`
(`browser/keys.ts`), which hands each press with its key, its physical code
and its target, and drops one already handled or still composing. Every
animation frame (the export page's draw, an ask's synced players)
goes through `Frames` (`browser/frames.ts`):
`loop` steps inside each frame's own callback, `coalesce` paints once a
frame. Every time read goes through Effect's `Clock` on the host
(`monotonicMs`), so a test's clock
reaches it. Every media element is driven through a `Playable` (`browser/media.ts`;
`playableOf` makes one of a `<video>` or an
`<audio>`): time is read from it, a seek is done once its frame is shown,
play and pause are effects. `Media` says what a refused play means
(`Blocked`, `Aborted`, `Failed`), plays muted when the browser refuses
sound (`playOrMute`, an ask's players), keeps the page's one voice
heard (`hear`: a take or a reader's Hear pauses the one before it), and makes the narration's audio.
Every copy goes through `Clipboard` (`browser/clipboard.ts`; the browser's in
`clipboard-browser.ts`): a link written whole, against the page's origin, and
a refusal (`ClipboardRefused`) in the browser's words.
A page's media queries go through `Viewport` (`browser/viewport.ts`), whose live adapter is the window's
`matchMedia`, and the only reader of it.
Every request goes through Effect's `HttpClient`: a page's calls through its
one `LabClient`, built once at its root (on the server, `LabClient.layerRendering`, whose reads
come back to the lab's own handler, `PageReads`, and go with the page for
the browser to adopt), and a film's timings through `loadNarrated`
(`narratedFilms` takes the client's layer, the page's `fetch` client unless
given).

**Footage** (`browser/footage.ts`): a film that reads camera frames (a talk)
says, for each frame, which source frames it reads (`Film.footageAt(T)`,
pure: a source `<name>/<sha12>` and a second in it, aimed at the middle of
the source frame); the host decodes them and hands them to the draw as
`RenderOptions.footage`, so `film.render` stays synchronous and keeps
nothing between frames. Every caller of `film.render` asks first: a still,
a seek, a probe, a look or a contact sheet decodes one frame's reads
(`Footage.ready`), and an export chunk decodes its frames as one run
(`Footage.run`, each source's packets at most once while its times rise).
A frame the host cannot decode fails as `FootageFrameMissing`, never drawn
black. A drawn film has no
`footageAt` and is drawn at once, as it always was, and its page never
loads the decoder. The live adapter (`footage-browser.ts`) opens each
source with mediabunny over a ranged `UrlSource` at
`/footage/<name>/<sha12>/<copy>.mp4` (`core/footage.ts`): the render page
reads the mezzanine, every other page the proxy. Every decoder it opens is
closed when its run ends, however it ends (done, stopped partway, failed,
interrupted), and a read that outlives its run (each frame's runs on a
fiber of its own) opens no decoder and holds no frame. It is given
mediabunny as a service (`FootageDecoders`, the page's own provided where
its host is built, `host-browser.ts`), loaded with the first read. One module answers that URL for the render's server (the
app's player) and the lab's alike (`tools/footage-route.ts`): a copy of a
name the footage library's lock lists now, of its original's hash, made and
on disk under the outputs folder, whole or by the byte range asked; the
library's lock (`/footage/library.lock.json`) and a transcript the lock
names (`/footage/transcripts/<file>`), for a talk's page to cut by;
anything else under `/footage/` is a 404. The server's host, and a test, give frames of their own (`Footage.layerOver`;
`Footage.none` has none). A footage film's probe also records each footage
frame it drew (`FootageMark`: its source and second), and a drawn film's
probe has no such field, as before. The browser test `e2e/player/footage-exact.dom.test.ts` holds
the seam frame-exact over a synthetic numbered clip, a still and an export
chunk alike; `e2e/player/talk-render.dom.test.ts` holds a talk's page so over
every seam of its cut, its probe captions to its phrases, and fails a chunk
whose mezzanine cannot be fetched.
`e2e/tools/talk.test.ts` runs a talk on real media (import, `make`, the mix
from its voice); `src/tools/talk.slow.test.ts` runs it with none, in the
framework suite.

The lint holds the host to its adapters in the lab, the player, `browser/`,
`command/` and the app's page entries (`.oxlintrc.json`): `effect/noGlobals`'
`members` list refuses the host's storage, frames, requests,
media and recording, media queries (`Viewport`), timers, clock and URL,
each naming the service that owns it, however a page reaches it: bare,
through any name of the global object and any chain of them
(`window.`, `globalThis.window.`, `top.`, `parent.`, `document.defaultView.`),
an alias or a destructure (`const perf = performance; perf.now()`); and a host
global held where the rule cannot follow it (`{ w: window }`, `[document]`,
`() => performance`) is refused too, while handing it to a call builds an
adapter and passes; `effect/noReflectGet` refuses
`Reflect.get(window, …)`; `film/host-events-through-adapter`
(`lint/`) refuses a window or document listener for a navigation, key or
drag event however it is spelled (an event named by a const or a loop, an
alias of the window, a handler property such as `onpopstate`, a bare or a
borrowed `addEventListener`), a host listener whose event it cannot read,
and a press's end heard on any element, a JSX handler included;
`effect/noGlobals` holds in the player as everywhere. The
fixtures and tests are the host's side and exempt; a live adapter
(`*-browser.ts`) is not: each line where it reaches the one host API it
adapts says so (`oxlint-disable-next-line`, with why), so an adapter that
reaches another's API is red as a page is. No page imports a live adapter's
module (`no-restricted-imports`): only a page's mount builds the host
(`BrowserHost`), the two stores are `storage-browser.ts`'s, and the review's
and the studio's mounts build theirs with an adapter of their own. The address bar is `Location`'s alone (`@manna/url-state`'s
`location-browser.ts`): no film file reads or writes the URL directly.

Frames stay pure: no `Math.random`, no wall clock, no state carried between
frames. Seed randomness by key (`f.hand(key)`, `random.ts`); another scene's paper, torn as it tore it, by `f.handsOf(drawing)`. Another scene's framing, as that scene reads it (a lab edit included), by `f.knobsOf(drawing)(knob)`: a callback reads the knob where it lives, so a drag moves both scenes.

```sh
bun run gate        # repo root, as CI: the deterministic lint and every workspace's unit tests
bun run test:slow   # repo root, by hand and before a deploy: typecheck, builds, slow tests, full lint, format check
```
