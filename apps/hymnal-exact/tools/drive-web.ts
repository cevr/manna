/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noAsyncFunction, effect/noNewError, effect/noNewPromise, effect/noNullish, effect/noTernary, effect/noThrowStatement, effect/noUnknownParameters, effect/noAs, effect/noTryCatch, effect/noUnsafeDictionaryType, effect/noKnownValueWidening, effect/maxCognitiveComplexity, eslint/no-await-in-loop -- a host script that serves the built site and drives headless Chrome over the DevTools protocol, each in a process group of its own, awaits each page in turn, reads each method's JSON as it comes, and prints what it found in a report of named sections; it never runs in the data module. */

/**
 * The production web build as a visitor meets it (spec B), with no Exact
 * driver attached: `dist/` (`bun run build:web`, a release build) served as
 * plain files by the host's one rule (`tools/web/serve.ts`, or with
 * `--server exact` by Exact's own `serve` through the wrapper), and Chrome
 * driven over the DevTools protocol (`tools/web/chrome.ts`). Each check
 * prints one `PASS` or `FAIL` line; the drive exits 1 on any failure.
 *
 * - `rest`: a hymn page left before the rest's delay asks the bucket
 *   nothing, and one rested on asks only its printed key's recording, as
 *   the app saves the page the reader rests on;
 * - `addresses`: every hymn's address opened cold shows its number and
 *   title, and addresses the rule reads in its own ways (`007`, a trailing
 *   slash, an escape, a query) open the screen `placeOf` says;
 * - `notfound`: `/hymns/0`, `/hymns/696`, `/hymns/abc` and `/nothing` show
 *   the not-found screen (status 404 from the plain host), and its link
 *   home opens the list;
 * - `noscript`: with script off, `/` and `/hymns/100` are the shell, each
 *   with a `<title>` and description that name its screen
 *   (`src/web/pages.ts`), and an unknown hymn is the not-found page;
 * - `measure`: the bytes and times of `/` and `/hymns/100`, cold (cache
 *   emptied) and warm, five each, medians against `tools/web/budget.json`
 *   (bytes always; times only at a load of 5 or less, by `overOf` of
 *   `tools/web/budget.ts`, which also fails a value with no limit unless
 *   its `UNBUDGETED` names why, and writes the budget from such runs'
 *   `--json` reports), and `--throttle` measures over a slow phone
 *   network (150 ms, 1.6 Mbit/s down) with no budget;
 * - `shipped`: `/` reads no hymn's chords and no indexes, `/hymns/100` its
 *   own chords, its neighbours' and the indexes once each, and a chords
 *   file that fails to load leaves the page drawn, and the hymn, turned to
 *   by the pager or opened by its address, shows its chords once they are
 *   read again (`src/shipped/load.ts`, `chordsMend`);
 * - `return`: Dark chosen in Settings, a hymn visited, a favourite, a
 *   stanza choice; Chrome closed as a person closes it and opened again on
 *   its profile: all four kept.
 *
 * Every request is recorded by origin: one not the local server's fails,
 * but for the recordings' bucket after a press of Play, or for the printed
 * key's recording of a hymn page shown for the rest's delay, which the drive
 * answers itself with silence (`tools/recordings.ts`), so nothing reaches
 * the network. `bun tools/drive-web.ts [web] [check…] [--server plain|exact]
 * [--json <file>]`: `web`, the host other drives name, is the only one;
 * a name that is no check is refused. With `--server exact`, `measure`
 * runs only when named: its budget is the plain host's cache rule.
 *
 * Each check runs under a stall watchdog (`tools/web/stall.ts`): a check
 * that takes no step (an open, a wait, a tap) for `STALL_MS`, or throws,
 * fails by its name and the step it was at, and the checks after it fail as
 * not run. `addresses` prints its progress every hundred hymns, since its
 * 695 opens take minutes under load.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { join } from 'node:path';

import { claimAppPort } from '@manna/exact-kit/port';
import { readWords } from '@manna/hymnal-app/vite/words';
import { recordingKey, setOf } from '@manna/hymnal/recordings';

import { placeOf } from '../src/web/place.ts';
import { QUIET_STORED } from './quiet.ts';
import { answer } from './recordings.ts';
import { type Budget, MAX_LOAD, overOf, TIME_SLACK_MS } from './web/budget.ts';
import { CALL_MS, type Chrome, type Page, launchChrome } from './web/chrome.ts';
import { makeStall } from './web/stall.ts';

const app = join(import.meta.dir, '..');
const dist = join(app, 'dist');
const args = process.argv.slice(2);
const flag = (name: string) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const server = flag('--server') ?? 'plain';
const CHECKS = [
  'rest',
  'addresses',
  'notfound',
  'noscript',
  'measure',
  'shipped',
  'return',
] as const;
const named = args.filter(
  (arg, i) => !arg.startsWith('--') && !args[i - 1]?.startsWith('--') && arg !== 'web',
);
const unknown = named.filter((name) => !(CHECKS as ReadonlyArray<string>).includes(name));
if (unknown.length > 0) {
  console.error(`drive-web: no check named ${unknown.join(', ')}; the checks: ${CHECKS.join(' ')}`);
  process.exit(2);
}
/** The budget is the plain host's cache rule (`tools/web/serve.ts`); Exact's serve keeps its own, so `measure` runs there only when named. */
const checks =
  named.length > 0
    ? named
    : CHECKS.filter((name) => server !== 'exact' || name !== 'measure').map(String);
/** The site's port, either host's, claimed from the app's spare range for the whole run, so the reopen finds its store. */
const PORT = (await claimAppPort(app, { label: `drive-web --server ${server}` })).port;
const origin = `http://127.0.0.1:${PORT}`;
const BUCKET = 'https://hymns.cvr.im';
const budgetFile = join(import.meta.dir, 'web/budget.json');
const report: Record<string, unknown> = { server, origin };

const hymns = readWords();
const book = {
  hymns,
  index: () => {
    throw new Error('the drive asks no search');
  },
};

let failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (!ok) failed += 1;
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${name}${ok || detail === undefined ? '' : `: ${JSON.stringify(detail).slice(0, 600)}`}`,
  );
};

/** A check's steps may pause for a DevTools call's whole bound and a page's load: past that with no step, it is stuck. */
const STALL_MS = CALL_MS + 15_000;
const stall = makeStall(STALL_MS);
const { mark } = stall;
let halted: string | undefined;

/**
 * `body` run as the check `name` under the watchdog. A check that throws or
 * stalls fails by its name and step, and every check after it fails as not
 * run, since the page it leaves is in no known state.
 */
const run = async (name: string, body: () => Promise<unknown>) => {
  if (halted !== undefined) {
    check(`${name}: not run (${halted})`, false);
    return;
  }
  const ended = await stall.watch(body);
  if (ended.ended === 'done') return;
  halted = `${name} ${ended.ended} at "${ended.step}"`;
  check(
    ended.ended === 'stalled'
      ? `${name} ran to its end: it stalled at "${ended.step}" (no step in ${STALL_MS / 1000} s)`
      : `${name} ran to its end: it threw at "${ended.step}"`,
    false,
    ended,
  );
};

/** Every Chrome the drive opened, closed at its end whatever became of its check. */
const launched: Array<Chrome> = [];
const launch = async (profile: string, fresh: boolean) => {
  mark(`launch Chrome on ${profile}`);
  const chrome = await launchChrome(profile, fresh);
  launched.push(chrome);
  return chrome;
};

type Child = ReturnType<typeof Bun.spawn>;
const groups = new Set<Child>();
const stop = (child: Child) => {
  if (!groups.delete(child)) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    groups.delete(child);
  }
};
/** The server's and every Chrome's process groups stopped, at the drive's exit or when it is stopped itself. */
const stopAll = () => {
  for (const child of groups) stop(child);
  for (const chrome of launched) chrome.stopNow();
};
process.on('exit', stopAll);
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const)
  process.on(signal, () => {
    console.log(`drive-web: stopped by ${signal}`);
    stopAll();
    process.exit(1);
  });

/** The built site, a release: its marker says so, and its page script holds no agent mode. */
const marker = existsSync(join(dist, '.exact-build.json'))
  ? (JSON.parse(readFileSync(join(dist, '.exact-build.json'), 'utf8')) as {
      release?: boolean;
      target?: string;
    })
  : undefined;
/** Whether `dist/` holds the pages `tools/web/pages.ts` writes after Exact's build. */
const pagesWritten = () =>
  existsSync(join(dist, 'hymns/100/index.html')) && existsSync(join(dist, '404.html'));
if (marker === undefined || !pagesWritten()) {
  console.error(
    `drive-web: ${marker === undefined ? 'no built site' : 'a built site without its pages (tools/web/pages.ts)'} in dist/: bun run build:web first`,
  );
  process.exit(2);
}
const appJs = readFileSync(join(dist, 'app.js'), 'utf8');
check(
  "the site is a release build (its marker says release; app.js loads no agent.js or perf.js, a development build's)",
  marker.release === true && !/\.\/(agent|perf)\.js|develop\(/u.test(appJs),
  marker,
);

/** The server, in a process group of its own, once it answers. */
const startServer = async () => {
  const command =
    server === 'exact'
      ? ['bun', 'run', 'exact', 'serve', 'dist', '--port', `${PORT}`]
      : ['bun', join(import.meta.dir, 'web/serve.ts'), 'dist', '--port', `${PORT}`];
  const child = Bun.spawn(command, {
    cwd: app,
    stdout: 'ignore',
    stderr: 'inherit',
    detached: true,
  });
  groups.add(child);
  for (let tries = 0; tries < 100; tries++) {
    const up = await fetch(`${origin}/robots.txt`, { signal: AbortSignal.timeout(2000) }).then(
      (r) => r.ok,
      () => false,
    );
    if (up) return child;
    await Bun.sleep(100);
  }
  stop(child);
  throw new Error(`the server did not answer at ${origin}`);
};

/**
 * Every request a page makes, by URL, with whether it was after the first
 * Play and whether it is the save of a rested hymn page: the printed key's
 * recording of the hymn the page has shown for at least `REST_MS`.
 */
const requests: Array<{ url: string; afterPlay: boolean; rested: boolean; at: number }> = [];
let played = false;
/** The app saves the hymn page the reader rests on 750 ms after it shows (`downloadsRest`, `features/downloads.contract`); the drive allows its own observation of the page's change up to 100 ms late. */
const REST_MS = 650;
/** The printed key's recording of hymn `number`, as the bucket names it. */
const printed = (number: number) => `${BUCKET}/audio/${setOf(number)}/${recordingKey(number)}`;

const watch = async (page: Page) => {
  const shown: { number: number; since: number } = { number: 0, since: 0 };
  const showing = (url: string) => {
    const place = placeOf(book, new URL(url).pathname);
    const number = place.screen === 'hymn' ? place.number : 0;
    if (number !== shown.number) Object.assign(shown, { number, since: Date.now() });
  };
  page.on('Page.frameNavigated', (params) => {
    const frame = params.frame as { url: string; parentId?: string };
    if (frame.parentId === undefined) showing(frame.url);
  });
  page.on('Page.navigatedWithinDocument', (params) => showing(String(params.url)));
  page.on('Network.requestWillBeSent', (params) => {
    const url = (params.request as { url: string }).url;
    const at = Date.now();
    const rested = shown.number > 0 && url === printed(shown.number) && at - shown.since >= REST_MS;
    requests.push({ url, afterPlay: played, rested, at });
  });
  await page.send('Fetch.enable', { patterns: [{ urlPattern: `${BUCKET}/*` }] });
  page.on('Fetch.requestPaused', (params) => {
    const request = params.request as {
      url: string;
      method: string;
      headers: Record<string, string>;
    };
    if (!request.url.startsWith(`${BUCKET}/`)) return;
    const local = new URL(request.url);
    const response = answer(
      new Request(`http://127.0.0.1${local.pathname}`, {
        method: request.method,
        headers: request.headers,
      }),
    );
    void response
      .arrayBuffer()
      .then((body) =>
        page.send('Fetch.fulfillRequest', {
          requestId: params.requestId,
          responseCode: response.status,
          responseHeaders: [...response.headers].map(([name, value]) => ({ name, value })),
          body: Buffer.from(body).toString('base64'),
        }),
      )
      .catch((error: unknown) => console.log(`drive-web: the bucket's answer not given: ${error}`));
  });
};

const MARKS = `(() => {
  const marks = (window.__web = {});
  const look = () => {
    const now = performance.now();
    if (marks.row === undefined && document.querySelector('[data-testid="hymn-1"]')) marks.row = now;
    if (marks.words === undefined && document.querySelector('[data-testid="stanza-1"]')) marks.words = now;
    if (marks.ready === undefined && globalThis.exact && globalThis.exact.ready === true) marks.ready = now;
  };
  new MutationObserver(look).observe(document, { childList: true, subtree: true });
  const frame = () => { look(); if (marks.ready === undefined) requestAnimationFrame(frame); };
  frame();
})();`;

/** Whether `expression` holds in the page within `ms`. */
const waitFor = async (page: Page, expression: string, ms = 10_000) => {
  mark(`wait for ${expression.slice(0, 120)}`);
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await page.evaluate<boolean>(`Boolean(${expression})`).catch(() => false)) return true;
    await Bun.sleep(20);
  }
  return false;
};

/** `path` opened as typed: its document's status, once it has loaded (and, with script, once the app is ready). */
const open = async (page: Page, path: string, script = true) => {
  mark(`open ${path}`);
  let status = 0;
  const off = page.on('Network.responseReceived', (params) => {
    if (params.type === 'Document') status = (params.response as { status: number }).status;
  });
  const loaded = new Promise<void>((resolve) => {
    const done = page.on('Page.loadEventFired', () => {
      done();
      resolve();
    });
  });
  await page.send('Page.navigate', { url: `${origin}${path}` });
  await Promise.race([loaded, Bun.sleep(15_000)]);
  off();
  const ready = script
    ? await waitFor(page, 'globalThis.exact && globalThis.exact.ready === true')
    : false;
  return { status, ready };
};

/**
 * A press of the element `selector` names, as its activation (`click()`),
 * which a pointer, a key and an assistive tool all make: a pointer pressed
 * through `Input.dispatchMouseEvent` reached a link but not Play's button.
 */
const tap = (page: Page, selector: string) => {
  mark(`tap ${selector}`);
  return page.evaluate<boolean>(
    `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.scrollIntoView({ block: 'center' }); el.click(); return true; })()`,
  );
};

/** The screen the page shows: its document title names it, the hymn's by its number. */
const screenOf = async (page: Page) =>
  page.evaluate<{ title: string; number: string | null; notfound: boolean; path: string }>(
    `({ title: document.title, number: document.querySelector('[data-testid="hymn-number"]')?.textContent ?? null, notfound: Boolean(document.querySelector('[data-testid="notfound"]')), path: location.pathname })`,
  );

const titleOf = (n: number) => hymns.find((hymn) => hymn.number === n)?.title ?? '';

const addresses = async (page: Page) => {
  const started = Date.now();
  const wrong: Array<unknown> = [];
  for (const hymn of hymns) {
    const { status, ready } = await open(page, `/hymns/${hymn.number}`);
    const shown = await waitFor(
      page,
      `document.querySelector('[data-testid="hymn-number"]')?.textContent === ${JSON.stringify(`${hymn.number}`)} && document.querySelector('[data-testid="hymn-title"]')?.textContent === ${JSON.stringify(hymn.title)}`,
      5000,
    );
    if (status !== 200 || !ready || !shown) wrong.push({ n: hymn.number, status, ready, shown });
    if (hymn.number % 100 === 0)
      console.log(
        `addresses: ${hymn.number} of ${hymns.length} opened (${((Date.now() - started) / 1000).toFixed(0)} s)`,
      );
  }
  const seconds = (Date.now() - started) / 1000;
  report.addresses = { hymns: hymns.length, seconds, wrong: wrong.length };
  check(
    `every hymn's address opened cold shows its number and title (${hymns.length} in ${seconds.toFixed(1)} s)`,
    wrong.length === 0,
    wrong.slice(0, 5),
  );
  const odd = [
    '/hymns/007',
    '/hymns/100/',
    '/hymns/%31%30%30',
    '/hymns/100?q=1',
    '/hymns/100#stanza-2',
    '/recent?x=1',
    '/Recent',
    '/hymns/+1',
    '/hymns/1.0',
    '/settings',
    '/settings/about?x=1',
    '/settings/',
    '/Settings/about',
  ];
  const disagree: Array<unknown> = [];
  for (const path of odd) {
    const place = placeOf(book, path);
    await open(page, path);
    await Bun.sleep(300);
    const want =
      place.screen === 'hymn'
        ? `document.querySelector('[data-testid="hymn-number"]')?.textContent === '${place.number}'`
        : place.screen === 'notfound'
          ? `document.querySelector('[data-testid="notfound"]')`
          : place.screen === 'recent'
            ? `document.title === 'Recent'`
            : place.screen === 'settings' || place.screen === 'about'
              ? `document.querySelector('[data-testid="${place.screen}"]')`
              : `document.title === 'Hymns'`;
    if (!(await waitFor(page, want, 5000)))
      disagree.push({ path, place, shown: await screenOf(page) });
  }
  check(
    `odd addresses open the screen the address rule names (${odd.join(' ')})`,
    disagree.length === 0,
    disagree,
  );
};

const notFound = async (page: Page) => {
  const wrong: Array<unknown> = [];
  for (const path of ['/hymns/0', '/hymns/696', '/hymns/abc', '/nothing']) {
    const { status } = await open(page, path);
    const shown = await waitFor(
      page,
      `document.querySelector('[data-testid="notfound-title"]') && document.querySelector('[data-testid="notfound-home"]')?.getAttribute('href') === '/'`,
      5000,
    );
    const statusOk = server === 'exact' ? status === 200 || status === 404 : status === 404;
    if (!shown || !statusOk) wrong.push({ path, status, shown, screen: await screenOf(page) });
  }
  check(
    '/hymns/0, /hymns/696, /hymns/abc and /nothing show not-found with a link home',
    wrong.length === 0,
    wrong,
  );
  await tap(page, '[data-testid="notfound-home"]');
  const home = await waitFor(
    page,
    `location.pathname === '/' && document.querySelector('[data-testid="title"]')?.textContent === 'Hymns' && !document.querySelector('[data-testid="notfound"]')`,
    5000,
  );
  check("the not-found screen's link opens the list", home, await screenOf(page));
};

const noScript = async (page: Page) => {
  await page.send('Emulation.setScriptExecutionDisabled', { value: true });
  const head = `({ title: document.title, description: document.querySelector('meta[name="description"]')?.content ?? '' })`;
  const body = `document.getElementById('exact-root')?.textContent?.trim().length ?? -1`;
  await open(page, '/', false);
  const list = await page.evaluate<{ title: string; description: string }>(head);
  const listText = await page.evaluate<number>(body);
  check(
    "with script off, /'s title and description name the list (its body is the empty shell)",
    list.title === 'Hymns' && list.description.includes('695 hymns'),
    { list, listText },
  );
  await open(page, '/hymns/100', false);
  const hymn = await page.evaluate<{ title: string; description: string }>(head);
  const hymnText = await page.evaluate<number>(body);
  check(
    "with script off, /hymns/100's title and description name the hymn (its body is the empty shell)",
    hymn.title === titleOf(100) && hymn.description.startsWith('Hymn 100 of the hymnal'),
    { hymn, hymnText },
  );
  const sheets: Array<{ title: string; description: string }> = [];
  for (const path of ['/settings', '/settings/about']) {
    await open(page, path, false);
    sheets.push(await page.evaluate<{ title: string; description: string }>(head));
  }
  check(
    "with script off, /settings's and /settings/about's titles name their screens",
    sheets[0]?.title === 'Settings' && sheets[1]?.title === 'About',
    sheets,
  );
  await open(page, '/hymns/696', false);
  const missing = await page.evaluate<{ title: string; description: string }>(head);
  check(
    server === 'exact'
      ? "with script off, an unknown hymn is Exact's serve's shell (it answers a route's pattern with shell.html)"
      : 'with script off, an unknown hymn is the not-found page',
    missing.title === (server === 'exact' ? 'Hymnal' : 'No Such Page'),
    missing,
  );
  report.noscript = { list, listText, hymn, hymnText };
  await page.send('Emulation.setScriptExecutionDisabled', { value: false });
};

const median = (values: ReadonlyArray<number>) =>
  values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

const kindOf = (url: string, type: string) => {
  if (url.endsWith('.wasm')) return 'wasm';
  if (type === 'Document') return 'html';
  if (type === 'Script') return 'script';
  if (type === 'Stylesheet') return 'css';
  return 'data';
};

/**
 * One load of `path`: bytes on the wire by kind and by file, and its times
 * from navigation start. The bytes are the site's own: a recording the app
 * fetches from the bucket once the page has rested (the printed key's save)
 * is listed among the files but not counted, as it is no part of the launch
 * and lands inside the window only when the page was slow to show.
 */
const measureOnce = async (page: Page, path: string, cold: boolean) => {
  if (cold) await page.send('Network.clearBrowserCache');
  const seen = new Map<string, { url: string; type: string; bytes: number; status: number }>();
  const offs = [
    page.on('Network.responseReceived', (params) => {
      const response = params.response as { url: string; status: number };
      seen.set(params.requestId as string, {
        url: response.url,
        type: String(params.type),
        bytes: 0,
        status: response.status,
      });
    }),
    page.on('Network.loadingFinished', (params) => {
      const entry = seen.get(params.requestId as string);
      if (entry) entry.bytes = Number(params.encodedDataLength);
    }),
  ];
  await open(page, path);
  await waitFor(
    page,
    path === '/' ? `window.__web.row !== undefined` : `window.__web.words !== undefined`,
    5000,
  );
  await Bun.sleep(600);
  for (const off of offs) off();
  const marks = await page.evaluate<Record<string, number>>(
    `(() => { const n = performance.getEntriesByType('navigation')[0]; const c = performance.getEntriesByType('resource').find((e) => e.name.includes('/modules/chords/')); return { ...window.__web, response: n.responseEnd, dom: n.domContentLoadedEventEnd, load: n.loadEventEnd, ...(c ? { chordsAsked: c.startTime } : {}) }; })()`,
  );
  const files = [...seen.values()].map((entry) => ({
    ...entry,
    kind: kindOf(entry.url, entry.type),
    file: entry.url.replace(origin, ''),
  }));
  const bytes: Record<string, number> = { html: 0, script: 0, css: 0, data: 0, wasm: 0 };
  for (const file of files.filter(({ url }) => !url.startsWith(BUCKET)))
    bytes[file.kind] = (bytes[file.kind] ?? 0) + file.bytes;
  return { bytes, total: Object.values(bytes).reduce((a, b) => a + b, 0), marks, files };
};

/** How long after the app's ready a hymn page may ask its chords file: its first ask's own turn, no serial wait before it. */
const CHORDS_ASKED_MS = 25;

/** The file a hymn page must not fetch to draw its words: the indexes, whose head line it reads from its bundled table (`src/hymn/heads.ts`). */
const UNWAITED = /^\/modules\/indexes\//u;

const measure = async (page: Page) => {
  const load = loadavg()[0] ?? 0;
  const limits =
    (existsSync(budgetFile)
      ? (JSON.parse(readFileSync(budgetFile, 'utf8')) as Partial<Budget>).limits
      : undefined) ?? {};
  const measured: Record<string, Record<string, number>> = {};
  const loads: Record<string, unknown> = {};
  const throttled = args.includes('--throttle');
  if (throttled)
    await page.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: 200_000,
      uploadThroughput: 94_000,
    });
  for (const path of ['/', '/hymns/100']) {
    const shown = path === '/' ? 'row' : 'words';
    for (const cold of [true, false]) {
      if (!cold) await measureOnce(page, path, false);
      const runs = [];
      for (let i = 0; i < 5; i++) runs.push(await measureOnce(page, path, cold));
      const key = `${path} ${cold ? 'cold' : 'warm'}`;
      measured[key] = {
        bytes: median(runs.map((run) => run.total)),
        html: median(runs.map((run) => run.bytes.html ?? 0)),
        script: median(runs.map((run) => run.bytes.script ?? 0)),
        css: median(runs.map((run) => run.bytes.css ?? 0)),
        data: median(runs.map((run) => run.bytes.data ?? 0)),
        wasm: median(runs.map((run) => run.bytes.wasm ?? 0)),
        [`${shown}Ms`]: Math.round(median(runs.map((run) => run.marks[shown] ?? Number.NaN))),
        readyMs: Math.round(median(runs.map((run) => run.marks.ready ?? Number.NaN))),
        loadMs: Math.round(median(runs.map((run) => run.marks.load ?? Number.NaN))),
      };
      loads[key] = runs[0]?.files.map(({ file, kind, bytes, status }) => ({
        file,
        kind,
        bytes,
        status,
      }));
      if (path === '/hymns/100' && cold) {
        const waited = runs.flatMap((run) =>
          run.files.filter(({ file }) => UNWAITED.test(file)).map(({ file }) => file),
        );
        check(
          "a hymn page's words wait for no read of the indexes file (cold /hymns/100)",
          runs.length > 0 && waited.length === 0,
          waited,
        );
        const asked = Math.round(
          median(runs.map((run) => (run.marks.chordsAsked ?? Number.NaN) - (run.marks.ready ?? 0))),
        );
        check(
          `a hymn page asks its chords file within ${CHORDS_ASKED_MS} ms of the app's ready (cold /hymns/100: ${asked} ms${load <= MAX_LOAD ? '' : `, not checked: load ${load.toFixed(1)}`})`,
          load > MAX_LOAD || asked <= CHORDS_ASKED_MS,
          asked,
        );
      }
    }
  }
  report.measure = { load, throttled, measured, loads };
  console.log(JSON.stringify(measured, null, 1));
  if (throttled) {
    console.log('throttled (150 ms, 1.6 Mbit/s down): measured only, no budget');
    return;
  }
  const timesChecked = load <= MAX_LOAD;
  const over = overOf(measured, limits, timesChecked);
  check(
    `bytes and times within tools/web/budget.json + 10% (a time + ${TIME_SLACK_MS} ms at least) (times ${timesChecked ? 'checked' : `not checked: load ${load.toFixed(1)}`})`,
    limits['/ cold'] !== undefined && over.length === 0,
    over,
  );
};

/** The page's requests for the chords' and the indexes' shipped files (`modules/<folder>/<n>.js`), in order, each with its status, 0 for one that failed. */
const shippedRequests = (page: Page) => {
  const asked: Array<{ id: string; file: string; status: number }> = [];
  const offs = [
    page.on('Network.requestWillBeSent', (params) => {
      const url = (params.request as { url: string }).url;
      if (/^\/modules\/(chords|indexes)\//u.test(url.replace(origin, '')))
        asked.push({ id: String(params.requestId), file: url.replace(origin, ''), status: -1 });
    }),
    page.on('Network.responseReceived', (params) => {
      const entry = asked.find(({ id }) => id === params.requestId);
      if (entry) entry.status = (params.response as { status: number }).status;
    }),
    page.on('Network.loadingFailed', (params) => {
      const entry = asked.find(({ id }) => id === params.requestId);
      if (entry) entry.status = 0;
    }),
  ];
  return {
    files: () => asked.map(({ file, status }) => ({ file, status })),
    stop: () => {
      for (const off of offs) off();
    },
  };
};

/**
 * The files the launch does not bundle (`src/shipped/load.ts`): `/` reads
 * no hymn's chords and no indexes; `/hymns/100` reads its own chords, its
 * pager's neighbours' and the indexes once each. With chords on, a
 * neighbour's read that fails (101's chords blocked, as offline) leaves
 * the page drawn with its chords and words, and once they can load the
 * pager turned to 101 (a sideways wheel) shows 101 with its chords, read
 * again (a new address, `?try=1`; `chordsMend`, features/chords.contract);
 * and a hymn opened by its address whose first read fails (102's) shows
 * its chords from the read made again at once.
 */
const shipped = async (page: Page) => {
  const launch = async (path: string) => {
    await page.send('Network.clearBrowserCache');
    const seen = shippedRequests(page);
    await open(page, path);
    await waitFor(
      page,
      path === '/' ? `window.__web.row !== undefined` : `window.__web.words !== undefined`,
      5000,
    );
    await Bun.sleep(600);
    seen.stop();
    return seen.files();
  };
  const atHome = await launch('/');
  check("the list's launch reads no hymn's chords and no indexes", atHome.length === 0, atHome);
  const atHymn = await launch('/hymns/100');
  const wanted = ['/modules/chords/100.js', '/modules/chords/99.js', '/modules/chords/101.js'];
  check(
    "a hymn page's launch reads its chords and its neighbours', once each, and no indexes",
    atHymn.length === wanted.length &&
      wanted.every(
        (file) => atHymn.filter((each) => each.file === file && each.status === 200).length === 1,
      ),
    atHymn,
  );
  mark('chords on');
  await open(page, '/');
  await tap(page, '[data-testid="gear"]');
  await waitFor(page, `document.querySelector('[data-testid="chords-toggle"]') !== null`, 5000);
  await tap(page, '[data-testid="chords-toggle"]');
  const on = await waitFor(
    page,
    `document.querySelector('[data-testid="chords-toggle"]')?.getAttribute('aria-checked') === 'true'`,
    5000,
  );
  mark('block 101 chords');
  await page.send('Network.setBlockedURLs', { urls: [`${origin}/modules/chords/101.js`] });
  await page.send('Network.clearBrowserCache');
  const seen = shippedRequests(page);
  try {
    await open(page, '/hymns/100');
    const words = await waitFor(
      page,
      `(${shownChords}).number === 100 && (${shownChords}).chords > 0`,
      10_000,
    );
    await Bun.sleep(600);
    const failed = seen.files().filter(({ file }) => file === '/modules/chords/101.js');
    check(
      "a neighbour's chords that fail to load leave the hymn page drawn with its chords and words",
      on && words && failed.length === 1 && failed[0]?.status === 0,
      { on, words, files: seen.files() },
    );
    await page.send('Network.setBlockedURLs', { urls: [] });
    mark('turn the pager to 101');
    const pager = await page.evaluate<{ x: number; y: number; width: number }>(
      `(() => { const r = document.querySelector('[data-testid="hymn-pager"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width }; })()`,
    );
    await page.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: pager.x,
      y: pager.y,
      deltaX: pager.width,
      deltaY: 0,
    });
    const drawn = await waitFor(page, chordsDrawn(101), 12_000);
    const retried = seen.files().filter(({ file }) => file.startsWith('/modules/chords/101.js?'));
    check(
      'the pager turned to a neighbour whose chords failed shows that hymn with its chords once they are read again',
      drawn && retried.some(({ status }) => status === 200),
      { drawn, shown: await page.evaluate(shownChords), files: seen.files() },
    );
  } finally {
    seen.stop();
    await page.send('Network.setBlockedURLs', { urls: [] });
  }
  mark('refuse 102 chords once');
  await page.send('Network.clearBrowserCache');
  const once = await refuseOnce(page, '/modules/chords/102.js');
  const linked = shippedRequests(page);
  try {
    await open(page, '/hymns/102');
    const drawn = await waitFor(page, chordsDrawn(102), 12_000);
    const reads = linked.files().filter(({ file }) => file.startsWith('/modules/chords/102.js'));
    check(
      "a hymn opened by its address whose chords' first read fails shows its chords once they are read again",
      drawn && once.refused() === 1 && reads.some(({ status }) => status === 200),
      { drawn, refused: once.refused(), shown: await page.evaluate(shownChords), reads },
    );
  } finally {
    linked.stop();
    await once.stop();
  }
  mark('chords off');
  await open(page, '/');
  await tap(page, '[data-testid="gear"]');
  await waitFor(page, `document.querySelector('[data-testid="chords-toggle"]') !== null`, 5000);
  await tap(page, '[data-testid="chords-toggle"]');
  await waitFor(
    page,
    `document.querySelector('[data-testid="chords-toggle"]')?.getAttribute('aria-checked') === 'false'`,
    5000,
  );
  mark('hold 103 chords 1.5 s');
  await page.send('Network.clearBrowserCache');
  const held = await holdFile(page, '/modules/chords/103.js', HELD_MS, false);
  try {
    const seen = await sampleWords(page, '/hymns/103', HELD_MS + 3000);
    const bare = seen.filter((sample) => sample.words > 0 && sample.hyphens === 0);
    const first = seen.find((sample) => sample.hyphens > 0);
    check(
      `a hymn page whose chords file is held ${HELD_MS} ms draws its words only with their syllables, once it lands`,
      held.held() === 1 && bare.length === 0 && first !== undefined && first.at < HELD_MS + 1500,
      { held: held.held(), bare: bare.length, first, during: seen.at(0) },
    );
    report.held = seen;
  } finally {
    await held.stop();
  }
  mark('fail 104 chords');
  await page.send('Network.clearBrowserCache');
  const missing = await holdFile(page, '/modules/chords/104.js', 0, true);
  try {
    const seen = await sampleWords(page, '/hymns/104', 1500);
    const first = seen.find((sample) => sample.words > 0);
    check(
      'a hymn page whose chords file cannot be read draws its words, without their syllables, after the read and its one retry fail',
      missing.held() >= 2 && first !== undefined && first.at < 1000,
      { refused: missing.held(), first, last: seen.at(-1) },
    );
    report.missing = seen;
  } finally {
    await missing.stop();
  }
};

/** How long the slow-network case holds a chords file back. */
const HELD_MS = 1500;

/** Opens `path` and samples its first stanza every 50 ms for `ms`: when, how many words and hyphens it draws, and what the page shows. */
const sampleWords = async (page: Page, path: string, ms: number) => {
  const samples: Array<{ at: number; words: number; hyphens: number; shown: string }> = [];
  const start = Date.now();
  void open(page, path).catch(() => undefined);
  while (Date.now() - start < ms) {
    const got = await page
      .evaluate<{ words: number; hyphens: number; shown: string }>(
        `(() => { const s = document.querySelector('[data-testid="stanza-1"]'); const t = s ? s.innerText : ''; return { words: t.split(/\\s+/).filter(Boolean).length, hyphens: (t.match(/-/g) ?? []).length, shown: (document.querySelector('[data-testid="hymn-page"]') ? 'hymn page' : document.body.innerText.slice(0, 40)) }; })()`,
      )
      .catch(() => ({ words: 0, hyphens: 0, shown: 'navigating' }));
    samples.push({ at: Date.now() - start, ...got });
    await Bun.sleep(50);
  }
  return samples;
};

/** Holds the page's requests for `file` `ms` before letting them through, or fails each when `fail`; `held` counts them. */
const holdFile = async (page: Page, file: string, ms: number, fail: boolean) => {
  let held = 0;
  const off = page.on('Fetch.requestPaused', (params) => {
    const id = String(params.requestId);
    const url = (params.request as { url: string }).url;
    if (!url.startsWith(`${origin}${file}`)) return;
    held += 1;
    if (fail) {
      void page.send('Fetch.failRequest', { requestId: id, errorReason: 'InternetDisconnected' });
      return;
    }
    setTimeout(() => void page.send('Fetch.continueRequest', { requestId: id }), ms);
  });
  const bucket = { urlPattern: `${BUCKET}/*` };
  await page.send('Fetch.enable', { patterns: [bucket, { urlPattern: `${origin}${file}*` }] });
  return {
    held: () => held,
    stop: async () => {
      off();
      await page.send('Fetch.enable', { patterns: [bucket] });
    },
  };
};

/** The shown hymn page: its hymn's number, its chords drawn and whether it says it has none. */
const shownChords = `(() => { const root = document.querySelector('[data-testid="hymn-page"]'); return { path: location.pathname, number: Number(root?.querySelector('[data-testid="hymn-number"]')?.textContent ?? 0), chords: root ? root.querySelectorAll('[data-testid^="chord-"]').length : 0, none: Boolean(root?.querySelector('[data-testid^="no-chords"]')) }; })()`;

/** Whether hymn `n` is the page shown, at its address, its chords drawn and no notice that it has none. */
const chordsDrawn = (n: number) =>
  `(() => { const shown = ${shownChords}; return shown.path === '/hymns/${n}' && shown.number === ${n} && shown.chords > 0 && !shown.none; })()`;

/** Fails the page's first request for `file` (as a network failure), and lets every later one through. */
const refuseOnce = async (page: Page, file: string) => {
  let refused = 0;
  const off = page.on('Fetch.requestPaused', (params) => {
    const id = String(params.requestId);
    const url = (params.request as { url: string }).url;
    if (refused === 0 && url === `${origin}${file}`) {
      refused += 1;
      void page.send('Fetch.failRequest', { requestId: id, errorReason: 'Failed' });
      return;
    }
    if (url.startsWith(`${origin}${file}`))
      void page.send('Fetch.continueRequest', { requestId: id });
  });
  const bucket = { urlPattern: `${BUCKET}/*` };
  await page.send('Fetch.enable', { patterns: [bucket, { urlPattern: `${origin}${file}*` }] });
  return {
    refused: () => refused,
    stop: async () => {
      off();
      await page.send('Fetch.enable', { patterns: [bucket] });
    },
  };
};

/** The app's root is drawn in the dark scheme (`color-scheme=settingsScheme` in `app.contract`). */
const isDark = `getComputedStyle(document.querySelector('[data-testid="root"]') ?? document.documentElement).colorScheme === 'dark'`;

/** A light system on both launches, so a dark root after the reopen is the kept choice, not the system's. */
const LIGHT_SYSTEM = [{ name: 'prefers-color-scheme', value: 'light' }];

const returning = async () => {
  const profile = join(app, '.exact/web-return-profile');
  const first = await launch(profile, true);
  await watch(first.page);
  await first.page.send('Emulation.setEmulatedMedia', { features: LIGHT_SYSTEM });
  const page = first.page;
  const trace: Array<unknown> = [];
  let firstPlayLost = 0;
  const step = async (name: string, done: Promise<unknown>) => {
    mark(name);
    trace.push([name, await done]);
  };
  const has = (id: string) => `document.querySelector('[data-testid="${id}"]')`;
  const chips = `[...document.querySelectorAll('[data-testid="player"] [data-testid^="stanza-"]')].map((b) => b.getAttribute('aria-pressed'))`;
  /** Play pressed on hymn 2's page, the full player opened once the bar shows: its stanzas' chips. */
  const playerOf = async (on: Page) => {
    await step('play shown', waitFor(on, has('play'), 5000));
    if (!(await on.evaluate<boolean>(QUIET_STORED)))
      throw new Error('Sounds and haptics is on: no Play is made with it on (tools/quiet.ts)');
    played = true;
    await step('tap play', tap(on, '[data-testid="play"]'));
    const bar = await waitFor(on, has('bar-title'), 4000);
    if (!bar) {
      firstPlayLost += 1;
      await step('tap play again', tap(on, '[data-testid="play"]'));
    }
    await step('bar', waitFor(on, has('bar-title'), 4000));
    await Bun.sleep(3000);
    await step('tap bar', tap(on, '[data-testid="bar-title"]'));
    await step('chips', waitFor(on, `${chips}.length > 1`, 8000));
  };
  await step('settings', open(page, '/settings'));
  await step('appearance shown', waitFor(page, has('appearance-dark'), 5000));
  await step('tap sounds and haptics', tap(page, '[data-testid="settings-feel"]'));
  const quiet = await waitFor(page, QUIET_STORED, 3000);
  await step('sounds and haptics off', quiet);
  if (!quiet) throw new Error('Sounds and haptics did not turn off: no Play is made with it on');
  const lightFirst = !(await page.evaluate<boolean>(isDark));
  await step('tap dark', tap(page, '[data-testid="appearance-dark"]'));
  const darkSet = await waitFor(page, isDark, 3000);
  await step('dark', darkSet);
  await step('open', open(page, '/hymns/2'));
  await step(
    'title',
    waitFor(page, `${has('hymn-title')}?.textContent === ${JSON.stringify(titleOf(2))}`),
  );
  await step('tap favourite', tap(page, '[data-testid="favourite"]'));
  await step(
    'starred',
    waitFor(page, `${has('favourite')}?.getAttribute('aria-pressed') === 'true'`, 3000),
  );
  await step(
    'recent',
    waitFor(page, `localStorage.getItem('exact.state.recentList') === '[2]'`, 5000),
  );
  await playerOf(page);
  await step('tap stanza-2', tap(page, '[data-testid="player"] [data-testid="stanza-2"]'));
  await Bun.sleep(300);
  await step('tap stanza-4', tap(page, '[data-testid="player"] [data-testid="stanza-4"]'));
  await Bun.sleep(500);
  const chosen = await page.evaluate<Array<string | null>>(chips);
  await step('kept', page.evaluate(`localStorage.getItem('exact.state.playerKept')`));
  mark('close Chrome');
  const closed = await first.close();
  check(
    'Chrome closed as a person closes it (Browser.close), not stopped',
    closed === 'closed',
    closed,
  );
  const second = await launch(profile, false);
  await watch(second.page);
  await second.page.send('Emulation.setEmulatedMedia', { features: LIGHT_SYSTEM });
  await step('reopen', open(second.page, '/'));
  const darkKept = await waitFor(second.page, isDark, 5000);
  const shelf = await waitFor(second.page, has('shelf-2'), 5000);
  await step(
    'shelf',
    second.page.evaluate(
      `[...document.querySelectorAll('[data-testid^="shelf-"], [data-testid="recent-shelf"]')].map((e) => e.getAttribute('data-testid'))`,
    ),
  );
  const star = await waitFor(second.page, has('star-2'), 5000);
  await step('open again', open(second.page, '/hymns/2'));
  await playerOf(second.page);
  const kept = await second.page.evaluate<Array<string | null>>(chips);
  await second.close();
  report.returning = { darkSet, darkKept, shelf, star, chosen, kept, firstPlayLost, trace };
  check('the first press of Play plays (both launches)', firstPlayLost === 0, { firstPlayLost });
  if (!shelf || !star || JSON.stringify(chosen) !== JSON.stringify(kept) || chosen.length === 0)
    console.log(`trace ${JSON.stringify(trace)}`);
  check('after a close and a reopen: Recent holds the hymn visited', shelf);
  check('after a close and a reopen: the favourite is starred in the list', star);
  check(
    'after a close and a reopen: the stanza choice is as left',
    JSON.stringify(chosen) === JSON.stringify(kept) &&
      chosen.includes('false') &&
      chosen.includes('true'),
    { chosen, kept },
  );
  check(
    'after a close and a reopen: Dark, chosen in Settings over a light first launch, is as left',
    lightFirst && darkSet && darkKept,
    { lightFirst, darkSet, darkKept },
  );
};

/** The bucket's requests made since the `from`th request. */
const bucketSince = (from: number) =>
  requests.slice(from).filter(({ url }) => url.startsWith(BUCKET));

/**
 * The save of the page the reader rests on, on a fresh profile before any
 * other check has opened a hymn: hymn 1 opened from the list and rested on
 * asks only its printed key; back on the list, hymn 3 opened and left by
 * its back button well before the delay asks the bucket nothing, the store
 * already running.
 */
const resting = async (page: Page) => {
  await open(page, '/');
  const row = await waitFor(page, `document.querySelector('[data-testid="hymn-1"]')`, 5000);
  const rest = requests.length;
  await tap(page, '[data-testid="hymn-1"]');
  const shownRest = await waitFor(page, `location.pathname === '/hymns/1'`, 3000);
  mark('rest on hymn 1');
  await Bun.sleep(2000);
  const restAsked = bucketSince(rest);
  check(
    "a hymn page rested on asks the bucket for its printed key's recording, and nothing else",
    row &&
      shownRest &&
      restAsked.length > 0 &&
      restAsked.every(({ url, rested }) => rested && url === printed(1)),
    { row, shownRest, asked: restAsked.slice(0, 5) },
  );
  await tap(page, '[data-testid="hymn-back"]');
  const list = await waitFor(
    page,
    `location.pathname === '/' && document.querySelector('[data-testid="hymn-3"]')`,
    3000,
  );
  const left = requests.length;
  const opened = Date.now();
  await tap(page, '[data-testid="hymn-3"]');
  const shown = await waitFor(page, `location.pathname === '/hymns/3'`, 3000);
  await tap(page, '[data-testid="hymn-back"]');
  const back = await waitFor(page, `location.pathname === '/'`, 3000);
  const stayed = Date.now() - opened;
  mark('wait past the rest');
  await Bun.sleep(1500);
  const leftAsked = bucketSince(left);
  check(
    `a hymn page left before the rest's 750 ms asks the bucket nothing (left after ${stayed} ms)`,
    list && shown && back && stayed < REST_MS && leftAsked.length === 0,
    { list, shown, back, stayed, asked: leftAsked.slice(0, 5) },
  );
  report.rest = { stayed, left: leftAsked.length, rested: restAsked.length };
};

const ON_ONE_PAGE = {
  rest: resting,
  addresses,
  notfound: notFound,
  noscript: noScript,
  measure,
  shipped,
} as const satisfies Record<
  Exclude<(typeof CHECKS)[number], 'return'>,
  (page: Page) => Promise<void>
>;

const serverChild = await startServer();
try {
  const onePage = Object.entries(ON_ONE_PAGE).filter(([name]) => checks.includes(name));
  if (onePage.length > 0) {
    const opened: { chrome?: Chrome } = {};
    await run('launch Chrome', async () => {
      const chrome = await launch(join(app, '.exact/web-drive-profile'), true);
      await watch(chrome.page);
      mark('add the marks script');
      await chrome.page.send('Page.addScriptToEvaluateOnNewDocument', { source: MARKS });
      opened.chrome = chrome;
    });
    for (const [name, body] of onePage)
      await run(name, async () =>
        opened.chrome === undefined ? undefined : body(opened.chrome.page),
      );
    await opened.chrome?.close();
  }
  if (checks.includes('return')) await run('return', returning);
} finally {
  for (const chrome of launched) await chrome.close();
  stop(serverChild);
}

const foreign = requests.filter(
  ({ url }) => !url.startsWith(origin) && !/^(data|blob):/u.test(url),
);
const unasked = foreign.filter(
  ({ url, afterPlay, rested }) => !url.startsWith(BUCKET) || !(afterPlay || rested),
);
report.requests = {
  total: requests.length,
  foreign: foreign.length,
  bucketAnsweredByDrive: foreign.length - unasked.length,
  restedSaves: foreign.filter(({ rested }) => rested).length,
};
check(
  `every request is the local server's, but the bucket after Play or a rested hymn page's printed key, answered by the drive (${requests.length} requests, ${foreign.length - unasked.length} to the bucket)`,
  unasked.length === 0,
  unasked.slice(0, 5),
);
check(
  "dist/ still holds its pages (Exact's serve builds the site again, without them, when a source changed since build:web: run it again)",
  pagesWritten(),
);

const out = flag('--json');
if (out !== undefined) writeFileSync(out, `${JSON.stringify(report, null, 1)}\n`);
console.log(`${failed === 0 ? 'ok' : 'FAILED'}: drive-web (${server}), ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
