/* oxlint-disable effect/noNodeBuiltinImport, effect/noAsyncFunction, effect/noGlobals -- a Bun test reading tracked source files, as the gate's other source checks do. */

/**
 * The Contract's study actions are `studyStep`'s compositions, read from
 * the Contract files' text as `src/read/read.test.ts` reads Read's: each
 * action of `features/study.contract`, so a change to one fails here until
 * `step.ts` and its model test say the same. Also the seams the chapter
 * holds: the verse's text selectable and built again by each hold, no
 * `contextmenu` on a verse (it would take iOS's long press from the
 * selection, gesture.md), the hint's two clauses, the route, and the
 * folds' line counts.
 */

import { expect, it } from 'bun:test';
import { join } from 'node:path';

import { DEF_LINES, NOTE_LINES } from './sheet';

const APP = join(import.meta.dir, '../..');
const read = (path: string) => Bun.file(join(APP, path)).text();

const SHEET = 'path("studySheet", `${readBook}`, `${readChapter}`, `${verse}`';
const AT = 'studyAt.params.book, studyAt.params.chapter';
const LINE = `\${readTop.id} \${studyAt.params.book} \${studyAt.params.chapter} \${studyAt.params.verse} \${row} 0`;

it("holds each study action to studyStep's composition", async () => {
  const study = await read('features/study.contract');
  const blocks = [
    [
      '  action studyOpen(verse: number, tab: string)',
      '    studyWord = ""',
      '    studyUnfolded = []',
      '    studyRow = -1',
      `    nav = push(nav, ${SHEET}, tab))`,
    ],
    [
      '  action studySelected(verse: number, s: Selection)',
      '    if s.text != "" and not s.text.includes(" ") and not studyUp',
      '      studyHold(verse, s.start, s.end)',
    ],
    [
      '  action studyHold(verse: number, start: number, end: number)',
      '    feelTick()',
      '    studyHolds = studyHolds + 1',
      '    studyHeld = "held"',
      '    studyUnfolded = []',
      '    studyRow = -1',
      '    studyWord = `${readBook}.${readChapter}.${verse}:o${start}`',
      `    nav = push(nav, ${SHEET}, "words"))`,
    ],
    [
      '  action studyTab(tab: string)',
      '    feelTick()',
      `    nav = replace(nav, path("studySheet", ${AT}, studyAt.params.verse, tab))`,
    ],
    ['  action studyWordTap(index: number)', '    studyWord = `${studyPlace}:i${index}`'],
    [
      '  action studyFold(key: string)',
      '    if studyUnfolded.includes(key)',
      '      studyUnfolded = studyUnfolded.filter(k => k != key)',
      '    else',
      '      studyUnfolded = studyUnfolded.concat([key])',
    ],
    [
      '  action studyMove(verse: number)',
      '    feelTick()',
      '    studyWord = ""',
      '    studyUnfolded = []',
      `    nav = replace(nav, path("studySheet", ${AT}, \`\${verse}\`, "commentary"))`,
    ],
    [
      '  action studyFollow(book: number, chapter: number, verse: number, row: number)',
      `    studyBacks = studyBacks == "" ? \`${LINE}\` : \`\${studyBacks};${LINE}\``,
      '    chooserFirst = 0',
      '    chooserLast = 0',
      '    chooserAnswer = ""',
      '    nav = push(back(nav), path("readAt", `${book}`, `${chapter}`, `${verse}`) + `#verse-${verse}`)',
    ],
    ['  action studyDone', '    nav = back(nav)'],
    [
      '  task studyReturning when studyReturnShown.key != "" key=studyReturnShown.key',
      '    after(1, studyReturned)',
      '  action studyReturned',
      '    studyBacks = studyReturnShown.backs',
      '    if studyReturnShown.reopen',
      '      studyWord = ""',
      '      studyUnfolded = []',
      '      studyRow = studyReturnShown.row',
      '      nav = push(nav, path("studySheet", `${studyReturnShown.book}`, `${studyReturnShown.chapter}`, `${studyReturnShown.verse}`, "xrefs"))',
    ],
  ];
  for (const block of blocks) expect(study).toContain(`${block.join('\n')}\n`);
});

it('keeps the chapter seams: a selectable verse built again by each hold, no contextmenu, the hint', async () => {
  const chooser = await read('features/chooser.contract');
  expect(chooser).toContain('for k in [holds] key=k');
  expect(chooser).toMatch(/text [^\n]*user-select="text" selectionchange=select\(v\.verse\)/u);
  expect(chooser).toMatch(/text `\$\{v\.verse\}` user-select="none"/u);
  expect(chooser).not.toContain('contextmenu=');
  expect(chooser).toContain(
    'text (held ? "Tap a verse to plant or study it." : "Tap a verse to plant or study it. Hold a word for its Hebrew or Greek.")',
  );
  const app = await read('app.contract');
  expect(app).toContain('    studySheet "/read/study/:book/:chapter/:verse/:tab"\n');
  expect(app).toContain('select=studySelected, holds=studyHolds, held=(studyHeld != "")');
  const readContract = await read('features/read.contract');
  expect(readContract).toContain('or name == "studySheet"');
});

it('folds notes at NOTE_LINES and definitions at DEF_LINES, and opens the sheet large', async () => {
  const study = await read('features/study.contract');
  expect(study).toContain(
    `line-clamp=(n.folds and not unfolded.includes(n.key) ? ${NOTE_LINES} : 0)`,
  );
  expect(study).toContain(
    `line-clamp=(e.folds and not unfolded.includes(e.key) ? ${DEF_LINES} : 0)`,
  );
  expect(study).toContain('navigationDetent="medium large" navigationInitialDetent="large"');
  expect(study).toContain('text r.text line-clamp=3');
});

it("wraps the bar's buttons rather than squeeze one, and keeps the sheet's scroller under its header row", async () => {
  const study = await read('features/study.contract');
  const lines = study.split('\n');
  const bar = lines.find((line) => line.includes('testId="study-bar"')) ?? '';
  const button = lines.find((line) => line.includes('testId=`study-${b.tab}`')) ?? '';
  expect(bar).toContain('flex-wrap="wrap"');
  expect(button).toContain('flex=1');
  expect(button).not.toContain('min-width=0');
  const heading = lines.findIndex((line) => line.includes('testId="study-heading"'));
  expect(lines[heading - 1]).toContain('background-color="hs.ground"');
});
