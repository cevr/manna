# About

The About screen (`apps/heartseed/src/about/screen.tsx`) holds the natural
voice's credits and the Apache License 2.0 whole, which the app owes for
the natural voice's vendored code. It is reached from home by the gear
`Settings` in home's bar, then the button `About` in the Settings sheet,
and left by the button `Your field` (shown `‹ Your field`) in its bar,
fixed above its scroll view, which returns to home with the sheet closed;
in place in the root route: no route, no link, no tab. Like every field
control, `Settings` is disabled while a remove is pending, and About is
never shown while Say it listens. In its scroll view, the one heading
`About`, the credits paragraph (`id=about-credits`) and the licence
(`id=about-licence`), the text of
`apps/heartseed/native/natural/kokoro/LICENSE` byte for byte, served as
the bundle-time module `virtual:heartseed-licence`. About has no foot and
no `Appearance` radios (the Settings sheet holds them: `appearance.md`
drives them); it writes nothing, and a launch never opens on it.

## Sub-features

- `about-credits`: home's `Settings`, then the sheet's `About`, shows the
  heading `About`, a node whose raw label equals the credits (`CREDITS`
  in `apps/heartseed/src/about/screen.tsx`), a node whose raw label starts
  `Apache License` and ends `limitations under the License.`, and a button
  `Your field`, with no `Voice` and no radio `System`, `Light` or `Dark`;
  `Your field` shows the field (the heading `Your field`) with no heading
  `Settings`; a relaunch from About opens home.

## How to get to it (user POV)

- From home, tap `Settings` in its bar, then `About` in the sheet; tap
  `Your field` to come back.

## Driving it

Set `RUN`, `EVIDENCE`, `PORT` and `START` as `first.md` sets them, and
`sim` = `bun run --cwd apps/heartseed sim`. Nothing native changes for
About: `--app` with a build of the head's native code serves; the
JavaScript comes from the dev server.

1. `first.md` steps 1-7, to `first-home`.
2. `about-credits`: on home, `sim tap "label=Settings"`,
   `sim tap "label=About"`, `sim snapshot about` and a raw snapshot
   (`agent-device snapshot --json --raw --observe-only --force-full
   --session verify-heartseed`) → the heading `About`, the button
   `Your field`, no `Voice`, no radio `System`; from the raw snapshot,
   three booleans: a label equal to `CREDITS`, a label starting
   `Apache License`, a label ending `limitations under the License.`.
3. `sim tap "label=Your field"` → the heading `Your field`, no heading
   `Settings`. Then `sim tap "label=Settings"`, `sim tap "label=About"`,
   `sim relaunch`, `sim open / --expect "id=counts"` → the heading
   `Your field` (home), no heading `About`.
4. Then `sim doctor` (record `head` and `timingsHold`) and `sim down`.

Red on base (before the Settings sheet): `sim tap "label=Settings"` finds
no element.

Report only booleans and the labels named above; delete the `snapshots`
folder and the raw snapshots.

## Gotchas

- About never needs a `sim scroll`: `Settings` is in home's bar and
  `About` in the sheet, both outside the scroll views, and `Your field`
  sits in About's bar. The licence is long; reading it from the raw
  snapshot needs no scroll either, since the node holds the whole text.
- Its contrast, its one heading, the gear disabled while a remove is
  pending and About never shown while Say it listens are the tests'
  (`apps/heartseed/src/about/screen.test.tsx`,
  `apps/heartseed/src/settings/ways.test.tsx`), never the drive's.
