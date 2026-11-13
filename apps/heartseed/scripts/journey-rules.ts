/* oxlint-disable effect/noNodeBuiltinImport, effect/noNullish -- the rules read the app's sources from disk, synchronously, as the tests that call them do, and an absent parser node or regular-expression group is nullish. */

/**
 * The rules verify-heartseed's journeys hold, each a pure function over the
 * journeys as `sim journey` loads them (`@manna/sim/check`), each fault a
 * string that starts `<feature>/<step> `:
 *
 * - R1 `firstRunFaults`: a first-minute heading is waited for only after the
 *   welcome is left, in that launch;
 * - R2 `hiddenFaults`: no selector names a node hidden from VoiceOver;
 * - R3 `startFaults`: a journey proves its start, an `open` that shows;
 * - R4 `undrawn`: every selector is one the app's sources can draw;
 * - R5 `proseDrives` and `LEGACY`: the driving commands a markdown text
 *   holds, and the files still allowed to hold them;
 * - R6 `ownerFaults` and `citeFaults`: each journey is run by its feature
 *   file, and each cite of a step names one that ships;
 * - R7 `footFaults`: a journey that scrolls home to its foot scrolls it back
 *   up before it ends.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  type Fills,
  fillsTemplate,
  isSpelled,
  type Journey,
  loadJourneys,
  loadJourneyText,
  parseSelector,
  selectorsOf,
  type Source,
  type Spelled,
  spelled,
  staleHoles,
  type Step,
  STRING,
  type WordHole,
} from '@manna/sim/check';
import { BIBLE_BOOKS, formatBibleReference, parseBibleQuery } from '@manna/core/bible';
import { Predicate } from 'effect';
import { parseSync, Visitor, type JSXAttribute, type Node } from 'oxc-parser';

import { HANDBOOK, HANDBOOK_LISTS, handbookTitle } from '../src/handbook.ts';
import { readVerses } from '../vite/passage.ts';
import { app } from './sim-app.ts';

const APP = join(import.meta.dir, '..');
/** verify-heartseed's feature files and the journeys beside them. */
const FEATURES = join(APP, '../../.claude/skills/verify-heartseed/features');

/** The headings of the first minute's verse, each shown only after the welcome in its launch, folded. */
const PHASES = ['hear it', 'say it with help', 'say it alone', 'planted'];

/** The welcome's ways on, folded: `Skip`, and `Begin`'s `Plant your first verse`. */
const LEAVES = ['skip', 'plant your first verse'];

/** A selector's label, folded as agent-device matches it; none (empty) for an id. */
const labelOf = (selector: string) => {
  const { by, value } = parseSelector(selector);
  if (by === 'label') return value.toLowerCase();
  return '';
};

/** The selectors a step acts on: its target and its pan's or pinch's start, before its expects. */
const actedOn = (step: Step) => {
  const all = selectorsOf(step);
  return all.slice(0, all.length - step.expect.length);
};

/** The selectors a step waits to show: what it acts on, and each `shows`. */
const waitsFor = (step: Step) => [
  ...actedOn(step),
  ...step.expect.flatMap((expect) => {
    if ('shows' in expect) return [expect.shows];
    return [];
  }),
];

/** Whether a step starts a launch: a `relaunch`, or an `open` whose retry may terminate the app. */
const launches = (step: Step) =>
  step.action === 'relaunch' || (step.action === 'open' && step.relaunch !== false);

/**
 * R1. The steps that wait for a heading of the first minute's verse in a
 * launch the welcome has not been left in. A launch starts at the journey's
 * start, at a `relaunch` and at an `open` whose `relaunch` is not false,
 * before the step's own selectors are judged; a tap on `Skip` or `Plant your
 * first verse` leaves the welcome, before the tap's expects are judged. A
 * wait is a selector the step acts on or a `shows`; a `hides` is none.
 */
export const firstRunFaults = (journey: Journey): ReadonlyArray<string> => {
  let left = false;
  const faults: Array<string> = [];
  for (const step of journey.steps) {
    if (launches(step)) left = false;
    if (step.action === 'tap' && LEAVES.includes(labelOf(step.target))) left = true;
    const headings = waitsFor(step).filter((selector) => PHASES.includes(labelOf(selector)));
    if (!left && headings.length > 0)
      faults.push(
        `${journey.feature}/${step.name} waits for ${headings.join(', ')} before the welcome is left in its launch`,
      );
  }
  return faults;
};

/** The ids hidden from VoiceOver: whole ids, and the openings of numbered families. */
export interface Hidden {
  readonly ids: ReadonlySet<string>;
  readonly families: ReadonlySet<string>;
}

/** A hidden family's number: numbers joined by `-`. */
const NUMBERED = /^\d+(?:-\d+)*$/;

/** Whether `id` is a hidden id, or a hidden family's opening followed by its number. */
const isHidden = (hidden: Hidden, id: string) =>
  hidden.ids.has(id) ||
  [...hidden.families].some(
    (family) => id.startsWith(family) && NUMBERED.test(id.slice(family.length)),
  );

/** R2. Each selector of a step, a `hides` too, that names a node hidden from VoiceOver by its id. */
export const hiddenFaults = (journey: Journey, hidden: Hidden): ReadonlyArray<string> =>
  journey.steps.flatMap((step) =>
    selectorsOf(step)
      .filter((selector) => {
        const { by, value } = parseSelector(selector);
        return by === 'id' && isHidden(hidden, value);
      })
      .map((selector) => `${journey.feature}/${step.name} ${selector} is hidden from VoiceOver`),
  );

const attribute = (attributes: ReadonlyArray<JSXAttribute>, name: string) =>
  attributes.findLast((each) => each.name.type === 'JSXIdentifier' && each.name.name === name);

const valueOf = (each: JSXAttribute | undefined): Node | null | undefined => {
  if (each?.value?.type === 'JSXExpressionContainer') return each.value.expression;
  return each?.value;
};

/**
 * The hidden ids one source declares: each JSX element that carries
 * `aria-hidden` (bare or `true`) and a `testID` names that id, or, for a
 * template, every id its literal opening starts (`break-${word}` gives the
 * family `break-`).
 */
export const hiddenIn = (path: string, text: string): Hidden => {
  const ids = new Set<string>();
  const families = new Set<string>();
  new Visitor({
    JSXOpeningElement: (node) => {
      const attributes = node.attributes.filter(
        (each): each is JSXAttribute => each.type === 'JSXAttribute',
      );
      const hidden = attribute(attributes, 'aria-hidden');
      const flag = valueOf(hidden);
      if (hidden === undefined) return;
      if (
        flag != null &&
        !(flag.type === 'Literal' && (flag.value === true || flag.value === 'true'))
      )
        return;
      const id = valueOf(attribute(attributes, 'testID'));
      if (id?.type === 'Literal' && Predicate.isString(id.value)) ids.add(id.value);
      if (id?.type === 'TemplateLiteral' && id.expressions.length > 0) {
        const opening = id.quasis[0]?.value.cooked ?? '';
        if (opening !== '') families.add(opening);
      }
    },
  }).visit(parseSync(path, text, { sourceType: 'module' }).program);
  return { ids, families };
};

/** The hidden ids of every product source of the app (`src`, `app`; tests and `src/test` left out). */
export const hiddenOfApp = (): Hidden => {
  const sources = ['src', 'app'].flatMap((folder) =>
    readdirSync(join(APP, folder), { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.tsx$/u.test(entry.name))
      .map((entry) => relative(APP, join(entry.parentPath, entry.name)))
      .filter((path) => !/\.test\.tsx$/u.test(path) && !path.startsWith('src/test/')),
  );
  const each = sources.map((path) => hiddenIn(path, readFileSync(join(APP, path), 'utf8')));
  return {
    ids: new Set(each.flatMap((hidden) => [...hidden.ids])),
    families: new Set(each.flatMap((hidden) => [...hidden.families])),
  };
};

/** The app's product sources (`src`, `app`; no test, no `test` folder, no declaration file), as `<folder>/<path>` and text. */
export const sourcesOfApp = (): ReadonlyArray<Source> =>
  ['src', 'app'].flatMap((folder) =>
    readdirSync(join(APP, folder), { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.tsx?$/u.test(entry.name))
      .map((entry) => relative(APP, join(entry.parentPath, entry.name)))
      .filter((path) => !/\.test\.|\.d\.ts$|(^|\/)test\//u.test(path))
      .sort()
      .map((path): Source => [path, readFileSync(join(APP, path), 'utf8')]),
  );

/** R3. A journey whose first step is no `open` with a `shows`: it cannot prove the screen it starts on. */
export const startFaults = (journey: Journey): ReadonlyArray<string> => {
  const [first] = journey.steps;
  if (first === undefined) return [`${journey.feature} has no step`];
  if (first.action === 'open' && first.expect.some((expect) => 'shows' in expect)) return [];
  return [`${journey.feature}/${first.name} is no open that shows where the journey starts`];
};

/** The targets at home's foot, under its lists: `Add a list` and the limit line. */
const FOOT = new Set(['id=add-list', 'id=limit']);

/**
 * R7. A journey whose last scroll goes to home's foot (`id=add-list` or
 * `id=limit`): it leaves home scrolled down, and the next journey in its
 * feature file's order, whose `open` keeps the running app's offset, starts
 * past the furrows it waits for. Such a journey ends with a scroll up to
 * `label=Your field`.
 */
export const footFaults = (journey: Journey): ReadonlyArray<string> => {
  const last = journey.steps.findLast((step) => step.action === 'scroll');
  if (last === undefined || last.action !== 'scroll' || !FOOT.has(last.target)) return [];
  return [`${journey.feature}/${last.name} leaves home at its foot`];
};

/**
 * The strings of the array `export const <name> = [...]` in `file` of
 * `sources`, read from its text; none when it is gone or moved.
 */
const constStrings = (sources: ReadonlyArray<Source>, file: string, name: string) => {
  const text = sources.find(([one]) => one === file)?.[1] ?? '';
  const array = new RegExp(`export const ${name} = \\[([^\\]]*)\\]`).exec(text)?.[1] ?? '';
  return [...array.matchAll(STRING)].map((match) => match[1] ?? match[2] ?? '');
};

/** The strings of the union `type <name> = '<a>' | '<b>' …` in `file` of `sources`; none when it is gone or moved. */
const unionStrings = (sources: ReadonlyArray<Source>, file: string, name: string) => {
  const text = sources.find(([one]) => one === file)?.[1] ?? '';
  const union = new RegExp(`type ${name} =([^;]*);`, 'u').exec(text)?.[1] ?? '';
  if (!/^(\s*\|?\s*'[^']*')+\s*$/u.test(union)) return [];
  return [...union.matchAll(STRING)].map((match) => match[1] ?? match[2] ?? '');
};

/** The collections' titles, each the second string of an entry of `src/promises.ts`'s `LIST`: `[ '<id>', '<title>', [rows] ]`. */
const titlesOf = (sources: ReadonlyArray<Source>) => {
  const text = sources.find(([one]) => one === 'src/promises.ts')?.[1] ?? '';
  return Array.from(
    text.matchAll(/^ {2}\[\n {4}'[a-z-]+',\n {4}'([^'\n]+)',$/gmu),
    (match) => match[1] ?? '',
  );
};

/** The stage words a stage hole takes: `src/garden.ts`'s `STAGES`, and `not planted`. */
const stagesOf = (sources: ReadonlyArray<Source>) => [
  ...constStrings(sources, 'src/garden.ts', 'STAGES'),
  'not planted',
];

/**
 * Heartseed's label templates whose hole holds a word, each filled from the
 * module that names the words: Today's stage line takes a stage word, a
 * furrow's `Open` a collection's title, the dictation probe's lines a
 * dictation's ending (or `none`) and its script, and the theme probe's
 * `scheme` line a scheme.
 */
export const wordHolesOf = (sources: ReadonlyArray<Source>): ReadonlyArray<WordHole> => [
  { file: 'app/index.tsx', parts: ['Stage: ', ''], words: stagesOf(sources) },
  { file: 'src/field/plot.tsx', parts: ['Open ', ''], words: titlesOf(sources) },
  {
    file: 'app/probe/dictation.tsx',
    parts: ['ended ', ''],
    words: [...unionStrings(sources, 'src/dictation/attempt.ts', 'Ending'), 'none'],
  },
  {
    file: 'app/probe/dictation.tsx',
    parts: ['script ', ''],
    words: unionStrings(sources, 'app/probe/dictation.tsx', 'Script'),
  },
  {
    file: 'app/probe/theme.tsx',
    parts: ['scheme ', ''],
    words: unionStrings(sources, 'src/theme.ts', 'Scheme'),
  },
];

/** What a reference hole takes: a verse's reference, a stage word, or a Handbook list's title as the reader sees it. */
export type HoleClass = 'reference' | 'stage' | 'list';

/** A label template whose holes each take only the classes its module fills them with, one entry of `fills` per hole. */
export type ReferenceHole = Pick<WordHole, 'file' | 'parts'> & {
  readonly fills: ReadonlyArray<ReadonlyArray<HoleClass>>;
};

/**
 * Heartseed's label templates whose holes hold a verse's reference, a
 * stage word or a Handbook list's title, each hole only what its module
 * puts there: a plant's name on home and on the end of a session
 * (`<reference>, <stage>`, then `, ready today` when ready); an offer's
 * `Plant <title>` in the Add a list sheet, a passage's title being its
 * reference; a furrow's `Open <title>` and its list's `Remove <name>`, a
 * passage by its reference and a Handbook list by its title; and the home
 * probe's `Start with <reference>`.
 */
export const REFERENCE_HOLES: ReadonlyArray<ReferenceHole> = [
  { file: 'src/home.ts', parts: ['', ', ', ''], fills: [['reference'], ['stage']] },
  { file: 'src/home.ts', parts: ['', ', ', ', ready today'], fills: [['reference'], ['stage']] },
  { file: 'src/run/tended.tsx', parts: ['', ', ', ''], fills: [['reference'], ['stage']] },
  { file: 'src/shelves/sheet.tsx', parts: ['Plant ', ''], fills: [['reference', 'list']] },
  { file: 'app/probe/home.tsx', parts: ['Start with ', ''], fills: [['reference']] },
  { file: 'src/field/plot.tsx', parts: ['Open ', ''], fills: [['reference', 'list']] },
  { file: 'src/list/screen.tsx', parts: ['Remove ', ''], fills: [['reference', 'list']] },
];

/** Whether `value` fills `parts`, the n-th hole with a piece that `fills[n]` takes; the last hole as `fillsTemplate` fills one. */
const fillsEach = (
  value: string,
  parts: ReadonlyArray<string>,
  fills: ReadonlyArray<(piece: string) => boolean>,
): boolean => {
  const [fill = () => false, ...after] = fills;
  if (after.length === 0) return fillsTemplate(value, parts, fill);
  const [head = '', ...rest] = parts;
  if (!value.startsWith(head)) return false;
  const tail = value.slice(head.length);
  for (let end = 1; end <= tail.length; end++)
    if (fill(tail.slice(0, end)) && fillsEach(tail.slice(end), rest, after)) return true;
  return false;
};

/**
 * Whether `label` is a verse or a verse range as the canon names it
 * (`Isaiah 41:10`, `John 15:1-5`): the app draws a passage's reference from
 * the bundled corpus (`vite/passage.ts`), never from a string of its own.
 */
const isReference = (label: string) => {
  const parsed = parseBibleQuery(label);
  if (parsed._tag !== 'single' && parsed._tag !== 'verseRange') return false;
  if (formatBibleReference(parsed.ref) !== label) return false;
  if (parsed._tag === 'single') return inKjv(parsed.ref);
  return inKjv(parsed.ref.start) && inKjv(parsed.ref.end);
};

/**
 * Whether `label` is a book or one of its chapters as the passage chooser
 * names them (`Genesis`, `Psalms 119`): the chooser draws both from the
 * canon's books (`src/chooser/screen.tsx`), never from a string of its own.
 */
const isBookOrChapter = (label: string) => {
  const chapter = /^(.+) (\d+)$/u.exec(label);
  return BIBLE_BOOKS.some((book) => {
    if (book.name === label) return true;
    if (chapter === null || book.name !== chapter[1]) return false;
    const at = Number(chapter[2]);
    return at >= 1 && at <= book.chapters;
  });
};

/**
 * The Handbook's section and list titles (`src/handbook.ts`'s `HANDBOOK`,
 * decoded from `data/handbook.json`): the Add a list sheet's heads and offers, and a
 * planted list's furrow, draw them from that file, never from a string of
 * the sources.
 */
const handbookNames = (): ReadonlySet<string> =>
  new Set([...HANDBOOK.map((section) => section.title), ...handbookListTitles()]);

/** The Handbook lists' titles as the reader sees them (`handbookTitle`): what an offer's `Plant`, a furrow's `Open` and a list's `Remove` name a planted list by. */
export const handbookListTitles = (): ReadonlySet<string> =>
  new Set(HANDBOOK_LISTS.map(handbookTitle));

/** Whether the bundled KJV has the verse `at`. */
const inKjv = (at: { readonly book: number; readonly chapter: number; readonly verse: number }) =>
  kjvVerses().has(`${at.book}:${at.chapter}:${at.verse}`);

let kjv: ReadonlySet<string> = new Set();

/** Every verse of the bundled KJV (`vite/passage.ts`'s corpus) as `<book>:<chapter>:<verse>`, read once per process. */
const kjvVerses = () => {
  if (kjv.size === 0)
    kjv = new Set(readVerses().map((row) => `${row.book}:${row.chapter}:${row.verse}`));
  return kjv;
};

/** The word holes and reference holes whose file no longer spells their template, as `<file> <parts>`. */
export const holeFaults = (sources: ReadonlyArray<Source>): ReadonlyArray<string> =>
  staleHoles(spelled(sources), [
    ...wordHolesOf(sources),
    ...REFERENCE_HOLES.map(({ file, parts }) => ({ file, parts, words: [] })),
  ]);

/**
 * R4. The selectors of each journey the app cannot draw, as `<feature>/<step>
 * <selector>`: an `id` its sources give as a string or a template filled by
 * numbers; a label they spell in any case, a template filled only by a
 * number, the journey's typed text or a word hole's words; a verse's
 * reference as the canon names it; a book or a chapter of it as the canon
 * names them; a Handbook section's or list's title; and a reference hole
 * filled, each hole, only by the classes its entry of `REFERENCE_HOLES`
 * names.
 */
export const undrawn = (
  journeys: ReadonlyArray<Journey>,
  sources: ReadonlyArray<Source>,
): ReadonlyArray<string> => {
  const from: Spelled = spelled(sources);
  const holes = wordHolesOf(sources);
  const stages = new Set(stagesOf(sources));
  const handbook = handbookNames();
  const lists = handbookListTitles();
  const takes: Record<HoleClass, (piece: string) => boolean> = {
    reference: isReference,
    stage: (piece) => stages.has(piece),
    list: (piece) => lists.has(piece),
  };
  const named = (value: string) =>
    isReference(value) ||
    isBookOrChapter(value) ||
    handbook.has(value) ||
    REFERENCE_HOLES.some(({ parts, fills }) =>
      fillsEach(
        value,
        parts,
        fills.map((classes) => (piece: string) => classes.some((one) => takes[one](piece))),
      ),
    );
  return journeys.flatMap((journey) => {
    const fills: Fills = {
      typed: journey.steps.flatMap((step) => {
        if (step.action === 'fill') return [step.value];
        return [];
      }),
      holes,
    };
    return journey.steps.flatMap((step) =>
      selectorsOf(step)
        .filter((selector) => {
          const { by, value } = parseSelector(selector);
          if (by === 'label' && named(value)) return false;
          return !isSpelled(from, fills, value, by);
        })
        .map((selector) => `${journey.feature}/${step.name} ${selector}`),
    );
  });
};

/** Every shipped journey of verify-heartseed, loaded as `sim journey` loads it, in file-name order. */
export const shippedJourneys = loadJourneys(app, FEATURES);

/** `text` as Heartseed's journey file of `feature`, loaded as `sim journey` loads it: quiet, so a step that keeps a shot is refused. */
export const journeyOfText = (feature: string, text: string) => loadJourneyText(app, feature, text);

/** `sim`'s verbs that drive the app; every other (`boot`, `install`, `snapshot`, `read`, `journey`, …) does not. */
const SIM_DRIVES = new Set([
  'open',
  'tap',
  'fill',
  'back',
  'scroll',
  'gesture',
  'pinch',
  'hold',
  'relaunch',
]);

/** One shell word (quotes and escapes kept together), or a run of shell operators. */
const WORD = /(?:"[^"]*"|'[^']*'|\\.|[^\s"'\\;&|()])+|[;&|()]+/gu;
const OPERATOR = /^[;&|()]+$/u;

/** Whether a word starts a command of the helper: `sim`, or its file by any path. */
const isHelper = (word: string) => word === 'sim' || word.endsWith('scripts/sim.ts');

/** Whether a tool's verb drives the app: one of `sim`'s driving verbs, or any of `agent-device`'s but `snapshot`. */
const drivesBy = (helper: boolean, verb: string) => {
  if (helper) return SIM_DRIVES.has(verb);
  return verb !== '' && verb !== 'snapshot';
};

/** The driving commands of one piece of code, each from its tool to the next shell operator. */
const drivesIn = (code: string): ReadonlyArray<string> => {
  const words = Array.from(code.matchAll(WORD), ([word]) => word);
  return words.flatMap((word, at) => {
    const helper = isHelper(word);
    if (!helper && word !== 'agent-device') return [];
    const rest = words.slice(at + 1);
    const end = rest.findIndex((each) => OPERATOR.test(each));
    let own = rest;
    if (end >= 0) own = rest.slice(0, end);
    const verb = own.find((each) => !each.startsWith('-')) ?? '';
    if (!drivesBy(helper, verb)) return [];
    return [[word, ...own].join(' ')];
  });
};

/** A fenced block, indented in a list item or not: its body. */
const FENCE = /^[ \t]*```[^\n]*\n([\s\S]*?)^[ \t]*```/gmu;
/** Inline code, over line breaks. */
const INLINE = /`([^`]+)`/gu;

/**
 * R5. The commands of a markdown text that drive the app, as `<file>:
 * <command>`. A command is read in inline code or on a fenced line (a line
 * ending `\` joined to the next), from the helper (`sim`, or a word ending
 * `scripts/sim.ts`, at the code's start or after white space or `;&|(`,
 * however it is reached) or `agent-device`; its verb is the next word that
 * is no option. `sim`'s `open`, `tap`, `fill`, `back`, `scroll`, `gesture`,
 * `pinch`, `hold` and `relaunch` drive; every `agent-device` verb but
 * `snapshot` drives. Prose is not read: "tap Skip" in a sentence is no command.
 */
export const proseDrives = (file: string, text: string): ReadonlyArray<string> => {
  const fenced = Array.from(text.matchAll(FENCE), ([, body]) =>
    (body ?? '').replace(/\\\n\s*/gu, ' ').split('\n'),
  ).flat();
  const prose = text.replace(FENCE, '');
  const inline = Array.from(prose.matchAll(INLINE), ([, code]) =>
    (code ?? '').replace(/\s+/gu, ' '),
  );
  return [...fenced, ...inline].flatMap(drivesIn).map((command) => `${file}: ${command}`);
};

/**
 * The files of verify-heartseed that still drive in prose, each with why:
 * `SKILL.md` alone, since it documents the commands.
 */
export const LEGACY: ReadonlyMap<string, string> = new Map([
  ['SKILL.md', 'it documents the commands a journey and a by-hand step run'],
]);

/** A feature file's stem: `first` of `features/first.md`. */
const stemOf = (file: string) => /^features\/(.+)\.md$/u.exec(file)?.[1] ?? '';

/**
 * R6. Each journey's owner: its feature is `<stem>` or `<stem>-<slug>` of a
 * `features/<stem>.md` among `files`, and that file runs it in a `sim journey
 * <feature>` command. A journey no such file runs is a fault.
 */
export const ownerFaults = (
  journeys: ReadonlyArray<Journey>,
  files: ReadonlyMap<string, string>,
): ReadonlyArray<string> =>
  journeys.flatMap((journey) => {
    const owners = [...files].filter(([file, text]) => {
      const stem = stemOf(file);
      const owns =
        stem !== '' && (journey.feature === stem || journey.feature.startsWith(`${stem}-`));
      return (
        owns && new RegExp(`\\bsim\\s+journey\\s+${journey.feature}(?![\\w-])`, 'u').test(text)
      );
    });
    if (owners.length > 0) return [];
    return [`${journey.feature} is run by no features/<stem>.md of its name`];
  });

/** A cite of a journey's step in inline code: `<journey>/<step>`. */
const CITE = /`([a-z0-9]+(?:-[a-z0-9]+)*)\/([a-z0-9]+(?:-[a-z0-9]+)*)`/gu;

/**
 * R6. In each file off the legacy list, each inline `<journey>/<step>` whose
 * journey ships and names no such step, as `<file>: <journey>/<step>`.
 */
export const citeFaults = (
  journeys: ReadonlyArray<Journey>,
  files: ReadonlyMap<string, string>,
): ReadonlyArray<string> => {
  const steps = new Map(
    journeys.map((journey) => [journey.feature, new Set(journey.steps.map((step) => step.name))]),
  );
  return [...files]
    .filter(([file]) => !LEGACY.has(file))
    .flatMap(([file, text]) =>
      Array.from(text.matchAll(CITE)).flatMap(([, feature = '', step = '']) => {
        const names = steps.get(feature);
        if (names === undefined || names.has(step)) return [];
        return [`${file}: ${feature}/${step} names no step of ${feature}`];
      }),
    );
};
