/**
 * Settings' Downloads, mounted in a browser's document (`src/test/setup.ts`)
 * with each role it may draw in set to a colour of its own, so a computed
 * colour names the role it came from: the one destructive action, Delete
 * downloads, and its confirm draw in the alert; Keep downloads and Download
 * all recordings in the accent.
 */

import { describe, expect, it } from 'bun:test';
import { RegistryProvider } from '@effect/atom-react';
import { Option } from 'effect';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { Downloads } from './Downloads';

const ROLES = ['ink', 'muted', 'accent', 'alert', 'line', 'soft'] as const;
type Role = (typeof ROLES)[number];
const role = (name: Role) => `rgb(${ROLES.indexOf(name) + 1}, 1, 2)`;

/** Downloads mounted under the role sheet; disposed, both go. */
const mounted = () => {
  const sheet = document.createElement('style');
  sheet.textContent = `:root { ${ROLES.map((name) => `--${name}: ${role(name)};`).join(' ')} }`;
  document.head.append(sheet);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <RegistryProvider>
        <Downloads />
      </RegistryProvider>,
    ),
  );
  /** The label of the button named `name`. */
  const label = (name: string) =>
    Option.getOrThrow(
      Option.fromNullishOr(host.querySelector<HTMLElement>(`[aria-label="${name}"] > *`)),
    );
  return {
    label,
    colourOf: (name: string) => getComputedStyle(label(name)).color,
    press: (name: string) =>
      act(() =>
        Option.getOrThrow(
          Option.fromNullishOr(host.querySelector<HTMLElement>(`[aria-label="${name}"]`)),
        ).click(),
      ),
    [Symbol.dispose]: () => {
      act(() => root.unmount());
      host.remove();
      sheet.remove();
    },
  };
};

describe('the Downloads section’s colours', () => {
  it('draws Delete downloads and its confirm in the alert, and Keep downloads in the accent', () => {
    using downloads = mounted();
    downloads.press('Delete downloads');
    expect({
      testID: downloads.label('Delete downloads').dataset['testid'],
      delete: downloads.colourOf('Delete downloads'),
      confirm: downloads.colourOf('Confirm delete downloads'),
      keep: downloads.colourOf('Keep downloads'),
      download: downloads.colourOf('Download all recordings'),
    }).toEqual({
      testID: 'downloads-delete',
      delete: role('alert'),
      confirm: role('alert'),
      keep: role('accent'),
      download: role('accent'),
    });
  });
});
