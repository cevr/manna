# EGW Search

A Solid 2 page over an Effect `HttpApi` server. Build and run the app with:

```sh
bun run --cwd apps/egw-search build
bun run --cwd apps/egw-search start
```

`build` is a Vite build into `dist/`; the server (`server/main.ts`) serves it
beside `/api/search`, `/api/search/batch` and `/health`. For development,
`bun run --cwd apps/egw-search dev` runs Vite on port 5273 with `/api`
proxied to the server on port 3101.

## Deploy

Production is a Cloudflare Worker (`server/cloudflare/Search.ts`) declared in
`alchemy.run.ts`. It answers the same `SearchApi` as `server/main.ts`, with the
corpus in D1, the vectors in Vectorize and the query embedder on Workers AI
(the table in `Search.ts` maps each one). `.github/workflows/deploy-egw-search.yml`
deploys `prod` from `main` and a `pr-<n>` preview per pull request. For local
work, deploy a throwaway stage and check it:

```sh
bun run --cwd apps/egw-search test:deploy
```

Every stage reads one shared corpus and index (`server/cloudflare/resources.ts`),
adopted and retained, so a teardown removes only its Worker. They were loaded
once from `egw-paragraphs.db` and `vectors.bvi`. Every Sunday at 09:00 UTC the
`egw-corpus-sync` Workflow (`server/cloudflare/Sync.ts`) installs the books the
library has added into D1 and their vectors into Vectorize. Only `prod` writes;
any other stage's Workflow plans and stops. The library's credentials,
`EGW_CLIENT_ID` and `EGW_CLIENT_SECRET`, are secrets of the account's
Cloudflare Secrets Store, which the sync Worker binds by name
(`server/cloudflare/store-secret.ts`) and reads inside its steps, so a deploy
(a machine's or CI's) needs only the Cloudflare login. The owner manages them
with the cf CLI, in a terminal, where `read -rs` takes the value at a hidden
prompt, so it lands in neither the shell history nor the repository. The
store's ID comes from `cf secrets-store stores list`. To create
`EGW_CLIENT_ID` (and `EGW_CLIENT_SECRET` alike):

```sh
read -rs 'v?EGW_CLIENT_ID: ' && cf secrets-store secrets create <store id> --body "$(jq -nc --arg v "$v" '[{name:"EGW_CLIENT_ID",value:$v,scopes:["workers"]}]')"; unset v
```

To change one, find its ID with
`cf secrets-store secrets list --store-id <store id>`, then:

```sh
read -rs 'v?EGW_CLIENT_ID: ' && cf secrets-store secrets edit <secret id> --store-id <store id> --scopes workers --value "$v"; unset v
```

To add vectors for books already installed, start an instance with
`{"mode":"sync","reembed":[<book id>, ...]}`.

The URL is the search state. `src/url-state.ts` declares the workspace as a
`@manna/url-state` place — each pane's keys, their defaults, and which changes
push a history entry (a new query, a pane added or closed) or replace it (a
filter, the limit) — and the page reads and writes it through the place atom.
`src/scroll.ts` keeps each history entry's scroll position. Links keep the
spelling they have always had (`?q=latter+rain&q2=loud+cry&section2=bible`);
`src/url-state.test.ts` holds a corpus of them.

Run the owned browser regression fixture with:

```sh
bun run --cwd apps/egw-search test:browser
```

The command builds the page, starts a fixture server on port `3187` (set
`EGW_BROWSER_PORT` to use another) that serves the build and the app's own
`SearchApi` with deterministic answers, and runs Playwright against it. A
unit runs it by hand when it changes the page; neither the gate nor CI runs
it. It does not read the private EGW corpus or use credentials. Playwright owns the
fixture process and closes it after the run. Install the browser once with:

```sh
bunx playwright install chromium
```

The suite checks the batched search transport, the workspace in the URL and
its history, row identity across panes, a pane's unsent draft, debounced
filter changes, typed failures and recovery, request cancellation when a pane
closes, the viewport on filter changes and new panes, the scroll position on
Back, the row labels and context disclosure, and the not-found page. It does
not prove production corpus retrieval or browser behavior in the deployed
service. Failures retain Playwright traces under this app's `test-results/`
(git-ignored, written by the run).
