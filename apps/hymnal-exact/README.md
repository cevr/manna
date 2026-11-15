# @manna/hymnal-exact

The hymnal on [Exact](https://github.com/expo/exact), bundle id `im.cvr.hymnal.exact`, ported beside `apps/hymnal` until it replaces it (iOS and the web first; Android stays the current app's until a trial). How to install Exact, the pin, the wrapper and the simulators: `docs/exact.md`.

```sh
bun run exact contract build app.contract --json --errors-only   # [] means no errors
bun run exact web            # the dev loop, at http://127.0.0.1:8766/
bun run exact test web       # the contract tests in headless Chrome
bun run exact test ios       # the same on verify-hymnal-exact
bun run exact verify         # tests, checks, a relaunch: done when clean
bun run exact verify ios
bun test ./src               # the Bun tests the gate runs (no Exact needed)
```

## Where a feature's files go

| Path                       | What                                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| `app.contract`             | The root view: one `use` line and one route per feature                                        |
| `app.ts`                   | The data module: one registry entry per feature                                                |
| `features/<name>.contract` | A feature's view                                                                               |
| `src/<name>/**`            | A feature's logic: pure TypeScript, imported by `app.ts`, tested in Bun                        |
| `<name>.test.contract`     | A feature's contract tests, beside `app.contract`: Exact's `test` and `verify` read only those |
| `app.test.contract`        | The app's own test: its name heads the first screen                                            |
| `src/sources.ts`           | The registry: every source the view asks for, one spread per feature                           |
| `src/hymns/**`             | The data seam: the book, made at build, and the declarations Exact's type check reads          |
| `exact.mjs`                | The kit's launcher, for Exact's own `bun exact.mjs` calls; `bun run exact` is `manna-exact`    |

## Adding a feature

1. Write `features/<name>.contract`: its `shape`s, a `members HymnalExact` block with its state, resources and actions (each name prefixed by the feature, as `listQuery`, `hymnShown`), and its screen component.
2. In `app.contract`: one `use <Screen> from "./features/<name>.contract"` line, one `members "./features/<name>.contract"` line, its route under `routes nav`, and one `if e.name == "<route>"` branch in the stack's loop.
3. In `src/<name>/sources.ts`, export `<name>Sources(book)`, the sources its resources name; add one spread line to `src/sources.ts`. `app.ts` stays as it is.
4. Put its rules in pure modules under `src/<name>/`, with Bun tests beside them, and its contract tests in `<name>.test.contract`.

## The home

`features/list.contract` draws the home list: a tab row (`tab-<name>`) over the list of the tab in use, `listTab`, kept across launches. Sections is the list of every hymn under its sections (`hymnRows`), under the Recent shelf; Lists, Topics, Metres and Scripture are the current app's `tabsOf` (`@manna/hymnal-app/home/tabs`), asked one tab at a time by `listTabRows` once the tab is chosen (`src/home/tabs.ts`). A tab's answer is its groups' names and hymn numbers; the titles come once from `listTitles`. A hymn found by the search opens as the current app's `openingAt` says (`listOpening`).

`features/recent.contract` and `features/favourites.contract` keep the reader's two lists as `persist` states of hymn numbers, `recentList` and `favouriteList`. A hymn page coming to the top of the stack is a visit (`recentAfter`, the current app's `visited`); the star in a hymn page's header (`favourite`) adds or takes out its hymn (`favouritesAfter`, the current app's `toggleFavourite`). The shelf shows Recent's latest five (`shelf-<n>`), and its last row, `recent-all`, opens `/recent` with all of them (`recent-<n>`). A favourite's rows carry a star (`star-<n>`).

## The book

`bun run exact` first runs `src/hymns/make.ts`, which writes `src/hymns/words.gen.json` and `indexes.gen.json` (ignored) by the current app's own derivations (`@manna/hymnal-app/vite/words`, `vite/indexes`). `tsconfig.json` maps the current app's `virtual:hymnal` and `virtual:hymnal-indexes` to those files, so Exact's bundler takes `apps/hymnal/src/hymns/search.ts` and `hymns.ts` unchanged, and maps `@manna/hymnal-app/hymns/*` to `src/hymns/decl/*.d.ts` for Exact's type check, which stages declarations and cannot stage `effect`'s. The Bun tests get the same modules through `src/test/setup.ts`. The list's answer holds numbers, titles and sections; a hymn's words are answered only for the hymn open.

Logic of the current hymnal and `@manna/hymnal` is imported through package exports, never copied: `src/no-copy.test.ts` fails on a copy of the current app's sources. A Bun test of a module `app.ts` imports can run it under `withDataHost` (`@manna/exact-kit/data-host/testing`) to fail where Hermes would.

## The player

A hymn's recording plays from the recordings' bucket (`https://hymns.cvr.im`, the current app's `audioUrl`), through one `audio` element per load and the system's Now Playing (`features/player.contract`). Every rule is one pure `step(state, input)` in `src/player/step.ts`, over the current app's own `bar`, `stanzas`, `title`, `time` and `follow/timeline` (imported through `@manna/hymnal-app`'s exports, whose declarations are `apps/hymnal/exact/**`); `src/player/sources.ts` answers `playerStep`, which the view calls for each tap and each of the element's events, each event naming its load. `src/player/protocol.qnt` is the protocol of taps, events and the platform's play and pause; `protocol.test.ts` checks it over `step` by a search of every interleaving. Quint's simulator runs the model itself: `bunx @informalsystems/quint run --invariant=safe --max-steps=20 src/player/protocol.qnt`.

`bun run exact` also runs `tools/timing.ts`, which writes `src/player/timing.gen.ts` (ignored): each hymn's line timing with its words left out, for the stanza choice's length.

Tests and drives never ask the bucket. A development build takes a loopback fixture's origin from `HYMNAL_RECORDINGS`; the fixture is `tools/recordings.ts` (app.json's `commands.server`), two recordings of digital silence and a 404 for hymn 13. The tests name port 4797, which Exact gives each run in turn; the drives start the fixture themselves, on their checkout's own port (`bun tools/recordings.ts --port`, in 4790–5789), so two checkouts' drives never share one, and the build's grant for 4797 moves to it:

```sh
HYMNAL_RECORDINGS=http://127.0.0.1:4797 bun run exact test web player.test.contract
HYMNAL_RECORDINGS=http://127.0.0.1:4797 bun run exact test ios player.test.contract
HYMNAL_RECORDINGS=http://127.0.0.1:4797 bun run exact test web seek.test.contract
HYMNAL_RECORDINGS=http://127.0.0.1:4797 bun run exact test ios seek.test.contract
bun tools/drive-player.ts web    # the fixture down and up, a hymn with no recording, a kept stanza choice, a held drag, a skip, ten seeks, label contrast, the dock under Settings
bun tools/drive-player.ts ios
```

The seek: the full player's position bar (`position`, a range) sends one seek at its release; a step, a stanza's place (`stanza-place-<n>`) and the lock screen's seek and ±10 s skip send one each. Each seek has a serial; the element's `time` and `seeked` name the one they follow, so a late one moves nothing, and a sent place is held until it is reached or 2 s pass (`scrub-rules.ts`'s `settleFor`). A span the stanza choice leaves out is sought across: a frame task arms it on the runner's clock from the last tick (`due`), and the next tick corrects it. `protocol.test.ts` searches 10 actions deep in the gate; `PROTOCOL_DEPTH=18` searches deeper.

## The web

`bun run build:web` makes the site a host serves as plain files: Exact's release build (`web-build --out dist`, after the book's makers) and then `tools/web/pages.ts`, which writes a page per address a screen has from the build's `shell.html` (`src/web/pages.ts`): `index.html`, `recent/`, `player/`, `settings/`, `settings/about/`, `hymns/<n>/` for each hymn and `404.html`, each the same shell with its screen's own `<title>` and description, so a shared link previews as its hymn. Every route renders in the browser (`render=client`). The pin can render a route at build (`render=build`, with `pages=` for a hymn's), but its pages keep the answers they were built with: on such a site a returning reader's Recent shelf stayed empty, a stanza choice was written back to none and the first press of Play did nothing (`bun tools/drive-web.ts return` over such a build).

A host needs one rule, `servedFor` in `src/web/served.ts`: a file at the path, else that folder's `index.html`, with 200; anything else `404.html` with 404, whose script draws the not-found screen (`features/notfound.contract`). Which screen an address opens is `placeOf` (`src/web/place.ts`): a hymn's address only as the current app writes its number (`/hymns/7`, never `/hymns/007`), and a path with a trailing `/` is not found.

```sh
bun run build:web                  # dist/, about 5 s
bun run serve:web                  # Exact's serve of dist/ on http://127.0.0.1:8766/
bun tools/web/serve.ts dist        # the same by the one rule alone, as a static host serves it
bun tools/drive-web.ts             # every hymn's address, not-found, script off, bytes and times, a returning reader
bun tools/drive-web.ts measure --write-budget   # writes tools/web/budget.json from five loads of each
```

The rules' tests (`src/web/*.test.ts`) are the unit-test part `test:web`, the rest `test:app`, so each part stays under the gate's 1 s budget; turbo's `test` runs both.

The drive starts the server and Chrome (no Exact driver), each in a process group of its own, and fails on any request that leaves the local server, but the recordings' bucket after a press of Play, which it answers itself with silence. Its budget checks bytes always and times only at a load of 5 or less.

## Settings and the colours

The gear in the list's title row (`SettingsGear`, one call line in `features/list.contract`) opens Settings (`features/settings.contract`), a sheet over the book: Appearance (System, Light, Dark), then one row per feature that has a setting, then About (`features/about.contract`), pushed in the sheet. A feature adds its row as one call line in the sheet's rows section, where its comment says, its component and state in its own file.

The appearance is Contract's `settingsLook persist`, read before the first frame: the root is drawn in `settingsScheme` from it, so a kept Dark never paints light first, and `setScheme` hands the platform the same choice for its own sheets and bars. Its rules (the choices, reading kept text, the scheme each shows) are `src/look/look.ts`, held to the current hymnal's `Appearance` and its web `applyAppearance` by `look.test.ts`.

The colours are the brand, `app.forma`: every role of the current hymnal's theme (`apps/hymnal/src/theme.ts`, Heartseed's palette), light and dark, under the role's own name, and the platform's roles the screens draw with (`-exact-background`, `-exact-label`, `-exact-secondary-label`, the tint, …) each set to one of them, so a screen that names no colour is drawn in the brand. A Contract file names a role, never a colour. The Bun tests hold the brand to the theme (`brand.test.ts`), every text to the current app's 4.5:1 on the ground it is drawn on (`contrast.test.ts`), and the Contract files to no colour literal (`literal.test.ts`). A test cannot read a painted colour, so the live colour checks are a drive:

```sh
bun run exact test web settings.test.contract
bun run exact test ios settings.test.contract
bun tools/drive-settings.ts web    # the brand's roles at launch, Dark at once and on the first frame after a relaunch, System following
bun tools/drive-settings.ts ios
```

`app.contract.d.ts` (the types `app.ts` imports), `.exact/` (builds, screenshots, scratch) and `dist/` are generated and ignored. `app.ts` stays out of the typecheck, which covers `src/` alone.
