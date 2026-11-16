/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noAsyncFunction, effect/noNewError, effect/noNewPromise, effect/noNullish, effect/noTernary, effect/noThrowStatement, effect/noUnknownParameters, effect/noAs, effect/noTryCatch, effect/noUnsafeDictionaryType, effect/noKnownValueWidening, effect/maxCognitiveComplexity, eslint/no-await-in-loop, eslint/complexity -- a host script that serves the built site and drives headless Chrome over the DevTools protocol, each in a process group of its own, awaits each page in turn, reads each method's JSON as it comes, and prints what it found in a report of named sections; it never runs in the data module. */

/**
 * The production web build as a visitor meets it (spec B), with no Exact
 * driver attached: `dist/` (`bun run build:web`, a release build) served as
 * plain files by the host's one rule (`tools/web/serve.ts`, or with
 * `--server exact` by Exact's own `serve` through the wrapper), and Chrome
 * driven over the DevTools protocol (`tools/web/chrome.ts`). Each check
 * prints one `PASS` or `FAIL` line; the drive exits 1 on any failure.
 *
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
 *   (bytes always; times only at a load of 5 or less, by `allowedOver` of
 *   `tools/web/budget.ts`, which writes the budget from five or more such
 *   runs' `--json` reports), and `--throttle` measures over a slow phone
 *   network (150 ms, 1.6 Mbit/s down) with no budget;
 * - `return`: Dark chosen in Settings, a hymn visited, a favourite, a
 *   stanza choice; Chrome closed as a person closes it and opened again on
 *   its profile: all four kept.
 *
 * Every request is recorded by origin: one not the local server's fails,
 * but for the recordings' bucket after a press of Play, which the drive
 * answers itself with silence (`tools/recordings.ts`), so nothing reaches
 * the network. `bun tools/drive-web.ts [check…] [--server plain|exact]
 * [--json <file>]`.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { join } from 'node:path';

import { readWords } from '@manna/hymnal-app/vite/words';

import { placeOf } from '../src/web/place.ts';
import { answer, checkoutPort } from './recordings.ts';
import { allowedOver, type Budget, isTime, MAX_LOAD, TIME_SLACK_MS } from './web/budget.ts';
import { type Page, launchChrome } from './web/chrome.ts';

const app = join(import.meta.dir, '..');
const dist = join(app, 'dist');
const args = process.argv.slice(2);
const flag = (name: string) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const server = flag('--server') ?? 'plain';
const CHECKS = ['addresses', 'notfound', 'noscript', 'measure', 'return'] as const;
const named = args.filter((arg, i) => !arg.startsWith('--') && !args[i - 1]?.startsWith('--'));
const checks = named.length > 0 ? named : [...CHECKS];
const PORT = server === 'exact' ? 8778 : checkoutPort();
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
process.on('exit', () => {
  for (const child of groups) stop(child);
});

/** The built site, a release: its marker says so, and its page script holds no agent mode. */
const marker = existsSync(join(dist, '.exact-build.json'))
  ? (JSON.parse(readFileSync(join(dist, '.exact-build.json'), 'utf8')) as {
      release?: boolean;
      target?: string;
    })
  : undefined;
if (marker === undefined) {
  console.error('drive-web: no built site in dist/: bun run build:web first');
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
    const up = await fetch(`${origin}/robots.txt`).then(
      (r) => r.ok,
      () => false,
    );
    if (up) return child;
    await Bun.sleep(100);
  }
  stop(child);
  throw new Error(`the server did not answer at ${origin}`);
};

/** Every request a page makes, by URL, with whether it was before the first Play. */
const requests: Array<{ url: string; afterPlay: boolean }> = [];
let played = false;

const watch = async (page: Page) => {
  page.on('Network.requestWillBeSent', (params) => {
    const url = (params.request as { url: string }).url;
    requests.push({ url, afterPlay: played });
  });
  await page.send('Fetch.enable', { patterns: [{ urlPattern: `${BUCKET}/*` }] });
  page.on('Fetch.requestPaused', (params) => {
    const request = params.request as {
      url: string;
      method: string;
      headers: Record<string, string>;
    };
    const local = new URL(request.url);
    const response = answer(
      new Request(`http://127.0.0.1${local.pathname}`, {
        method: request.method,
        headers: request.headers,
      }),
    );
    void response.arrayBuffer().then((body) =>
      page.send('Fetch.fulfillRequest', {
        requestId: params.requestId,
        responseCode: response.status,
        responseHeaders: [...response.headers].map(([name, value]) => ({ name, value })),
        body: Buffer.from(body).toString('base64'),
      }),
    );
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
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await page.evaluate<boolean>(`Boolean(${expression})`).catch(() => false)) return true;
    await Bun.sleep(20);
  }
  return false;
};

/** `path` opened as typed: its document's status, once it has loaded (and, with script, once the app is ready). */
const open = async (page: Page, path: string, script = true) => {
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
const tap = (page: Page, selector: string) =>
  page.evaluate<boolean>(
    `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.scrollIntoView({ block: 'center' }); el.click(); return true; })()`,
  );

/** The screen the page shows: its document title names it, the hymn's by its number. */
const screenOf = async (page: Page) =>
  page.evaluate<{ title: string; topic: string | null; notfound: boolean; path: string }>(
    `({ title: document.title, topic: document.querySelector('[data-testid="hymn-topic"]')?.textContent ?? null, notfound: Boolean(document.querySelector('[data-testid="notfound"]')), path: location.pathname })`,
  );

const titleOf = (n: number) => hymns.find((hymn) => hymn.number === n)?.title ?? '';

const addresses = async (page: Page) => {
  const started = Date.now();
  const wrong: Array<unknown> = [];
  for (const hymn of hymns) {
    const { status, ready } = await open(page, `/hymns/${hymn.number}`);
    const shown = await waitFor(
      page,
      `document.querySelector('[data-testid="hymn-topic"]')?.textContent?.startsWith(${JSON.stringify(`${hymn.number} · `)}) && document.querySelector('[data-testid="hymn-title"]')?.textContent === ${JSON.stringify(hymn.title)}`,
      5000,
    );
    if (status !== 200 || !ready || !shown) wrong.push({ n: hymn.number, status, ready, shown });
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
        ? `document.querySelector('[data-testid="hymn-topic"]')?.textContent?.startsWith('${place.number} · ')`
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

/** One load of `path`: bytes on the wire by kind and by file, and its times from navigation start. */
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
    `(() => { const n = performance.getEntriesByType('navigation')[0]; return { ...window.__web, response: n.responseEnd, dom: n.domContentLoadedEventEnd, load: n.loadEventEnd }; })()`,
  );
  const files = [...seen.values()].map((entry) => ({
    ...entry,
    kind: kindOf(entry.url, entry.type),
    file: entry.url.replace(origin, ''),
  }));
  const bytes: Record<string, number> = { html: 0, script: 0, css: 0, data: 0, wasm: 0 };
  for (const file of files) bytes[file.kind] = (bytes[file.kind] ?? 0) + file.bytes;
  return { bytes, total: Object.values(bytes).reduce((a, b) => a + b, 0), marks, files };
};

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
    }
  }
  report.measure = { load, throttled, measured, loads };
  console.log(JSON.stringify(measured, null, 1));
  if (throttled) {
    console.log('throttled (150 ms, 1.6 Mbit/s down): measured only, no budget');
    return;
  }
  const over: Array<string> = [];
  const timesChecked = load <= MAX_LOAD;
  for (const [key, values] of Object.entries(measured))
    for (const [name, value] of Object.entries(values)) {
      const limit = limits[key]?.[name];
      if (limit === undefined || (isTime(name) && !timesChecked)) continue;
      const allowed = allowedOver(name, limit);
      if (value > allowed) over.push(`${key} ${name} ${value} > ${Math.floor(allowed)}`);
    }
  check(
    `bytes and times within tools/web/budget.json + 10% (a time + ${TIME_SLACK_MS} ms at least) (times ${timesChecked ? 'checked' : `not checked: load ${load.toFixed(1)}`})`,
    limits['/ cold'] !== undefined && over.length === 0,
    over,
  );
};

/** The app's root is drawn in the dark scheme (`color-scheme=settingsScheme` in `app.contract`). */
const isDark = `getComputedStyle(document.querySelector('[data-testid="root"]') ?? document.documentElement).colorScheme === 'dark'`;

/** A light system on both launches, so a dark root after the reopen is the kept choice, not the system's. */
const LIGHT_SYSTEM = [{ name: 'prefers-color-scheme', value: 'light' }];

const returning = async () => {
  const profile = join(app, '.exact/web-return-profile');
  const first = await launchChrome(profile, true);
  await watch(first.page);
  await first.page.send('Emulation.setEmulatedMedia', { features: LIGHT_SYSTEM });
  const page = first.page;
  const trace: Array<unknown> = [];
  let firstPlayLost = 0;
  const step = async (name: string, done: Promise<unknown>) => trace.push([name, await done]);
  const has = (id: string) => `document.querySelector('[data-testid="${id}"]')`;
  const chips = `[...document.querySelectorAll('[data-testid="player"] [data-testid^="stanza-"]')].map((b) => b.getAttribute('aria-pressed'))`;
  /** Play pressed on hymn 2's page, the full player opened once the bar shows: its stanzas' chips. */
  const playerOf = async (on: Page) => {
    await step('play shown', waitFor(on, has('play'), 5000));
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
  const closed = await first.close();
  check(
    'Chrome closed as a person closes it (Browser.close), not stopped',
    closed === 'closed',
    closed,
  );
  const second = await launchChrome(profile, false);
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

const serverChild = await startServer();
try {
  if (checks.some((name) => name !== 'return')) {
    const chrome = await launchChrome(join(app, '.exact/web-drive-profile'), true);
    await watch(chrome.page);
    await chrome.page.send('Page.addScriptToEvaluateOnNewDocument', { source: MARKS });
    if (checks.includes('addresses')) await addresses(chrome.page);
    if (checks.includes('notfound')) await notFound(chrome.page);
    if (checks.includes('noscript')) await noScript(chrome.page);
    if (checks.includes('measure')) await measure(chrome.page);
    await chrome.close();
  }
  if (checks.includes('return')) await returning();
} finally {
  stop(serverChild);
}

const foreign = requests.filter(
  ({ url }) => !url.startsWith(origin) && !/^(data|blob):/u.test(url),
);
const beforePlay = foreign.filter(({ url, afterPlay }) => !afterPlay || !url.startsWith(BUCKET));
report.requests = {
  total: requests.length,
  foreign: foreign.length,
  bucketAnsweredByDrive: foreign.length - beforePlay.length,
};
check(
  `every request is the local server's, but the bucket after Play, answered by the drive (${requests.length} requests, ${foreign.length - beforePlay.length} to the bucket)`,
  beforePlay.length === 0,
  beforePlay.slice(0, 5),
);

const out = flag('--json');
if (out !== undefined) writeFileSync(out, `${JSON.stringify(report, null, 1)}\n`);
console.log(`${failed === 0 ? 'ok' : 'FAILED'}: drive-web (${server}), ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
