# EGW Search

A Solid 2 page over an Effect `HttpApi` server. Build and run the app with:

```sh
bun run --cwd apps/egw-search build
bun run --cwd apps/egw-search start
```

`build` is a Vite build into `dist/`; the server (`server/main.ts`) serves it
beside `/api/search`, `/api/search/batch`, `/api/commentary/pack` and `/health`.

`/api/commentary/pack` is Ellen White's Bible Commentary as one JSON pack that
Heartseed downloads and keeps: each paragraph of 1BC-7BC linked to a Bible
verse, once, and each verse's notes (`server/commentary.ts` is the rule). It is
built from the corpus the server holds, so it follows the weekly sync. The
links are read from the paragraphs themselves when the pack is built, by
core's one reading (`packages/core/src/egw/commentary-links.ts`), not from the
stored `paragraph_bible_refs` rows, so a deploy carries the current reading: a
citation names every verse its printed text names ("John 1:1-3, 14"), not only
its title's first verse, and each paragraph under a verse heading ("14")
comments on that verse. The stored rows `manna study` reads are made by the
same reading at install; `manna egw relink [code...]` makes them again from
the stored paragraphs when the reading changes. After
a deploy, once the edge's hour has passed, check the served pack against the
one the local corpus builds (one GET, references and counts only). D1 follows
the weekly sync and the local file does not, so the verse counts drift apart;
the check prints that drift and judges the code instead: it exits non-zero
when more than 1% of the notes both packs hold (by paragraph reference) link
other verses live, when either pack holds more than 5% of its notes alone, or
when John 1:14 has fewer than ten notes live:

```sh
bun run --cwd apps/egw-search commentary:check
```

`server/commentary-corpus.slow.test.ts` (in `test:slow`) builds the pack over
the local corpus, read-only, and skips, saying so, where there is none. The
pack's `ETag` is its version, made of its note count and an FNV-1a sum of the
whole pack (its notes and its verse map, `packSum`), so a changed note or link
gives a new version, and an `If-None-Match` naming the current one answers `304`. The Bun server keeps the built pack
in memory for an hour; the Worker keeps it in the edge cache for an hour, so D1
is read for it at most once an hour per edge (on a `workers.dev` stage the
Cache API keeps nothing, so every ask reads D1). For development,
`bun run --cwd apps/egw-search dev` runs Vite on port 5273 with `/api`
proxied to the server on port 3101.

`/api/study/:name` serves Heartseed's other packs, built from `bible.db`
rather than this corpus: `xrefs` (OpenBible.info's cross-references, CC BY),
`tags` and `lexicon` (Open Scriptures' Strong's numbers and dictionaries,
CC BY-SA) and `words` (the word index find reads). The Worker reads them from
the R2 bucket `heartseed-study-packs` (`StudyPackFiles`, adopted and retained;
the deploy creates it), the Bun server from `EGW_STUDY_DIR` or
`~/.bible/study`; each answers its version as its `ETag`, `304` for
`If-None-Match`, and `404` until it is published. `bible.db` lives on the
owner's Mac alone, so no deploy builds them: after a rebuild of `bible.db`, or
a change to their builder (`apps/heartseed-exact/tools/study.ts`), run

```sh
bun run --cwd apps/egw-search study:publish            # build, upload, and check each answers 304
bun run --cwd apps/egw-search study:publish --dry-run  # build and check only, no credentials
```

Heartseed's web build reads both packs from another origin, so those paths
alone answer any origin (`server/pack-cors.ts`, a global middleware of either
host's router): they expose the `ETag` and answer the preflight that
`If-None-Match` makes a browser send. Every other path carries no CORS
headers.

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
