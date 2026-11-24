/* oxlint-disable effect/noNewError, effect/noUnsafeDictionaryType -- a host tool that opens Chrome through Playwright on a profile folder and speaks the DevTools protocol on Playwright's own session to its page, whose messages' parameters are each method's own JSON; no Exact driver is attached, and it never runs in a data module. */

/**
 * The browser of a port's web drive, with no Exact driver attached:
 * Playwright's Chromium (`channel: 'chromium'`, the Chrome for Testing
 * build `@playwright/test` pins, in its new headless mode) on a persistent
 * profile folder, 430×932, audio muted, one page, with no media feature
 * emulated (Playwright's default emulation of the colour scheme, reduced
 * motion, forced colours and contrast cost every load about 40-50 ms,
 * measured; a drive that wants one sets it with `emulateMedia`). Playwright starts the
 * browser, passes its keychain flags and stops it when the drive's process
 * ends; no tool of ours starts a browser binary itself
 * (`manna/no-browser-spawn`). A drive reads the network through the
 * DevTools protocol on Playwright's own session to the page
 * (`newCDPSession`): the bytes on the wire (`encodedDataLength`), the cache
 * cleared, a file blocked, held or failed (`Fetch`, which leaves the HTTP
 * cache on, where `page.route` turns it off), and script turned off.
 * `close` closes the context, which asks Chrome to close (`Browser.close`),
 * so it writes what it holds to the profile as a person's closing it does.
 * A call the browser does not answer in `CALL_MS` rejects with its method
 * named, so a dead or stuck browser fails the drive instead of hanging it.
 * It lives here, outside the app folders, because Exact's type check stages
 * the declarations of every package a file in an app folder imports, and
 * Playwright's would join every port's.
 */

import { rmSync } from 'node:fs';

import { type BrowserContext, type Page as PlaywrightPage, chromium } from '@playwright/test';

type Listener = (params: Record<string, unknown>) => void;

/** How long a call waits for the browser's answer before it rejects, naming its method. */
export const CALL_MS = 30_000;

/** The size of a phone held upright, the page's viewport. */
const VIEWPORT = { width: 430, height: 932 } as const;

/** `call`, rejected naming `what` when it has not settled in `CALL_MS`. */
const bounded = <T>(what: string, call: Promise<T>): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${what} got no answer from the browser in ${CALL_MS / 1000} s`)),
      CALL_MS,
    );
  });
  return Promise.race([call, late]).finally(() => clearTimeout(timer));
};

export interface Page {
  /** The page as Playwright drives it: its navigation, its pointer, its events. */
  readonly page: PlaywrightPage;
  /** A DevTools protocol method on Playwright's session to the page. */
  readonly send: (
    method: string,
    params?: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  /** A DevTools protocol event on that session; the call it returns stops listening. */
  readonly on: (event: string, listener: Listener) => () => void;
  /** The value of `expression` in the page, awaited. */
  readonly evaluate: <T>(expression: string) => Promise<T>;
}

export interface Browser {
  readonly page: Page;
  /** The browser's version, as Playwright reports it. */
  readonly version: string;
  /** `closed` when the browser closed within 10 s of being asked, else `stopped`: Playwright stops it at the drive's exit. */
  readonly close: () => Promise<'closed' | 'stopped'>;
}

/** The browser on `profile` (made fresh when `fresh`), with one page open on `about:blank` and the page's `Page` and `Network` domains on. */
export const launchBrowser = async (profile: string, fresh: boolean): Promise<Browser> => {
  if (fresh) rmSync(profile, { recursive: true, force: true });
  const context: BrowserContext = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    viewport: VIEWPORT,
    colorScheme: null,
    reducedMotion: null,
    forcedColors: null,
    contrast: null,
    args: ['--mute-audio'],
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
  });
  const playwrightPage = context.pages()[0] ?? (await context.newPage());
  const session = await context.newCDPSession(playwrightPage);
  const page: Page = {
    page: playwrightPage,
    send: (method, params) =>
      bounded(
        method,
        session.send(method as 'Runtime.evaluate', params as never) as Promise<
          Record<string, unknown>
        >,
      ),
    on: (event, listener) => {
      const handler = (params?: Record<string, unknown>) => listener(params ?? {});
      session.on(event as 'Network.requestWillBeSent', handler);
      return () => {
        session.off(event as 'Network.requestWillBeSent', handler);
      };
    },
    evaluate: <T>(expression: string) =>
      bounded(`evaluate ${expression.slice(0, 80)}`, playwrightPage.evaluate<T>(expression)),
  };
  await Promise.all(['Page.enable', 'Network.enable'].map((method) => page.send(method)));
  const version = context.browser()?.version() ?? 'unknown';
  const close = async (): Promise<'closed' | 'stopped'> => {
    const ended = await Promise.race([
      context.close().then(
        () => true,
        () => true,
      ),
      Bun.sleep(10_000).then(() => false),
    ]);
    if (ended) return 'closed';
    return 'stopped';
  };
  return { page, version, close };
};
