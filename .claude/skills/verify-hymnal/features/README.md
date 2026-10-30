# Hymnal verification map

The maintained source for verifying what a hymnal reader can do. Read this
index before driving the app, then use the matching feature file as the
recipe.

## Baseline

- `bun run --cwd apps/hymnal sim boot --platform ios --port $PORT --out "$EVIDENCE"`,
  then `bun run --cwd apps/hymnal sim install` (iOS), or `--platform web`
  (SKILL.md, Launch). Never ports 8191 or 8095, the owner's previews.
- `bun run --cwd apps/hymnal sim doctor` passes before the first drive.
- A hymn opened by deep link (`sim open hymns/100`) has no back button,
  so `sim back` finds nothing there. Go back with the edge pan or
  `sim open /` (`hymn-reader.md`, Gotchas).
- The recipes write `bun run --cwd apps/hymnal sim` as `sim`. A step's
  "→" is its observable result: the JSON line's `ok`, and what the
  snapshot or screenshot shows.
- The app has no seed: its 695 hymns are compiled in, and its stored
  choices are the appearance setting, chords on or off (the bar's `Key`
  hold), the chord style, `Sounds and haptics`, each hymn's key and capo,
  the player sheet's reading choices and the home list's tab in use. A
  drive that changes one puts it back at the end (`System`; chords off,
  chord style `Simple`, `Sounds and haptics` on, no transpose, no capo;
  text size 100%, `System` font, `Normal` spacing, keep screen on off;
  the tab `Sections`).

## Proof and skip reporting

- `sim journey <feature>` runs `<feature>.journey.json` (iOS): it records
  a video to `$EVIDENCE/video/<feature>.mp4` (`--skip-video` leaves it
  out), prints one JSON line a step and a summary line, appends each to
  `$EVIDENCE/results.jsonl`, saves each step's receipts as
  `<feature>-<nn>-<step>`, and stops at the first failure.
- A by-hand step (the recipe's "By hand") appends its JSON line to
  `$EVIDENCE/results.jsonl` and saves `sim snapshot <step>` and
  `sim shot <step>`.
- A stored choice is proved by a second view: leave the screen and come
  back, or relaunch, and read it again.
- An entry point that is not on main is reported as the `TargetMissing`
  line `sim tap` printed and the reason in its Gotchas. It never counts as
  verified through another path.

## Journeys

Each app-driven iOS feature has a journey, run with
`sim journey <feature>`: about, browse, chords-and-capo, feel, follow,
hymn-list, hymn-reader, player, search and settings
(`<feature>.journey.json` here). The recipe says what to read in its
receipts and what stays by hand. The rest have none:

- offline: no journey: it needs a loopback fake recording origin, which
  a journey cannot stand up.
- app-icon: no journey: it reads SpringBoard and `simctl`, outside the
  app the journey drives.
- web-client, corpus-db and indexes: no journey: a browser, the CLI and
  SQLite, not the iOS app.

## Entry contract

Each feature file has an H1, one paragraph of user-visible behavior, then
exactly these H2s in order:

1. `Sub-features`: short ids, one line each.
2. `How to get to it (user POV)`: every entry point a reader has.
3. `Driving it with sim`: starts with three lines, then, for a feature
   with a journey, its `sim journey <feature>` line and what to read in
   the receipts, then labeled by-hand steps that pair a reader's action,
   an exact command and the observable result.
   - **Preconditions:** the state the steps need beyond the baseline.
   - **States:** which of default, focus-visible, open, loading, empty and
     error the steps exercise; mark the rest n/a.
   - **Regression:** the automated tests that cover the feature.
4. `Gotchas`: traps that waste or invalidate a run.

Name reader paths, accessible names, commands and observable results. Keep
source seams out.

## Features

| Feature                                                             | Id                                                                                                                                                                                                                                                                          | Deep link (iOS / web)                                          | Proof                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Downloaded recordings](offline.md), [Settings](settings.md)        | `offline-open-default`, `offline-play-key`, `offline-local-first`, `offline-download-all`, `offline-progress`, `offline-size`, `offline-delete`, `offline-resume`, `offline-deduplicate`                                                                                    | `hymnal://settings` / `/settings`; hymn 100                    | default-on-open and chosen-key-on-Play saves, local first, 695 defaults, progress/bytes, cancel/resume/delete and deduplication against a fake origin                                                                                                                                                                                                                                                                        |
| [Hymn list](hymn-list.md)                                           | `hymn-list`, `list-search-reveal`, `list-search-hide`, `list-search-top`, `list-search-pin`                                                                                                                                                                                 | `hymnal://` / `/`                                              | rows by number, open a row; a favourite starred; Recent 5 on home, See all opens all; deep in the list an upward scroll shows the search field over the top, a downward one hides it, the pin under it                                                                                                                                                                                                                       |
| [Browse tabs](browse.md)                                            | `browse-tabs`, `browse-sections`, `browse-lists`, `browse-topics`, `browse-metres`, `browse-scripture`, `browse-all-at-once`, `browse-rail`, `browse-tab-kept`, `browse-number`, `browse-number-open`, `browse-number-play`, `browse-number-idle`                           | `hymnal://` / `/`, the tab row                                 | each tab selects and shows its groups under headings; `All at once` tiles open at a group, `Done` returns; a drag on the Sections rail moves the list (rail hidden from accessibility); the tab in use kept across a relaunch; `Find a hymn by number` opens the drums `Hundreds`, `Tens` and `Ones`, `Open` opens the dialled hymn, `Play` (Sound off) plays it, and the `#` shows alone on the home list with no hymn held |
| [Chord placement](chords-and-capo.md), [global choice](settings.md) | `chords-placement-global`, `chords-placement-hymn`, `chords-placement-inherit`, `chords-placement-playing`, `chords-placement-kept`, `chords-placement-reset`                                                                                                               | `hymnal://settings` / `/settings`; player sheet on 373 and 388 | three modes, explicit inheritance, immediate anchors during silent Play, persistence, reset during fling, no playback commands or held chords                                                                                                                                                                                                                                                                                |
| [Hymn reader](hymn-reader.md)                                       | `hymn-reader`                                                                                                                                                                                                                                                               | `hymnal://hymns/100` / `/hymns/100`                            | stanzas and refrains in order, scroll; swipe to the next hymn, a left-edge pan goes back                                                                                                                                                                                                                                                                                                                                     |
| [About this hymn](about.md)                                         | `about-sheet`, `about-more-like`, `about-topics`, `about-scripture`, `about-tunes`, `search-about-size`                                                                                                                                                                     | `hymnal://hymns/100`, then `About this hymn`                   | the quiet line gives the section and first passage and opens the sheet; `More like this` lists 8 hymns by meaning, a row opens its hymn; `Topics`, `Scripture` and `Sing to another tune` equal the indexes, a topic opens the `Topics` tab at it, a passage opens search with it, a tune row opens its hymn; the app grows at most 20 MB; `Hymns about this` under 30 ms a query in Hermes                                  |
| [Web client](web-client.md)                                         | `web-client-cold`, `web-client-cache-migration`, `web-client-warm`, `web-client-production`                                                                                                                                                                                 | web `/`, `/hymns/100`                                          | hydrated list and reader, row navigation, Reading opens, no route-error overlay or raw RNW CommonJS requests; numeric/boolean proof                                                                                                                                                                                                                                                                                          |
| [Chords and capo](chords-and-capo.md)                               | `chords`, `chords-key`, `transpose`, `capo`, `chords-reset`, `chords-sound`, `chords-levels`, `chords-changes-only`, `chords-kept`, `chords-simple`, `chords-tap`, `chords-panel`, `chords-motion`, `chords-fling`                                                          | `hymnal://hymns/100` / `/hymns/100`                            | a hold of the bar's `Key` turns chords on; `chord-1-1-1` reads `Db`, then follows the key and capo dials; reset turns home in view, then closes; both levels keep syllable anchors; only changes show, with chordless openings empty; the dials on one panel; the hold springs; kept per hymn; Simple on hymn 3: `G`, `D`                                                                                                    |
| [Player](player.md)                                                 | `player`, `player-bar`, `player-full`, `player-spring`, `player-seek-bar`, `player-sheet-reader`, `player-stack`, `player-key-set`, `player-key-switch`, `player-key-fallback`, `player-capo-invariant`, `player-swap-page`, `player-swap-sheet`, `player-swap-race`        | `hymnal://hymns/100` / `/hymns/100`                            | Key selects its recording at retained musical time; paused selection waits for Play; fallback is visible; capo changes shapes alone. Existing bar, sheet and stack checks still apply.                                                                                                                                                                                                                                       |
| [Follow](follow.md)                                                 | `follow-play`, `follow-play-recording`, `follow-line`, `follow-syllable`, `follow-sound`, `follow-hand`, `follow-seek`, `follow-intro`, `follow-soprano`, `follow-melisma`, `follow-shared-note`, `follow-key-continuity`                                                   | `hymnal://hymns/100` / `/hymns/100`                            | one Play tap, sound off, the selected line in view to the last line; Resume follow after a drag                                                                                                                                                                                                                                                                                                                              |
| [Settings and about](settings.md)                                   | `settings`, `settings-chords`, `settings-feel`, `about`                                                                                                                                                                                                                     | `hymnal://settings` / `/settings`                              | appearance kept after leaving; chord style kept after a relaunch; `Sounds and haptics` on at first, off kept after a relaunch; About's credits                                                                                                                                                                                                                                                                               |
| [Feel](feel.md)                                                     | `feel-voice`, `feel-cues`, `feel-off`                                                                                                                                                                                                                                       | `hymnal://hymns/100` / `/hymns/100`                            | `[feel] ready sounds=13 … simulator=true` once; each dial detent's `[feel] play sound=<name> skipped=simulator` line, none for any other touch; none with the switch off                                                                                                                                                                                                                                                     |
| [Search](search.md)                                                 | `search`, `search-number`, `search-number-forms`, `search-text`, `search-line`, `search-typo`, `search-dropped`, `search-modern`, `search-order`, `search-matched-line`, `search-about`, `search-topic`, `search-scripture`, `search-open`, `search-empty`, `search-hermes` | `hymnal://` (the home field) / `/`                             | `no 100`, `#100`, `Hymn #100` find 100 first; a line of hymn 100 with a typo finds it with the line under its title; title words list titles first in number order; `Psalm 23` lists the Scriptural index's hymns first, a topic's name its hymns; open a result, back to the query                                                                                                                                          |
| [Corpus database](corpus-db.md)                                     | `corpus-db`, `corpus-db-build`, `corpus-db-census`, `corpus-db-search`, `corpus-db-cli`, `corpus-db-legacy`, `corpus-init-empty`, `corpus-init-preserve`, `corpus-init-wal`, `corpus-init-wal-refuse`, `corpus-init-runtime-repeat`, `corpus-db-indexes`                    | CLI and SQLite; sim n/a                                        | reproducible build, normalized census/FTS, 920 lookup IDs, legacy reader, isolated init, default preservation, forced WAL refusal and measured runtime repeat; [acceptance commands](corpus-db.md#driving-it-with-sim)                                                                                                                                                                                                       |
| [Back-matter indexes](indexes.md)                                   | `indexes-data`, `indexes-checks`, `indexes-readings`                                                                                                                                                                                                                        | CLI; sim n/a                                                   | eleven index files, every check passing with `indexes files=11 entries=9221 problems=0`, each check's mutations caught, each page read twice and every difference ruled; [steps](indexes.md#driving-it-with-sim)                                                                                                                                                                                                             |
| [App icon](app-icon.md)                                             | `icon-light`, `icon-dark`, `icon-tinted`, `icon-name`, `icon-web`, `splash-light`, `splash-dark`                                                                                                                                                                            | home screen / `/manifest.webmanifest`                          | the night's wheat on the wheat named Hymnal, the wheat on the night in dark, tinted; the launch screen's wheat on its ground; the four web files 200 and linked                                                                                                                                                                                                                                                              |
