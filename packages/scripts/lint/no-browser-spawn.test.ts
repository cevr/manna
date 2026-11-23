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

/** How many process starts the rule reports in `source`, run on the parser's tree as oxlint walks it. */
const reportsIn = (source: string) => {
  const nodes = nodesOf(parseSync('drive.ts', source).program);
  return Testing.runRuleMulti(
    noBrowserSpawn,
    nodes
      .filter((node) => node.type === 'CallExpression' || node.type === 'TaggedTemplateExpression')
      .map((node) => [node.type, node] as const),
    { filename: 'drive.ts', sourceText: source },
  ).length;
};

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
  ])('a process on no browser, or Playwright starting its own, is not reported: %s', (source) => {
    expect(reportsIn(source)).toBe(0);
  });
});
