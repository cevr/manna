/* oxlint-disable effect/noAsyncFunction, effect/noNullish -- the cases mount the root route in happy-dom through React's promise-based `act`; the DOM answers an absent node or attribute as null or undefined. */

/**
 * The way to the field is always within reach of a tap. `Your field` sits
 * in Today's header, outside its scroll view, so a recital that adds the
 * recap, the grades and the growth line never pushes it below the fold or
 * into the home indicator's area; the screen rig faults any frame that puts
 * it inside a scroll view. That one view of Say it decides both whether the
 * control is offered and whether the field stays open is
 * `reach-held.test.tsx`'s.
 */

import { describe, expect, it } from 'bun:test';
import { act } from 'react';
import passage from 'virtual:heartseed-passage';

import { recallOf } from '../test/field-model';
import { mount, record, scrolled } from '../test/field-rig';
import { device } from '../test/one';

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
});
