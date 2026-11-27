import { describe, expect, test } from 'bun:test';
import { Option, Predicate } from 'effect';
import { Testing } from 'oxlint-plugin-effect/rule-bindings';
import { type Node, parseSync, visitorKeys } from 'oxc-parser';
import { noBrowserSpawn } from './no-browser-spawn.ts';

/** Whether a value read off a node is a node: an object with a string `type`. */
const isNode = (value: unknown): value is Node =>
  Predicate.hasProperty(value, 'type') && Predicate.isString(value.type);

/** The child nodes of `node`, in source order, by the parser's own visitor keys. */
const childrenOf = (node: Node): ReadonlyArray<Node> =>
  (visitorKeys[node.type] ?? []).flatMap((key) => {
    const value: unknown = Reflect.get(node, key);
    if (Array.isArray(value)) return value.filter(isNode);
    return Option.toArray(Option.liftPredicate(value, isNode));
  });

/** Every node under `node`, outer first, each given its `parent` as oxlint gives it. */
const nodesOf = (node: Node): ReadonlyArray<Node> =>
  childrenOf(node).flatMap((child) => {
    Reflect.set(child, 'parent', node);
    return [child, ...nodesOf(child)];
  });

/** The node kinds the rule visits. */
const VISITED = new Set([
  'CallExpression',
  'TaggedTemplateExpression',
  'ImportDeclaration',
  'ImportExpression',
  'ExportNamedDeclaration',
  'ExportAllDeclaration',
]);

/** The rule's reports in `source`, run on the parser's tree as oxlint walks it, by the kind of node each names. */
const reportedIn = (source: string) => {
  const nodes = nodesOf(parseSync('drive.ts', source).program).filter((node) =>
    VISITED.has(node.type),
  );
  return Testing.runRuleMulti(
    noBrowserSpawn,
    nodes.map((node) => [node.type, node] as const),
    { filename: 'drive.ts', sourceText: source },
  );
};

/** How many reports the rule makes in `source`. */
const reportsIn = (source: string) => reportedIn(source).length;

describe('manna/no-browser-spawn', () => {
  test.each([
    ["Bun.spawn([chromePath(), '--headless=new', `--user-data-dir=${profile}`, 'about:blank'])"],
    ["Bun.spawn([path, '--remote-debugging-port=0', 'about:blank'], { detached: true })"],
    ["spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--version'])"],
    ['spawnSync(process.env.CHROME, [url])'],
    ["execFile(chromium.executablePath(), ['--headless', url])"],
    ["Bun.spawnSync([`${cache}/chromium-1255/chrome-linux64/chrome`, '--dump-dom', url])"],
    ['$`${browserBinary} --headless=new ${url}`'],
    ["const flags = ['--remote-debugging-pipe']; Bun.spawn([bin, ...flags, url])"],
    ["cp.exec('open -a Chromium ' + url)"],
  ])('a process started on a browser is reported: %s', (source) => {
    expect(reportsIn(source)).toBe(1);
  });

  test.each([
    ["Bun.spawn(['bun', 'run', 'exact', 'agent', 'web', '--port', `${port}`], { cwd: app })"],
    [
      "Bun.spawn(['bun', 'run', 'exact', 'serve', 'dist'], { env: { ...process.env, CHROME: shim } })",
    ],
    ["chromium.launchPersistentContext(profile, { headless: true, args: ['--mute-audio'] })"],
    ['chromium.launch({ executablePath: exact.chromium().executable, headless: true })'],
    ["spawn(['git', 'show', 'HEAD:apps/hymnal-exact/tools/web/browser.txt'])"],
    ['$`bun test ./src`'],
    ["page.evaluate('document.title')"],
    [
      "import { chromium } from '@playwright/test'; const context = await chromium.launchPersistentContext(profile, { headless: true });",
    ],
    [
      "import * as pw from '@playwright/test'; const browser = await pw.chromium.launch({ headless: true }); await browser.close();",
    ],
    ['const app = await launch(appDir); server.connect(port); webdriver.remote(url)'],
    ["export { chromium } from '@playwright/test'; export * from './drive.ts';"],
    ["import { createRequire } from 'node:module'; createRequire(import.meta.url)('playwright');"],
  ])('a process on no browser, or Playwright starting its own, is not reported: %s', (source) => {
    expect(reportsIn(source)).toBe(0);
  });

  test.each([
    [
      "import puppeteer from 'puppeteer-core'; await puppeteer.launch({ executablePath: path, headless: true });",
      2,
    ],
    [
      "import * as driver from 'puppeteer'; const browser = await driver.launch({ headless: true });",
      2,
    ],
    ["import { launch as go } from 'puppeteer-core'; await go({ headless: true });", 2],
    ["import { launch } from 'chrome-launcher'; await launch({ chromeFlags: [] });", 2],
    ["const puppeteer = require('puppeteer'); puppeteer.connect({ browserURL: url });", 2],
    ["const { launch: start } = await import('puppeteer'); await start();", 2],
    ["await (await import('puppeteer-core')).default.launch({ headless: true });", 2],
    ["import { remote } from 'webdriverio'; await remote({ capabilities });", 2],
    ["import { Builder } from 'selenium-webdriver'; new Builder().forBrowser('chrome');", 1],
    ["import type { Browser } from 'puppeteer-core/lib/types';", 1],
    ["export { default as driver } from 'puppeteer';", 1],
    ["export * from 'puppeteer-core';", 1],
    [
      "import { createRequire } from 'node:module'; createRequire(import.meta.url)('puppeteer');",
      1,
    ],
    [
      "import { createRequire } from 'node:module'; const load = createRequire(import.meta.url); const p = load('puppeteer-core'); await p.launch({});",
      2,
    ],
  ])(
    'a browser driver other than Playwright is reported, its import and each launch bound to it: %s',
    (source, reports) => {
      expect(reportsIn(source)).toBe(reports);
    },
  );

  test('a Puppeteer launch is reported at the launch call itself, aliased or namespaced', () => {
    const launches = reportedIn(
      "import * as driver from 'puppeteer-core'; import p from 'puppeteer'; await driver.launch({}); await p.launch({});",
    ).filter((report) =>
      Option.fromNullishOr(report.diagnostic.node).pipe(
        Option.exists((node) => Reflect.get(node, 'type') === 'CallExpression'),
      ),
    );
    expect(launches).toHaveLength(2);
  });
});
