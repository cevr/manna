import { describe, expect, test } from 'bun:test';
import { Effect, Layer, Option } from 'effect';
import { Clipboard, ClipboardRefused } from '../browser/clipboard.ts';
import { hostOf } from '../browser/host.ts';
import { pageHref, reviewFileUrl } from '../core/api.ts';
import { BY_BUTTON, type Command, Receipt } from './command.ts';
import { contextAt, withSelection } from './context.ts';
import { linkCommands, linkOf } from './link.ts';
import { Selection } from './selection.ts';
import { EVERYWHERE, targetAt, targetAttr } from './target.ts';
import { contextRows } from './menu.ts';

const ORIGIN = 'https://lab.slow.test';

/** Copy link over a clipboard in memory, and what was written to it. */
const copier = () => {
  const written: Array<string> = [];
  const [command] = linkCommands(hostOf(Clipboard.memory(written, ORIGIN)));
  return { command: Option.getOrThrow(Option.fromUndefinedOr(command)), written };
};

const run = (command: Command, ctx: ReturnType<typeof contextAt>) =>
  Effect.runSync(command.run(ctx, { ...BY_BUTTON, input: 'pointer' }));

describe('Copy link', () => {
  const here = '/asks/a1?still=board-open.breath';
  const one = Selection.cases.Words.make({ scene: 'one', from: 0, to: 2 });
  const page = { ...contextAt('ask', here), selection: [one] };

  test("copies the page's own URL, whole, for a thing on it or for nothing", () => {
    const { command, written } = copier();
    expect(run(command, page)).toEqual(
      Receipt.Said({
        said: 'Copied the link to words 0–2 of one',
        undo: Option.none(),
        bound: Option.none(),
        tone: 'done',
      }),
    );
    run(command, withSelection(page, []));
    expect(written).toEqual([`${ORIGIN}${here}`, `${ORIGIN}${here}`]);
  });

  test('copies a file as itself: its link opens the file', () => {
    const file = withSelection(page, [Selection.cases.File.make({ ref: 'out/f/a b.mp4' })]);
    expect(linkOf(file)).toBe(reviewFileUrl('out/f/a b.mp4'));
  });

  test('says why when the browser keeps the link off the clipboard', () => {
    const refusing = Layer.succeed(
      Clipboard,
      Clipboard.of({
        copyLink: () => Effect.fail(new ClipboardRefused({ reason: 'NotAllowedError' })),
      }),
    );
    const [command] = linkCommands(hostOf(refusing));
    expect(
      Option.map(Option.fromUndefinedOr(command), (c) => run(c, withSelection(page, []))),
    ).toEqual(
      Option.some(
        Receipt.Said({
          said: 'The browser kept the link off the clipboard: NotAllowedError',
          undo: Option.none(),
          bound: Option.none(),
          tone: 'refused',
        }),
      ),
    );
  });
});

describe('a context menu', () => {
  const ctx = contextAt('ask', pageHref.ask('a1'));
  const about = (id: string, targets: Command['about']): Command => ({
    id,
    label: id,
    group: 'g',
    about: targets,
    touch: 'a test command',
    when: () => true,
    run: () => Effect.succeed(Receipt.Quiet()),
  });
  const commands = [
    about('anywhere', EVERYWHERE),
    about('beat.split', ['Beat']),
    about('page.only', ['Page']),
    about('both', ['Beat', 'Page']),
  ];
  const ids = (c: typeof ctx) =>
    contextRows(commands, c).flatMap(([, rows]) => rows.map((r) => r.command.id));

  test('lists the commands about the thing it opened on, or about the page, its own first', () => {
    expect(ids(withSelection(ctx, [Selection.cases.Beat.make({ beat: 'one' })]))).toEqual([
      'beat.split',
      'both',
      'anywhere',
    ]);
    expect(ids(ctx)).toEqual(['page.only', 'both', 'anywhere']);
  });

  test('reads the thing from the nearest marked element under the press', () => {
    const rise = Selection.cases.Beat.make({ beat: 'one' });
    const attr = targetAttr(rise);
    const marked = { getAttribute: (name: string) => new Map([['data-target', attr]]).get(name) };
    const press = Object.assign(new EventTarget(), {
      closest: (selector: string) => new Map([['[data-target]', marked]]).get(selector),
    });
    expect(targetAt(Option.some(press))).toEqual(Option.some(rise));
    const bare = Object.assign(new EventTarget(), {
      closest: () => Option.getOrNull(Option.none()),
    });
    expect(targetAt(Option.some(bare))).toEqual(Option.none());
    expect(targetAt(Option.some(new EventTarget()))).toEqual(Option.none());
  });
});
