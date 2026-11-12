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

Set `RUN`, `EVIDENCE`, `PORT` and `START` as `first.md` sets them, and
`sim` = `bun run --cwd apps/heartseed sim`. Nothing native changes for
About: `--app` with a build of the head's native code serves; the
JavaScript comes from the dev server.

1. `first.md` steps 1-7, to `first-home`.
2. `about-page`: on home, `sim scroll "label=Settings" down`, `sim tap
   "label=Settings"`, `sim tap "label=About"`, `sim snapshot about` and a
   raw snapshot (`agent-device snapshot --json --raw --observe-only
   --force-full --session verify-heartseed`) → as the row says; from the
   raw snapshot, booleans only: a label `Heartseed`, a label starting
   `Version `, no label starting `Apache License`.
3. `about-credits`: `sim tap "label=Licences"`, `sim snapshot licences`
   and a raw snapshot → the heading `Licences`, the button `About`, no
   `Voice`; three booleans: a label equal to `CREDITS`, a label starting
   `Apache License`, a label ending `limitations under the License.`.
   `sim tap "label=About"`, `sim snapshot about-again` → the heading
   `About`, no label starting `Apache License`.
4. `sim tap "label=Your field"` → the heading `Your field`, no heading
   `Settings`. Then `sim scroll "label=Settings" down`, `sim tap
   "label=Settings"`, `sim tap "label=About"`, `sim relaunch`, `sim open /
   --expect "id=today-card"` → the heading `Your field` (home), no heading
   `About`.
5. Then `sim doctor` (record `head` and `timingsHold`) and `sim down`.

Red on base (e27f247c9): the sheet's `About` shows the licence at once,
with no `Licences` button and no `Version ` line.

Report only booleans and the labels named above; delete the `snapshots`
folder and the raw snapshots.

## Gotchas

- Home's `Settings` and `How Heartseed works` rows lie at the field's end:
  `sim scroll "label=Settings" down` first. `About` in the sheet is
  outside its scroll view; `Your field` sits in About's bar and `About` in
  the licences' bar. The licence is long; reading it from the raw
  snapshot needs no scroll, since the node holds the whole text.
- `label=About` names the sheet's button on home and the licences' back
  on `Licences`; tap it only where the step says.
- Their contrast, their one heading, the `Settings` row disabled while a
  remove is pending, neither page shown while Say it listens, and the
  rule that only `Licences` holds the licence are the tests'
  (`apps/heartseed/src/about/screen.test.tsx`,
  `apps/heartseed/src/about/rule.test.ts`,
  `apps/heartseed/src/settings/ways.test.tsx`), never the drive's.
