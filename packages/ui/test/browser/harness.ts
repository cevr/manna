import { afterAll, afterEach, beforeAll } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import { transform } from '@solidjs/compiler';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import type { BunPlugin } from 'bun';

import type * as ServerEntry from './server.ts';

const THROTTLE = ((written: string): number => {
  const rate = Number(written);
  if (!Number.isFinite(rate) || rate < 1)
    throw new Error(`UI_BROWSER_CPU_THROTTLE is ${JSON.stringify(written)}: a rate of 1 or more`);
  return rate;
})(process.env['UI_BROWSER_CPU_THROTTLE'] ?? '1');

const SILENT = [
  '--mute-audio',
  '--disable-audio-output',
  '--overscroll-history-navigation=0',
  '--pull-to-refresh=0',
];

interface SolidOptions {
  readonly generate: 'dom' | 'ssr';
  readonly hydratable: boolean;
  readonly fixtureFile?: string | undefined;
}

const solid = (options: SolidOptions): BunPlugin => ({
  name: `solid-${options.generate}`,
  setup(build) {
    const { fixtureFile } = options;
    if (fixtureFile !== undefined) {
      build.onResolve({ filter: /fixtures\/index\.ts$/ }, () => ({ path: fixtureFile }));
    }
    build.onLoad({ filter: /\.tsx$/ }, async (args) => {
      const code = await Bun.file(args.path).text();
      const out = transform(code, {
        filename: args.path,
        generate: options.generate,
        hydratable: options.hydratable,
        moduleName: '@solidjs/web',
      });
      return { contents: out.code, loader: 'ts' };
    });
  },
});

const bundle = async (fixtureFile: string, hydratable: boolean): Promise<string> => {
  const output = await Bun.build({
    entrypoints: [`${import.meta.dir}/client.tsx`],
    plugins: [solid({ generate: 'dom', hydratable, fixtureFile })],
    target: 'browser',
    conditions: ['browser', 'development'],
  });
  const [script] = output.outputs;
  if (!output.success || !script) {
    throw new Error(output.logs.map(String).join('\n'));
  }
  return script.text();
};

export interface ServerBuild<Module> {
  readonly module: Module;
  readonly dispose: () => Promise<void>;
}

export const buildServer = async <Module>(
  entry: string,
  fixtureFile?: string,
): Promise<ServerBuild<Module>> => {
  const outdir = await mkdtemp(`${tmpdir()}/ui-server-`);
  const dispose = () => rm(outdir, { recursive: true, force: true });
  const output = await Bun.build({
    entrypoints: [entry],
    plugins: [solid({ generate: 'ssr', hydratable: true, fixtureFile })],
    target: 'bun',
    outdir,
  });
  const [built] = output.outputs;
  if (!output.success || !built) {
    await dispose();
    throw new Error(output.logs.map(String).join('\n'));
  }
  const module: Module = await import(built.path);
  return { module, dispose };
};

const page = (head: string, served: string | undefined): string => `<!doctype html>
<html><head><meta charset="utf-8"><title>ui</title>
<style>
  body { margin: 0; font: 14px sans-serif; }
  /* A host page's own overscroll gestures (pull to refresh, swipe back) reload or leave the page under
     a test. */
  html { overscroll-behavior: none; }
  [hidden] { display: none !important; }
</style>${head}</head>
<body>${served === undefined ? '<div id="root"></div>' : `<div id="root" data-served>${served}</div>`}<script type="module" src="/client.js"></script></body></html>`;

export interface HarnessOptions {
  readonly hydrate?: boolean;
}

export interface Harness {
  open(fixture: string, options?: OpenOptions): Promise<Page>;
}

export interface OpenOptions {
  readonly query?: Record<string, string>;
  readonly touch?: boolean;
  readonly viewport?: { width: number; height: number };
  readonly scrollbars?: boolean;
  readonly platform?: string;
  readonly engine?: 'webkit';
  readonly deviceWidth?: boolean;
}

export const harness = (fixtureFile: string, options: HarnessOptions = {}): Harness => {
  const hydrate = options.hydrate ?? false;
  let server: ReturnType<typeof Bun.serve> | undefined;
  let serverBuild: ServerBuild<typeof ServerEntry> | undefined;
  let browser: Browser | undefined;
  let scrollbarBrowser: Promise<Browser> | undefined;
  let contexts: Array<BrowserContext> = [];
  let problems: Array<string> = [];

  beforeAll(async () => {
    const fixturePath = `${import.meta.dir}/fixtures/${fixtureFile}`;
    const script = await bundle(fixturePath, hydrate);
    if (hydrate) {
      serverBuild = await buildServer(`${import.meta.dir}/server.ts`, fixturePath);
    }
    const render = serverBuild?.module.render;
    server = Bun.serve({
      port: 0,
      fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === '/client.js') {
          return new Response(script, { headers: { 'content-type': 'text/javascript' } });
        }
        const rendered = render?.(url.searchParams.get('fixture') ?? '');
        return new Response(page(rendered?.head ?? '', rendered?.html), {
          headers: { 'content-type': 'text/html;charset=utf-8' },
        });
      },
    });
    browser = await chromium.launch({ channel: 'chromium', args: SILENT });
  });

  afterEach(async () => {
    const closing = contexts;
    contexts = [];
    await Promise.all(closing.map((context) => context.close()));
    const found = problems;
    problems = [];
    if (found.length > 0) {
      throw new Error(`the page reported problems:\n${found.join('\n')}`);
    }
  });

  afterAll(async () => {
    await browser?.close();
    await (await scrollbarBrowser)?.close();
    await server?.stop(true);
    await serverBuild?.dispose();
  });

  return {
    async open(fixture, options = {}) {
      if (!browser || !server) {
        throw new Error('harness: open a fixture inside a case');
      }
      if (options.scrollbars) {
        scrollbarBrowser ??= chromium.launch({
          args: SILENT,
          ignoreDefaultArgs: ['--hide-scrollbars'],
        });
      }
      const from = options.scrollbars ? await scrollbarBrowser! : browser;
      const context = await from.newContext({
        hasTouch: options.touch ?? false,
        isMobile: options.touch ?? false,
        viewport: options.viewport ?? { width: 800, height: 600 },
      });
      contexts.push(context);
      if (options.platform !== undefined) {
        await context.addInitScript((platform) => {
          Object.defineProperty(Navigator.prototype, 'platform', { get: () => platform });
        }, options.platform);
      }
      if (options.engine === 'webkit') {
        await context.addInitScript(() => {
          const supports = CSS.supports.bind(CSS) as (...args: Array<string>) => boolean;
          CSS.supports = ((...args: Array<string>) =>
            args.join(' ').replace(/\s/g, '') === '-webkit-backdrop-filter:none' ||
            supports(...args)) as typeof CSS.supports;
        });
      }
      if (options.deviceWidth) {
        await context.addInitScript(() => {
          document.addEventListener('DOMContentLoaded', () => {
            const meta = document.createElement('meta');
            meta.name = 'viewport';
            meta.content = 'width=device-width';
            document.head.append(meta);
          });
        });
      }
      const page = await context.newPage();
      page.setDefaultTimeout(5000);
      if (THROTTLE > 1) {
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
      }
      page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
      page.on('console', (message) => {
        const type = message.type();
        if (type === 'error' || type === 'warning') {
          problems.push(`console.${type}: ${message.text()}`);
        }
      });
      const query = new URLSearchParams({ fixture, ...options.query });
      await page.goto(`${server.url.origin}/?${query}`);
      await page
        .locator('#root[data-mounted]')
        .waitFor({ state: 'attached', timeout: 5000 })
        .catch((error: unknown) => {
          throw new Error(
            `fixture ${fixture} did not mount: ${String(error)}\n${problems.join('\n')}`,
          );
        });
      return page;
    },
  };
};

export const logOf = (page: Page): Promise<Array<string>> =>
  page.evaluate(() => (window as unknown as { __log: Array<string> }).__log);

export const servedOf = (page: Page): Promise<string> =>
  page.evaluate(() => (window as unknown as { __served: string }).__served);

export const focused = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!el) {
      return '';
    }
    return el.id || el.getAttribute('data-testid') || el.tagName.toLowerCase();
  });

export const recordTransitions = (page: Page): Promise<void> =>
  page.evaluate(() => {
    document.addEventListener(
      'transitionrun',
      (event) => {
        const target = event.target as Element;
        const name = target.id || target.getAttribute('data-testid') || target.tagName;
        (window as unknown as { __log: Array<string> }).__log.push(
          `transition ${name} ${event.propertyName}`,
        );
      },
      true,
    );
  });

export const scriptClick = (page: Page, selector: string): Promise<void> =>
  page.evaluate((target) => {
    setTimeout(() => (document.querySelector(target) as HTMLElement).click());
  }, selector);
