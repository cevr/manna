import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';
import { type Command, Receipt } from './command.ts';
import { contextAt } from './context.ts';
import { byGroup, contextRows, menuRows, rowChord, rowKey, sheetRows, viewRows } from './menu.ts';

const command = (id: string, group: string, label: string): Command => ({
  id,
  label,
  group,
  touch: 'a test command',
  when: () => true,
  run: () => Effect.succeed(Receipt.Quiet()),
});

/** A command found only by typing in ⌘K (`Command.typed`). */
const typed: Command = {
  ...command('go.scene.cold', 'Go to', 'Go to scene cold'),
  typed: true,
};

const commands = [
  command('play.toggle', 'Transport', 'Play or pause'),
  command('edit.undo', 'Edit', 'Undo'),
  command('play.frame-next', 'Transport', 'Next frame'),
];
const ctx = contextAt('ask', '/films/f/studio');

describe('the command menu and the sheet', () => {
  test('group commands where their group first comes, keeping their order within it', () => {
    expect(byGroup(commands).map(([g, cs]) => [g, cs.map((c) => c.id)])).toEqual([
      ['Transport', ['play.toggle', 'play.frame-next']],
      ['Edit', ['edit.undo']],
    ]);
  });

  test('the menu matches every word typed, in the label, the group or the id', () => {
    expect(menuRows(commands, ctx, '').map((r) => r.command.id)).toEqual([
      'play.toggle',
      'play.frame-next',
      'edit.undo',
    ]);
    expect(menuRows(commands, ctx, 'next FRAME').map((r) => r.label)).toEqual(['Next frame']);
    expect(menuRows(commands, ctx, 'transport pause').map((r) => r.command.id)).toEqual([
      'play.toggle',
    ]);
    expect(menuRows(commands, ctx, 'edit.un').map((r) => r.command.id)).toEqual(['edit.undo']);
    expect(menuRows(commands, ctx, 'nothing')).toEqual([]);
  });

  test('a typed command is a row once a word is typed, and never in the sheet or a context menu', () => {
    const goes = [typed];
    const all = [...commands, ...goes];
    expect(menuRows(all, ctx, '').map((r) => r.command.id)).not.toContain('go.scene.cold');
    expect(menuRows(all, ctx, 'cold').map((r) => r.label)).toEqual(['Go to scene cold']);
    expect(sheetRows(all, () => []).map(([group]) => group)).toEqual(['Transport', 'Edit']);
    expect(contextRows(all, ctx)).toEqual([]);
  });

  test('the sheet lists every command a key is bound to, one found only by typing too', () => {
    const goes = [typed];
    const bound = (id: string) => ['g'].filter(() => id === 'go.scene.cold');
    expect(sheetRows([...commands, ...goes], bound).map(([group]) => group)).toEqual([
      'Transport',
      'Edit',
      'Go to',
    ]);
  });

  test('the view menu lists the View commands available, then what it ends on, each at its step', () => {
    const view = [command('review.captions', 'View', 'Captions'), ...commands];
    const sheet = command('app.keys', 'Help', 'Keyboard shortcuts');
    expect(viewRows(view, ctx, [sheet]).map((r) => [r.command.id, r.step])).toEqual([
      ['review.captions', 'normal'],
      ['app.keys', 'normal'],
    ]);
  });
});

describe("a stepped command in a context menu (a finger's Shift)", () => {
  test('is a row at its step and a row at its coarse step (×10), each its own row', () => {
    const next: Command = {
      ...command('play.frame-next', 'Transport', 'Next frame'),
      stepped: true,
      about: ['Page'],
    };
    const scene: Command = {
      ...command('play.scene-next', 'Transport', 'Next scene'),
      about: ['Page'],
    };
    const rows = contextRows([next, scene], ctx).flatMap(([, r]) => r);
    expect(rows.map((r) => [r.command.id, r.label, r.step])).toEqual([
      ['play.frame-next', 'Next frame', 'normal'],
      ['play.frame-next', 'Next frame ×10', 'coarse'],
      ['play.scene-next', 'Next scene', 'normal'],
    ]);
    expect(new Set(rows.map(rowKey)).size).toBe(rows.length);
    // Its keys read as the keymap steps them: the coarse row's with Shift.
    expect(rows.slice(0, 2).map((r) => rowChord(r, 'arrowright'))).toEqual([
      'arrowright',
      'shift+arrowright',
    ]);
  });

  test('⌘K and a chip list it once, at its step', () => {
    const next: Command = {
      ...command('play.frame-next', 'Transport', 'Next frame'),
      stepped: true,
    };
    expect(menuRows([next], ctx, '').map((r) => [r.label, r.step])).toEqual([
      ['Next frame', 'normal'],
    ]);
  });
});
