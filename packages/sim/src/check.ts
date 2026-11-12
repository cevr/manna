/**
 * Journey files read as data, for an app's tests: each file loaded as `sim
 * journey` loads it (on a stand-in booted iOS drive, no step taken), a
 * selector read as the drive reads it, the selectors a step names, and the
 * strings, templates and JSX texts an app's sources spell, so a test can
 * hold every selector of a shipped journey to one the app can draw.
 */
import { Effect, FileSystem, Option, Path, Predicate } from 'effect';

import type { App } from './app.ts';
import { Drive, type DriveMembers, parseTarget, type Place } from './drive.ts';
import { loadJourney, panStart } from './journey.ts';

const SUFFIX = '.journey.json';
const PROBE = '/nonexistent/loop-probe-x';

/** A journey as `sim journey` decodes it. */
export type Journey = Effect.Success<ReturnType<typeof loadJourney>>['journey'];
/** One step of a decoded journey. */
export type Step = Journey['steps'][number];

const noStep = () => Effect.die('a journey file is only loaded here, never driven');

/** The drive `sim journey` loads a journey on: a booted iOS session, and no step taken. */
const booted = (app: App): DriveMembers => ({
  readSession: () =>
    Effect.succeed({
      platform: 'ios',
      out: `${PROBE}/out`,
      port: app.ports.default,
      serverPid: 1,
      udid: 'STAND-IN',
      bootedAt: '2026-10-30T00:00:00.000Z',
    }),
  boot: noStep,
  install: noStep,
  open: noStep,
  tap: noStep,
  fill: noStep,
  back: noStep,
  scroll: noStep,
  shot: noStep,
  snapshot: noStep,
  read: noStep,
  record: noStep,
  log: noStep,
  doctor: noStep,
  down: noStep,
  sees: noStep,
  gesture: noStep,
  pinch: noStep,
  hold: noStep,
  relaunch: noStep,
  clean: noStep,
});

/** The journey file of `feature` in `dir`, loaded as `sim journey <feature>` loads it for `app`. */
const load = (app: App, dir: string, feature: string) =>
  loadJourney(
    {
      app: `${PROBE}/app`,
      state: `${PROBE}/state`,
      script: `${PROBE}/app/scripts/sim.ts`,
      features: dir,
      warm: [],
      config: app,
    } satisfies Place,
    feature,
  ).pipe(
    Effect.map(({ journey }) => journey),
    Effect.provideService(Drive, booted(app)),
  );

/** Every `*.journey.json` in `dir`, loaded for `app` as `sim journey` loads it, in name order; the first refused file fails. */
export const loadJourneys = Effect.fn('Sim.loadJourneys')(function* (app: App, dir: string) {
  const fs = yield* FileSystem.FileSystem;
  const files = (yield* fs.readDirectory(dir)).filter((name) => name.endsWith(SUFFIX)).sort();
  return yield* Effect.forEach(files, (name) => load(app, dir, name.slice(0, -SUFFIX.length)));
});

/** `text` as the journey file of `feature`, loaded for `app` as `sim journey` loads it. */
export const loadJourneyText = (app: App, feature: string, text: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = yield* fs.makeTempDirectoryScoped();
    yield* fs.writeFileString(path.join(dir, `${feature}${SUFFIX}`), text);
    return yield* load(app, dir, feature);
  });

/** A selector as the drive reads it: `id=`, `label=` or a bare label, after an optional `role=<role> `. */
export const parseSelector = parseTarget;

/** The selectors a step names: its target (never `screen`), its pan's or pinch's start when no point, then each expect's, in order. */
export const selectorsOf = (step: Step): ReadonlyArray<string> => {
  const own: Array<string> = [];
  if ('target' in step && step.target !== 'screen') own.push(step.target);
  let start = '';
  if ('from' in step) start = step.from;
  if ('at' in step) start = step.at;
  own.push(...Option.toArray(Option.filter(panStart(start), Predicate.isString)));
  for (const expect of step.expect) {
    if ('shows' in expect) own.push(expect.shows);
    else own.push(expect.hides);
  }
  return own;
};

/** What the app's sources spell: exact strings, and template literals as their parts between holes. */
export interface Spelled {
  readonly exact: ReadonlySet<string>;
  readonly templates: ReadonlyArray<Template>;
}

/** A template literal or JSX text: the file that spells it, and its parts between holes. */
interface Template {
  readonly file: string;
  readonly parts: ReadonlyArray<string>;
}

/**
 * A label template whose hole holds a word: the file that spells it, its
 * parts between holes, and the words its holes take, read from the module
 * that names them. No other source string fills it, so renaming the word
 * where it is named fails, though the word is spelled elsewhere.
 */
export interface WordHole {
  readonly file: string;
  readonly parts: ReadonlyArray<string>;
  readonly words: ReadonlyArray<string>;
}

/** What a hole may hold besides a number: the journey's typed text and the word holes' words. */
export interface Fills {
  /** What the journey types (`fill`): a label's hole may show it back (`No hymn matches “${q}”.`). */
  readonly typed: ReadonlyArray<string>;
  readonly holes: ReadonlyArray<WordHole>;
}

/** A source file: its path from the app's folder (`src/…`, `app/…`) and its text. */
export type Source = readonly [file: string, text: string];

/** A single- or double-quoted string literal on one line: its text in group 1 or 2. */
export const STRING = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g;
const TEMPLATE = /`((?:[^`\\]|\\.)*)`/g;
/** A JSX text between tags, its `{…}` expressions its holes. */
const JSX_TEXT = />((?:[^<>{}]|\{[^{}]*\})+)</g;
const JSX_HOLE = /\{[^{}]*\}/;
const HOLE = /\$\{[^}]*\}/;
/** Comments, taken out first: an apostrophe in one would pair with a quote in the code. */
const COMMENT = /\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm;
/**
 * A word of two letters or more: a template whose own text has none (`${a}
 * ${b}`) names nothing, unless a word hole gives its holes their words.
 */
const WORD = /\p{L}{2,}/u;
/** A testID's hole: numbers joined by `-`. */
const ID_HOLE = /^\d+(?:-\d+)*$/;
/** A label's number hole. */
const NUMBER = /^\d+$/;

/** The strings, template literals and JSX texts of `sources`, their comments left out. */
export const spelled = (sources: ReadonlyArray<Source>): Spelled => {
  const exact = new Set<string>();
  const templates: Array<Template> = [];
  for (const [file, text] of sources) {
    const source = text.replace(COMMENT, '');
    for (const match of source.matchAll(STRING)) exact.add(match[1] ?? match[2] ?? '');
    for (const match of source.matchAll(JSX_TEXT)) {
      const parts = (match[1] ?? '').trim().split(JSX_HOLE);
      if (parts.length === 1) exact.add(parts[0] ?? '');
      else templates.push({ file, parts });
    }
    for (const match of source.matchAll(TEMPLATE)) {
      const parts = (match[1] ?? '').split(HOLE);
      if (parts.length === 1) exact.add(parts[0] ?? '');
      else templates.push({ file, parts });
    }
  }
  return { exact, templates };
};

/** Whether two templates' parts are the same. */
const sameParts = (one: ReadonlyArray<string>, other: ReadonlyArray<string>) =>
  one.length === other.length && one.every((part, at) => part === other[at]);

/**
 * Whether `value` is `parts` joined by holes, each hole a non-empty piece
 * `fills` takes, trying every place a hole may end.
 */
export const fillsTemplate = (
  value: string,
  parts: ReadonlyArray<string>,
  fills: (piece: string) => boolean,
): boolean => {
  const [head = '', ...rest] = parts;
  if (!value.startsWith(head)) return false;
  const after = value.slice(head.length);
  if (rest.length === 0) return after === '';
  for (let end = 1; end <= after.length; end++)
    if (fills(after.slice(0, end)) && fillsTemplate(after.slice(end), rest, fills)) return true;
  return false;
};

/**
 * Whether `value` is spelled whole, as a string, or fills a template. A
 * testID's hole holds numbers joined by `-` (`chord-${at}-${n}`, `at` being
 * `1-1`), so `hymn-${…}` gives no word-named id. A label's hole holds a
 * number, the journey's typed text, or, in a template a word hole lists for
 * its file, one of that hole's words: never any other text, so `Play ${n}`
 * does not draw `Play hymn 100`, and `${name}, see all` draws `Recent, see
 * all` only while the shelf is named `Recent`. A label matches in any case,
 * as agent-device matches it.
 */
export const isSpelled = (from: Spelled, fills: Fills, value: string, by: 'id' | 'label') => {
  if (from.exact.has(value)) return true;
  const worded = (parts: ReadonlyArray<string>) => WORD.test(parts.join(' '));
  if (by === 'id')
    return from.templates.some(
      ({ parts }) => worded(parts) && fillsTemplate(value, parts, (piece) => ID_HOLE.test(piece)),
    );
  const fold = (text: string) => text.toLowerCase();
  if ([...from.exact].some((one) => fold(one) === fold(value))) return true;
  const typed = new Set(fills.typed.map(fold));
  return from.templates.some(({ file, parts }) => {
    const listed = fills.holes.filter((hole) => hole.file === file && sameParts(hole.parts, parts));
    if (listed.length === 0 && !worded(parts)) return false;
    const words = new Set(listed.flatMap((hole) => hole.words.map(fold)));
    const fill = (piece: string) => NUMBER.test(piece) || typed.has(piece) || words.has(piece);
    return fillsTemplate(fold(value), parts.map(fold), fill);
  });
};

/** The word holes whose file no longer spells their template, as `<file> <parts>`. */
export const staleHoles = (from: Spelled, holes: ReadonlyArray<WordHole>) =>
  holes
    .filter(
      (hole) =>
        !from.templates.some(
          (template) => template.file === hole.file && sameParts(template.parts, hole.parts),
        ),
    )
    .map((hole) => `${hole.file} ${hole.parts.join('…')}`);
