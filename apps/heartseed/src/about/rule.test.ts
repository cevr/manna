/**
 * The licences' clause of the root's rule (`licenceFaults`,
 * `src/test/root-rule.ts`), on frames built by hand: About holds one
 * `Licences` row and no licence text; `Licences` holds the credits and the
 * licence once each and one `About` back outside its scroll view; any
 * other screen holds none of them, so no row lands on the licences
 * straight.
 */

import { describe, expect, it } from 'bun:test';

import { licenceFaults } from '../test/root-rule';

/** A button named `label`. */
const button = (label: string) => {
  const node = document.createElement('div');
  node.setAttribute('role', 'button');
  node.setAttribute('aria-label', label);
  return node;
};

/** A node of test id `id`. */
const tagged = (id: string) => {
  const node = document.createElement('div');
  node.setAttribute('data-testid', id);
  return node;
};

/** The faults of a frame headed `on`, `scrolled` in a scroll view above `fixed`, sorted. */
const faultsOf = (on: string, scrolled: readonly Element[], fixed: readonly Element[]) => {
  const host = document.createElement('div');
  const scroll = document.createElement('div');
  scroll.setAttribute('style', 'overflow-y: auto');
  scroll.append(...scrolled);
  host.append(scroll, ...fixed);
  document.body.append(host);
  const controls = [...host.querySelectorAll('[role="button"]')];
  const faults = licenceFaults(on, host, controls).toSorted();
  host.remove();
  return faults;
};

const LICENCES = () => [tagged('about-credits'), tagged('about-licence')];

describe('the licences’ clause', () => {
  it('passes About with its one row, the licences with their back, and home with neither', () => {
    expect([
      faultsOf('About', [], [button('Your field'), button('Licences')]),
      faultsOf('Licences', LICENCES(), [button('About')]),
      faultsOf('Your field', [button('Settings')], []),
    ]).toEqual([[], [], []]);
  });

  it('names one fault for each clause a frame breaks', () => {
    expect([
      faultsOf('About', LICENCES(), [button('Your field')]),
      faultsOf('Heartseed', [tagged('about-licence')], [button('Licences')]),
      faultsOf('Licences', [tagged('about-licence'), button('About')], []),
      faultsOf('Your field', [], [button('About')]),
      faultsOf('About', [], [button('Licences'), button('Licences')]),
    ]).toEqual([
      ['0 Licences on About', 'about-credits on About', 'about-licence on About'],
      ['Licences on Heartseed', 'about-licence on Heartseed'],
      ['0 about-credits on Licences', 'the About back inside a scroll view'],
      ['the About back on Your field'],
      ['2 Licences on About'],
    ]);
  });
});
