# App icon

The app is named `Heartseed` on the home screen, under one mark: brand C,
"Two leaves", a seedling whose two first leaves open into a heart
(`apps/heartseed/assets/icon/heartseed.svg`), in the colours of
`apps/heartseed/src/theme.ts`. In light mode the garden ink (`#2c4542`) on
a pale sage (`#dfe8cf`); in dark mode a pale sage (`#dfe8cf`) on the night
garden (`#142420`); in the tinted style a white mark the system tints. On
Android the mark is the adaptive icon's foreground in the ink, on the pale
sage, with a white monochrome layer for themed icons. The launch screen
shows the same mark, 224 pt wide, centred on the app's own ground: the ink
on `#f1f0e6` in light mode, the pale ink `#e6eedb` on `#142420` in dark
mode. The appearance follows the system: the build names no
`UIUserInterfaceStyle`.

Heartseed takes no screenshot (`SKILL.md`), so the rows read the build's
asset catalog and Info.plist; the pixels of every file are
`apps/heartseed/scripts/icon.test.ts`'s, and the icon on the home screen
and the launch screen's frames are the owner's look on his phone.

## Sub-features

- `icon-light`: the light icon, the ink's mark on the pale sage.
- `icon-dark`: the dark icon, the pale sage's mark on the night garden.
- `icon-tinted`: the tinted icon, a white mark on black for the system's tint.
- `icon-name`: the name under the icon reads `Heartseed`.
- `splash-light`: the launch screen in light mode, the ink's mark on `#f1f0e6`.
- `splash-dark`: the launch screen in dark mode, the pale ink's mark on `#142420`.

## How to get to it (user POV)

- The iOS home screen, in light, dark and tinted icon styles.
- The Android launcher (the adaptive icon, and themed icons for monochrome).
- The launch screen, on every cold launch.

## Driving it with sim

- **Preconditions:** Launch 1-3 of `SKILL.md`, then a fresh install:
  `xcrun simctl uninstall <udid> app.heartseed` before
  `sim install --prebuild`, since the home screen keeps the icon it saw
  first and `--prebuild` copies the new files into the build. `<udid>` is
  `detail.udid` of `sim boot`'s line. An uninstall deletes the reader's
  garden on that simulator: when its rows must be kept, read the rows from
  a build that is not installed (the Gotchas).
- **States:** default (light), dark, tinted and loading (the launch
  screen). Focus-visible, open, empty and error are n/a.
- **Regression:** `apps/heartseed/scripts/icon.test.ts` (part `test:icon`)
  and `apps/heartseed/src/theme.test.ts` (part `test:theme`).

1. **Install.** `xcrun simctl uninstall <udid> app.heartseed`, then
   `sim install --prebuild`. → `ok`, `paths.app` names `<Heartseed.app>`.
2. **The asset catalog (`icon-light`, `icon-dark`, `icon-tinted`,
   `splash-light`, `splash-dark`).**
   `xcrun --sdk iphonesimulator assetutil --info <Heartseed.app>/Assets.car > "$EVIDENCE/assetutil.json"`.
   → `AppIcon` has three 1024 px renditions: `icon-1024.png` with no
   appearance, `icon-1024-dark.png` with `UIAppearanceDark` and
   `icon-1024-tinted.png` with `ISAppearanceTintable`; `Splash` has
   `splash*.png` with no appearance and `splash-dark*.png` with
   `UIAppearanceDark`.
3. **The launch screen's ground (`splash-light`, `splash-dark`).** In the
   same JSON, `SplashBackground` has two colour renditions, one with no
   appearance and one with `UIAppearanceDark`; or read that colour set's
   `Contents.json` in the asset catalog prebuild writes into the app's
   git-ignored `ios` folder. → `#f1f0e6` (red 0.945, green 0.941, blue
   0.902) and `#142420` (red 0.078, green 0.141, blue 0.125). The launch
   storyboard prebuild writes beside it draws the image `Splash` 224 wide on
   the colour `SplashBackground`.
4. **The name and the appearance (`icon-name`).**
   `plutil -p <Heartseed.app>/Info.plist`. → `CFBundleDisplayName`
   `Heartseed`, `UILaunchStoryboardName` `LaunchScreen`, and no
   `UIUserInterfaceStyle` (or `Automatic`), never `Light` or `Dark`.

Red on a build before the brand: its `Assets.car` holds no dark or tinted
`AppIcon` rendition and no `Splash` image set.

## Gotchas

- The home screen caches an app's icon by bundle id: a rebuild over an
  installed app can keep the old icon. Uninstall first, when the garden on
  the simulator may go.
- The icons in the build come from `apps/heartseed/assets/icon/`, copied in
  by `prebuild:native`: after `bun run --cwd apps/heartseed icon`, pass
  `--prebuild` again.
- To read the rows without touching the installed app (its garden kept):
  after `bun run --cwd apps/heartseed prebuild:native`, compile the asset
  catalog prebuild wrote (`Images.xcassets`, in the app's `ios` folder)
  alone into a scratch folder with `xcrun actool … --compile <scratch>
  --platform iphonesimulator --minimum-deployment-target 18.0 --app-icon
  AppIcon`, then run step 2 and 3's `assetutil` on `<scratch>/Assets.car`,
  and step 4's `plutil` on the `Info.plist` prebuild wrote beside it (the
  build copies it, its `$(…)` values filled in).
- SpringBoard keeps the launch screen it drew first in memory, past an
  uninstall and a reinstall: a new launch screen shows only after the
  simulator restarts. The rows above read files, so they need no restart.
