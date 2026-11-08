# Appearance

Every Heartseed screen is drawn in brand C's roles
(`apps/heartseed/src/theme.ts`), in light or dark, and every text in SF
Rounded (`ui-rounded`). The reader's appearance, `System`, `Light` or
`Dark` (System by default), is chosen on About's foot and stored under
the key `APPEARANCE_KEY` (`apps/heartseed/src/appearance.ts`); a stored text
other than exactly `system`, `light` or `dark` reads as System. The scheme
is decided in one place, `useScheme()` (`apps/heartseed/src/look.tsx`):
Light and Dark their own, System dark when the system says `dark`, light
otherwise; a change of the system's appearance repaints the shown screen
with no tap when System is chosen, and changes nothing under Light or Dark.
On iOS the app's interface style follows the choice
(`Appearance.setColorScheme`, `unspecified` for System), so the status bar
and the system's own controls match.

A development probe, `apps/heartseed/app/probe/theme.tsx`
(`heartseed://probe/theme`), prints six lines: `system <light|dark|none>`
(the system's own appearance: the last one React Native reported with no
interface style set), `stored <text|none>` (the key's text in the store),
`native <light|dark|none>` (the interface style React Native reports, the
choice's under Light or Dark), `scheme <light|dark>` (the stored
appearance's over the system's), `ground <hex>` (that scheme's ground) and
`face ui-rounded`. A release build renders nothing on it.

Heartseed takes no screenshot (`SKILL.md`), so the simulator cannot show
the colours themselves: what the reader sees in each scheme, the status
bar's legibility in each style, the launch screen's scheme after a choice
(iOS draws it in the system's appearance before any JavaScript) and SF
Rounded's look and wrapping are the owner's on his phone, and the screens'
paints are the unit tests' (`apps/heartseed/src/look/`,
`apps/heartseed/src/appearance/walk.test.tsx`, the frame oracle in
`apps/heartseed/src/test/look.ts`; `apps/heartseed/README.md`, Look).

## Sub-features

- `appearance-system`: with the simulator's appearance light, the probe
  shows `system light`, `scheme light`, `ground #f1f0e6` and
  `face ui-rounded`; with the probe shown, the appearance set to dark
  shows `system dark`, `scheme dark` and `ground #142420` with no tap.
- `appearance-choice`: with the simulator's appearance dark, from Today
  `Your field`, `About`: a raw snapshot shows the radio group's three
  radios `System`, `Light`, `Dark` with `System` checked; a tap of `Light`
  → `Light` checked, and the probe shows `system dark`, `stored light`,
  `native light`, `scheme light` and `ground #f1f0e6`.
- `appearance-kept`: a relaunch, then the probe → `scheme light` still;
  back on About, a tap of `System` → the probe shows `stored system`,
  `native dark` and `scheme dark`.

## How to get to it (user POV)

- A reader who never chooses follows the phone's appearance, set in
  Settings (or Control Centre). From Today, `Your field`, `About`, then
  `System`, `Light` or `Dark` in About's foot. The probe is a developer's
  link, not a reader's.

## Driving it

Set `RUN`, `EVIDENCE`, `PORT` and `START` as `first.md` sets them, and
`sim` = `bun run --cwd apps/heartseed sim`. `<udid>` is `detail.udid` of
`sim boot`'s line. Nothing native changes for the look: `--app` with a
build of the head's native code serves; the JavaScript comes from the dev
server.

1. `first.md` steps 1-7, to `first-today`.
2. `appearance-system`, light:

   ```bash
   xcrun simctl ui <udid> appearance light
   sim open / --expect "id=session"
   sim open probe/theme --expect "label=scheme light"
   sim snapshot appearance-light
   ```

   → the snapshot has the text nodes `system light`, `scheme light`,
   `ground #f1f0e6` and `face ui-rounded`.

3. Dark, with the probe shown and no tap:

   ```bash
   xcrun simctl ui <udid> appearance dark
   sim snapshot appearance-dark
   ```

   → the text nodes `system dark`, `scheme dark` and `ground #142420`
   (take the snapshot again once after a second when it still shows
   light: the system announces the change to the app asynchronously).

4. `appearance-choice`, the simulator still dark:

   ```bash
   sim open / --expect "id=session"
   sim tap "label=Your field"
   sim tap "label=About"
   agent-device snapshot --json --raw --observe-only --force-full --session verify-heartseed
   sim tap "label=Light"
   agent-device snapshot --json --raw --observe-only --force-full --session verify-heartseed
   sim open probe/theme --expect "label=scheme light"
   sim snapshot appearance-chosen
   ```

   → the first raw snapshot has the radios `System`, `Light`, `Dark`,
   `System` alone selected; the second `Light` alone selected; the probe's
   text nodes `system dark`, `stored light`, `native light`,
   `scheme light` and `ground #f1f0e6`.

5. `appearance-kept`:

   ```bash
   sim relaunch
   sim open / --expect "id=session"
   sim open probe/theme --expect "label=scheme light"
   sim open / --expect "id=session"
   sim tap "label=Your field"
   sim tap "label=About"
   sim tap "label=System"
   sim open probe/theme --expect "label=scheme dark"
   sim snapshot appearance-system-again
   ```

   → `scheme light` after the relaunch; then the text nodes
   `stored system`, `native dark` and `scheme dark`.

6. Put the appearance back: `xcrun simctl ui <udid> appearance light`.
   Then `sim doctor` (record `head` and `timingsHold`) and `sim down`.

Report the probe's lines and the radios' labels and selected states only;
delete the `snapshots` folder and the raw snapshots.

## Gotchas

- **A link that launches the app lands on Today** (`dictation.md`,
  Gotchas): open `/` first, then the probe.
- `xcrun simctl ui <udid> appearance` changes the whole simulator's
  appearance, which outlives the drive: always put it back to light.
- The stored appearance outlives the drive too: step 5 leaves `system`
  stored, which reads as the default.
- Under Light or Dark, React Native reports the chosen style, never the
  system's, and hears no change of the system: the probe's `system` line
  is the last one reported with no style set.
