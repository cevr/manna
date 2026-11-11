/* oxlint-disable effect/noNullish, effect/noTernary -- the frozen plain DOM oracle retains absent-node sentinels and branches. */

import { theme } from '../theme';
import { computed, systemScheme } from './look';

const text = (node: Element | null | undefined) =>
  (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
const hidden = (node: Element) => node.closest('[aria-hidden="true"]') !== null;

const seen = (node: Element) => {
  for (let at: Element | null = node; at !== null; at = at.parentElement) {
    const style = getComputedStyle(at);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')
      return false;
  }
  return !/rgba\(.*, 0(\.0+)?\)$|transparent/.test(getComputedStyle(node).color);
};

const channels = (css: string) => {
  const values = (css.match(/[\d.]+/g) ?? []).map(Number);
  const [r = 0, g = 0, b = 0, a = values.length >= 3 ? 1 : 0] = values;
  return { rgb: [r, g, b], a };
};
const luminance = (rgb: readonly number[]) => {
  const [r = 0, g = 0, b = 0] = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrastModel = (node: Element) => {
  let ground: Element | null = node;
  while (ground !== null && channels(getComputedStyle(ground).backgroundColor).a < 1)
    ground = ground.parentElement;
  if (ground === null) return 0;
  const ink = luminance(channels(getComputedStyle(node).color).rgb);
  const fill = luminance(channels(getComputedStyle(ground).backgroundColor).rgb);
  return (Math.max(ink, fill) + 0.05) / (Math.min(ink, fill) + 0.05);
};

const iconOf = (image: Element | null | undefined) => {
  const found = /\/assets\/home\/([a-z]+)-(light|dark)\.png$/u.exec(
    image?.getAttribute('src') ?? '',
  );
  if (found === null) return '<no home icon>';
  return found[2] === systemScheme() ? (found[1] ?? '') : `<${found[1]} of the ${found[2]} set>`;
};
const oneIcon = (node: Element) => {
  const images = node.querySelectorAll('img');
  const image = images[0];
  if (images.length !== 1 || image === undefined) return `<${images.length} images>`;
  return hidden(image) ? iconOf(image) : '<an exposed icon>';
};
const counted = (host: Element, id: string) => {
  const nodes = host.querySelectorAll(`[data-testid="${id}"]`);
  const node = nodes[0];
  if (nodes.length !== 1 || node === undefined) return `<${nodes.length} ${id}>`;
  const exposed = !hidden(node) && (node.getAttribute('aria-label') ?? text(node)) === text(node);
  return seen(node) && exposed ? text(node) : `<${id} not seen as exposed>`;
};
const drawingOf = (plant: Element) => {
  const soils = plant.querySelectorAll('[data-testid="plant-soil"]');
  const images = plant.querySelectorAll('img');
  const soil = soils[0];
  if (soils.length === 0) return oneIcon(plant);
  if (soils.length !== 1 || soil === undefined || images.length > 0)
    return '<not one hidden drawing>';
  const filled = getComputedStyle(soil).backgroundColor === computed(theme[systemScheme()].soil);
  return hidden(soil) && filled ? 'soil' : '<soil not hidden and filled soil>';
};
const plantRead = (plant: Element) => {
  const label = plant.getAttribute('aria-label') ?? '<no name>';
  return {
    label:
      plant.getAttribute('role') === 'button' && !hidden(plant)
        ? label.endsWith(', ready today')
          ? label.slice(0, -', ready today'.length)
          : label
        : '<not one exposed button>',
    drawn: drawingOf(plant),
    shown: [...plant.querySelectorAll('*')]
      .filter((node) => node.children.length === 0 && seen(node))
      .map(text)
      .join(''),
  };
};
const ALLOWED = ['row-title', 'field-plant', 'sown', 'harvest', 'caption', 'today-card', 'chosen']
  .map((id) => `[data-testid="${id}"]`)
  .join(',');

/** The plain field read, independent of optimized read plumbing. */
export const fieldReadModel = (host: Element) => {
  const rows = [...host.querySelectorAll('[data-testid="row"]')].map((row) => {
    const titles = row.querySelectorAll('[data-testid="row-title"]');
    const title = titles[0];
    const icons = row.querySelectorAll('[data-testid="furrow-icon"]');
    const icon = icons[0];
    return {
      title:
        titles.length === 1 && title !== undefined && seen(title) && !hidden(title)
          ? text(title)
          : '<title not one seen and exposed>',
      icon: icons.length === 1 && icon !== undefined ? oneIcon(icon) : `<${icons.length} icons>`,
      plants: [...row.querySelectorAll('[data-testid="field-plant"]')].map(plantRead),
    };
  });
  const strays = [...host.querySelectorAll('*')].filter(
    (node) =>
      (node.children.length === 0 &&
        /\d/.test(text(node)) &&
        text(node) !== 'Mark 4:28' &&
        node.closest(ALLOWED) === null) ||
      ((node.tagName === 'IMG' || node.getAttribute('role') === 'img') &&
        node.closest('[data-testid="field-plant"]') === null &&
        !hidden(node)),
  ).length;
  const faint = [...host.querySelectorAll('*')]
    .filter((node) => node.children.length === 0 && text(node) !== '' && seen(node))
    .filter((node) => contrastModel(node) < 4.5)
    .map((node) => node.closest('[data-testid]')?.getAttribute('data-testid') ?? 'text');
  return {
    sown: counted(host, 'sown'),
    harvest: counted(host, 'harvest'),
    rows,
    strays,
    faint: [...new Set(faint)],
  };
};

/** The plain readout minima, including Infinity for an empty visible set. */
export const readoutsModel = (host: Element) => {
  const lowest = (id: string) =>
    Math.min(
      ...[...host.querySelectorAll(`[data-testid="${id}"], [data-testid="${id}"] *`)]
        .filter((node) => node.children.length === 0 && text(node) !== '' && seen(node))
        .map(contrastModel),
    );
  return {
    sown: lowest('sown'),
    harvest: lowest('harvest'),
    titles: lowest('row-title'),
    numbers: lowest('field-plant'),
    captions: lowest('caption'),
    card: Math.min(lowest('today-card'), lowest('chosen')),
    ends: lowest('end-row'),
  };
};
