# The screening site

`films.cvr.im`: a small public, read-only site where the owner sends the milestones of a film to those he shares them with. It holds only what he publishes, never every render: for each film a `board` (the Board with its voice, and the kept panels below it), a `render` (a full render) and a `final` (the finished film), one of each.

- `/` lists every film with a published version, the most recently published first: its title, its newest version's poster and date.
- `/<film>/` lists the film's versions, newest first.
- `/<film>/<version>/` plays the version on a phone (`<video controls playsinline preload="metadata">`), and for the Board shows the kept panels in the film's order, each with its beat.

Nothing on a page is interactive but the video: no notes, buttons, logins or comments. The pages are dark, read on a phone first, and ask not to be indexed (`X-Robots-Tag: noindex` on every answer, and `/robots.txt` disallows every path); a link works for anyone who has it.

## How it is built

Two Cloudflare Workers over one private R2 bucket, declared in `alchemy.run.ts`:

- the site (`src/worker/Site.ts`) answers every request with `src/respond.ts`: it reads one object at a time by key and never lists the bucket, answers a `Range` with 206 so a phone can seek, keeps a version's files a year (each is named by its bytes) and has the browser ask for a page again each time. Any other path is 404.
- the desk (`src/worker/Desk.ts`, its `workers.dev` host alone) is the publisher's way in (`src/desk.ts`): it reads, writes, lists and deletes objects, and answers only to the stack's secret. A file over 32 MiB goes up in parts, since a Worker takes a body of 100 MB at most.

The pages are Solid 2 components (`src/pages.tsx`) drawn to whole HTML files when a version is published, from the films' manifests (`src/manifest.ts`, one `<film>/manifest.json` each); nothing hydrates. Publishing (`src/publish.ts` plans it, `src/desk-client.ts` `publishTo` writes it) uploads each file the bucket lacks under `<film>/<version>/<sha256>.<ext>`, writes the version's page, the film's folder, its manifest and the index, then deletes the replaced version's files.

## Publish

From `apps/animations`, after a milestone:

```bash
bun run screening publish <film> board            # renders the Board (film render --board --share), its poster and panels
bun run screening publish <film> render           # the latest full render's share copy
bun run screening publish <film> final [--from <video>]
bun run screening publish <film> board --dry-run  # gathers it and prints what it would upload
bun run screening list                            # every film's versions and their links
```

It prints the version's link, `https://films.cvr.im/<film>/<version>/`. Publishing a version again replaces it, with the new date.

The publisher reads the site's URL, the desk's URL and the desk's secret from the animations app's .env file (`SCREENING_URL`, `SCREENING_DESK_URL`, `SCREENING_DESK_TOKEN`), written there from the stack's state by `bun run keys` here (`--stage <stage>`, prod by default).

## Deploy

```bash
bun run plan          # what a prod deploy would change
bun run deploy        # prod: films.cvr.im (the owner's call, from the main checkout, whose .alchemy/ holds prod's state)
bun run keys          # prod's URLs and secret into the animations app's .env
```

A throwaway stage for a test: `bunx alchemy deploy alchemy.run.ts --stage agent-<name> --yes`, `bun run keys --stage agent-<name>`, publish to it, then `bunx alchemy destroy alchemy.run.ts --stage agent-<name> --yes` (its bucket goes with it; prod's is retained).

## Tests

`bun run test` runs the site end to end in one process (`src/site.test.ts`): a publish through the desk's policy over a bucket in memory, then a reader's requests to the site's policy over the same bucket.
