/* oxlint-disable effect/noTernary, effect/noNullish -- a Bun test's reader of the app's own Contract text, line by line. */

/**
 * Every cue the port tells goes through the Feel, as the current hymnal's
 * every control tells its `Tell` (A2, the haptics guard this replaces):
 *
 * - no Contract line but `features/feel.contract`'s plays a `haptic(` or a
 *   sound (`playSound(`, or the voice's `feelSound(`): a call site names a
 *   cue, never a body;
 * - `feelTell` and `feelTellAt` give a body only under `if settingsFeel`,
 *   and `feelGive`, which gives one whatever the switch says, is told only
 *   by them and by the Sounds and haptics switch's own turn on;
 * - each `feelTell(` and `feelTellAt(` stands in the action the table below names, and every
 *   cue its first argument can name is a row of the Feel table, so a call
 *   site dropped, moved or misspelt fails here;
 * - every cue the current app's own source tells (`one-sites.testing.ts`),
 *   each stopping dial's wall among them, the port tells too, and no other,
 *   so a site of the current app never ported fails here.
 *
 * Each finder is first tried on a planted defect, so a finder that finds
 * nothing cannot pass.
 */

import { describe, expect, it } from 'bun:test';

import { appFile, contractFiles } from '../look/design.testing.ts';
import { PLAIN } from './cue-names.testing.ts';
import { FEEL_ROWS } from './cues.ts';
import { type OneFile, oneCues, oneFiles } from './one-sites.testing.ts';

/** The cues the key and capo dials' bar tells by its step's answer (`keysStep`'s `cue`: the current thumb.ts's). */
const THUMB = ['chords-on', 'chords-off', 'press', 'wall', 'reset'];

/** Each `feelTell(` by the action it stands in, and the cues its first argument can name. */
const SITES: ReadonlyArray<{ readonly action: string; readonly cues: ReadonlyArray<string> }> = [
  { action: 'playerSoundSwitch', cues: ['switch-off', 'switch-on'] },
  { action: 'let', cues: ['sheet-open'] },
  { action: 'opened', cues: ['press'] },
  { action: 'chordsSet', cues: ['chords-on', 'chords-off'] },
  { action: 'downloadsAsk', cues: ['choose'] },
  { action: 'favouriteKeep', cues: ['favourite-on'] },
  { action: 'favouriteKeep', cues: ['favourite-off'] },
  { action: 'findTurn', cues: ['detent-hundreds', 'detent-tens', 'detent-ones', 'rail-tick'] },
  { action: 'findTook', cues: ['zoom-out', 'zoom-in'] },
  { action: 'findSearch', cues: ['tab'] },
  { action: 'followTook', cues: ['seek-tick'] },
  { action: 'followAct', cues: ['seek-grab'] },
  { action: 'followAct', cues: ['seek-release'] },
  { action: 'followAct', cues: ['seek-release'] },
  { action: 'keysTook', cues: THUMB },
  { action: 'keysPressTook', cues: ['sheet-open'] },
  { action: 'keysPressTook', cues: ['choose'] },
  { action: 'keysKeyScrolled', cues: ['detent-key'] },
  { action: 'keysKeyAdjusted', cues: ['detent-key'] },
  { action: 'keysCapoAdjusted', cues: ['detent-capo'] },
  { action: 'keysCapoScrolled', cues: ['detent-capo'] },
  { action: 'listChoose', cues: ['tab'] },
  { action: 'listScrolled', cues: ['section'] },
  { action: 'playerAsk', cues: ['pause', 'play'] },
  { action: 'playerAsk', cues: ['pause', 'play'] },
  { action: 'playerAsk', cues: ['play'] },
  { action: 'playerAsk', cues: ['press'] },
  { action: 'playerAsk', cues: ['reset'] },
  { action: 'playerSeekDrag', cues: ['seek-grab'] },
  { action: 'playerSeekDrag', cues: ['seek-tick'] },
  { action: 'playerSeekLet', cues: ['seek-release'] },
  { action: 'railTook', cues: ['rail-tick'] },
  { action: 'readingSizeAdjusted', cues: ['detent-size'] },
  { action: 'readingSizeScrolled', cues: ['detent-size'] },
  { action: 'readingFontChoose', cues: ['choose'] },
  { action: 'readingSpacingChoose', cues: ['choose'] },
  { action: 'readingAwakeSet', cues: ['switch-on', 'switch-off'] },
  { action: 'settingsChoose', cues: ['choose'] },
  { action: 'settingsStyleChoose', cues: ['choose'] },
  { action: 'settingsPlacementChoose', cues: ['choose'] },
  { action: 'sheetPlaceAdjusted', cues: ['detent-placement'] },
  { action: 'sheetPlaceScrolled', cues: ['detent-placement'] },
  { action: 'sheetInherit', cues: ['reset'] },
  { action: 'playerCounted', cues: ['beat-accent', 'beat'] },
  { action: 'playerCountCheck', cues: ['beat'] },
  { action: 'scrolled', cues: ['detent-tempo'] },
  { action: 'adjusted', cues: ['detent-tempo'] },
  { action: 'feelHeld', cues: ['wall'] },
  { action: 'feelWheeled', cues: ['wall'] },
];

/** The find drums' names, as `detent-${drum}` spells their cues. */
const DRUMS = ['hundreds', 'tens', 'ones'];

/** What a cue argument the table cannot spell stands for: the bar's answer, by its name. */
const NAMED = new Map([['s.cue', THUMB]]);

interface Line {
  readonly at: string;
  readonly indent: number;
  readonly text: string;
}

/** A file's lines but its comments and blanks, each with its place and indent. */
const linesOf = (file: string, text: string): ReadonlyArray<Line> =>
  text
    .split('\n')
    .map((line, index) => ({
      at: `${file}:${index + 1}`,
      indent: line.length - line.trimStart().length,
      text: line.trim(),
    }))
    .filter((line) => line.text !== '' && !line.text.startsWith('//'));

/** The action whose block holds `lines[index]`. */
const actionOf = (lines: ReadonlyArray<Line>, index: number): string => {
  let indent = lines[index]?.indent ?? 0;
  for (let at = index - 1; at >= 0; at--) {
    const line = lines[at];
    if (line !== undefined && line.indent < indent) {
      const action = /^action\s+(\w+)/u.exec(line.text);
      if (action) return action[1] ?? '';
      indent = line.indent;
    }
  }
  return '';
};

/** Whether `lines[index]` stands under a line that reads `holder`. */
const under = (lines: ReadonlyArray<Line>, index: number, holder: string): boolean => {
  let indent = lines[index]?.indent ?? 0;
  for (let at = index - 1; at >= 0; at--) {
    const line = lines[at];
    if (line !== undefined && line.indent < indent) {
      if (line.text === holder) return true;
      indent = line.indent;
    }
  }
  return false;
};

/** The first argument of the call that opens at `from` (just past its `(`). */
const firstArgument = (text: string, from: number): string => {
  let depth = 0;
  for (let at = from; at < text.length; at++) {
    const c = text[at];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) return text.slice(from, at).trim();
      depth--;
    } else if (c === ',' && depth === 0) return text.slice(from, at).trim();
  }
  return text.slice(from).trim();
};

/** Every cue a cue argument can name: the string literals of its arms (past a choice's `?`), a drum's template spelt out, or what a named answer stands for. */
const cuesOf = (argument: string): ReadonlyArray<string> => {
  const named = NAMED.get(argument);
  if (named) return named;
  const arms = argument.includes('?') ? argument.slice(argument.indexOf('?') + 1) : argument;
  return [...arms.matchAll(/"([^"]*)"|`([^`]*)`/gu)].flatMap((found) => {
    const template = found[2];
    if (template === undefined) return [found[1] ?? ''];
    return template.includes('${drum}')
      ? DRUMS.map((drum) => template.replace('${drum}', drum))
      : [template];
  });
};

interface Call {
  readonly at: string;
  readonly name: string;
  readonly action: string;
  readonly cues: ReadonlyArray<string>;
  readonly felt: boolean;
}

/** Every call of `names` in a Contract text: its action, the cues it can tell, and whether `settingsFeel` holds it. */
const callsOf = (file: string, text: string, names: ReadonlyArray<string>): ReadonlyArray<Call> => {
  const lines = linesOf(file, text);
  return lines.flatMap((line, index) =>
    names.flatMap((name) =>
      [...line.text.matchAll(new RegExp(`(?<![\\w.])${name}\\(`, 'gu'))]
        .filter(() => !line.text.startsWith('action '))
        .map((found) => ({
          at: line.at,
          name,
          action: actionOf(lines, index),
          cues: cuesOf(firstArgument(line.text, (found.index ?? 0) + found[0].length)),
          felt: under(lines, index, 'if settingsFeel'),
        })),
    ),
  );
};

const files = contractFiles().map((file) => ({ file, text: appFile(file) }));
const FEEL = 'features/feel.contract';
const all = (names: ReadonlyArray<string>) =>
  files.flatMap(({ file, text }) => callsOf(file, text, names));
const tells = all(['feelTell', 'feelTellAt']);
const rows = new Set(FEEL_ROWS.map((row) => row.cue));

/** Each dial whose push past an end the port tells as a wall, as `wall-<dial>`: the dial each call of `feelHeld` or `feelWheeled` names, of those of the two whose block tells `wall` (`walling`); a find drum's `drum` is each drum drawn with `wraps=false`. */
const portWalls = (
  sources: ReadonlyArray<{ readonly text: string }>,
  walling: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  const names = ['feelHeld', 'feelWheeled'].filter((name) => walling.includes(name));
  if (names.length === 0) return [];
  const code = sources.map(({ text }) =>
    linesOf('', text)
      .map((line) => line.text)
      .join('\n'),
  );
  const drums = code.flatMap((text) =>
    [...text.matchAll(/FindDrum\(drum="(\w+)"[^)\n]*\bwraps=false/gu)].map(
      (found) => found[1] ?? '',
    ),
  );
  return code
    .flatMap((text) => [
      ...text.matchAll(
        new RegExp(`(?<![\\w.])(?:${names.join('|')})\\((?:"(\\w+)"|drum\\b)`, 'gu'),
      ),
    ])
    .flatMap((found) => (found[1] === undefined ? drums : [found[1]]))
    .map((dial) => `wall-${dial}`);
};

/** Every cue the port tells, a stopping dial's wall as `wall-<dial>`, sorted. */
const portCues = (sources: ReadonlyArray<{ readonly file: string; readonly text: string }>) => {
  const told = sources.flatMap(({ file, text }) => callsOf(file, text, ['feelTell', 'feelTellAt']));
  const walling = told.filter((call) => call.cues.includes('wall')).map((call) => call.action);
  return [
    ...new Set([...told.flatMap((call) => call.cues), ...portWalls(sources, walling)]),
  ].toSorted();
};

describe('the finders find a planted defect', () => {
  it('a call, its action, its cues and whether the setting holds it', () => {
    const text = [
      'members X',
      '  action a(kind: string)',
      '    if settingsFeel',
      '      if kind == "x"',
      '        haptic("selection")',
      '    feelTell(on ? "chords-on" : `detent-${drum}`, n)',
      '    feelTell(s.cue, 0)',
      '  action feelTell(cue: string)',
    ].join('\n');
    expect(
      callsOf('x', text, ['haptic', 'feelTell']).map(({ name, action, cues, felt }) => ({
        name,
        action,
        cues,
        felt,
      })),
    ).toEqual([
      { name: 'haptic', action: 'a', cues: ['selection'], felt: true },
      {
        name: 'feelTell',
        action: 'a',
        cues: ['chords-on', 'detent-hundreds', 'detent-tens', 'detent-ones'],
        felt: false,
      },
      { name: 'feelTell', action: 'a', cues: THUMB, felt: false },
    ]);
  });

  it('the current app’s cues, each stopping dial’s wall and each drum among them', () => {
    const one: ReadonlyArray<OneFile> = [
      { path: 'src/player/dial.ts', text: "cues.push({ _tag: 'wall' });" },
      {
        path: 'src/player/drums.ts',
        text: "hundreds: { name: 'hundreds', count: 7, wrap: false },\ntens: { name: 'tens', count: 10, wrap: true },",
      },
      {
        path: 'src/player/Dials.tsx',
        text: '<DialView dial="capo" wrap={false} onTurn={(c) => f(c)} />\n<DialView dial="key" wrap />',
      },
      {
        path: 'src/player/FindDrums.tsx',
        text: '<DialView\n  dial={drum}\n  wrap={DRUMS[drum].wrap}\n/>',
      },
      {
        path: 'src/x.tsx',
        text: "cue(plain((on && 'chords-on') || 'chords-off'));\nplain(chord);\ntell({ _tag: 'beat', accent });\n{ _tag: 'selection' }",
      },
    ];
    expect(oneCues(one, PLAIN)).toEqual([
      'beat',
      'beat-accent',
      'chords-off',
      'chords-on',
      'detent-capo',
      'detent-hundreds',
      'detent-key',
      'detent-tens',
      'wall-capo',
      'wall-hundreds',
    ]);
    expect(
      portCues([
        {
          file: 'x',
          text: [
            'members X',
            '  action feelHeld(dial: string, x: number, end: number)',
            '    feelTell("wall", 0)',
            '  action a',
            '    feelHeld("capo", x, 1)',
            '    feelTell("press", 0)',
            '  action b',
            '    // feelWheeled("tempo", x, 1, 2)',
            '    feelHeld(drum, x, 1)',
            '  view',
            '    FindDrum(drum="hundreds", wraps=false)',
            '    FindDrum(drum="tens", wraps=true)',
          ].join('\n'),
        },
      ]),
    ).toEqual(['press', 'wall', 'wall-capo', 'wall-hundreds']);
  });

  it('a call inside another’s argument, not a name ending in the call’s', () => {
    expect(
      callsOf(
        'x',
        '  action a\n    feelTell(f(1, "z") == "y" ? "a" : "b", 0)\n    x.feelTell("c")\n    myfeelTell("d")',
        ['feelTell'],
      ).map((c) => c.cues),
    ).toEqual([['a', 'b']]);
  });
});

describe('every cue goes through the Feel', () => {
  it('plays a haptic or a sound in features/feel.contract alone', () => {
    const bodies = all(['haptic', 'playSound', 'feelSound']);
    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies.filter((call) => !call.at.startsWith(`${FEEL}:`)).map((call) => call.at)).toEqual(
      [],
    );
  });

  it('gives a body from feelTell and feelTellAt only under Sounds and haptics, and from feelGive only there and at the switch’s turn on', () => {
    const gives = all(['feelGive']);
    expect(
      gives
        .map(({ action, felt }) => ({ action, felt }))
        .toSorted((a, b) => a.action.localeCompare(b.action)),
    ).toEqual([
      { action: 'feelTell', felt: true },
      { action: 'feelTellAt', felt: true },
      { action: 'settingsFeelSet', felt: false },
    ]);
    expect(gives.find((call) => call.action === 'settingsFeelSet')?.cues).toEqual(['switch-on']);
  });

  it('tells each cue from the action the current app tells it from', () => {
    const site = ({
      action,
      cues,
    }: {
      readonly action: string;
      readonly cues: ReadonlyArray<string>;
    }) => `${action}: ${[...cues].toSorted().join(' ')}`;
    expect(tells.map(site).toSorted()).toEqual(SITES.map(site).toSorted());
  });

  it('tells every cue the current app’s source tells, a wall on each dial that stops, and no other', () => {
    expect(portCues(files)).toEqual([...oneCues(oneFiles(), PLAIN)]);
  });

  it('names a row of the Feel table in every cue it tells', () => {
    for (const call of tells)
      for (const cue of call.cues)
        expect({ at: call.at, cue, row: rows.has(cue) }).toEqual({ at: call.at, cue, row: true });
  });
});
