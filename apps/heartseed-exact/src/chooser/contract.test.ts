/* oxlint-disable effect/noNodeBuiltinImport, effect/noAsyncFunction, effect/noGlobals -- a Bun test reading tracked source files, as the gate's other source checks do. */

/**
 * The chapter screen's Contract held to its rules by its text (spec,
 * acceptance 4): a verse's press is the chooser's tap behind the one tick;
 * the bar's filled buttons appear only under the offers `chapterRead`
 * makes (`shown.plant`, `shown.singles`) and run only while offered; a
 * chapter change clears the range (`chooserMoved`); the bar's rise and
 * leave and the opened verse's ease each choose on reduced motion (with
 * `src/look/motion.test.ts`, which holds every row's arms and tokens, and
 * `brand.test.ts`, which holds the colours).
 */

import { expect, it } from 'bun:test';
import { join } from 'node:path';

const APP = join(import.meta.dir, '../..');
const read = (path: string) => Bun.file(join(APP, path)).text();

/** The lines of `text` under the line that holds `head`, indented deeper than it. */
const blockUnder = (text: string, head: string) => {
  const lines = text.split('\n');
  const at = lines.findIndex((line) => line.includes(head));
  const indent = (line: string) => line.length - line.trimStart().length;
  const own = indent(lines[at] ?? '');
  const body: string[] = [];
  for (const line of lines.slice(at + 1)) {
    if (line.trim() !== '' && indent(line) <= own) break;
    body.push(line);
  }
  return body.join('\n');
};

it("taps a verse through the tick and the chooser's tap", async () => {
  const app = await read('app.contract');
  const chooser = await read('features/chooser.contract');
  const feel = await read('features/feel.contract');
  expect(app).toContain('ChapterPage(shown=chapterShown, ');
  expect(app).toContain(' tap=feelChooseVerse, ');
  expect(chooser).toMatch(/ row role="checkbox" [^\n]* press=tap\(v\.verse\) /u);
  expect(feel).toContain(
    '  action feelChooseVerse(verse: number)\n    feelTick()\n    chooserTapIt(verse)\n',
  );
  expect(blockUnder(chooser, 'action chooserTapIt(verse: number)')).toContain(
    'send chooserTapped = chapterTap(',
  );
});

it('draws a filled button only under its offer, and runs it only while offered', async () => {
  const chooser = await read('features/chooser.contract');
  const filled = [...chooser.matchAll(/^( *)button [^\n]*buttonStyle="filled"[^\n]*$/gmu)];
  expect(filled.map((each) => /press=(\w+)/u.exec(each[0])?.[1])).toEqual(['plant', 'join']);
  const lines = chooser.split('\n');
  const guards = filled.map((each) => {
    const at = lines.indexOf(each[0]);
    return lines[at - 1]?.trim();
  });
  expect(guards).toEqual(['if shown.plant', 'if shown.singles']);
  expect(blockUnder(chooser, 'if shown.landed')).toContain('text "Planted." role="status"');
  expect(blockUnder(chooser, 'if shown.landed')).toMatch(
    /button press=practise buttonStyle="bordered"/u,
  );
  expect(blockUnder(chooser, 'if shown.already')).toBe(
    '            text "Already in your field." role="status" color="hs.quiet" testId="chapter-already"',
  );
  expect(blockUnder(chooser, 'action chooserPlantIt')).toContain(
    'if chapterShown.plant and not pending(chooserPlanted)',
  );
  expect(blockUnder(chooser, 'action chooserJoinIt')).toContain(
    'if chapterShown.singles and not pending(chooserPlanted)',
  );
});

it('clears the range when the chapter changes', async () => {
  const chooser = await read('features/chooser.contract');
  expect(chooser).toContain(
    '  task chooserMoved when readUp key=`${readBook}.${readChapter}`\n    change(chooserClear)\n',
  );
  expect(blockUnder(chooser, 'action chooserClear')).toBe(
    '    chooserFirst = 0\n    chooserLast = 0\n    chooserAnswer = ""',
  );
});

it("moves the bar and the opened verse by the brand's rows, each with its reduced arm", async () => {
  const chooser = await read('features/chooser.contract');
  expect(chooser).toContain(
    'animation=(still ? "hs-fade duration.fade easing.out both" : "hs-rise duration.rise easing.out both") -exact-exit-animation=(still ? "hs-fade-out duration.fade ease-out both" : "hs-leave duration.exit ease-out both") testId="chapter-bar"',
  );
  expect(chooser).toContain(
    'animation=(still ? "none" : "hs-landed duration.rise easing.out") testId="verse-landed"',
  );
  expect(chooser).toContain('keyframes hs-landed\n  from opacity=1\n');
});
