# App icon

The app is named `Hymnal` on the home screen, under one blade of wheat, in
Heartseed's colours (`apps/heartseed/src/theme.ts`), so the two apps read as
one family: Heartseed's gold blade (`#d4a640`) on its garden ink (`#2c4542`)
in light mode, the gold blade on its night ground (`#142420`) in dark mode,
and a white blade the system tints in the tinted style. On Android the blade
is the adaptive icon's foreground in the gold, on the garden ink, with a
white monochrome layer for themed icons. On the web the tab shows the light
icon (the dark one when the system is dark), and the page names a touch icon
and a web manifest. The launch screen shows the same blade, 200 points wide,
centred on Heartseed's page grounds: the ink (`#2c4542`) on `#f1f0e6` in
light mode, the gold (`#d4a640`) on `#142420` in dark mode. The hymn list
that follows keeps the hymnal's own grounds (`#f7f9fb`, `#0a1f2d`).

This feature takes no screenshot, recording or pixel capture on the
simulator (the owner's rule), so the rows read the build's asset catalog and
Info.plist; the pixels of every file are `apps/hymnal/scripts/icon.test.ts`'s,
and the icon on the home screen and the launch screen's frames are the
owner's look on his phone.

## Sub-features

- `icon-light`: the light icon, the gold blade on the garden ink.
- `icon-dark`: the dark icon, the gold blade on the night ground.
- `icon-tinted`: the tinted icon, a white blade on black for the system's tint.
- `icon-name`: the name under the icon reads `Hymnal`.
- `icon-web`: the favicons, touch icon and manifest the page links, each served.
- `splash-light`: the launch screen in light mode, the ink's blade on `#f1f0e6`.
- `splash-dark`: the launch screen in dark mode, the gold blade on `#142420`.

## How to get to it (user POV)

- The iOS home screen, in light, dark and tinted icon styles.
- The Android launcher (the adaptive icon, and themed icons for monochrome).
- The browser tab's icon, and "Add to Home Screen" on the web.
- The launch screen, on every cold launch.

## Driving it with sim

- **Preconditions:** Launch of `SKILL.md`, then a fresh install:
  `xcrun simctl uninstall <udid> im.cvr.hymnal` before
  `sim install --prebuild`, since the home screen keeps the icon it saw
  first and `--prebuild` copies the new files into the build. `<udid>` is
  `detail.udid` of `sim boot`'s line.
- **States:** default (light), dark, tinted and loading (the launch
  screen). Focus-visible, open, empty and error are n/a.
- **Regression:** `apps/hymnal/scripts/icon.test.ts` (part `test:infra`).

1. **Install.** `sim boot --platform ios --port $PORT --out "$EVIDENCE"`,
   `xcrun simctl uninstall <udid> im.cvr.hymnal`, `sim install --prebuild`.
   → `ok`. Then `APP=$(xcrun simctl get_app_container <udid> im.cvr.hymnal app)`.
2. **The asset catalog (`icon-light`, `icon-dark`, `icon-tinted`,
   `splash-light`, `splash-dark`).**
   `xcrun --sdk iphonesimulator assetutil --info "$APP/Assets.car" > "$EVIDENCE/assetutil.json"`.
   → `AppIcon` has three 1024 px renditions: `icon-1024.png` with no
   appearance, `icon-1024-dark.png` with `UIAppearanceDark` and
   `icon-1024-tinted.png` with `ISAppearanceTintable`; `Splash` has
   `splash*.png` with no appearance and `splash-dark*.png` with
   `UIAppearanceDark`.
3. **The launch screen's ground (`splash-light`, `splash-dark`).** In the
   same JSON, `SplashBackground` has two colour renditions, one with no
   appearance and one with `UIAppearanceDark`. Each component × 255,
   rounded, gives the hex; write both to `"$EVIDENCE/splash-colours.txt"`.
   → `#f1f0e6` (red 0.945, green 0.941, blue 0.902) and `#142420` (red
   0.078, green 0.141, blue 0.125). The launch storyboard prebuild writes,
   `apps/hymnal/ios/Hymnal/LaunchScreen.storyboard`, draws `image="Splash"`
   on the colour `name="SplashBackground"`. Red on a build before
   Heartseed's colours: `#f7f9fb` and `#0a1f2d` (or an older prebuild's
   `#12354e`).
4. **The name (`icon-name`).** `plutil -p "$APP/Info.plist"`. →
   `CFBundleDisplayName` `Hymnal` and `UILaunchStoryboardName`
   `LaunchScreen`.
5. **Web (`icon-web`).** `sim boot --platform web --port $PORT --out "$EVIDENCE"`.
   `curl -s -o /dev/null -w "%{http_code}" http://localhost:$PORT/<file>`
   for `manifest.webmanifest`, `favicon.svg`, `favicon-32.png` and
   `apple-touch-icon.png`. → `200` each.
   `agent-browser --session verify-hymnal eval "JSON.stringify([...document.head.querySelectorAll('link[rel=icon],link[rel=apple-touch-icon],link[rel=manifest]')].map(l => l.rel + ' ' + l.getAttribute('href')))"`
   → `icon /favicon-32.png`, `icon /favicon.svg`,
   `apple-touch-icon /apple-touch-icon.png`, `manifest /manifest.webmanifest`.
   `curl -s http://localhost:$PORT/favicon.svg` → `#2c4542` and `#d4a640`,
   and `#142420` under `prefers-color-scheme: dark`.

## Gotchas

- The home screen caches an app's icon by bundle id: a rebuild over an
  installed app can keep the old icon. Uninstall first.
- The icons in the build come from `apps/hymnal/assets/icon/`, copied in by
  `prebuild:native`: after `bun run --cwd apps/hymnal icon`, pass
  `--prebuild` again. A worktree's git-ignored `ios` folder can predate the
  current colours, so read the rows from a `--prebuild` install.
- SpringBoard keeps the launch screen it drew first in memory, past an
  uninstall and a reinstall: a new launch screen shows on a cold launch only
  after the simulator restarts. The rows above read the bundle's files, so
  the cache cannot hide a new launch screen from them.
- The dark and tinted icons on a home screen follow its icon style (Edit →
  Customize), not the system appearance; that look is the owner's, on his
  phone.
- A headless browser shows no tab strip, so the web proof is the served
  files and the head's links.
