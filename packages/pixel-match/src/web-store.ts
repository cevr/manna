/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noThrowStatement, effect/noNewError, effect/noAsyncFunction, effect/noAs, effect/noNullish, effect/noTryCatch, node/no-process-env -- a host tool that opens the agent's own Chrome profile for a named store through Playwright and Exact's launcher module at the pin, step by step in order; a browser that is not there is a broken host, said by a throw; the browser and the page's server are closed whether the writes pass or fail. */

/**
 * A row's fixture in the port's web store (`pixel shot --web`). On the web
 * a drive's named store (`--storage pm-<id>`) is a Chrome profile of
 * Exact's (`scripts/agent-launch.mjs` `webStore`: under the app's id and its
 * directory's digest), and a
 * persisted state lives in that page origin's `localStorage` under
 * `exact.state.@<the app directory's digest>/<name>` (a development build's
 * key, `host/web-js/rt.js` `Kept`). So the store is emptied as Exact empties
 * it (`removeDriveStore`), opened by the browser Exact drives with
 * (`chromium`), the states written on a page of the store's origin, and the
 * browser closed, which writes `localStorage` to the profile; the drive then
 * opens it with `--keep-storage`. Exact's own functions name the profile,
 * the port and the browser, so they are the pin's, never a copy of them.
 */

import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { chromium } from '@playwright/test';

/** The parts of Exact's `scripts/agent-launch.mjs` this module calls. */
interface ExactLaunch {
  readonly webStore: (
    app: { readonly id: string; readonly dir: string },
    storage: string,
  ) => { readonly base: string; readonly profile: string; readonly port: number };
  readonly appDigest: (dir: string) => string;
  readonly chromium: () => { readonly executable: string; readonly unavailable: string | null };
  readonly removeDriveStore: (
    store: { readonly base: string; readonly profile: string },
    storage: string,
  ) => Promise<void>;
}

/** The Exact clone the wrapper runs (`@manna/exact-kit`'s `EXACT`, else its default). */
const exactClone = () => process.env['EXACT'] ?? join(homedir(), 'Developer', 'vendor', 'exact');

/** A persisted state's `localStorage` key in a development build of the app whose directory has `digest`. */
export const keptKey = (digest: string, name: string) => `exact.state.@${digest}/${name}`;

/**
 * Empties the agent's web store `storage` of the app at `appDir` (id
 * `bundle`) and writes `states` into it, for the page served on `port`: a
 * page's `localStorage` is its origin's, and the wrapper serves each drive
 * on a port of the app's spare range, so the shot claims one port
 * (`@manna/exact-kit/port`) and both seeds and drives on it.
 */
export const writeWebStore = async (
  appDir: string,
  port: number,
  seed: {
    readonly storage: string;
    readonly bundle: string;
    readonly states: ReadonlyArray<readonly [string, string]>;
  },
) => {
  const exact = (await import(join(exactClone(), 'scripts', 'agent-launch.mjs'))) as ExactLaunch;
  const dir = realpathSync(appDir);
  const store = exact.webStore({ id: seed.bundle, dir }, seed.storage);
  const browser = exact.chromium();
  if (browser.unavailable !== null)
    throw new Error(`no browser for the web store: ${browser.unavailable}`);
  await exact.removeDriveStore(store, seed.storage);
  const digest = exact.appDigest(dir);
  const entries = seed.states.map(([name, text]) => [keptKey(digest, name), text] as const);
  const server = Bun.serve({
    port,
    hostname: '127.0.0.1',
    fetch: () =>
      new Response('<!doctype html><title>seed</title>', {
        headers: { 'content-type': 'text/html' },
      }),
  });
  try {
    const context = await chromium.launchPersistentContext(store.profile, {
      executablePath: browser.executable,
      headless: true,
      args: ['--use-mock-keychain', '--password-store=basic'],
    });
    try {
      const page = context.pages()[0] ?? (await context.newPage());
      await page.goto(`http://127.0.0.1:${port}/`);
      await page.evaluate((kv) => {
        for (const [key, value] of kv) localStorage.setItem(key, value);
      }, entries);
    } finally {
      await context.close();
    }
  } finally {
    await server.stop(true);
  }
  return entries;
};
