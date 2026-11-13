# About

About (`apps/heartseed/src/about/screen.tsx`) is a small page: the one
heading `About`, the app's name `Heartseed` (`id=about-name`), its version
`Version <x.y.z>` (`id=about-version`, `apps/heartseed/package.json`'s
`version`) and one row, the button `Licences`. It is reached from home by
the `Settings` row at the field's end, then the button `About` in the
Settings sheet, and by no other way (`How Heartseed works` replays the
welcome, `first.md`), and left by the button `Your field` (shown
`‹ Your field`) in its bar, which returns to home with the sheet closed.

`Licences` shows the licences on a page of their own, the one way to
them: the one heading `Licences`, and in its scroll view the natural
voice's credits paragraph (`id=about-credits`) and the Apache License 2.0
(`id=about-licence`), the text of
`apps/heartseed/native/natural/kokoro/LICENSE` byte for byte, served as
the bundle-time module `virtual:heartseed-licence`, which the app owes for
the natural voice's vendored code. Its one way back is the button `About`
(shown `‹ About`) in its bar, fixed above the scroll view, which shows
About again.

Both pages show in place in the root route: no route, no link, no tab.
Neither page is shown while Say it listens. Neither has a
foot or the `Appearance` radios (the Settings sheet holds them:
`appearance.md` drives them); neither writes anything, and a launch never
opens on either.

## Sub-features

- `about-page`: home's `Settings`, then the sheet's `About`, shows the
  heading `About`, the texts `Heartseed` and one starting `Version `, and
  exactly the buttons `Your field` and `Licences`; no label starting
  `Apache License`, no credits, no `Voice` and no radio `System`, `Light`
  or `Dark`.
- `about-credits`: About's `Licences` shows the heading `Licences`, a node
  whose raw label equals the credits (`CREDITS` in
  `apps/heartseed/src/about/screen.tsx`), a node whose raw label starts
  `Apache License` and ends `limitations under the License.`, and the one
  button `About`; `About` shows About again (the heading `About`, no
  licence); its `Your field` shows the field (the heading `Your field`)
  with no heading `Settings`; a relaunch from About opens home.

## How to get to it (user POV)

- From home, scroll to the field's end and tap `Settings`, then `About`
  in the sheet; tap `Licences` for the licences, `About` to come back from
  them, and `Your field` to come back home.

## Driving it

`sim journeys <file>.md` plays the lists below one after another, each in one app session from its start, with no screenshot and no video, and names each journey that fails with its first failed step and the journey before it (`SKILL.md`, Drive). The by-hand steps between them (a raw snapshot, a read of the log) are not part of it.

**Journeys in order:** from a fresh install: `first`, `about`.

Set `RUN`, `EVIDENCE`, `PORT` and `START` as `first.md` sets them, and
`sim` = `bun run --cwd apps/heartseed sim`. Nothing native changes for
About: `--app` with a build of the head's native code serves; the
JavaScript comes from the dev server.

The taps are the journey `about` beside this file (`about.journey.json`),
one `sim journey about` call; its receipts are
`$EVIDENCE/snapshots/about-<nn>-<step>.txt`, cited as `about/<step>`. The
licence's text, the version line and other run-time labels are read in a
raw snapshot (`first.md`, Driving it) taken by hand where a step says, as
booleans only.

1. `first.md`'s `sim journey first`, to `first-home`.
2. `sim journey about` → `"ok":true`.
3. `about-page`: `about/about`, after the scroll to `Settings`, the sheet
   and `About` → as the row says. A raw snapshot here (a second run of the
   journey up to this step, or by hand after step 6 below) gives three
   booleans: a label `Heartseed`, a label starting `Version `, no label
   starting `Apache License`.
4. `about-credits`: `about/licences` → the heading `Licences`, the button
   `About`, no `Voice`; from a raw snapshot taken on `Licences`, three
   booleans: a label equal to `CREDITS`, a label starting
   `Apache License`, a label ending `limitations under the License.`.
   `about/about-again` → the heading `About`, no label starting
   `Apache License`.
5. `about/about-home-again` → the heading `Your field`, no heading
   `Settings`. Then the journey opens About again through `Settings` and
   relaunches: `about/about-relaunch` → the heading `Your field` (home), no
   heading `About`.
6. Then `sim doctor` (record `head` and `timingsHold`) and `sim down`.

Red on base (e27f247c9): the sheet's `About` shows the licence at once,
with no `Licences` button, so the journey's `about` step fails
`TargetMissing` on `label=Licences`, and no `Version ` line.

Report only booleans and the labels named above; delete the `snapshots`
folder and the raw snapshots.

## Gotchas

- Home's `Settings` and `How Heartseed works` rows lie at the field's end:
  the journey scrolls to `Settings` first. `About` in the sheet is
  outside its scroll view; `Your field` sits in About's bar and `About` in
  the licences' bar. The licence is long; reading it from the raw
  snapshot needs no scroll, since the node holds the whole text.
- `label=About` names the sheet's button on home and the licences' back
  on `Licences`; a step taps it only where it stands.
- Their contrast, their one heading, neither page shown while Say it
  listens, and the
  rule that only `Licences` holds the licence are the tests'
  (`apps/heartseed/src/about/screen.test.tsx`,
  `apps/heartseed/src/about/rule.test.ts`,
  `apps/heartseed/src/settings/ways.test.tsx`), never the drive's.
