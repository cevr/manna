/* oxlint-disable effect/noAsyncFunction, effect/noNewPromise, effect/noGlobals, effect/noNullish, effect/noFixedWaitInTests, effect/noRuntimeTypeof, eslint/no-await-in-loop -- the cases mount the root route in happy-dom through React's promise-based `act`, one of them under a registry whose subscriptions it holds (a proxy that binds the registry's own methods), and hand each turn over in `act` on the host's clock until the frame they wait on lands; the DOM answers an absent node or attribute as null or undefined. */

/**
 * The way to the field is always within reach of a tap. `Your field` sits
 * in Today's header, outside its scroll view, so a recital that adds the
 * recap, the grades and the growth line never pushes it below the fold or
 * into the home indicator's area; the screen rig faults any frame that puts
 * it inside a scroll view. And one view of Say it decides both whether the
 * control is offered and whether the field stays open: with every root
 * subscriber's news of Say it held back, a tap in the first frame that
 * offers the control after a growing recital opens the field.
 */

import { RegistryContext } from '@effect/atom-react';
import { describe, expect, it } from 'bun:test';
import { Effect, Layer } from 'effect';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import passage from 'virtual:heartseed-passage';

import Root from '../../app/index';
import { appLayer, runtime, sayItView } from '../app';
import { recite, scriptedSource } from '../dictation/script';
import { Chime } from '../garden';
import { Haptics } from '../sayit';
import { store } from '../store';
import { recallOf } from '../test/field-model';
import { mount, record, scrolled } from '../test/field-rig';
import { device } from '../test/one';
import { voiceSource } from '../voice/source';

/** A disk whose passage was planted at a seed long ago, so the next recital grows it. */
const planted = () => [record(recallOf(passage.reference, Date.UTC(2020, 0, 1, 12), 3, 0))];

describe('the way to the field', () => {
  it('sits outside Today’s scroll view, before and after a recital that grows the passage', async () => {
    device.launch(planted());
    const app = await mount(true);
    expect(await app.until(app.home)).toBe(true);
    await app.begin();
    expect(await app.until(() => app.control() !== undefined)).toBe(true);
    const before = app.stage();
    expect(scrolled(app.control() as Element)).toBe(false);
    await app.field();
    await app.back();
    await app.say();
    expect(await app.until(() => app.control() !== undefined)).toBe(true);
    expect({
      grew: app.stage() !== before,
      summary: app.summary() !== '',
      scrolled: scrolled(app.control() as Element),
      faults: app.faults,
    }).toEqual({ grew: true, summary: true, scrolled: false, faults: [] });
    expect(await app.leave()).toEqual([]);
  });

  it('keeps Today on screen when a recital starts in the turn of a tap on Your field', async () => {
    device.launch(planted());
    const app = await mount(true);
    expect(await app.until(app.home)).toBe(true);
    await app.begin();
    expect(await app.until(() => app.control() !== undefined)).toBe(true);
    const button = (label: string) =>
      [...document.querySelectorAll('[role="button"]')].find(
        (node) => node.getAttribute('aria-label') === label,
      );
    const click = (node: Element | undefined) =>
      node?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    await act(async () => {
      click(button('Say it'));
      click(app.control());
    });
    expect(await app.until(() => app.summary() !== '')).toBe(true);
    expect({
      headings: [...document.querySelectorAll('[role="heading"]')].map((node) => node.textContent),
      faults: app.faults,
    }).toEqual({ headings: ['Today'], faults: [] });
    expect(await app.leave()).toEqual([]);
  });

  it('opens at a tap in the first frame that offers it after a growing recital, with the root’s news of Say it held back', async () => {
    device.launch(planted());
    const chimed = Promise.withResolvers<void>();
    const layer = appLayer({
      source: scriptedSource(recite(passage.text, { skip: [10], every: 5, pace: 3 })),
      haptics: Layer.succeed(Haptics, Haptics.of({ tick: Effect.void })),
      store,
      chime: Layer.succeed(Chime, Chime.of({ grow: () => Effect.promise(() => chimed.promise) })),
      voice: voiceSource,
    });
    const registry = AtomRegistry.make({ initialValues: [[runtime.layer, layer]] });
    const hold = { on: false, subscribers: 0, held: [] as Array<() => void> };
    const subscribe: AtomRegistry.AtomRegistry['subscribe'] = (atom, f, options) => {
      if (atom !== sayItView) return registry.subscribe(atom, f, options);
      hold.subscribers += 1;
      const mine = hold.subscribers;
      return registry.subscribe(
        atom,
        (value) => {
          if (hold.on && mine < hold.subscribers) hold.held.push(() => f(value));
          else f(value);
        },
        options,
      );
    };
    const held: AtomRegistry.AtomRegistry = new Proxy(registry, {
      get: (target, key) => {
        if (key === 'subscribe') return subscribe;
        const value: unknown = Reflect.get(target, key, target);
        if (typeof value === 'function') return value.bind(target);
        return value;
      },
    });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () =>
      root.render(
        <RegistryContext.Provider value={held}>
          <Root />
        </RegistryContext.Provider>,
      ),
    );
    const button = (label: string) =>
      [...host.querySelectorAll('[role="button"]')].find(
        (node) => node.getAttribute('aria-label') === label,
      );
    const headings = () =>
      [...host.querySelectorAll('[role="heading"]')].map((node) => node.textContent);
    const until = async (holds: () => boolean, ms = 3000) => {
      const start = Date.now();
      while (!holds()) {
        if (Date.now() - start > ms) return false;
        await act(() => new Promise((resolve) => setTimeout(resolve, 1)));
      }
      return true;
    };
    const click = (node: Element | undefined) =>
      node?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    expect(await until(() => button('Begin') !== undefined)).toBe(true);
    await act(async () => click(button('Begin')));
    expect(await until(() => button('Your field') !== undefined)).toBe(true);
    await act(async () => click(button('Your field')));
    expect(await until(() => headings().includes('Your field'))).toBe(true);
    await act(async () => click(button('Begin')));
    expect(await until(() => button('Say it') !== undefined)).toBe(true);
    hold.on = true;
    await act(async () => click(button('Say it')));
    expect(await until(() => button('Listening') !== undefined)).toBe(true);
    const tapped = { at: 0 };
    const watch = new MutationObserver(() => {
      if (tapped.at > 0 || button('Your field') === undefined) return;
      tapped.at = 1;
      click(button('Your field'));
    });
    watch.observe(host, { subtree: true, childList: true, attributes: true, characterData: true });
    expect(await until(() => tapped.at > 0)).toBe(true);
    watch.disconnect();
    await until(() => device.disk.size > 1);
    await until(() => false, 20);
    const shown = { held: hold.held.length > 0, headings: headings() };
    hold.on = false;
    chimed.resolve();
    for (const each of hold.held) each();
    await act(async () => root.unmount());
    host.remove();
    expect(shown).toEqual({ held: true, headings: ['Your field'] });
  });
});
