# Appearance

Every Heartseed screen is drawn in brand C's roles
(`apps/heartseed/src/theme.ts`), in light or dark as the system's
appearance says, and every text in SF Rounded (`ui-rounded`). The scheme is
decided in one place, `useScheme()` (`apps/heartseed/src/look.tsx`): dark
when the system says `dark`, light otherwise; a change of the system's
appearance repaints the shown screen with no tap. A development probe,
`apps/heartseed/app/probe/theme.tsx` (`heartseed://probe/theme`), prints
four lines: `system <light|dark|none>` (what React Native's `Appearance`
reports), `scheme <light|dark>`, `ground <hex>` (that scheme's ground) and
`face ui-rounded`. A release build renders nothing on it.

Heartseed takes no screenshot (`SKILL.md`), so the simulator cannot show
the colours themselves: what the reader sees in each scheme, the status
bar's legibility and SF Rounded's look and wrapping are the owner's on his
phone, and the screens' paints are the unit tests'
(`apps/heartseed/src/look/`, the frame oracle in
`apps/heartseed/src/test/look.ts`; `apps/heartseed/README.md`, Look).

## Sub-features

- `appearance-system`: with the simulator's appearance light, the probe
  shows `system light`, `scheme light`, `ground #f1f0e6` and
  `face ui-rounded`; with the probe shown, the appearance set to dark
  shows `system dark`, `scheme dark` and `ground #142420` with no tap.

## How to get to it (user POV)

- A reader changes the phone's appearance in Settings (or Control Centre);
  the app follows it. The probe is a developer's link, not a reader's.

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

4. Put the appearance back: `xcrun simctl ui <udid> appearance light`.
   Then `sim doctor` (record `head` and `timingsHold`) and `sim down`.

Report the probe's lines only; delete the `snapshots` folder.

## Gotchas

- **A link that launches the app lands on Today** (`dictation.md`,
  Gotchas): open `/` first, then the probe.
- `xcrun simctl ui <udid> appearance` changes the whole simulator's
  appearance, which outlives the drive: always put it back to light.
