# App icon

The app is named `Hymnal` on the home screen, under one blade of wheat, in
the brand's Moonlit wheat (`@manna/brand`): the night's blade (`#12354e`) on
the wheat (`#ffefae`) in light mode, the wheat's blade on the night in dark
mode, and a white wheat the system tints in the tinted style. On Android the
wheat is the adaptive icon's foreground in the night, on a wheat ground,
with a white monochrome layer for themed icons. On the web the tab shows the
wheat (the wheat's blade on the night when the system is dark), and the page
names a touch icon and a web manifest. The launch screen shows the same
wheat centred on the app's own ground: the night's blade on the paper
(`#fff9e0`) in light mode, the wheat's on the night in dark mode.

## Sub-features

- `icon-light`: the light icon, the night's blade on the wheat.
- `icon-dark`: the dark icon, the wheat's blade on the night.
- `icon-tinted`: the tinted icon, the wheat in the system's tint.
- `icon-name`: the name under the icon reads `Hymnal`.
- `icon-web`: the favicons, touch icon and manifest the page links, each served.
- `splash-light`: a cold launch in light mode shows the night's blade on the paper.
- `splash-dark`: a cold launch in dark mode shows the wheat's blade on the night.

## How to get to it (user POV)

- The iOS home screen, in light, dark and tinted icon styles.
- The Android launcher (the adaptive icon, and themed icons for monochrome).
- The browser tab's icon, and "Add to Home Screen" on the web.
- The launch screen, on every cold launch.

## Driving it with sim

- **Preconditions:** a fresh install: `xcrun simctl uninstall <udid> im.cvr.hymnal` before `sim install --prebuild`, since the home screen keeps the icon it saw first. `<udid>` is `detail.udid` of `sim boot`'s line.
- **States:** default (light), dark, tinted and loading (the launch screen). Focus-visible, open, empty and error are n/a.
- **Regression:** `apps/hymnal/scripts/icon.test.ts`.

1. **Install.** `sim boot --platform ios --port $PORT --out "$EVIDENCE"`, `xcrun simctl uninstall <udid> im.cvr.hymnal`, `sim install --prebuild`. → `ok`.
2. **Light and name (`icon-light`, `icon-name`).** `xcrun simctl ui <udid> appearance light`, `xcrun simctl terminate <udid> im.cvr.hymnal`, then `xcrun simctl io <udid> screenshot "$EVIDENCE/shots/home-light.png"`. → the home screen shows the night's blade on the wheat, named `Hymnal`. If the icon is not on the first page, swipe to its page (`agent-device gesture pan 350 450 -300 0 250 --session verify-hymnal`).
3. **Dark (`icon-dark`).** Bind SpringBoard: `agent-device open com.apple.springboard --platform ios --session verify-hymnal`. Long-press an empty spot (`agent-device longpress 200 600 --session verify-hymnal`), `agent-device press 'label="Edit"' --settle --session verify-hymnal`, `agent-device press 'label="Customize"' --settle --session verify-hymnal`, then press `Dark` and its `Auto`, tap `dismiss popup` and press `Done`. `xcrun simctl ui <udid> appearance dark`, then the shot to `home-dark.png`. → the wheat's blade on the night.
4. **Tinted (`icon-tinted`).** The same path to Customize, then press `Tinted`, and the shot to `home-tinted.png`. → the white wheat in the tint on a glassy ground. Put the style back to `Default` (on iOS 27 the sheet's buttons can drop out of the snapshot: press `Default` at its point from a screenshot), then `Done`.
5. **The asset catalog.** `xcrun --sdk iphonesimulator assetutil --info <Hymnal.app>/Assets.car > "$EVIDENCE/assetutil.json"`, with `<Hymnal.app>` the `paths.app` of `sim install`'s line. → `AppIcon` has three 1024 px renditions: `icon-1024.png`, `icon-1024-dark.png` (`UIAppearanceDark`) and `icon-1024-tinted.png` (`ISAppearanceTintable`); `Splash` has `splash*.png` and `splash-dark*.png` (`UIAppearanceDark`).
6. **Launch screen (`splash-light`, `splash-dark`).** `xcrun simctl shutdown <udid>`, `xcrun simctl boot <udid>` (Gotchas). For each appearance: `xcrun simctl ui <udid> appearance light`, `xcrun simctl terminate <udid> im.cvr.hymnal`, then `xcrun simctl launch <udid> im.cvr.hymnal` and, at once, `xcrun simctl io <udid> screenshot` a few times in a row to `splash-light.png`. → the first frames show the night's blade centred on the paper; with `appearance dark`, the wheat's blade on the night. The hymn list follows.
7. **Web (`icon-web`).** `sim boot --platform web --port $PORT --out "$EVIDENCE"`. `curl -s -o /dev/null -w "%{http_code}" http://localhost:$PORT/<file>` for `manifest.webmanifest`, `favicon.svg`, `favicon-32.png` and `apple-touch-icon.png`. → `200` each. `agent-browser --session verify-hymnal eval "JSON.stringify([...document.head.querySelectorAll('link[rel=icon],link[rel=apple-touch-icon],link[rel=manifest]')].map(l => l.rel + ' ' + l.getAttribute('href')))"` → `icon /favicon-32.png`, `icon /favicon.svg`, `apple-touch-icon /apple-touch-icon.png`, `manifest /manifest.webmanifest`.

## Gotchas

- The home screen caches an app's icon by bundle id: a rebuild over an installed app can keep the old icon. Uninstall first.
- The icons in the build come from `apps/hymnal/assets/icon/`, copied in by `prebuild:native`: after `bun run --cwd apps/hymnal icon`, pass `--prebuild` again.
- The dark and tinted icons follow the home screen's icon style (Edit → Customize), not the system appearance. With the style `Default`, `appearance dark` leaves the light icon on the home screen, and every other app's icon stays light too. Choose `Dark` (with `Auto`) or `Tinted` there, and put back `Default` at the end.
- SpringBoard keeps the launch screen it drew first in memory, past an uninstall and a reinstall and past removing the SplashBoard folder in the app's data container's Library: a new launch screen shows only after the simulator restarts (`xcrun simctl shutdown`, then `boot`). Until then a cold launch shows the old one.
- The launch screen lasts well under a second on a warm dev server: shoot as the launch starts, in a burst, never after a sleep.
- A headless browser shows no tab strip, so the web proof is the served files and the head's links, not a shot of the tab.
