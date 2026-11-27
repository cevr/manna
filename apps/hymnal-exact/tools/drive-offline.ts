/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noAsyncFunction, effect/noNewError, effect/noNullish, effect/noTernary, effect/noThrowStatement, effect/noTryCatch, effect/noAs, effect/noUnknownParameters, eslint/no-await-in-loop -- a host script that serves the built site and drives Playwright's headless Chromium on a kept profile, awaits each step in turn, reads the page's answers by the fields it checks and prints a named line per check; it never runs in the data module. */

/**
 * A saved hymn opened offline, on the web: the built site (`dist/`, `bun
 * run build:web`) served by the host's one rule (`tools/web/serve.ts`) to
 * Playwright's Chromium on a kept profile (`@manna/exact-kit/browser`), the
 * bucket answered by the recordings' fixture (`tools/recordings.ts`), its
 * silence labelled `audio/mpeg` as the bucket's recordings are, since a
 * release build saves only those, and refused once the page is offline. With
 * Sounds and haptics off and chords on, hymn 2 is opened and its chords
 * counted, the page rests until its recording is saved (Downloads says one
 * or more), and the browser is closed as a person closes it. Relaunched on
 * the same profile, the list is opened, the page goes offline and hymn 2 is
 * tapped:
 *
 * - (a) its stanza draws;
 *
 * then the leg named, `chords` (the default):
 *
 * - (b) as many chords draw as online, with no no-chords notice;
 * - (e) a swipe to hymn `NEIGHBOUR`, whose chords the pager read as hymn 2's
 *   neighbour, draws its chords;
 * - (d) hymn `NEVER`, whose chords file the first launch never asked for,
 *   shows the no-chords notice, and the page throws no error;
 *
 * or `play`:
 *
 * - (c) Play plays the saved recording, asking the bucket nothing.
 *
 * `bun tools/drive-offline.ts web [chords|play]`. Exits 1 on a failed
 * check, 2 when a step did not settle.
 */

import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { type Browser, type Page, launchBrowser } from '@manna/exact-kit/browser';
import { claimAppPort } from '@manna/exact-kit/port';

import { QUIET_STORED } from './quiet.ts';
import { answer } from './recordings.ts';
import { serveBuilt } from './web/serve.ts';

const host = process.argv[2] ?? 'web';
if (host !== 'web') {
  console.error(
    `drive-offline: the web only (Cache Storage and an offline page are the browser's), not ${host}`,
  );
  process.exit(2);
}
const leg = process.argv[3] ?? 'chords';
if (leg !== 'chords' && leg !== 'play') {
  console.error(`drive-offline: the legs are chords (the default) and play, not ${leg}`);
  process.exit(2);
}
const app = join(import.meta.dir, '..');
const dist = join(app, 'dist');
if (!existsSync(join(dist, '.exact-build.json'))) {
  console.error('drive-offline: no built site in dist/: bun run build:web first');
  process.exit(2);
}

const HYMN = 2;
const NEIGHBOUR = 3;
const NEVER = 5;
const BUCKET = 'https://hymns.cvr.im';
const port = (await claimAppPort(app, { label: 'drive-offline' })).port;
const site = serveBuilt(dist, port);
const origin = `http://127.0.0.1:${port}`;
const profile = join(app, '.exact/offline-profile');

let failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (!ok) failed += 1;
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${name}${detail === undefined ? '' : `: ${JSON.stringify(detail)}`}`,
  );
};

/** Every bucket request since the page went offline, and every error the page threw. */
const seen = {
  offline: false,
  bucketOffline: [] as Array<string>,
  errors: [] as Array<string>,
  chordFiles: [] as Array<string>,
};

/** The page's bucket requests answered by the fixture; its requests and errors noted. */
const watch = async (on: Page) => {
  on.page.on('request', (request) => {
    const url = request.url();
    if (seen.offline && url.startsWith(`${BUCKET}/`)) seen.bucketOffline.push(url);
    if (url.includes('/chords/'))
      seen.chordFiles.push(`${seen.offline ? 'offline' : 'online'} ${new URL(url).pathname}`);
  });
  on.page.on('pageerror', (error) => {
    seen.errors.push(String(error));
  });
  await on.send('Fetch.enable', { patterns: [{ urlPattern: `${BUCKET}/*` }] });
  on.on('Fetch.requestPaused', (params) => {
    const request = params.request as {
      url: string;
      method: string;
      headers: Record<string, string>;
    };
    if (seen.offline) {
      void on
        .send('Fetch.failRequest', {
          requestId: params.requestId,
          errorReason: 'InternetDisconnected',
        })
        .catch(() => {});
      return;
    }
    const reply = answer(
      new Request(`http://127.0.0.1${new URL(request.url).pathname}`, {
        method: request.method,
        headers: request.headers,
      }),
    );
    void reply
      .arrayBuffer()
      .then((body) =>
        on.send('Fetch.fulfillRequest', {
          requestId: params.requestId,
          responseCode: reply.status,
          responseHeaders: [...reply.headers].map(([name, value]) => ({
            name,
            value: name === 'content-type' && value.startsWith('audio/') ? 'audio/mpeg' : value,
          })),
          body: Buffer.from(body).toString('base64'),
        }),
      )
      .catch(() => {});
  });
};

let step = 'launch';
const waitFor = async (on: Page, name: string, expression: string, ms = 10_000) => {
  step = name;
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await on.evaluate<boolean>(`Boolean(${expression})`).catch(() => false)) return true;
    await Bun.sleep(50);
  }
  return false;
};
const settle = async (on: Page, name: string, expression: string, ms?: number) => {
  if (!(await waitFor(on, name, expression, ms))) throw new Error(`${name}: not in time`);
};
const open = async (on: Page, path: string) => {
  step = `open ${path}`;
  await on.page.goto(`${origin}${path}`, { waitUntil: 'load', timeout: 15_000 });
  await settle(on, `${path} ready`, 'globalThis.exact && globalThis.exact.ready === true');
};
const tap = async (on: Page, id: string) => {
  step = `tap ${id}`;
  const found = await on.evaluate<boolean>(
    `(() => { const el = document.querySelector('[data-testid="${id}"]'); if (!el) return false; el.scrollIntoView({ block: 'center' }); el.click(); return true; })()`,
  );
  if (!found) throw new Error(`no ${id} to tap`);
};
const page = `document.querySelector('[data-testid="hymn-page"]')`;
const chords = `(${page}?.querySelectorAll('[data-testid^="chord-"]').length ?? 0)`;
const notice = `Boolean(${page}?.querySelector('[data-testid="no-chords"]'))`;
const stanza = `Boolean(${page}?.querySelector('[data-testid="stanza-1"]'))`;
const shown = (n: number) =>
  `location.pathname === '/hymns/${n}' && ${page}?.querySelector('[data-testid="hymn-number"]')?.textContent === '${n}'`;
const audio = `document.querySelector('[data-testid="audio"]')`;

const launched: Array<Browser> = [];
const launch = async (fresh: boolean) => {
  step = `launch ${fresh ? 'fresh' : 'kept'}`;
  const browser = await launchBrowser(profile, fresh);
  launched.push(browser);
  await watch(browser.page);
  return browser;
};

let unsettled: string | undefined;
try {
  const first = await launch(true);
  const on = first.page;
  await open(on, '/settings');
  await tap(on, 'settings-feel');
  await settle(on, 'sounds and haptics off', QUIET_STORED, 3000);
  await tap(on, 'chords-toggle');
  await settle(
    on,
    'chords on',
    `document.querySelector('[data-testid="chords-toggle"]')?.getAttribute('aria-checked') === 'true'`,
    3000,
  );
  await open(on, `/hymns/${HYMN}`);
  await settle(on, `hymn ${HYMN}'s chords`, `${chords} > 0`);
  await Bun.sleep(500);
  const online = await on.evaluate<number>(chords);
  check(`online: hymn ${HYMN} draws its chords`, online > 0, { chords: online });
  await Bun.sleep(2500);
  await tap(on, 'hymn-back');
  await settle(
    on,
    'the list',
    `location.pathname === '/' && document.querySelector('[data-testid="gear"]')`,
  );
  await tap(on, 'gear');
  const saved = await waitFor(
    on,
    'a recording saved',
    `Number(document.querySelector('[data-testid="downloads-progress"]')?.getAttribute('aria-valuenow') ?? 0) >= 1`,
    15_000,
  );
  check(`online: hymn ${HYMN}'s recording saved (Downloads shows 1 or more)`, saved);
  step = 'close';
  const closed = await first.close();
  check('the browser closed as a person closes it', closed === 'closed', { closed });

  const second = await launch(false);
  const back = second.page;
  await open(back, '/');
  await settle(back, `row hymn-${HYMN}`, `document.querySelector('[data-testid="hymn-${HYMN}"]')`);
  step = 'offline';
  await back.page.context().setOffline(true);
  seen.offline = true;
  await settle(back, 'the page offline', '!navigator.onLine', 6000);
  await tap(back, `hymn-${HYMN}`);
  await settle(back, `hymn ${HYMN} shown offline`, shown(HYMN));
  check(
    `(a) offline: hymn ${HYMN}'s stanza draws`,
    await waitFor(back, 'stanza offline', stanza, 8000),
  );
  if (leg === 'play') await played(back);
  else await chordsKept(back, online);
} catch (error) {
  unsettled = `${step}: ${error instanceof Error ? error.message : String(error)}`;
  check(`the drive ran to its end (it stopped at ${step})`, false, unsettled);
} finally {
  for (const browser of launched) await browser.close().catch(() => 'stopped');
  void site.stop(true);
  rmSync(profile, { recursive: true, force: true });
}
console.log(
  failed === 0
    ? `drive-offline ${leg}: every check passed`
    : `drive-offline ${leg}: ${failed} failed`,
);
process.exit(unsettled !== undefined ? 2 : failed === 0 ? 0 : 1);

/** (b), (e) and (d): hymn 2's chords kept, its neighbour's kept, a hymn never read told so. */
async function chordsKept(back: Page, online: number) {
  const drawn = await waitFor(back, 'chords offline', `${chords} >= ${online}`, 6000);
  const count = await back.evaluate<number>(chords);
  const told = await back.evaluate<boolean>(notice);
  check(
    `(b) offline: hymn ${HYMN} draws as many chords as online (${online}), with no no-chords notice`,
    drawn && count === online && !told,
    { online, offline: count, notice: told },
  );
  step = `swipe to hymn ${NEIGHBOUR}`;
  const port = await back.page.getByTestId('hymn-pager').boundingBox();
  if (port === null) throw new Error('no hymn-pager to swipe');
  await back.page.mouse.move(port.x + port.width / 2, port.y + port.height / 2);
  await back.page.mouse.wheel(port.width, 0);
  const swiped = await waitFor(back, `hymn ${NEIGHBOUR} shown offline`, shown(NEIGHBOUR), 8000);
  const near =
    swiped &&
    (await waitFor(
      back,
      `hymn ${NEIGHBOUR}'s chords offline`,
      `${chords} > 0 && !${notice}`,
      6000,
    ));
  check(
    `(e) offline: a swipe to hymn ${NEIGHBOUR}, read as hymn ${HYMN}'s neighbour, draws its chords`,
    near,
    {
      swiped,
      chords: await back.evaluate<number>(chords),
    },
  );
  await tap(back, 'hymn-back');
  await settle(
    back,
    `row hymn-${NEVER}`,
    `location.pathname === '/' && document.querySelector('[data-testid="hymn-${NEVER}"]')`,
  );
  await tap(back, `hymn-${NEVER}`);
  await settle(back, `hymn ${NEVER} shown offline`, shown(NEVER));
  const quiet = await waitFor(back, `hymn ${NEVER}'s notice`, `${stanza} && ${notice}`, 8000);
  const none = await back.evaluate<number>(chords);
  const read = seen.chordFiles.includes(`online /modules/chords/${NEVER}.js`);
  check(
    `(d) offline: hymn ${NEVER}, whose chords were never read, shows the no-chords notice and no error`,
    !read && quiet && none === 0 && seen.errors.length === 0,
    { readOnline: read, notice: quiet, chords: none, errors: seen.errors },
  );
}

/** (c): Play on hymn 2 offline sounds its saved recording, asking the bucket nothing. */
async function played(back: Page) {
  await settle(back, 'play shown', `document.querySelector('[data-testid="play"]')`, 5000);
  await tap(back, 'play');
  if (
    !(await waitFor(back, 'the bar', `document.querySelector('[data-testid="bar-title"]')`, 4000))
  )
    await tap(back, 'play');
  const playing = await waitFor(
    back,
    'saved recording plays',
    `${audio} && !${audio}.paused && ${audio}.currentTime > 0`,
    10_000,
  );
  const state = await back.evaluate<unknown>(
    `({ src: (${audio}?.currentSrc ?? '').slice(0, 40), paused: ${audio}?.paused, at: ${audio}?.currentTime, ready: ${audio}?.readyState, error: ${audio}?.error?.code ?? null, loading: Boolean(document.querySelector('[data-testid="bar-loading"]')) })`,
  );
  const src = (state as { src: string }).src;
  check(
    '(c) offline: Play plays the saved recording, asking the bucket nothing',
    playing && !src.startsWith(BUCKET) && seen.bucketOffline.length === 0,
    { playing, state, bucket: seen.bucketOffline },
  );
}
