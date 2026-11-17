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

`features/recent.contract` and `features/favourites.contract` keep the reader's two lists as `persist` states of hymn numbers, `recentList` and `favouriteList`. A hymn page coming to the top of the stack is a visit (`recentAfter`, the current app's `visited`); the star in a hymn page's header (`favourite`) adds or takes out its hymn (`favouritesAfter`, the current app's `toggleFavourite`). The shelf shows Recent's latest five (`shelf-<n>`), and its last row, `recent-all`, opens `/recent` with all of them (`recent-<n>`). A favourite's rows carry a star (`star-<n>`). A section's header is drawn in the muted role on every host (`src/list/headers.test.ts`).

## Finding a hymn

`features/find.contract` draws the find bar at the foot of home, under the list, and under the header of Recent and a hymn's page (`find-bar`, on the top screen only; on home a bar between the tab row and the list would take the tab row out of UIKit's bar and leave the list inset under it): folded it offers Search (`find-search`) and the `#` (`find-number`), and on home All at once (`tiles-show`); with search on at that screen, the box (`search`), the `#` and Cancel (`find-cancel`). Which row shows and which control is chosen are the current app's `modeAt` and `chosenOf` (`@manna/hymnal-app/home/find-rules`). The `#` opens the drums, a dialog of three ranges (`drum-hundreds`, `drum-tens`, `drum-ones`) the platform reads as adjustable, their number held to the book by the current app's `turn` and `held` (`player/drums`); Open goes to the hymn, and a tap outside closes them and does nothing else. All at once (`tiles`, `tile-<n>`) lies over the home list, which stays built under it, so Done returns to the tab and row it stood at; a pinch in on the list opens it and a pinch out closes it (the web hears a trackpad's, a wheel with Control; iOS has the control). On a hymn's page a found hymn takes that page's place (`openingAt`).

Every rule is one pure `step(state, input)` in `src/find/step.ts`, answered by `findStep` (`src/find/sources.ts`), one state per launch of the data module, as the player's. A screen is named by its path, without the query a launch adds. `step.model.test.ts` checks it against a reference model over generated stacks; `drums.test.ts` checks every number, drum and turn against the current app's. The tiles' numbers (`findTiles`) are asked once, when they first show. `bun tools/drive-find.ts web|ios` reads the drums in the accessibility tree, pinches the list and checks a header's painted colour.

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

The seek: the full player's position bar (`position`, a range) sends one seek at its release; a step, a stanza's place (`stanza-place-<n>`) and the lock screen's seek and ±10 s skip send one each. Each seek has a serial; the element's `time` and `seeked` name the one they follow, so a late one moves nothing, and a sent place is held until it is reached or 2 s pass (`scrub-rules.ts`'s `settleFor`). A span the stanza choice leaves out is sought across: a frame task arms it on the runner's clock from the last tick (`due`), and the next tick corrects it. VoiceOver's swipe on the bar moves it 10 s (`adjust-step=10`, `NUDGE`), as an arrow key does on the web, while a drag keeps the range's default step; `adjust-step` is the Exact patch the pin carries (`docs/exact.md`, "The pin"), and `type "position" adjust up` in `seek.test.contract` performs one swipe. `protocol.test.ts` searches 10 actions deep in the gate; `PROTOCOL_DEPTH=18` searches deeper.

## The web

`bun run build:web` makes the site a host serves as plain files: Exact's release build (`web-build --out dist`, after the book's makers) and then `tools/web/pages.ts`, which writes a page per address a screen has from the build's `shell.html` (`src/web/pages.ts`): `index.html`, `recent/`, `player/`, `settings/`, `settings/about/`, `hymns/<n>/` for each hymn and `404.html`, each the same shell with its screen's own `<title>` and description, so a shared link previews as its hymn. Every route renders in the browser (`render=client`). The pin can render a route at build (`render=build`, with `pages=` for a hymn's), but its pages keep the answers they were built with: on such a site a returning reader's Recent shelf stayed empty, a stanza choice was written back to none and the first press of Play did nothing (`bun tools/drive-web.ts return` over such a build).

A host needs one rule, `servedFor` in `src/web/served.ts`: a file at the path, else that folder's `index.html`, with 200; anything else `404.html` with 404, whose script draws the not-found screen (`features/notfound.contract`). Which screen an address opens is `placeOf` (`src/web/place.ts`): a hymn's address only as the current app writes its number (`/hymns/7`, never `/hymns/007`), and a path with a trailing `/` is not found.

```sh
bun run build:web                  # dist/, about 5 s
bun run serve:web                  # Exact's serve of dist/ on http://127.0.0.1:8766/
bun tools/web/serve.ts dist        # the same by the one rule alone, as a static host serves it
bun tools/drive-web.ts             # every hymn's address, not-found, script off, bytes and times, a returning reader
bun tools/drive-web.ts measure --json run-1.json   # one run's report; five or more at load ≤ 5
bun tools/web/budget.ts run-*.json   # writes tools/web/budget.json: each limit the runs' median, the runs kept beside it
```

The rules' tests (`src/web/*.test.ts`) are the unit-test part `test:web`, the chords' page, declarations and data-host tests the part `test:chords`, their moves, line rule and shapes the part `test:moves`, the find bar's the part `test:find`, the motion and Sounds and haptics guards (`src/look/motion.test.ts`, `src/look/quiet.test.ts`, `src/settings/feel.test.ts`) the part `test:motion`, the rest `test:app`, so each part stays under the gate's 1 s budget; turbo's `test` runs them all.

The drive starts the server and Chrome (no Exact driver), each in a process group of its own, and fails on any request that leaves the local server, but the recordings' bucket after a press of Play, which it answers itself with silence. Its budget checks bytes always and times only at a load of 5 or less. Either host listens on a port the drive claims from the app's spare range for its whole run (`claimAppPort` of `@manna/exact-kit/port`), so two drives never meet and the reopen finds its store. It takes about three minutes, most of it the 695 addresses, whose progress it prints every hundred. Each check runs under a watchdog (`tools/web/stall.ts`): a check that takes no step for 45 s, or a DevTools call Chrome leaves unanswered for 30 s, fails by the check's name and the step it was at, and the checks after it fail as not run. `bun tools/drive-web.ts web` is the whole drive too, as the other drives take their host; a name that is no check is refused. With `--server exact` it leaves out `measure` unless named, since the budget is the plain host's cache rule, and it fails if `dist/` lost its pages: Exact's serve builds the site again, without `tools/web/pages.ts`'s pages, when a source changed since `build:web`. The plain host keeps a file for a year when its name ends in the bundler's eight-character digest, which may hold `-` and `_` (`cacheOf`, `src/web/cache.test.ts`), so a warm load asks only for the HTML and the undigested scripts.

## Settings and the colours

The gear in the list's title row (`SettingsGear`, one call line in `features/list.contract`) opens Settings (`features/settings.contract`), a sheet over the book: Appearance (System, Light, Dark), then one row per feature that has a setting, then About (`features/about.contract`), pushed in the sheet. A feature adds its row as one call line in the sheet's rows section, where its comment says, its component and state in its own file.

Sounds and haptics (`settings-feel`, `SettingsFeelRow`) is the current hymnal's `feel`: on until the reader turns it off, kept as its word (`settingsFeelKept persist`, `on` or `off`) and read by `feelOf` (`src/settings/feel.ts`) into `settingsFeel`, which `feel.test.ts` holds to the current app's decoding and default. Every `haptic(…)` the app plays stands under `if settingsFeel` (see "Motion"). Every test and drive that plays a hymn turns it off first, as the owner asks: a contract test opens at `at "/settings"` with the shared opener (`QUIET_OPENER` in `tools/quiet.ts`, held by `src/look/quiet.test.ts`), the agent drives run `quietOps` and stop before Play unless it reads off, and `drive-web.ts` refuses Play while it is on.

The appearance is Contract's `settingsLook persist`, read before the first frame: the root is drawn in `settingsScheme` from it, so a kept Dark never paints light first, and `setScheme` hands the platform the same choice for its own sheets and bars. Its rules (the choices, reading kept text, the scheme each shows) are `src/look/look.ts`, held to the current hymnal's `Appearance` and its web `applyAppearance` by `look.test.ts`.

The colours are the brand, `app.forma`: every role of the current hymnal's theme (`apps/hymnal/src/theme.ts`, Heartseed's palette), light and dark, under the role's own name, and the platform's roles the screens draw with (`-exact-background`, `-exact-label`, `-exact-secondary-label`, the tint, …) each set to one of them, so a screen that names no colour is drawn in the brand. A Contract file names a role, never a colour. The Bun tests hold the brand to the theme (`brand.test.ts`), every text to the current app's 4.5:1 on the ground it is drawn on (`contrast.test.ts`), and the Contract files to no colour literal (`literal.test.ts`). A test cannot read a painted colour, so the live colour checks are a drive:

```sh
bun run exact test web settings.test.contract
bun run exact test ios settings.test.contract
bun tools/drive-settings.ts web    # the brand's roles at launch, Dark at once and on the first frame after a relaunch, System following
bun tools/drive-settings.ts ios
```

## Motion

Calm and quick, as the owner asked (150–250 ms, nothing that overshoots), and still under Reduce Motion. The times and curves are `app.forma`'s motion tokens (`duration.fade`, `duration.exit`, `duration.bar-in`, `duration.bar-out`, `duration.panel`, `duration.tiles-in`, `duration.tiles-out`, `duration.growth`, `easing.out`, `easing.growth`), named in each row and written in at build; the shared frames (`hy-rise`, `hy-sink`, `hy-fade-in`, `hy-fade-out`) and `motionStill`, the platform's Reduce Motion (`settingsMedia.prefersReducedMotion`), are `features/motion.contract`. Every motion row is a choice on `motionStill` whose still arm only fades or is `none`.

- The filled buttons (`PlayerFilled`) take the brand's `pressed` fill under `onPressed` while held, and give to 0.97, on the host's press curve.
- The docked bar rises from the screen's foot (`hy-rise`, 250 ms, `easing.out`) and sinks back (`hy-sink`, 150 ms, `ease-out`) when a sheet opens; still, it fades in and out over 150 ms. The room under a hymn's last row (`PlayerBarRoom`) slides with it. The bar's own box, not the dock, rises and sinks: a column pinned to the dock's foot (`bottom=0`) around the `bar` row, because an exiting node is drawn at its offset in its parent, and the dock shrinks to nothing at the screen's foot once the bar goes, so the row alone would sink from below the screen. A dock spanning the screen would fix that too, but `verify` then reads the rows under it as covered. An exiting bar is out of the agent's tree at once (`tree lists live targets`), so no test waits on it.
- Play, Pause and the sheet's toggle tick `impact-light`, a stanza and an appearance `selection`, as the current Feel seam's `bodyOf` gives their cues, each only under `if settingsFeel`.
- The drums (`FindDrums`, a painted `dialog`, so iOS gives it no transition of its own) pop in from 0.96 (`hy-pop`, `duration.panel`, 250 ms, `easing.out`) and fade out (`duration.exit`, 150 ms); the platform fades the dim under them. They are drawn only while the step has them open (`if findShown.drums`), so every close the step makes plays the exit. The dialog fills the window, clear, with its panel (`drums-panel`) in the middle, drawing the edge and lift a web dialog draws (a 1 px border in `line` and `0 16px 48px` of `shadow` at 24 %): a tap outside the panel lands on `drums-outside` beneath it (a box hearing `pointerup`, no control: the `#` is the close a reader and Tab reach), and the dialog's `key` handler claims Escape (`preventDefault()`), each a close through the step, so the `if` drops a dialog still open and it fades as for `#`; the host's own light dismiss (`closedby="any"`) would close it first and its exit would play unseen. Under Reduce Motion they fade in and leave at once (no exit). Open (`drums-open`) presses as `PlayerFilled` does.
- The tiles grow in from 1.06 (`hy-zoom-in`, `duration.tiles-in`, 180 ms) and fade out to 1.06 (`hy-zoom-out`, `duration.tiles-out`, 140 ms), the current `All at once`'s, whose times `@manna/hymnal-app/home/tile-times` gives; still, they cross-fade over `duration.fade`. Only their column moves, never each of the 695 tiles.
- The search box and Cancel fade in and out over `duration.fade`, and the find bar's row grows on `easing.growth`, a spring of damping ratio 1 settling over `duration.growth` (250 ms: q113 shortens the current bar's 0.30 s); still, no layout transition.
- With chords on, each chord fades in over its syllable (`hy-fade-in`, 150 ms); they drop at once when chords go off.
- A favourite added ticks `success` and one taken out `impact-light`; a tab chosen (not the tab in use) `selection`; the chords switch `impact-light`; each Key or Capo step and each drum's turn `selection`.

`src/look/motion.test.ts` holds it all from the files: each token's value, no duration over 250 ms and no spring under a damping ratio of 1, every motion row a choice on `motionStill` with a still arm that only fades, no time, curve or spring written in Contract, the press, and every `haptic(` under the setting with the kind its cue's body gives (a table there names each call's cue). The live checks are a drive (it reads the sources, so it takes the test setup's modules); on iOS a transform in flight reads at its end value, so iOS reads the ends and films the rise and sink:

```sh
bun --preload ./src/test/setup.ts tools/drive-motion.ts web   # the press light and dark, the rise at 100 ms, the exit and return, the room, Reduce Motion, the setting kept
bun --preload ./src/test/setup.ts tools/drive-motion.ts ios
bun tools/drive-find.ts web   # the drums' pop, each close's fade at 50 ms (#, outside, Escape), Open pressed, the tiles' zoom, Cancel's fade, a chord's fade, Reduce Motion
bun tools/drive-find.ts ios   # the end values, and films of the drums, the tiles, the bar and the chords
```

## Chords

Chords are off at first; Settings' `Chords` row (`ChordsRow`, one call line in the sheet) turns them on for every hymn, kept across launches (`chordsOn persist`). On, a hymn's page names the key sounding and the key played, with the transpose (`-` and `+`, wrapping through the twelve) and the capo (stopping at 0 and 11), and draws each sung line as its words, each word as its syllables, and over each syllable the chord that changes there, in the current app's default Simple style, spelled in the key played. A refrain carries its chords each time it is sung; a part the chords do not cover shows its words; a hymn with no chords says so over its words. Each hymn keeps its own move (`chordsMoves persist`, `"<hymn>:<transpose>:<capo>"`). A tap on a chord opens its shape over the page (`/hymns/<n>/chord/<grip>`): a chord box per chord, its strings and frets an SVG, the marks over the nut, each finger a dot with its number, a barre one bar.

`bun run exact` writes `src/chords/chords.gen.ts` (ignored; `chords.gen.d.ts` declares it) from the current app's `vite/chords` maker, one string per hymn, which `app.ts` hands the sources; a hymn's string is decoded only when its page is asked for with chords on. The rules are the current app's, imported (`hymns/chords`, `hymns/simple`, `hymns/shapes`, `@manna/hymnal/chord`), with declarations for Exact's type check under `src/hymns/decl/` and `src/chords/decl/`, held to their sources by `src/chords/held.test.ts`. What the port adds is `src/chords/`: the page's answer (`page.ts`), the kept moves (`move.ts`), the shape's drawing (`shape.ts`) and the line rule (`rows.ts`). A chord stands over its syllable because the two are one box, a column of the chord over the syllable, inside a wrapping row of the word's pairs inside a wrapping row of the line's words: a line breaks between words, a word only where it is wider than the page, and never inside a pair. `rows.ts` is that rule as a pure function the tests and the drive hold the hosts to.

The Bun tests hold every hymn's answer to the current app's `sectionsOf` (`page.test.ts`), every move's names and keys to its `transposed`, `capoed`, `playedKey` and `soundingKey` (`move.test.ts`), the line rule (`rows.test.ts`) and every chord's shape under every transpose to its `fingeringOf` (`shape.test.ts`). They run as their own tasks, `test:chords` and `test:moves`. A test cannot read where a node is drawn, so the placement checks are a drive, which reads the chords from the sources and so needs the test setup's modules:

```sh
bun run exact test web chords.test.contract
bun run exact test ios chords.test.contract
bun --preload ./src/test/setup.ts tools/drive-chords.ts web    # chords over their syllables, the largest text's lines broken by the line rule, kept after a relaunch
bun --preload ./src/test/setup.ts tools/drive-chords.ts ios
```

`app.contract.d.ts` (the types `app.ts` imports), `.exact/` (builds, screenshots, scratch) and `dist/` are generated and ignored. `app.ts` stays out of the typecheck, which covers `src/` alone.
