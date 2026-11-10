import { describe, expect, it } from 'bun:test';

import { motionFaults } from '../test/motion-rule';

const picture = () => document.createElement('img');

const drawing = (style = 'animation-name: spring') => {
  const node = document.createElement('div');
  node.setAttribute('data-testid', 'drawing');
  node.setAttribute('aria-hidden', 'true');
  node.setAttribute('style', style);
  node.append(picture());
  return node;
};

interface Cell {
  readonly name: string;
  readonly change: (node: HTMLElement) => void;
  readonly faults: readonly string[];
}

const CELLS: readonly Cell[] = [
  {
    name: 'an entering drawing exposed',
    change: (node) => node.removeAttribute('aria-hidden'),
    faults: ['a moving node exposed: drawing'],
  },
  {
    name: 'a title under the entrance',
    change: (node) => node.append('Your field'),
    faults: ['a moving node holding text: drawing'],
  },
  {
    name: 'Remove under the entrance',
    change: (node) => {
      const control = document.createElement('div');
      control.setAttribute('role', 'button');
      control.setAttribute('aria-label', 'Remove');
      node.append(control);
    },
    faults: ['a moving node that is or holds a control: drawing'],
  },
  {
    name: 'a plant button entering itself',
    change: (node) => node.setAttribute('role', 'button'),
    faults: ['a moving node that is or holds a control: drawing'],
  },
  {
    name: 'soil with no image',
    change: (node) => node.replaceChildren(document.createElement('div')),
    faults: ['a moving node without its one image: drawing'],
  },
  {
    name: 'a sway holding two images',
    change: (node) => {
      node.setAttribute('style', 'transform: rotate(3deg)');
      node.append(picture());
    },
    faults: ['a moving node without its one image: drawing'],
  },
  {
    name: 'a transform alone counts as moving',
    change: (node) => {
      node.setAttribute('style', 'transform: rotate(0deg)');
      node.removeAttribute('aria-hidden');
    },
    faults: ['a moving node exposed: drawing'],
  },
  {
    name: 'hidden visibility alone counts as moving',
    change: (node) => {
      node.setAttribute('style', 'visibility: hidden');
      node.removeAttribute('aria-hidden');
    },
    faults: ['a moving node exposed: drawing'],
  },
];

describe('only drawings move in a frame', () => {
  it('accepts a home row and an end with still text and controls beside hidden drawings', () => {
    const home = document.createElement('div');
    const end = document.createElement('div');
    for (const host of [home, end]) {
      const control = document.createElement('button');
      control.textContent = 'Your field';
      control.setAttribute('style', 'opacity: 1; visibility: visible');
      const hidden = document.createElement('div');
      hidden.setAttribute('aria-hidden', 'true');
      const spring = drawing();
      spring.removeAttribute('aria-hidden');
      const sway = drawing('transform: rotate(0deg)');
      spring.replaceChildren(sway);
      hidden.append(spring);
      host.append(control, hidden);
      expect(motionFaults(host)).toEqual([]);
    }
  });

  it('names each cell of the motion table with exactly its faults', () => {
    expect(CELLS.length).toBe(8);
    for (const cell of CELLS) {
      const host = document.createElement('div');
      const node = drawing();
      cell.change(node);
      host.append(node);
      expect({ cell: cell.name, faults: motionFaults(host) }).toEqual({
        cell: cell.name,
        faults: [...cell.faults],
      });
    }
  });

  it('recognizes each native and ARIA control, on the moving node or below it', () => {
    const controls = [
      '<button></button>',
      '<input type="radio">',
      '<input type="checkbox">',
      '<a href="/"> </a>',
      ...['button', 'radio', 'checkbox', 'link'].map((role) => `<div role="${role}"></div>`),
    ];
    let cells = 0;
    for (const markup of controls) {
      for (const self of [true, false]) {
        const host = document.createElement('div');
        host.innerHTML = markup;
        const control = host.firstElementChild;
        expect(control).not.toBeNull();
        if (!control) continue;
        if (self) {
          control.setAttribute('aria-hidden', 'true');
          control.setAttribute('style', 'transform: rotate(0deg)');
          control.setAttribute('data-testid', 'drawing');
          control.append(picture());
        } else {
          const node = drawing();
          node.append(control);
          host.append(node);
        }
        expect(motionFaults(host)).toEqual(['a moving node that is or holds a control: drawing']);
        cells++;
      }
    }
    expect(cells).toBe(16);
  });

  it('keeps all four faults and uses the tag when there is no test id', () => {
    const host = document.createElement('div');
    const node = document.createElement('button');
    node.setAttribute('style', 'animation-name: spring');
    node.textContent = 'Remove';
    host.append(node);
    expect(motionFaults(host)).toEqual([
      'a moving node exposed: BUTTON',
      'a moving node holding text: BUTTON',
      'a moving node that is or holds a control: BUTTON',
      'a moving node without its one image: BUTTON',
    ]);
  });

  it('the preload prefers reduced motion', () => {
    expect(matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(true);
  });
});
