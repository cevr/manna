# About

The About screen (`apps/heartseed/src/about/screen.tsx`) holds the natural
voice's credits and the Apache License 2.0 whole, which the app owes for
the natural voice's vendored code. It is reached from the field by the
button `About` in the field's fixed foot, under its scroll view, and left
by the button `Your field` (shown `‹ Your field`) in its bar, fixed above
its scroll view, in place in the root route: no route, no link, no tab.
Like every field control, `About` is disabled while a remove is pending,
and About is never shown while Say it listens. In its scroll view, the one
heading `About`, the credits paragraph (`id=about-credits`) and the
licence (`id=about-licence`), the text of
`apps/heartseed/native/natural/kokoro/LICENSE` byte for byte, served as
the bundle-time module `virtual:heartseed-licence`. A foot fixed under its
scroll view holds the radio group `Appearance`: `System`, `Light` and
`Dark` in that order, the stored one checked (`appearance.md` drives
them). About writes the store only at a tap of one of them, and a
launch never opens on it.

## Sub-features

- `about-credits`: the field shows a button `About` whose rect lies
  wholly inside the window and above the bottom safe area with no scroll;
  its tap shows the heading `About`, a node whose raw label equals the
  credits (`CREDITS` in `apps/heartseed/src/about/screen.tsx`), a node
  whose raw label starts `Apache License` and ends
  `limitations under the License.`, and a button `Your field`, with no
  `Voice`, and three radios `System`, `Light` and `Dark` whose rects lie
  wholly inside the window and above the bottom safe area with no scroll;
  `Your field` shows the field (the heading `Your field`); a relaunch from
  About opens Today.

## How to get to it (user POV)

- From Today, tap `Your field`, then `About`; tap `Your field` to come
  back.

## Driving it

Set `RUN`, `EVIDENCE`, `PORT` and `START` as `first.md` sets them, and
`sim` = `bun run --cwd apps/heartseed sim`. Nothing native changes for
About: `--app` with a build of the head's native code serves; the
JavaScript comes from the dev server.

1. `first.md` steps 1-7, to `first-today`.
2. `about-credits`: `sim tap "label=Your field"`, `sim snapshot about-field`
   and a raw snapshot (`agent-device snapshot --json --raw --observe-only
   --force-full --session verify-heartseed`) → a button `About`; from the
   raw snapshot, its rect and the window's, keeping only numbers.
3. `sim tap "label=About"`, `sim snapshot about` and a raw snapshot → the
   heading `About`, the button `Your field`, no `Voice`; from the raw
   snapshot, three booleans: a label equal to `CREDITS`, a label starting
   `Apache License`, a label ending `limitations under the License.`; and
   the radios `System`, `Light`, `Dark`, their rects and the window's,
   keeping only numbers.
4. `sim tap "label=Your field"` → the heading `Your field`. Then
   `sim tap "label=About"`, `sim relaunch`,
   `sim open / --expect "id=session"` → Today.
5. Then `sim doctor` (record `head` and `timingsHold`) and `sim down`.

Report only booleans, rect numbers and the labels named above; delete the
`snapshots` folder and the raw snapshots.

## Gotchas

- `About` never needs a `sim scroll`: it is in the field's foot, outside
  the scroll view, `Your field` sits in About's bar and the appearance
  radios in About's foot. The licence is
  long; reading it from the raw snapshot needs no scroll either, since
  the node holds the whole text.
- Its contrast, its one heading, its being disabled while a remove is
  pending and never shown while Say it listens are the tests'
  (`apps/heartseed/src/about/screen.test.tsx`), never the drive's.
