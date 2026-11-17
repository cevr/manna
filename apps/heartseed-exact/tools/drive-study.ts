/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noAsyncFunction, effect/noNewError, effect/noNullish, effect/noTernary, effect/noThrowStatement, effect/noNewPromise, effect/noRuntimeTypeof, effect/noTryCatch, effect/noAs, effect/noUnknownParameters, node/no-process-env, eslint/no-await-in-loop -- a host script: it starts the packs' fixture in a process group of its own (a signal to a group already gone is no failure), drives the built app through `bun run exact agent` (`makeDrive`), reads the agent's untyped JSON replies by the fields it checks, and prints what it found. */

/**
 * The study sheet's live checks (`bun tools/drive-study.ts web|ios`),
 * against `tools/commentary-fixture.ts` (every pack fetched once through
 * the one downloader), light and dark, shots in SHOTS (default
 * `.exact/shots`):
 *
 * - John 3:16's bar: Cross-refs 6, Words Greek, Commentary its count;
 *   `tree --ax` names the three buttons;
 * - Cross-refs: 6 rows; the first followed pushes its chapter; Back
 *   reopens the sheet on Cross-refs for verse 16;
 * - Words: the fourth word's entry is G25, Greek, with its renderings;
 *   `tree --ax` names a word button by its language and place ("…, Greek,
 *   word 4 of 25");
 * - the hold: on iOS a real long press (`--touch platform`, 900 ms on the
 *   verse's first line), on the web the context-menu click: it opens a
 *   word's entry on Words and chooses no verse; a tap after it chooses; a
 *   scroll begun on a word neither chooses nor holds; the shot after
 *   shows no selection (kept for the eye); the hint's second clause goes
 *   after the first hold and stays gone across a relaunch;
 * - the lemma under OpenDyslexic is drawn in the platform's face: its
 *   width is the width under the default font;
 * - at the largest text size the sheet's heading, tabs, word and entry
 *   clip nothing;
 * - Reduce Motion: the entry's fade moves by no translate.
 *
 * No verse's, definition's or note's words are printed: checks read
 * counts, numbers, names' shapes and frames. Exits 1 on any failed check.
 * `startPacks` is the fixture's start, which `tools/drive-reader.ts`
 * shares.
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { makeDrive } from '@manna/exact-kit/drive';

import { checkoutPort } from './commentary-fixture';

const app = join(import.meta.dir, '..');

/** A free port from this checkout's own (`offset` past it), so two drives never meet. */
const freePort = async (offset: number) => {
  for (let port = checkoutPort() + offset; port < checkoutPort() + offset + 10; port++) {
    const held = await fetch(`http://127.0.0.1:${port}/`)
      .then(() => true)
      .catch(() => false);
    if (!held) return port;
  }
  throw new Error('no free fixture port');
};

/**
 * Starts `tools/commentary-fixture.ts` in a process group of its own on a
 * free port past `offset`, names it in the app's launch (the web's build
 * and the simulator's `SIMCTL_CHILD_`), and returns its origin, a stop (by
 * its own group) and the drive's machine, whose runs carry that
 * environment.
 */
export const startPacks = async (offset: number) => {
  const port = await freePort(offset);
  const origin = `http://127.0.0.1:${port}`;
  let server: ReturnType<typeof Bun.spawn> | undefined = Bun.spawn(
    ['bun', join(import.meta.dir, 'commentary-fixture.ts')],
    {
      cwd: app,
      env: { ...process.env, PORT: `${port}` },
      stdout: 'ignore',
      stderr: 'inherit',
      detached: true,
    },
  );
  const stop = async () => {
    const child = server;
    server = undefined;
    if (child === undefined) return;
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {}
    await child.exited;
  };
  process.on('exit', () => {
    if (server !== undefined)
      try {
        process.kill(-server.pid, 'SIGTERM');
      } catch {}
  });
  for (let tries = 0; tries < 100; tries++) {
    const up = await fetch(`${origin}/fixture/heard`)
      .then((answer) => answer.ok)
      .catch(() => false);
    if (up) break;
    await Bun.sleep(100);
  }
  const named = (base: string) => {
    for (const name of ['HEARTSEED_PACKS_BASE', 'SIMCTL_CHILD_HEARTSEED_PACKS_BASE'])
      process.env[name] = base;
  };
  named(origin);
  const processes = {
    spawn: (argv: ReadonlyArray<string>, cwd: string) => {
      const child = Bun.spawn([...argv], {
        cwd,
        env: { ...process.env },
        stdout: 'pipe',
        stderr: 'pipe',
        detached: true,
      });
      return {
        pid: child.pid,
        ended: Promise.all([
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
          child.exited,
        ]).then(([stdout, stderr, code]) => ({ code, stdout, stderr })),
      };
    },
    signal: (pid: number, signal: 'SIGTERM') => {
      try {
        process.kill(pid, signal);
      } catch {}
    },
    sleep: (ms: number) => Bun.sleep(ms),
  };
  return { origin, stop, processes, named };
};

/** A run's ops, each read back by the index `step` answers. */
export const script = () => {
  const ops: string[] = [];
  const step = (...each: readonly string[]) => {
    ops.push(...each);
    return ops.length - 1;
  };
  return { ops, step };
};

export const SETTLE = ['clock data', 'clock settle'] as const;
/** Every pack fetched from the fixture on Your verses' probe, then the Read tab. */
export const FETCH = [...SETTLE, 'tap packs-fetch', ...SETTLE, 'tap tab-read', ...SETTLE];
export const goTo = (book: number, chapter: number) => [
  'tap chapter-title',
  ...SETTLE,
  `tap book-${book}`,
  ...SETTLE,
  `tap chapter-${chapter}`,
  ...SETTLE,
];

interface Frame {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
export interface Laid {
  readonly node?: {
    readonly space?: { readonly viewport?: Frame };
    readonly visible?: { readonly inViewport?: boolean; readonly clipped?: boolean };
    readonly style?: Record<string, { readonly value?: string; readonly computed?: string }>;
  };
}
interface Element {
  readonly testId?: string;
  readonly role?: string;
  readonly name?: string;
}
export const elementsOf = (reply: unknown) =>
  (reply as { ax?: { elements?: ReadonlyArray<Element> } } | undefined)?.ax?.elements ?? [];
export const nameOf = (reply: unknown, testId: string) =>
  elementsOf(reply).find((each) => each.testId === testId && each.role !== 'StaticText')?.name;

/** The `clipped` findings of a `check` reply, by id and box (never their text). */
export const clipsOf = (reply: unknown): ReadonlyArray<{ id: string; box: unknown }> => {
  const found: Array<{ id: string; box: unknown }> = [];
  const walk = (at: unknown) => {
    if (Array.isArray(at)) at.forEach(walk);
    else if (typeof at === 'object' && at !== null) {
      const it = at as { kind?: string; id?: string | null; box?: unknown };
      if (it.kind === 'clipped') found.push({ id: it.id ?? '', box: it.box });
      else Object.values(at).forEach(walk);
    }
  };
  walk(reply);
  return found;
};

/** A node's motion: its animation and any translate or transform it is drawn with now. */
export const motionOf = (reply: unknown) => {
  const style = (reply as Laid | undefined)?.node?.style ?? {};
  const animation = style['animation']?.computed ?? style['animation']?.value ?? '';
  const moving = Object.entries(style)
    .filter(([name]) => /^(translate|transform)/u.test(name))
    .map(([name, row]) => `${name}=${row.computed ?? row.value}`)
    .filter((row) => !/=(none|)$/u.test(row));
  return { animation, moving };
};

if (import.meta.main) {
  const host = process.argv[2] ?? 'web';
  const native = host === 'ios';
  const shots = process.env.SHOTS ?? join(app, '.exact/shots');
  mkdirSync(shots, { recursive: true });
  const packs = await startPacks(40);
  const drive = makeDrive({
    name: 'drive-study',
    host,
    appDir: app,
    processes: packs.processes,
    timeoutMs: native ? 45 * 60 * 1000 : undefined,
  });
  const flags = native ? ['--touch', 'platform'] : ['--port', '8774', '--size', '390x844'];
  const store = `study-${host}-${Date.now().toString(36)}`;
  const shot = (scene: string, scheme: string) =>
    join(shots, `study-${host}-${scene}-${scheme}.png`);
  const s = script();
  const both = (scene: string) => {
    s.step('prefer prefers-color-scheme dark', 'clock settle', `screenshot ${shot(scene, 'dark')}`);
    s.step(
      'prefer prefers-color-scheme light',
      'clock settle',
      `screenshot ${shot(scene, 'light')}`,
    );
  };
  /** The hold: a real long press on iOS, the context-menu click on the web. */
  const hold = (verse: number) =>
    native
      ? `tap verse-text-${verse} drag 0 0 from 40 12 press 900`
      : `tap verse-text-${verse} contextmenu`;

  s.step('prefer prefers-color-scheme light', 'clock settle');
  s.step(...FETCH, ...goTo(43, 3));
  const heldBefore = s.step('state studyHeld');
  s.step('tap verse-16', ...SETTLE);
  const bar = s.step('state studyBarShown');
  const axBar = s.step('tree --ax');
  both('bar');
  s.step('tap study-xrefs', ...SETTLE);
  const xrefs = s.step('state studySheetShown');
  both('xrefs');
  s.step('tap study-xref-0', ...SETTLE);
  const followed = s.step('state chapterShown.heading');
  both('followed');
  s.step('back', ...SETTLE);
  const reopened = s.step('state studyAt');
  s.step('tap study-tab-words', ...SETTLE, 'tap study-word-3', ...SETTLE);
  const word = s.step('state studyWordShown');
  const axWords = s.step('tree --ax');
  const lemmaPlain = s.step('layout study-lemma');
  both('words');
  s.step('prefer prefers-reduced-motion reduce', 'clock settle', 'tap study-word-4', 'clock +16');
  const still = s.step('layout study-entry');
  s.step('clock settle', 'prefer prefers-reduced-motion no-preference', 'clock settle');
  s.step('prefer root-font-size 53', ...SETTLE, 'tap study-word-3', ...SETTLE);
  const largest = [
    s.step('tap study-scroll wheel 0 -20000', 'clock settle', 'check'),
    s.step('tap study-scroll wheel 0 20000', 'clock settle', 'check'),
  ];
  both('largest');
  s.step('prefer root-font-size 17', ...SETTLE, 'tap study-done', ...SETTLE);
  s.step(
    'tap chapter-aa',
    ...SETTLE,
    'tap type-font-opendyslexic',
    'clock data',
    'tap type-done',
    'clock settle',
  );
  s.step('tap verse-16', ...SETTLE, 'tap study-words', ...SETTLE, 'tap study-word-3', ...SETTLE);
  const lemmaDyslexic = s.step('layout study-lemma');
  s.step('tap study-done', ...SETTLE, 'tap chapter-clear', ...SETTLE);
  s.step(hold(16), ...SETTLE);
  const held = s.step('state studyAt');
  const heldWord = s.step('state studyWordShown');
  const heldChosen = s.step('state chooserFirst');
  both('hold');
  s.step('tap study-done', ...SETTLE);
  const heldAfter = s.step('state studyHeld');
  both('after-hold');
  s.step('tap verse-5', ...SETTLE);
  const tapped = s.step('state chooserFirst');
  s.step('tap chapter-clear', ...SETTLE);
  const holdsBefore = s.step('state studyHolds');
  s.step('tap verse-text-20 drag 0 -250', ...SETTLE);
  const scrolled = [
    s.step('state studyHolds'),
    s.step('state chooserFirst'),
    s.step('state studyUp'),
  ];

  const r = await drive.run(
    [...flags, '--storage', store, '--reset-storage', '--url', '/verses'],
    s.ops,
  );

  const buttons = (
    r[bar] as { verses?: Array<{ verse: number; buttons: Array<{ line: string }> }> }
  )?.verses?.find((v) => v.verse === 16)?.buttons;
  drive.check(
    "John 3:16's bar: Cross-refs 6, Words Greek, Commentary a count or none",
    buttons?.[0]?.line === '6' &&
      buttons[1]?.line === 'Greek' &&
      /^(\d+|none)$/u.test(buttons[2]?.line ?? ''),
    buttons?.map((b) => b.line),
  );
  const barNames = ['study-xrefs', 'study-words', 'study-commentary'].map((id) =>
    nameOf(r[axBar], id),
  );
  drive.check(
    'tree --ax: the three buttons are named for John 3:16',
    barNames[0] === 'Cross-references of John 3:16, 6' &&
      barNames[1] === 'Hebrew and Greek words of John 3:16' &&
      /^Ellen White's commentary on John 3:16, /u.test(barNames[2] ?? ''),
    barNames,
  );
  const sheet = r[xrefs] as { xrefs?: unknown[] } | undefined;
  drive.check('Cross-refs: 6 rows', sheet?.xrefs?.length === 6, sheet?.xrefs?.length);
  drive.check(
    'follow: the first reference pushes its chapter',
    typeof r[followed] === 'string' && r[followed] !== 'John 3',
    r[followed],
  );
  const at = r[reopened] as { name?: string; params?: Record<string, string> } | undefined;
  drive.check(
    'Back reopens the sheet on Cross-refs for verse 16',
    at?.name === 'studySheet' && at.params?.verse === '16' && at.params.tab === 'xrefs',
    at,
  );
  const open = r[word] as
    | {
        open?: boolean;
        index?: number;
        entries?: Array<{ number: string; found: boolean; renders: unknown[]; heading: string }>;
      }
    | undefined;
  const entry = open?.entries?.[0];
  drive.check(
    'Words: the fourth word opens G25, Greek, with its renderings',
    open?.open === true &&
      open.index === 3 &&
      entry?.number === 'G25' &&
      entry.found &&
      entry.renders.length > 0,
    { index: open?.index, number: entry?.number, renders: entry?.renders.length },
  );
  const wordName = nameOf(r[axWords], 'study-word-3') ?? '';
  drive.check(
    'tree --ax: a word button says its language and place',
    /, Greek, word 4 of 25$/u.test(wordName),
    wordName.replace(/^[^,]*/u, '…'),
  );
  const width = (at: number) => (r[at] as Laid | undefined)?.node?.space?.viewport?.w ?? Number.NaN;
  drive.check(
    "the lemma under OpenDyslexic is drawn in the platform's face (its width unchanged)",
    Math.abs(width(lemmaPlain) - width(lemmaDyslexic)) < 0.5,
    { plain: width(lemmaPlain), dyslexic: width(lemmaDyslexic) },
  );
  const reduced = motionOf(r[still]);
  drive.check(
    'Reduce Motion: the entry moves by no translate',
    reduced.moving.length === 0,
    reduced,
  );
  const clipped = largest.flatMap((i) => clipsOf(r[i]));
  drive.check(
    "largest text: `check` finds nothing of the sheet's clipped, at its top and its end",
    largest.every((i) => r[i] !== undefined) && clipped.length === 0,
    clipped,
  );
  const heldAt = r[held] as { name?: string; params?: Record<string, string> } | undefined;
  const heldOpen = r[heldWord] as
    | { open?: boolean; index?: number; entries?: unknown[] }
    | undefined;
  drive.check(
    `the hold (${native ? 'a 900 ms press' : 'the context-menu click'}) opens a word's entry on Words for verse 16`,
    heldAt?.name === 'studySheet' &&
      heldAt.params?.verse === '16' &&
      heldAt.params.tab === 'words' &&
      heldOpen?.open === true &&
      (heldOpen.entries?.length ?? 0) > 0,
    { at: heldAt?.params, index: heldOpen?.index, entries: heldOpen?.entries?.length },
  );
  drive.check('the hold chose no verse', r[heldChosen] === 0, r[heldChosen]);
  drive.check('a tap after the hold still chooses', r[tapped] === 5, r[tapped]);
  drive.check(
    'a scroll begun on a word neither holds nor chooses',
    r[scrolled[0] ?? 0] === r[holdsBefore] &&
      r[scrolled[1] ?? 0] === 0 &&
      r[scrolled[2] ?? 0] === false,
    scrolled.map((i) => r[i]),
  );
  drive.check(
    'the hint keeps its hold clause until the first hold',
    r[heldBefore] === '' && r[heldAfter] === 'held',
    [r[heldBefore], r[heldAfter]],
  );

  const k = script();
  k.step(...SETTLE, 'tap tab-read', ...SETTLE);
  const keptHeld = k.step('state studyHeld');
  const hint = k.step('tree chapter-hint');
  const again = await drive.run([...flags, '--storage', store, '--keep-storage'], k.ops);
  drive.check(
    'the hint stays without its hold clause across a relaunch',
    again[keptHeld] === 'held' && !JSON.stringify(again[hint] ?? '').includes('Hold a word'),
    again[keptHeld],
  );
  await packs.stop();
  process.exit(drive.finish());
}
