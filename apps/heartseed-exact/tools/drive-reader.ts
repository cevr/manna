/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noAsyncFunction, effect/noNullish, effect/noTernary, effect/noAs, effect/noNewPromise, node/no-process-env, eslint/no-await-in-loop -- a host script: it runs the reader's other drives as children, starts the packs' fixture and a stand-in for egw.cvr.im in process groups and a server of its own, drives the built app through `bun run exact agent` (`makeDrive`), reads the agent's untyped JSON replies by the fields it checks, and prints what it found. */

/**
 * The reader's batch check (the plan's table, "The batch check"), on the
 * host named (`bun tools/drive-reader.ts web|ios [live]`), light and dark,
 * shots in SHOTS (default `.exact/shots`). Each row is its own drive's
 * checks run as a child, or a run here:
 *
 * - Psalm 119 at the worst settings, a size step's time, the Aa sheet
 *   kept up, Reduce Motion on the sheet, the font and settings kept across
 *   a relaunch: `tools/drive-type.ts`;
 * - the chapter: opened on a verse, the place kept across a relaunch,
 *   colours at AA light and dark: `tools/drive-chapter.ts`;
 * - the download and its failures (a first fetch, kept, `304`, a new
 *   version, refused, `500`, cut short, a wrong sum, a failed update
 *   leaving the old notes): `tools/drive-commentary.ts`;
 * - the study packs fetched once and read offline after, find included:
 *   `tools/drive-studydata.ts`;
 * - the sheet, the long press, the hint, OpenDyslexic, the largest text,
 *   Reduce Motion on the sheet: `tools/drive-study.ts`;
 * - every motion's reduced arm: `tools/drive-motion.ts`;
 * - here: the longest lexicon entry (found by length in the assets, never
 *   named) folds, opens whole, scrolls to its end, clips nothing at the
 *   largest text; John 1:14's commentary from a stand-in pack of 18
 *   made-up notes of 7,281 characters, each folded, the first opened
 *   whole; before any pack (a closed loopback named as the fixture), the
 *   chapter reads and each tab says its pack is on its way; once the
 *   packs land, their line at the largest text leaves the chapter its
 *   room; the sheet's text at AA on its ground, light and dark,
 *   from pixels; the journey (Today's book button to Practise it now); the
 *   data module's load and the app's size;
 * - `live` (iOS, once): a plain launch downloads the real packs from
 *   egw.cvr.im and John 1:14 has at least 10 notes.
 *
 * No verse, definition or note text is printed: checks read counts,
 * lengths, numbers and frames. Exits 1 on any failed row.
 */

import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { makeDrive } from '@manna/exact-kit/drive';

import { contrast } from '../src/look/brand';
import { baseOf } from '../src/packs/sources';
import { fixturePacks } from './commentary-fixture';
import { readPng, pixelAt } from './png';
import { clipsOf, FETCH, goTo, SETTLE, script, startPacks, type Laid } from './drive-study';

const host = process.argv[2] ?? 'web';
const live = process.argv[3] === 'live';
const native = host === 'ios';
const app = join(import.meta.dir, '..');
const shots = process.env.SHOTS ?? join(app, '.exact/shots');
mkdirSync(shots, { recursive: true });
const shot = (scene: string, scheme: string) =>
  join(shots, `reader-${host}-${scene}-${scheme}.png`);

/** One of the reader's drives as a child, its own lines kept to its PASS/FAIL summary. */
const child = async (name: string, ...args: string[]) => {
  const run = Bun.spawn(['bun', join(import.meta.dir, name), host, ...args], {
    cwd: app,
    env: { ...process.env, SHOTS: shots, TYPE_SHOTS: shots },
    stdout: 'pipe',
    stderr: 'pipe',
    detached: true,
  });
  const [out, , code] = await Promise.all([
    new Response(run.stdout).text(),
    new Response(run.stderr).text(),
    run.exited,
  ]);
  const lines = out.split('\n');
  const failed = lines.filter((line) => line.startsWith('FAIL')).map((line) => line.slice(0, 300));
  const passed = lines.filter((line) => line.startsWith('PASS')).length;
  return { code, passed, failed };
};

const results: Array<{ name: string; ok: boolean; got: unknown }> = [];
/** `READER_CHILDREN=0` runs this file's own rows alone, while one is being mended. */
const children =
  process.env.READER_CHILDREN === '0'
    ? []
    : [
        ['drive-type.ts'],
        ['drive-chapter.ts'],
        ['drive-commentary.ts'],
        ['drive-studydata.ts'],
        ['drive-study.ts'],
        ['drive-motion.ts'],
        ...(live ? [['drive-commentary.ts', 'live']] : []),
      ];
for (const [name = '', ...args] of children) {
  const ran = await child(name, ...args);
  results.push({
    name: `${name}${args.length > 0 ? ` ${args.join(' ')}` : ''}: every check passes (${ran.passed} passed)`,
    ok: ran.code === 0 && ran.failed.length === 0,
    got: ran.failed,
  });
}

/** 18 made-up notes for John 1:14, 7,281 characters in all, every one long enough to fold. */
const LONG_NOTES = 18;
const LONG_CHARACTERS = 7281;
const longLengths = () => {
  const lengths = Array.from({ length: LONG_NOTES }, (_, index) =>
    index === 0 ? 900 : 260 + ((index * 37) % 160),
  );
  const rest = LONG_CHARACTERS - lengths.slice(0, -1).reduce((sum, each) => sum + each, 0);
  return [...lengths.slice(0, -1), rest];
};
const made = (length: number, seed: number) => {
  const syllables = ['ka', 'lo', 'mi', 'ten', 'sar', 'vu', 'pel', 'dro'];
  let text = '';
  for (let at = seed; text.length < length; at++) text += `${syllables[at % syllables.length]} `;
  return text.slice(0, length);
};

await fixturePacks();
const { packOf, bodyOf } = await import('../src/test/commentary-packs');
const longPack = packOf(
  longLengths().map((length, index) => [`1BC ${1100 + index}.1`, made(length, index)] as const),
  { '43.1': [[14, Array.from({ length: LONG_NOTES }, (_, index) => index)]] },
);

const packs = await startPacks(60);
/** egw.cvr.im as this row meets it: the long commentary pack, and every other path the fixture's. */
const standIn = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  fetch: async (request) => {
    const url = new URL(request.url);
    const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'etag' };
    if (url.pathname === '/api/commentary/pack') {
      if (request.method === 'OPTIONS')
        return new Response(null, {
          status: 204,
          headers: { ...cors, 'access-control-allow-headers': 'if-none-match, content-type' },
        });
      const etag = `"${longPack.version}"`;
      if (request.headers.get('if-none-match') === etag)
        return new Response(null, { status: 304, headers: { ...cors, etag } });
      return new Response(bodyOf(longPack), {
        headers: { ...cors, etag, 'content-type': 'application/json' },
      });
    }
    return fetch(`${packs.origin}${url.pathname}`, {
      method: request.method,
      headers: request.headers,
    });
  },
});
packs.named(`http://127.0.0.1:${standIn.port}`);

const drive = makeDrive({
  name: 'drive-reader',
  host,
  appDir: app,
  processes: packs.processes,
  timeoutMs: native ? 45 * 60 * 1000 : undefined,
});
const flags = native ? ['--touch', 'platform'] : ['--port', '8772', '--size', '390x844'];
const store = `reader-${host}-${Date.now().toString(36)}`;

/** The longest definition's number and a verse carrying it, with that word's place among the verse's shown words. */
const longestPlace = async () => {
  const { assetLexicon, assetWords } = await import('./study');
  const { appSource } = await import('../src/test/study-assets');
  const { buildTags } = await import('../src/study/build');
  const { studyPackOf } = await import('../src/study/pack');
  const { wordsRead } = await import('../src/study/read');
  const lexicon = assetLexicon();
  const longest = lexicon.reduce((a, b) => (b.def.length > a.def.length ? b : a));
  const words = assetWords();
  const source = appSource();
  const bare = Number(longest.number.slice(1));
  const testament = (key: string) => (Number(key.split('.')[0]) <= 39 ? 'H' : 'G');
  const key =
    [...words].find(
      ([at, verse]) =>
        testament(at) === longest.number[0] &&
        verse.some((word) => word.numbers.some((n) => Number(n) === bare)),
    )?.[0] ?? '';
  const [book = 0, chapter = 0, verse = 0] = key.split('.').map(Number);
  const index = source.canon.findIndex(([b, c]) => b === book && c === chapter);
  const parts = Array.from({ length: source.canon.length }, () => '');
  parts[index] =
    buildTags({ ...source, words: (at) => words.get(at) }, index, index + 1).parts[0] ?? '';
  const read = wordsRead(studyPackOf(parts), book, chapter, verse);
  const word = read.words.findIndex((each) => each.numbers.includes(longest.number));
  return { number: longest.number, length: longest.def.length, book, chapter, verse, word };
};
const longest = await longestPlace();

const s = script();
const both = (scene: string) => {
  s.step('prefer prefers-color-scheme dark', 'clock settle', `screenshot ${shot(scene, 'dark')}`);
  s.step('prefer prefers-color-scheme light', 'clock settle', `screenshot ${shot(scene, 'light')}`);
};
const frames = (...ids: string[]) => ids.map((id) => s.step(`layout ${id}`));
/**
 * A loopback address no server answers: a port the system hands out, closed again at once. It names a loopback
 * fixture by the form `baseOf` reads (a port of two to five digits), else the launch would fetch egw.cvr.im.
 */
const closedBase = () => {
  const held = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response(null) });
  const base = `http://127.0.0.1:${held.port}`;
  void held.stop(true);
  return base;
};
const refused = closedBase();
const o = script();
o.step(...SETTLE, 'tap tab-read', ...SETTLE, ...goTo(43, 3), 'tap verse-16', ...SETTLE);
const before = { bar: o.step('state studyBarShown'), sheet: 0, retry: 0 };
o.step('tap study-xrefs', ...SETTLE);
before.sheet = o.step('state studySheetShown');
before.retry = o.step('state packsShown.retry');
packs.named(refused);
const offline = await drive.run(
  [...flags, '--storage', `${store}-offline`, '--reset-storage'],
  o.ops,
);
packs.named(`http://127.0.0.1:${standIn.port}`);
drive.check(
  'offline: the launch names a loopback no server answers, in the form the app reads as a fixture',
  baseOf(refused) === refused &&
    !(await fetch(refused).then(
      () => true,
      () => false,
    )),
  refused,
);

/** The Read tab's first showing fetches the packs; once they land, the landed line is up for its 3 seconds, here at the largest text. */
const c = script();
c.step(
  ...SETTLE,
  'prefer root-font-size 53',
  'tap tab-read',
  'clock until state packsShown.phase == "ready" within 5000',
  ...SETTLE,
);
const crowded = {
  foot: c.step('state packsShown.foot'),
  chapter: c.step('layout chapter-scroll'),
  line: c.step('layout packs-line'),
};
const landed = await drive.run(
  [...flags, '--storage', `${store}-landed`, '--reset-storage'],
  c.ops,
);
const crowdedFrame = (at: number) => (landed[at] as Laid | undefined)?.node?.space?.viewport;
const seen =
  (landed[crowded.chapter] as { viewport?: { h?: number } } | undefined)?.viewport?.h ?? Number.NaN;
drive.check(
  'packs just landed, at the largest text: their line shows, and the chapter keeps a quarter of the screen or more',
  (landed[crowded.foot] ?? '') !== '' &&
    crowdedFrame(crowded.line) !== undefined &&
    (crowdedFrame(crowded.chapter)?.h ?? 0) >= seen / 4,
  {
    foot: (landed[crowded.foot] ?? '') === '' ? 'none' : 'shown',
    line: crowdedFrame(crowded.line),
    chapter: crowdedFrame(crowded.chapter),
    seen,
  },
);
const reading = offline[before.sheet] as { xrefsLine?: string; xrefs?: unknown[] } | undefined;
const barBefore = (
  offline[before.bar] as { verses?: Array<{ verse: number; buttons: Array<{ line: string }> }> }
)?.verses?.find((v) => v.verse === 16)?.buttons;
drive.check(
  'offline from the first launch: the chapter reads, Words says its language, Cross-refs says it is on its way, with Try again',
  barBefore?.[1]?.line === 'Greek' &&
    reading?.xrefs?.length === 0 &&
    (reading.xrefsLine ?? '') !== '' &&
    offline[before.retry] === true,
  { lines: barBefore?.map((b) => b.line), rows: reading?.xrefs?.length },
);

s.step('prefer prefers-color-scheme light', 'clock settle', ...FETCH);
const logs = s.step('logs');
s.step(...goTo(43, 1), 'tap verse-14', ...SETTLE, 'tap study-commentary', ...SETTLE);
const notes = s.step('state studySheetShown');
const noteFolded = frames('study-note-0');
s.step('tap study-note-fold-0', 'clock settle');
const noteOpen = frames('study-note-0');
const commentaryFrames = frames('study-heading', 'study-note-text');
both('bc-long');
s.step('tap study-done', ...SETTLE, 'tap chapter-clear', ...SETTLE);
s.step(...goTo(longest.book, longest.chapter), `tap verse-${longest.verse}`, ...SETTLE);
s.step('tap study-words', ...SETTLE, `tap study-word-${longest.word}`, ...SETTLE);
const entry = s.step('state studyWordShown');
const defFolded = frames('study-def');
const entryFrames = frames('study-def', 'study-number');
both('entry-long');
s.step('tap study-def-fold', 'clock settle');
const defOpen = frames('study-def');
s.step('tap study-scroll wheel 0 40000', 'clock settle');
const foot = frames('study-words-foot');
s.step('prefer root-font-size 53', ...SETTLE, 'tap study-scroll wheel 0 -40000', 'clock settle');
const largest = [
  s.step('check'),
  s.step('tap study-scroll wheel 0 40000', 'clock settle', 'check'),
];
both('entry-largest');
s.step('prefer root-font-size 17', ...SETTLE);
const r = await drive.run(
  [...flags, '--storage', store, '--reset-storage', '--url', '/verses'],
  s.ops,
);

const height = (at: number) => (r[at] as Laid | undefined)?.node?.space?.viewport?.h ?? 0;
const sheet = r[notes] as { notes?: Array<{ text: string; folds: boolean }> } | undefined;
const characters = (sheet?.notes ?? []).reduce((sum, note) => sum + note.text.length, 0);
drive.check(
  "John 1:14's commentary: 18 notes of 7,281 characters, each folded",
  sheet?.notes?.length === LONG_NOTES &&
    characters === LONG_CHARACTERS &&
    sheet.notes.every((note) => note.folds),
  { notes: sheet?.notes?.length, characters },
);
drive.check(
  "John 1:14's first note opens whole",
  height(noteOpen[0] ?? 0) > height(noteFolded[0] ?? 0) * 1.3,
  { folded: height(noteFolded[0] ?? 0), open: height(noteOpen[0] ?? 0) },
);
const open = r[entry] as
  | { entries?: Array<{ number: string; folds: boolean; def: string }> }
  | undefined;
const shown = open?.entries?.find((each) => each.number === longest.number);
drive.check(
  'the longest lexicon entry folds, whole in its record',
  shown?.folds === true && shown.def.length === longest.length,
  { folds: shown?.folds, length: shown?.def.length, want: longest.length },
);
drive.check(
  'the longest entry opens whole on Show the full entry',
  height(defOpen[0] ?? 0) > height(defFolded[0] ?? 0) * 1.3,
  { folded: height(defFolded[0] ?? 0), open: height(defOpen[0] ?? 0) },
);
drive.check(
  'the sheet scrolls to the end of the open entry',
  (r[foot[0] ?? 0] as Laid | undefined)?.node?.visible?.inViewport === true,
  (r[foot[0] ?? 0] as Laid | undefined)?.node?.visible,
);
const clipped = largest.flatMap((at) => clipsOf(r[at]));
drive.check(
  'the longest entry at the largest text clips nothing, top and end',
  largest.every((at) => r[at] !== undefined) && clipped.length === 0,
  clipped,
);

/** A frame's ground (its commonest colour) and its mark (the colour farthest from it), from a shot. */
const paintOf = (path: string, at: number) => {
  const frame = (r[at] as Laid | undefined)?.node?.space?.viewport;
  if (frame === undefined) return undefined;
  const image = readPng(path);
  const scale = image.width / 390;
  const counts = new Map<string, number>();
  for (let y = Math.ceil(frame.y * scale); y < Math.floor((frame.y + frame.h) * scale); y++)
    for (let x = Math.ceil(frame.x * scale); x < Math.floor((frame.x + frame.w) * scale); x++) {
      const hex = `#${(pixelAt(image, x, y).match(/\d+/gu) ?? [])
        .slice(0, 3)
        .map((each) => Number(each).toString(16).padStart(2, '0'))
        .join('')}`;
      counts.set(hex, (counts.get(hex) ?? 0) + 1);
    }
  const ground = [...counts.entries()].toSorted((a, b) => b[1] - a[1])[0]?.[0] ?? '#000000';
  const mark = [...counts.keys()].toSorted((a, b) => contrast(b, ground) - contrast(a, ground))[0];
  return { ground, mark: mark ?? ground };
};
if (!native)
  for (const which of ['light', 'dark'] as const)
    for (const [scene, ats] of [
      ['bc-long', commentaryFrames],
      ['entry-long', entryFrames],
    ] as const)
      for (const at of ats) {
        const paint = paintOf(shot(scene, which), at);
        const ratio = paint === undefined ? 0 : contrast(paint.mark, paint.ground);
        drive.check(`${which} ${scene}: ${s.ops[at]} at AA on its ground`, ratio >= 4.5, {
          ratio: ratio.toFixed(2),
          ...paint,
        });
      }

const took = /top level took (\d+) ms/u.exec(JSON.stringify(r[logs] ?? ''));
const bundle = native ? '' : join(app, 'target/web-dist/app.js');
console.log(
  `cost: the data module's top level took ${took?.[1] ?? '?'} ms; ${
    bundle === '' ? 'the app size is drive-type.ts ios’s line' : `app.js ${statSync(bundle).size} B`
  }`,
);

const j = script();
j.step(
  ...SETTLE,
  'tap tab-read',
  ...SETTLE,
  ...goTo(43, 3),
  'tap verse-16',
  'clock data',
  'tap plant-singles',
  ...SETTLE,
);
j.step(
  'tap tab-garden',
  ...SETTLE,
  'tap single-button-John-3-16',
  ...SETTLE,
  'tap today-read',
  ...SETTLE,
);
const onVerse = j.step('state readVerse');
j.step(
  native ? 'tap verse-text-16 drag 0 0 from 40 12 press 900' : 'tap verse-text-16 contextmenu',
  ...SETTLE,
);
const held = j.step('state studyWordShown.open');
j.step('back', ...SETTLE);
const closed = j.step('state studyUp');
j.step(
  'tap verse-16',
  ...SETTLE,
  'tap study-xrefs',
  ...SETTLE,
  'tap study-xref-0',
  ...SETTLE,
  'back',
  ...SETTLE,
);
const reopened = j.step('state studyAt.params.tab');
j.step(
  'tap study-done',
  ...SETTLE,
  'tap chapter-find',
  ...SETTLE,
  'type goto-find "still waters"',
  ...SETTLE,
);
j.step('tap find-hit-19-23-2', ...SETTLE);
const found = j.step('state chapterShown.heading');
j.step(
  'tap verse-1',
  'clock data',
  'tap verse-3',
  'clock data',
  'tap plant-list',
  ...SETTLE,
  'tap chapter-practise',
  ...SETTLE,
);
const practising = [j.step('state nav.tab'), j.step('state todayRoute'), j.step('state todaySlug')];
const journey = await drive.run([...flags, '--storage', store, '--keep-storage'], j.ops);
drive.check(
  "the journey: Today's book button, a hold, Back, Cross-refs, follow, Back, find, a list of three, Practise it now",
  journey[onVerse] === 16 &&
    journey[held] === true &&
    journey[closed] === false &&
    journey[reopened] === 'xrefs' &&
    journey[found] === 'Psalms 23' &&
    journey[practising[0] ?? 0] === 'garden' &&
    journey[practising[1] ?? 0] === 'start' &&
    journey[practising[2] ?? 0] === 'Psalms-23-1',
  [onVerse, held, closed, reopened, found, ...practising].map((at) => journey[at]),
);
await standIn.stop(true);
await packs.stop();

if (live && native) {
  for (const name of ['HEARTSEED_PACKS_BASE', 'SIMCTL_CHILD_HEARTSEED_PACKS_BASE'])
    delete process.env[name];
  const l = script();
  l.step(
    ...SETTLE,
    'tap tab-read',
    'clock data',
    'clock +20000 real',
    ...SETTLE,
    ...goTo(43, 1),
    'tap verse-14',
    ...SETTLE,
  );
  const bar = l.step('state studyBarShown');
  const got = await drive.run(['--storage', `${store}-live`, '--reset-storage'], l.ops);
  const line = (
    got[bar] as { verses?: Array<{ verse: number; buttons: Array<{ line: string }> }> }
  )?.verses?.find((v) => v.verse === 14)?.buttons[2]?.line;
  drive.check(
    'live: the real pack from egw.cvr.im gives John 1:14 at least 10 notes',
    Number(line) >= 10,
    line,
  );
}

for (const row of results) drive.check(row.name, row.ok, row.got);
process.exit(drive.finish());
