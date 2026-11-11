/**
 * The full player's buttons draw in the button role (`button` and
 * `onButton`, `src/theme.ts`), not the number's accent: the web and
 * Android fill and its title, the iOS `UIButton`'s tint (drawn by
 * react-native-web as the fill it is given), and the spinner while a hymn
 * loads. Each role is told a colour of its own through the page's CSS
 * properties, so a reader of the wrong role draws the wrong colour.
 */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import { hymnAt } from '~/hymns/hymns';

import { AccentButton } from './AccentButton';
import { AccentButton as NativeButton } from './AccentButton.ios';
import { Player } from './player';
import { Toggle } from './Toggle';

const ROLES = ['button', 'onButton', 'accent', 'onAccent', 'pressed', 'onPressed'] as const;

/** The colour role `name` is drawn in here, distinct per role. */
const role = (name: (typeof ROLES)[number]) => `rgb(${ROLES.indexOf(name) + 1}, 7, 9)`;

/** `screen` drawn in a document whose roles are each a colour of their own; it unmounts when the `using` ends. */
const draw = (screen: ReactNode) => {
  const sheet = document.createElement('style');
  sheet.textContent = `:root { ${ROLES.map((name) => `--${name}: ${role(name)};`).join(' ')} }`;
  document.head.append(sheet);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(screen));
  return {
    host,
    [Symbol.dispose]: () => {
      act(() => root.unmount());
      host.remove();
      sheet.remove();
    },
  };
};

const colours = (element: Element) => {
  const drawn = getComputedStyle(element);
  return [drawn.backgroundColor, drawn.color, drawn.stroke, drawn.fill, drawn.borderTopColor];
};

const only = (host: Element, selector: string) =>
  Option.getOrThrow(Option.fromNullishOr(host.querySelector(selector)));

describe('the full player’s buttons', () => {
  it('on the web and Android: the fill in button, its title in onButton', () => {
    using drawn = draw(<AccentButton title="Play" label="Play hymn 100" onPress={() => {}} />);
    const button = only(drawn.host, '[role="button"]');
    const title = only(button, '[dir="auto"]');
    expect({
      fill: getComputedStyle(button).backgroundColor,
      title: getComputedStyle(title).color,
    }).toEqual({ fill: role('button'), title: role('onButton') });
  });

  it('on iOS: the UIButton tinted in button', () => {
    using drawn = draw(<NativeButton title="Play" label="Play hymn 100" onPress={() => {}} />);
    const button = only(drawn.host, '[role="button"]');
    expect(colours(button)).toContain(role('button'));
    expect(colours(button)).not.toContain(role('accent'));
  });

  it('while a hymn loads: the spinner in button', () => {
    const track = Option.getOrThrow(hymnAt('100'));
    using drawn = draw(<Toggle track={track} state={Player.Loading({ track })} send={() => {}} />);
    const spinner = only(drawn.host, '[aria-label="Loading hymn 100"]');
    const drawnIn = [spinner, ...spinner.querySelectorAll('*')].flatMap(colours);
    expect(drawnIn).toContain(role('button'));
    expect(drawnIn).not.toContain(role('accent'));
  });
});
