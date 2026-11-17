/**
 * The Aa sheet as its Contract writes it (spec, "What must be true of the
 * sheet"): a modal route of medium and large height over the screen it
 * previews, opened by `typeOpen` and closed by Done; each control a named
 * radio group; each font's tile named by its name and kind and at least 84
 * points tall, the chosen one ringed in the ink; every button at least 44
 * points; the size announced as it changes; and each choice, Reset among
 * them, a selection tick before it is kept.
 */

import { describe, expect, it } from 'bun:test';

import { readContracts } from '../../tools/look';

const contracts = readContracts();
const type = contracts.get('features/type.contract') ?? '';
const app = contracts.get('app.contract') ?? '';

/** The body of the action `name` in `text`. */
const bodyOf = (text: string, name: string) =>
  new RegExp(`^ {2}action ${name}\\b[^\\n]*\\n((?: {4,}[^\\n]*\\n?)*)`, 'mu').exec(text)?.[1] ?? '';

/** The line of `text` holding `testId="<id>"` or a template id starting with `<id>`. */
const lineOf = (text: string, id: string) =>
  text
    .split('\n')
    .find((line) => line.includes(`testId="${id}"`) || line.includes(`testId=\`${id}`)) ?? '';

describe('the route', () => {
  it('is a modal sheet of medium and large height, opened by typeOpen and closed by Done', () => {
    expect(app).toMatch(/^ {4}typeSheet "\/type"$/mu);
    expect(lineOf(type, 'type-sheet')).toContain('navigationPresentation="modal"');
    expect(lineOf(type, 'type-sheet')).toContain('navigationDetent="medium large"');
    expect(bodyOf(type, 'typeOpen').trim()).toBe('nav = push(nav, "/type")');
    expect(bodyOf(type, 'typeDone').trim()).toBe('nav = back(nav)');
    expect(app).toMatch(/TypeSheet\(route=e\.id, type=typeShown, [^\n]*done=typeDone\)/u);
  });
});

describe('a screen reader and a finger', () => {
  it('each control is a radio group with a name', () => {
    expect(type).toContain('row role="radiogroup" aria-label="Font"');
    expect(type).toContain('row role="radiogroup" aria-label=group');
    expect(
      [...type.matchAll(/TypeSegments\(line="([^"]+)", group="([^"]+)"/gu)].map((m) => [
        m[1],
        m[2],
      ]),
    ).toEqual([
      ['Line spacing', 'Line spacing'],
      ['Letter spacing', 'Letter spacing'],
      ['Line width', 'Line width'],
    ]);
  });

  it('each tile is a radio named by its spoken name, 84 points tall, the chosen one ringed in the ink', () => {
    const tile = lineOf(type, 'type-font-');
    expect(tile).toContain('role="radio"');
    expect(tile).toContain('aria-label=f.spoken');
    expect(tile).toContain('min-height=84');
    expect(tile).toContain('border-color=(type.font == f.value ? "hs.ink" : "hs.card")');
  });

  it('the size buttons, the size and Reset: 44 points, announced, named', () => {
    for (const id of ['type-smaller', 'type-larger', 'type-reset'])
      expect([id, lineOf(type, id).includes('min-height=44')]).toEqual([id, true]);
    expect(lineOf(type, 'type-smaller')).toContain('aria-label="Smaller text"');
    expect(lineOf(type, 'type-larger')).toContain('aria-label="Larger text"');
    expect(lineOf(type, 'type-size')).toContain('role="status" aria-label=type.sizeSpoken');
    expect(lineOf(type, 'type-reset')).toContain('disabled=(not type.differs)');
  });
});

describe('each choice ticks, then is kept', () => {
  for (const [prop, action, kept] of [
    ['font', 'typeChooseFont', 'typeFontKept'],
    ['size', 'typeChooseSize', 'typeSizeKept'],
    ['line', 'typeChooseLine', 'typeLineKept'],
    ['letter', 'typeChooseLetter', 'typeLetterKept'],
    ['width', 'typeChooseWidth', 'typeWidthKept'],
  ] as const)
    it(`the sheet's ${prop} ticks, then keeps the choice`, () => {
      expect(app).toContain(`${prop}=${action}`);
      expect(
        bodyOf(type, action)
          .trim()
          .split('\n')
          .map((line) => line.trim()),
      ).toEqual(['feelTick()', `${kept} = value`]);
    });

  it('Reset ticks, then empties all five', () => {
    expect(app).toContain('reset=typeReset');
    expect(
      bodyOf(type, 'typeReset')
        .trim()
        .split('\n')
        .map((line) => line.trim()),
    ).toEqual([
      'feelTick()',
      'typeFontKept = ""',
      'typeSizeKept = ""',
      'typeLineKept = ""',
      'typeLetterKept = ""',
      'typeWidthKept = ""',
    ]);
  });

  it('finds a choice with no tick', () => {
    expect(
      bodyOf(
        '  action typeChooseFont(value: string)\n    typeFontKept = value\n',
        'typeChooseFont',
      ),
    ).not.toContain('feelTick');
  });
});
