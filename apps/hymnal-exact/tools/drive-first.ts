/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noAs, effect/noAsyncFunction, effect/noNullish, effect/noTryCatch, effect/noTernary, effect/noKnownValueWidening, effect/noChainedTypeAssertions, effect/noUnknownParameters, eslint/no-await-in-loop -- a host script that serves the built site, drives it in Playwright, prints any check's detail as JSON, reads the page's nodes by their test ids where the DOM answers null for a node not there, keeps its mark on the page's global, and stops its browser and server however the drive ends. */

/**
 * A hymn page's first drawing in the built site (`dist/`, `bun run
 * build:web`), on the web: `bun tools/drive-first.ts web`.
 *
 * Opened at `/hymns/100` with its neighbours' chords files (99 and 101)
 * held back by the network for `HELD_MS`, hymn 100's words are drawn with
 * its chords well before those files land: the route's hymn is drawn from
 * its own answers, never waiting for the pager to place its pages or for
 * a neighbour's chords (`features/hymn.contract`, `hymnDrawn`). Once the
 * files land the pager draws 99 and 101 beside it, hymn 100 still drawn
 * and in the port.
 *
 * Exits 1 on any failed check.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { launchBrowser } from '@manna/exact-kit/browser';
import { claimAppPort } from '@manna/exact-kit/port';

const app = join(import.meta.dir, '..');
const host = process.argv[2] ?? 'web';
if (host !== 'web') {
  console.error(`drive-first: web only, not ${host}`);
  process.exit(2);
}
if (!existsSync(join(app, 'dist/hymns/100/index.html'))) {
  console.error('drive-first: no built site in dist/: bun run build:web first');
  process.exit(2);
}

/** How long the network holds the neighbours' chords files. */
const HELD_MS = 4000;
/** How long after the load the route's hymn may take to draw its words with chords. */
const DRAWN_MS = 2000;

let failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (!ok) failed += 1;
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${name}${ok || detail === undefined ? '' : `: ${JSON.stringify(detail)}`}`,
  );
};

const port = (await claimAppPort(app, { label: 'drive-first' })).port;
const origin = `http://127.0.0.1:${port}`;
const server = Bun.spawn(
  ['bun', join(import.meta.dir, 'web/serve.ts'), 'dist', '--port', `${port}`],
  {
    cwd: app,
    stdout: 'ignore',
    stderr: 'inherit',
  },
);
const browser = await launchBrowser(join(app, '.exact/drive-first-profile'), true);
try {
  for (let tries = 0; tries < 100; tries++) {
    if (
      await fetch(`${origin}/robots.txt`).then(
        (r) => r.ok,
        () => false,
      )
    )
      break;
    await Bun.sleep(100);
  }
  const page = browser.page.page;
  const held: Array<string> = [];
  await page.route(/\/modules\/chords\/(99|101)\.js/u, async (route) => {
    held.push(route.request().url().replace(origin, ''));
    await Bun.sleep(HELD_MS);
    await route.continue();
  });
  await page.addInitScript(() => {
    const seen: { pages?: Array<string> } = {};
    (globalThis as unknown as { __first: typeof seen }).__first = seen;
    new MutationObserver(() => {
      if (
        seen.pages === undefined &&
        document.querySelector('[data-testid="hymn-page"] [data-testid="stanza-1"]') !== null
      )
        seen.pages = [
          ...(document.querySelector('[data-testid="hymn-pager"]')?.children ?? []),
        ].map((e) => e.id);
    }).observe(document, { childList: true, subtree: true });
  });
  const opened = Date.now();
  await page.goto(`${origin}/hymns/100`, { waitUntil: 'domcontentloaded' });
  const words = await page
    .waitForSelector('[data-testid="hymn-page"] [data-testid="stanza-1"]', { timeout: DRAWN_MS })
    .then(
      () => Date.now() - opened,
      () => -1,
    );
  const firstDrawn = await page.evaluate(() => ({
    chords: document.querySelectorAll('[data-testid="hymn-page"] [data-testid^="chord-"]').length,
    neighbours: ['99', '101'].filter(
      (n) =>
        document.querySelector(`[data-testid="hymn-page-${n}"] [data-testid="stanza-1-${n}"]`) !==
        null,
    ),
    number: document.querySelector('[data-testid="hymn-number"]')?.textContent ?? '',
    titled: (document.querySelector('[data-testid="hymn-title"]')?.textContent ?? '') !== '',
    pagesAtWords: (globalThis as unknown as { __first: { pages?: Array<string> } }).__first.pages,
  }));
  check(
    "hymn 100's words are first drawn on its page alone, before the pager places 99 and 101 beside it",
    JSON.stringify(firstDrawn.pagesAtWords) === JSON.stringify(['hymn-page-100']),
    firstDrawn.pagesAtWords,
  );
  check(
    `hymn 100's words are drawn within ${DRAWN_MS} ms while its neighbours' chords files are held ${HELD_MS} ms (${words} ms)`,
    words >= 0,
    { words, held },
  );
  check(
    "they are drawn with hymn 100's number and title",
    firstDrawn.number === '100' && firstDrawn.titled,
    firstDrawn,
  );
  check(
    'no neighbour is drawn before its chords file lands',
    firstDrawn.neighbours.length === 0,
    firstDrawn,
  );
  const placed = await page
    .waitForFunction(
      () =>
        ['99', '101'].every(
          (n) =>
            document.querySelector(
              `[data-testid="hymn-page-${n}"] [data-testid="stanza-1-${n}"]`,
            ) !== null,
        ),
      undefined,
      { timeout: HELD_MS + 4000 },
    )
    .then(
      () => true,
      () => false,
    );
  const after = await page.evaluate(() => {
    const pager = document.querySelector('[data-testid="hymn-pager"]')?.getBoundingClientRect();
    const shown = document.querySelector('[data-testid="hymn-page"]')?.getBoundingClientRect();
    return {
      inPort: pager !== undefined && shown !== undefined && Math.abs(shown.x - pager.x) < 1,
      words: document.querySelector('[data-testid="hymn-page"] [data-testid="stanza-1"]') !== null,
    };
  });
  check(
    'once the files land the pager draws 99 and 101 beside hymn 100, which stays drawn and in the port',
    placed && after.inPort && after.words,
    { placed, ...after },
  );
} finally {
  await browser.close();
  server.kill();
}
console.log(`${failed === 0 ? 'ok' : 'FAILED'}: drive-first, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
