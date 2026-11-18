/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noThrowStatement, effect/noNewError, effect/noAsyncFunction, effect/noNullish, effect/noTernary, effect/noTryCatch, no-await-in-loop -- a host tool that serves a built web app from plain files with Bun and drives a headless Chromium through Playwright, step by step in order; a step that fails fails its cell, which is caught and named. */

/**
 * `pixel ref hymnal --web`: the hymnal's web references. The One web build
 * (`apps/hymnal`'s `one build`, its `dist`) is served from plain files on a
 * loopback port of the hymnal's reference range, and each web cell is taken
 * by one headless Chromium (`--use-mock-keychain`) at the cell's viewport,
 * scale and `prefers-color-scheme`, the row's fixture in `localStorage` as
 * One's web store keeps it (`One.Database.kv|hymnal|<key>`) before the page
 * loads, and its picture kept once two takes 500 ms apart are the same bytes.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { chromium, type Locator, type Page } from '@playwright/test';

import { storeOf } from './fixtures.ts';
import { cellName, cellsOf, viewportOf, type Cell, type Row, type Step } from './model.ts';
import { refFile } from './paths.ts';
import { isBlank } from './png.ts';
import type { Frame } from './ref.ts';

/** The loopback port the One web build is served on: the first of the hymnal's reference range after the dev server's. */
const PORT = 8261;

/** A file of `dist` for a request's path: the file itself, its `index.html`, its `.html`, else the root page. */
const fileFor = (dist: string, pathname: string) => {
  const clean = pathname.replace(/\/+$/, '');
  for (const candidate of [clean, `${clean}/index.html`, `${clean}.html`]) {
    const path = join(dist, candidate);
    if (path.startsWith(dist) && existsSync(path) && statSync(path).isFile()) return path;
  }
  return join(dist, 'index.html');
};

/** Serves `dist` as plain files until stopped. */
const serve = (dist: string) =>
  Bun.serve({
    port: PORT,
    hostname: '127.0.0.1',
    fetch: (request) => new Response(Bun.file(fileFor(dist, new URL(request.url).pathname))),
  });

/** The element a target names on the web: `id=` a test id, `label=` an accessible name or a text, whole. */
const locate = (page: Page, target: string): Locator => {
  const [kind, ...restOf] = target.split('=');
  const value = restOf.join('=');
  if (kind === 'id') return page.locator(`[data-testid="${value}"]`).first();
  return page
    .locator(`[aria-label="${value}"]`)
    .or(page.getByText(value, { exact: true }))
    .first();
};

const doStep = async (page: Page, base: string, step: Step) => {
  if ('open' in step) {
    await page.goto(`${base}/${step.open.replace(/^\//, '')}`, { waitUntil: 'networkidle' });
    if (step.expect === '') return page.waitForTimeout(1500);
    await locate(page, step.expect).waitFor({ timeout: 20_000 });
    return;
  }
  if ('tap' in step) return locate(page, step.tap).click({ timeout: 10_000 });
  if ('scroll' in step) {
    if (step.scroll === 'screen')
      return page.mouse.wheel(0, step.direction === 'down' ? 700 : -700);
    return locate(page, step.scroll).scrollIntoViewIfNeeded({ timeout: 10_000 });
  }
  if ('fill' in step) return locate(page, step.fill).fill(step.value, { timeout: 10_000 });
  if ('wait' in step) return page.waitForTimeout(step.wait);
  if ('back' in step) {
    await page.goBack();
    return;
  }
  throw new Error(`a step the web cannot take: ${JSON.stringify(step)}`);
};

/** The page once still: two takes 500 ms apart that are the same bytes, three tries. */
const stillShot = async (page: Page) => {
  for (let attempt = 0; attempt < 3; attempt++) {
    const first = await page.screenshot({ animations: 'disabled', caret: 'hide' });
    await page.waitForTimeout(500);
    const second = await page.screenshot({ animations: 'disabled', caret: 'hide' });
    if (first.equals(second)) return second;
    await page.waitForTimeout(700);
  }
  return undefined;
};

/** Takes the web cells of `rows`; the cells not taken, with their reasons. */
export const takeWeb = async (frame: Frame, rows: ReadonlyArray<Row>) => {
  const dist = join(frame.root, 'apps', 'hymnal', 'dist', 'client');
  if (!existsSync(dist))
    throw new Error(`no One web build at ${dist}: run \`bun run --cwd apps/hymnal build\``);
  const server = serve(dist);
  const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain'] });
  const missed: Array<readonly [string, string]> = [];
  const base = `http://127.0.0.1:${PORT}`;
  try {
    for (const row of rows) {
      const side = row.one;
      if (side === undefined) continue;
      for (const cell of cellsOf('hymnal', row).filter((each) => each.host === 'web')) {
        const name = cellName(cell);
        const reason = side.notDrawn?.web;
        if (reason !== undefined) {
          missed.push([name, `not drawn: ${reason}`]);
          continue;
        }
        const why = await takeCell(frame, browser, base, row, cell).catch((error: unknown) =>
          String(error instanceof Error ? error.message : error)
            .split('\n')[0]
            ?.slice(0, 300),
        );
        console.log(
          `${why === undefined ? 'took' : 'MISSED'} ${name}${why === undefined ? '' : `: ${why}`}`,
        );
        if (why !== undefined) missed.push([name, why]);
      }
    }
  } finally {
    await browser.close();
    await server.stop(true);
  }
  return missed;
};

const takeCell = async (
  frame: Frame,
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  base: string,
  row: Row,
  cell: Cell,
) => {
  const side = row.one;
  if (side === undefined) return 'no One side';
  const viewport = viewportOf(cell.size);
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.scale,
    colorScheme: cell.scheme,
    reducedMotion: 'reduce',
  });
  try {
    const fixture = row.fixture ?? 'hy-fresh';
    const store = storeOf('hymnal', fixture, new Date());
    const pairs = store?._tag === 'Pairs' ? store.pairs : [];
    await context.addInitScript((kv: ReadonlyArray<readonly [string, string]>) => {
      for (const [key, value] of kv) localStorage.setItem(`One.Database.kv|hymnal|${key}`, value);
    }, pairs);
    const page = await context.newPage();
    for (const step of side.web ?? side.steps) await doStep(page, base, step);
    if (side.hold !== undefined) {
      await locate(page, side.hold).hover();
      await page.mouse.down();
    }
    await page.waitForTimeout(400);
    const shot = await stillShot(page);
    if (side.hold !== undefined) await page.mouse.up();
    if (shot === undefined) return 'moving: no two takes 500 ms apart were the same bytes';
    if (isBlank(shot)) return 'blank: the page drew nothing';
    const file = refFile(frame, cell);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, shot);
    writeFileSync(
      file.replace(/\.png$/, '.json'),
      `${JSON.stringify(
        {
          cell: cellName(cell),
          one: frame.one,
          head: frame.head,
          fixture,
          capturedAt: new Date().toISOString(),
          browser: `chromium ${browser.version()}`,
          sha256: createHash('sha256').update(shot).digest('hex'),
        },
        null,
        2,
      )}\n`,
    );
    return undefined;
  } finally {
    await context.close();
  }
};
