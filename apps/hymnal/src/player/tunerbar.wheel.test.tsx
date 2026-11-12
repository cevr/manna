/**
 * The key button's wheel (owner, 2026-11-11: "long press opens a sort of
 * radial menu we can gesture"), mounted whole over a player and a reader's
 * store (`src/test/bar.tsx`).
 *
 * - R3 a hold and a slide up opens the tuner, chords as they were;
 * - R4 a hold let go in the middle does nothing;
 * - R5 a hold slid to Chords off turns chords off;
 * - R6 with no ear there is no Tuner item and no `tuner` action;
 * - R7 the open dials hold no Tuner chip, and Reset still shows when moved;
 * - R8 VoiceOver's `tuner` opens the tuner, `keyUp` and `keyDown` move the key a semitone;
 * - R9 the item under the finger draws on the button's fill under its ink,
 *   the others on the panel under the ink in the edge.
 *
 * The moves go to each item's slot from the wheel's origin (`toSlot`), and
 * a hold is played through its gesture's own callbacks
 * (`src/test/gesture.tsx`), the stand-in's hold being the handler's own
 * 350 ms. Hymn numbers only: no hymn's words are read.
 */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';
import { act } from 'react';

import { plain } from '~/feel/cue';

import { chordsOn, hold, keyButton, onPage, px, toSlot } from '../test/bar';
import { routed } from '../test/one';
import { actionsOf, perform } from '../test/props';

describe('the key button’s wheel', () => {
  it('R3: a hold slid up opens the tuner once, chords as they were, with a tick on the Tuner', () => {
    using page = onPage(chordsOn(), true);
    const held = hold();
    expect(Option.isSome(page.find('[data-testid="key-wheel"]'))).toBe(true);
    held.move(...toSlot('tuner'));
    held.lift();
    expect(routed).toEqual(['push /tuner']);
    expect(page.device.get('chords')).toBe('true');
    expect(page.cues).toEqual([plain('choose')]);
    expect(Option.isNone(page.find('[data-testid="key-wheel"]'))).toBe(true);
  });

  it('R4: a hold let go in the middle does nothing, the dials as they were', () => {
    using page = onPage(chordsOn(), true);
    act(() => keyButton(page).click());
    expect(Option.isSome(page.find('[data-testid="dials"]'))).toBe(true);
    const before = { key: keyButton(page).getAttribute('aria-valuetext'), cues: page.cues.length };
    const held = hold();
    held.move(6, -8);
    held.lift();
    expect({
      routed: [...routed],
      chords: page.device.get('chords'),
      dials: Option.isSome(page.find('[data-testid="dials"]')),
      key: keyButton(page).getAttribute('aria-valuetext'),
      cues: page.cues.length,
    }).toEqual({ routed: [], chords: 'true', dials: true, ...before });
  });

  describe('a key step from the wheel or VoiceOver turns one semitone with the dials closed', () => {
    const steps = [
      { item: 'keyDown', key: 'C' },
      { item: 'keyUp', key: 'D' },
    ] as const;
    const doors = (open: boolean) => (open && (['wheel', 'VoiceOver'] as const)) || ['wheel'];
    for (const open of [true, false]) {
      for (const { item, key } of steps) {
        for (const door of doors(open)) {
          it(`${item} by the ${door}, the dials ${(open && 'open') || 'shut'} before`, () => {
            using page = onPage(chordsOn(), true);
            if (open) act(() => keyButton(page).click());
            expect(Option.isSome(page.find('[data-testid="dials"]'))).toBe(open);
            if (door === 'wheel') {
              const held = hold();
              held.move(...toSlot(item));
              held.lift();
            } else perform(keyButton(page), item);
            expect({
              key: keyButton(page).getAttribute('aria-valuetext'),
              dials: Option.isSome(page.find('[data-testid="dials"]')),
              expanded: keyButton(page).getAttribute('aria-expanded'),
              chords: page.device.get('chords'),
            }).toEqual({ key, dials: false, expanded: 'false', chords: 'true' });
          });
        }
      }
    }
    it('a hold let go in the middle keeps the dials shut (R4 keeps them open)', () => {
      using page = onPage(chordsOn(), true);
      const held = hold();
      held.move(4, -6);
      held.lift();
      expect({
        key: keyButton(page).getAttribute('aria-valuetext'),
        dials: Option.isSome(page.find('[data-testid="dials"]')),
      }).toEqual({ key: 'Db', dials: false });
    });
  });

  it('R5: a hold slid to Chords off turns chords off, as the old hold did', () => {
    using page = onPage(chordsOn(), true);
    const held = hold();
    held.move(...toSlot('chords'));
    held.lift();
    expect(page.device.get('chords')).toBe('false');
    expect(page.cues).toEqual([plain('choose'), plain('chords-off')]);
  });

  it('a hold with chords off turns them on and opens no wheel', () => {
    using page = onPage(new Map(), true);
    hold().lift();
    expect({
      chords: page.device.get('chords'),
      wheel: Option.isSome(page.find('[data-testid="key-wheel"]')),
    }).toEqual({ chords: 'true', wheel: false });
  });

  it('R6: with no ear there is no Tuner item and no tuner action', () => {
    using page = onPage(chordsOn(), false);
    expect(actionsOf(keyButton(page)).map((action) => action.name)).toEqual([
      'keyDown',
      'keyUp',
      'reset',
      'chords',
    ]);
    const held = hold();
    expect({
      wheel: Option.isSome(page.find('[data-testid="key-wheel"]')),
      tuner: Option.isSome(page.find('[data-testid="key-wheel-tuner"]')),
    }).toEqual({ wheel: true, tuner: false });
    held.lift();
  });

  it('R7: the open dials hold no Tuner chip, and Reset shows once moved', () => {
    using page = onPage(chordsOn(), true);
    act(() => keyButton(page).click());
    expect(Option.isNone(page.find('[data-testid="dials-tuner"]'))).toBe(true);
    perform(page.get('[role="slider"][aria-label="Capo"]'), 'increment');
    expect(Option.isSome(page.find('[data-testid="dials-reset"]'))).toBe(true);
    expect(Option.isNone(page.find('[data-testid="dials-tuner"]'))).toBe(true);
  });

  it('R8: VoiceOver opens the tuner and moves the key a semitone each way', () => {
    using page = onPage(chordsOn(), true);
    expect(actionsOf(keyButton(page))).toEqual([
      { name: 'tuner', label: 'Open tuner' },
      { name: 'keyDown', label: 'Key down' },
      { name: 'keyUp', label: 'Key up' },
      { name: 'reset', label: 'Reset key' },
      { name: 'chords', label: 'Turn chords off' },
    ]);
    perform(keyButton(page), 'keyUp');
    expect(keyButton(page).getAttribute('aria-valuetext')).toBe('D');
    perform(keyButton(page), 'keyDown');
    perform(keyButton(page), 'keyDown');
    expect(keyButton(page).getAttribute('aria-valuetext')).toBe('C');
    perform(keyButton(page), 'reset');
    expect(keyButton(page).getAttribute('aria-valuetext')).toBe('Db');
    perform(keyButton(page), 'tuner');
    expect(routed).toEqual(['push /tuner']);
  });

  it('R9: the item under the finger is on the button’s fill under its ink, the others on the panel', () => {
    const roles = ['button', 'onButton', 'panel', 'ink', 'edge'];
    const sheet = document.createElement('style');
    sheet.textContent = `:root { ${roles.map((role, k) => `--${role}: rgb(${k + 1}, 3, 4);`).join(' ')} }`;
    document.head.append(sheet);
    using _sheet = { [Symbol.dispose]: () => sheet.remove() };
    const role = (name: string) => `rgb(${roles.indexOf(name) + 1}, 3, 4)`;
    using page = onPage(chordsOn(), true);
    const held = hold();
    held.move(...toSlot('keyUp'));
    const drawn = (item: string) => {
      const pill = page.get(`[data-testid="key-wheel-${item}"]`);
      const word = Option.getOrThrow(
        Option.fromNullishOr(pill.querySelector('[dir="auto"]') ?? pill.lastElementChild),
      );
      return {
        fill: getComputedStyle(pill).backgroundColor,
        ink: getComputedStyle(word).color,
        edge: getComputedStyle(pill).borderTopColor,
      };
    };
    expect(drawn('keyUp')).toEqual({
      fill: role('button'),
      ink: role('onButton'),
      edge: role('button'),
    });
    for (const item of ['tuner', 'keyDown', 'reset', 'chords'])
      expect({ item, ...drawn(item) }).toEqual({
        item,
        fill: role('panel'),
        ink: role('ink'),
        edge: role('edge'),
      });
    held.lift();
    expect(page.device.get('move.100')).toBe('{"transpose":1,"capo":0}');
  });

  it('the Tuner’s mark is small and upright: at most 14 points tall, no wider than tall, nothing turned', () => {
    using page = onPage(chordsOn(), true);
    const held = hold();
    expect({
      wheel: Option.isSome(page.find('[data-testid="key-wheel"]')),
      tuner: Option.isSome(page.find('[data-testid="key-wheel-tuner"]')),
      key: keyButton(page).getAttribute('aria-valuetext'),
    }).toEqual({ wheel: true, tuner: true, key: 'Db' });
    const mark = page.get('[data-testid="key-wheel-tuner"] [data-testid="mark-tuner"]');
    const turned = [mark, ...mark.querySelectorAll('*')].filter((part) =>
      /rotate/.test(getComputedStyle(part).transform),
    );
    expect({
      small: px(mark, 'height') <= 14,
      upright: px(mark, 'width') <= px(mark, 'height'),
      turned: turned.length,
    }).toEqual({ small: true, upright: true, turned: 0 });
    held.lift();
  });
});
