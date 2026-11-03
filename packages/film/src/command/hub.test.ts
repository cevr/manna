import { describe, expect, test } from 'bun:test';
import { Effect, Layer } from 'effect';
import { Clipboard } from '../browser/clipboard.ts';
import { hostOf } from '../browser/host.ts';
import { Keys } from '../browser/keys.ts';
import { type Command, type Receipt, quietly, said } from './command.ts';
import { makeHub } from './hub.ts';
import { pageHref } from '../core/api.ts';

interface Held {
  readonly shiftKey?: boolean;
  readonly altKey?: boolean;
  readonly metaKey?: boolean;
  readonly ctrlKey?: boolean;
}

const pageWith = (href = pageHref.ask('a1'), mac = true) => {
  const target = new EventTarget();
  const host = hostOf(
    Layer.mergeAll(Keys.layerOn(target, mac), Clipboard.memory([], 'https://lab.slow.test')),
  );
  const hub = Effect.runSyncWith(host)(makeHub('ask', () => href));
  const stop = Effect.runCallbackWith(host)(hub.listen);
  const keydown = (key: string, held: Held = {}) => {
    const e = Object.assign(new Event('keydown', { cancelable: true }), { key, ...held });
    target.dispatchEvent(e);
    return e.defaultPrevented;
  };
  const pointer = (type: string) => () =>
    target.dispatchEvent(Object.assign(new Event(type), { pointerId: 1 }));
  return {
    hub,
    stop,
    keydown,
    pointerdown: pointer('pointerdown'),
    pointerup: pointer('pointerup'),
    blur: () => target.dispatchEvent(new Event('blur')),
  };
};

const counter = (id: string, over: Partial<Omit<Command, 'touch'>> = {}) => {
  const ran: Array<string> = [];
  const command: Command = {
    id,
    label: id,
    group: 'test',
    touch: 'a test command',
    when: () => true,
    run: quietly((_ctx, how) => {
      ran.push(how.step);
    }),
    ...over,
  };
  return { command, ran };
};

describe('the hub', () => {
  test("is the page's one key listener: a bound press runs its command and is taken", () => {
    const { hub, stop, keydown } = pageWith();
    const frame = counter('play.frame-next', { keys: ['arrowright'], stepped: true });
    hub.commands.register(frame.command);
    expect([
      keydown('ArrowRight'),
      keydown('ArrowRight', { shiftKey: true }),
      keydown('q'),
    ]).toEqual([true, true, false]);
    expect(frame.ran).toEqual(['normal', 'coarse']);
    stop();
    keydown('ArrowRight');
    expect(frame.ran).toEqual(['normal', 'coarse']);
  });

  test('hears a part whose wrapper keeps its presses from the page: one it takes goes no further', () => {
    const { hub, stop } = pageWith();
    const frame = counter('play.frame-next', { keys: ['arrowright'] });
    hub.commands.register(frame.command);
    const part = new EventTarget();
    const reached: Array<string> = [];
    const host = hostOf(Keys.layerOn(new EventTarget()));
    const unheard = Effect.runCallbackWith(host)(hub.listenWithin(part));
    part.addEventListener('keydown', (e) => {
      if (!e.cancelBubble) reached.push(String(Reflect.get(e, 'key')));
    });
    const press = (key: string) => {
      const e = Object.assign(new Event('keydown', { cancelable: true }), { key });
      part.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect([press('ArrowRight'), press('q')]).toEqual([true, false]);
    expect(frame.ran).toEqual(['normal']);
    expect(reached).toEqual(['q']);
    unheard();
    press('ArrowRight');
    expect(frame.ran).toEqual(['normal']);
    stop();
  });

  test('every press is heard, bound or not, apart from what it runs, until its listener stops', () => {
    const { hub, stop, keydown } = pageWith();
    const frame = counter('play.frame-next', { keys: ['arrowright'] });
    hub.commands.register(frame.command);
    let heard = 0;
    const unheard = hub.presses(() => {
      heard += 1;
    });
    keydown('ArrowRight');
    keydown('q');
    expect([heard, frame.ran.length]).toEqual([2, 1]);
    unheard();
    keydown('q');
    expect(heard).toBe(2);
    stop();
  });

  test('starts with nothing selected and takes what the page refines it with; receipts reach their sinks', () => {
    const { hub } = pageWith();
    expect(hub.context().selection).toEqual([]);
    const stopRefining = hub.refine((ctx) => ({ ...ctx, playing: true }));
    expect(hub.context().playing).toBe(true);
    stopRefining();
    expect(hub.context().playing).toBe(false);
    const heard: Array<readonly [Receipt, string]> = [];
    hub.receipts((receipt, slot) => heard.push([receipt, slot]));
    hub.commands.register({
      id: 'x',
      label: 'x',
      group: 'test',
      touch: 'a test command',
      when: () => true,
      run: () => Effect.succeed(said('done')),
    });
    hub.invokeId('x', { step: 'normal', via: 'menu' });
    hub.announce(said('wrote'), 'edit');
    expect(heard).toEqual([
      [said('done'), 'x'],
      [said('wrote'), 'edit'],
    ]);
  });

  test('runs a command only where it is available, however it is asked for', () => {
    const { hub, keydown } = pageWith();
    const playing = counter('play.only', { keys: ['p'], when: (ctx) => ctx.playing });
    hub.commands.register(playing.command);
    hub.invokeId('play.only', { step: 'normal', via: 'menu' });
    expect(keydown('p')).toBe(false);
    expect(playing.ran).toEqual([]);
    hub.refine((ctx) => ({ ...ctx, playing: true }));
    hub.invokeId('play.only', { step: 'normal', via: 'menu' });
    expect(keydown('p')).toBe(true);
    expect(playing.ran).toEqual(['normal', 'normal']);
  });

  test('runs a command with the input that asked: its own, else the one the viewer last used', () => {
    const { hub, keydown, pointerdown } = pageWith();
    const inputs: Array<string> = [];
    hub.commands.register(
      counter('note.frame', {
        keys: ['n'],
        run: quietly((_ctx, how) => {
          inputs.push(how.input);
        }),
      }).command,
    );
    const button = { step: 'normal', via: 'button' } as const;
    expect(hub.input()).toBe('pointer');
    hub.invokeId('note.frame', button);
    keydown('n');
    expect(hub.input()).toBe('key');
    hub.invokeId('note.frame', button);
    pointerdown();
    hub.invokeId('note.frame', button);
    hub.invokeId('note.frame', { ...button, input: 'key' });
    expect(inputs).toEqual(['pointer', 'key', 'key', 'pointer', 'key']);
  });

  test("a key pressed while a pointer is down is the press's: the input that started a click is the click's", () => {
    const { hub, keydown, pointerdown, pointerup, blur } = pageWith();
    keydown('a');
    pointerdown();
    keydown('Shift', { shiftKey: true });
    expect(hub.input()).toBe('pointer');
    pointerup();
    keydown('Shift', { shiftKey: true });
    expect(hub.input()).toBe('key');
    pointerdown();
    keydown('Shift', { shiftKey: true });
    expect(hub.input()).toBe('pointer');
    blur();
    keydown('Shift', { shiftKey: true });
    expect(hub.input()).toBe('key');
  });

  test('a step through the history is a key only when a key the browser walks it by asked, once', () => {
    const { hub, keydown, pointerdown, pointerup } = pageWith();
    expect(hub.traversed()).toBe('pointer');
    for (const walk of [
      { key: 'ArrowLeft', held: { altKey: true } },
      { key: 'ArrowRight', held: { altKey: true } },
      { key: '[', held: { metaKey: true } },
      { key: ']', held: { metaKey: true } },
      { key: 'ArrowLeft', held: { metaKey: true } },
      { key: 'BrowserBack', held: {} },
      { key: 'BrowserForward', held: {} },
    ]) {
      keydown(walk.key, walk.held);
      expect([walk.key, hub.traversed()]).toEqual([walk.key, 'key']);
      expect([walk.key, hub.traversed()]).toEqual([walk.key, 'pointer']);
    }
    keydown('Shift', { shiftKey: true });
    expect(hub.traversed()).toBe('pointer');
    keydown('ArrowLeft', { altKey: true });
    pointerdown();
    pointerup();
    expect(hub.traversed()).toBe('pointer');
    hub.commands.register(counter('take.left', { keys: ['alt+arrowleft'] }).command);
    expect(keydown('ArrowLeft', { altKey: true })).toBe(true);
    expect(hub.traversed()).toBe('pointer');
  });
});
