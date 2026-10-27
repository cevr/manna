# Web client

The actual One web client mounts the home list and hymn reader and responds
to their controls. Server-rendered rows and stanzas can appear while the
client fails before mounting. This journey also covers D3.

## Sub-features

- `web-client-cold`: a clean checkout with freshly installed dependencies mounts both routes.
- `web-client-cache-migration`: an existing failing optimizer cache becomes usable after updating to the fixed commit at the same checkout path.
- `web-client-warm`: a restart with retained optimizer output mounts both routes again.
- `web-client-production`: the built and served production client hydrates both routes and opens Reading.

## How to get to it (user POV)

Open `/`, press its first hymn row, open the player sheet, then visit
`/hymns/100` directly. Open player needs no Play action.

## Driving it with sim

- **Preconditions:** the baseline host guard passes; record the exact commit,
  clean tracked status, Bun and browser versions, load, swap and free disk.
  Use free ports in 8270–8279, never the owner's 8191/8095. Confirm no other
  drive owns browser session `verify-hymnal` before using the helper. Give
  each drive a fresh `--state "$STATE"` and evidence directory.
- **States:** default and open in cold, existing-cache, warm and production
  drives; focus-visible, loading, empty and error UI states are n/a.
- **Regression:** this real-client journey guards the dependency boundary;
  isolated component tests and HTTP success cannot prove client mounting.
- **Privacy:** retain JSON technical counts, booleans, route/module paths
  and exit codes only. This recipe replaces the baseline video, snapshot,
  screenshot and console-dump steps. Never retain page words or raw HTML.
  Every `agent-browser` session uses
  `--args "--mute-audio,--disable-audio-output"`. Never press Play.

1. **Cold checkout.** Create a new clean checkout of the committed head,
   without copied `node_modules`, `.vite`, `.vxrn` or build output. Run
   `bun install --frozen-lockfile` once. From its root run
   `sim boot --platform web --port "$PORT" --out "$EVIDENCE" --state "$STATE"`,
   then `sim doctor --state "$STATE"`. Both must answer `ok`.
2. **Mounted list (`list-rows`).** In the helper's muted `verify-hymnal`
   browser, wait for React props on a list anchor or input, or an overlay.
   With `agent-browser ... eval`, return only these observations:
   `document.querySelectorAll('a[href^="/hymns/"]').length > 0`,
   no `document.querySelector('one-route-error-overlay')`, and at least one
   input/anchor with an own key starting `__reactProps$`. All must hold.
   Count resource entries whose name contains both `react-native-web` and
   `/dist/cjs/` via `performance.getEntriesByType('resource')`: expect 0.
3. **Row click (`list-open`).** Click `a[href="/hymns/1"]` with the browser.
   Wait for `[aria-label="Stanza 1"]`. Expect pathname `/hymns/1`, hydrated
   reader controls, stanza and line nodes, and no overlay.
4. **Client action (`player-full`).** Run
   `sim tap "label=Open player" --state "$STATE"`. Wait for
   `[aria-label="Reading"]` before testing its presence. It must appear.
   This user click proves a live React handler; no Play is needed.
5. **Deep reader (D3, `reader-words`).** Run
   `sim open hymns/100 --expect "label=Stanza 1" --state "$STATE"`.
   It must answer `ok`. Wait for React props on
   `[data-testid="hymn-scroll"]`, or an overlay. Expect pathname
   `/hymns/100`, a stanza, scroll control and exactly 24
   `[data-testid="line"]` nodes on the current corpus. Count nodes only.
   Require hydration, no overlay and zero raw RNW CJS resource requests.
   If the corpus changes, establish its expected line count independently.
6. **Cold cleanup.** `sim down --state "$STATE"`. Confirm the browser
   session is closed and `lsof -nP -iTCP:$PORT -sTCP:LISTEN` finds no
   listener. Record `web-client-cold` separately.
7. **Cache migration.** In a separate clean checkout of the unfixed base,
   install frozen dependencies and run steps 1–6 to establish RED. Keep
   that checkout's pathname and optimizer output. Check out the fixed head
   there; install again only if the lockfile changed. Repeat steps 1–6
   with fresh state/evidence. Expect GREEN without cache deletion,
   `--force`, an extra config or a user cache workaround. Record both
   commits and results as `web-client-cache-migration`.
8. **Warm restart.** Repeat steps 1–6 in the cold head checkout, keeping its
   optimizer output and using fresh browser state/evidence. Expect GREEN
   with the stock config. Record `web-client-warm` separately.
9. **Production.** Under the host guard, run
   `bun run --cwd apps/hymnal build --platform web` on the clean head.
   Serve the output locally from `apps/hymnal` with
   `bun run one serve --host 127.0.0.1 --port "$PORT"`.
   Use a distinct muted `webdev-production` browser session. Open `/` and
   `/hymns/100`; apply the hydration, overlay, resource and control checks
   above to both. Click Open player and wait for Reading. Record
   `web-client-production`. Close that browser and stop only the server
   this drive started. Prove its port vacant.

## Gotchas

- A successful `--expect` can match server HTML on a broken client.
- Wait for the sheet before testing Reading; the transition is asynchronous.
- Record technical error-signature booleans on failure, never overlay text.
- Changing Vite's optimizer extensions alone can leave an old cache valid.
  A fresh-cache pass does not replace the same-path migration check.
- Native Settings/deep-link navigation is a separate journey.
