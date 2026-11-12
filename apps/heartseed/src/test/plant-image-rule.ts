/* oxlint-disable effect/noNullish -- the drawing rule reads DOM attributes, computed styles and ancestors, whose absence is null. */

/**
 * The plant drawing rule the stage and first-minute rigs hold their frames
 * to: a planted stage is drawn as exactly one hand-drawn image of the home
 * set (`assets/home/<name>-<scheme>.png`), known by the image's own source,
 * never by a test id or a label. Every rendered image is read, so a plant's
 * asset drawn anonymously, with its ids and stage line stripped, is still
 * seen. The names are written out here apart from the product's mapping.
 */

import { END } from './root-rule';

/** The image each planted stage is drawn with, written out apart from the product's mapping: full corn is drawn as `corn`. */
export const STAGE_IMAGE: ReadonlyMap<string, string> = new Map([
  ['Stage: seed', 'seed'],
  ['Stage: blade', 'blade'],
  ['Stage: ear', 'ear'],
  ['Stage: full corn', 'corn'],
]);

/** The home set's names a plant is drawn with. */
const PLANT_NAMES = new Set(['seed', 'blade', 'ear', 'corn']);

const CONTROLS =
  'button,input,a[href],[role="button"],[role="radio"],[role="checkbox"],[role="link"],[role="switch"]';

/** An image's home-set asset as `assets/home/<name>-<scheme>.png`, read from its source alone; null for any other source. */
export const assetOf = (image: Element): string | null => {
  const found = /assets\/home\/([a-z]+)-(light|dark)\.png$/u.exec(image.getAttribute('src') ?? '');
  if (found === null) return null;
  return `assets/home/${found[1]}-${found[2]}.png`;
};

/** Whether an asset is one of a plant's four drawings. */
export const isPlantAsset = (asset: string | null) =>
  asset !== null && PLANT_NAMES.has(/assets\/home\/([a-z]+)-/u.exec(asset)?.[1] ?? '');

/** Every plant asset any image under `top` draws, in document order, its ids and labels ignored. */
export const plantAssetsIn = (top: Element | null | undefined): string[] =>
  [...(top?.querySelectorAll('img') ?? [])].map(assetOf).filter(isPlantAsset) as string[];

/** Whether a frame belongs to a screen that draws its own plants: home (`Your field`) or the end of a run. */
export const ownsImages = (top: Element) =>
  [...top.querySelectorAll('[role="heading"]')].some((node) => {
    const heading = (node.textContent ?? '').trim();
    return heading === 'Your field' || heading === END;
  });

/** Transforms that move and scale nothing: none, and the scroll view's own `translateZ(0)` layer. */
const STILL = /^(?:|none|translateZ\(0(?:px)?\))$/u;

/** What makes a node of a drawing move or grow: an animation, a transform or a hidden wait, inline or computed. */
const motionOf = (node: Element) => {
  const inline = (node as HTMLElement).style;
  const transform = getComputedStyle(node).transform;
  if ((inline?.animationName ?? '') !== '') return `animated ${inline.animationName}`;
  if (!STILL.test(inline?.transform ?? '')) return `transformed ${inline.transform}`;
  if (!STILL.test(transform)) return `transformed ${transform}`;
  if ((inline?.visibility ?? '') === 'hidden') return 'hidden to enter';
  return null;
};

/** A frame owed no plant: each plant wrapper and each plant asset drawn is a fault. */
const unowedFaults = (top: Element, plants: number) => {
  const out = plantAssetsIn(top).map((asset) => `the image ${asset} where none is owed`);
  if (plants > 0) out.unshift(`${plants} plants where none is owed`);
  return out;
};

/** The plant wrapper's own faults: exposed, not exactly one image, a plant asset outside it, text or a control in it. */
const wrapperFaults = (top: Element, plant: Element) => {
  const out: string[] = [];
  if (plant.getAttribute('aria-hidden') !== 'true') out.push('the plant exposed');
  const images = plant.querySelectorAll('img').length;
  if (images !== 1) out.push(`${images} images in the plant`);
  if (plantAssetsIn(top).length !== plantAssetsIn(plant).length)
    out.push('a plant image outside its plant');
  if ((plant.textContent ?? '').trim() !== '') out.push('text in the plant');
  if (plant.matches(CONTROLS) || plant.querySelector(CONTROLS) !== null)
    out.push('a control in the plant');
  return out;
};

/** One image of the plant's faults: not the owed asset, not hidden itself, its box not `size` square, or it or an ancestor up to `top` moving. */
const imageFaults = (
  top: Element,
  plant: Element,
  image: Element,
  want: { readonly asset: string; readonly size: number },
) => {
  const out: string[] = [];
  const asset = assetOf(image) ?? image.getAttribute('src');
  if (asset !== want.asset) out.push(`the image ${asset}, not ${want.asset}`);
  const box = image.parentElement ?? image;
  if (box.closest('[aria-hidden="true"]') === plant) out.push('the image exposed inside its plant');
  const { width, height } = getComputedStyle(box);
  if (width !== `${want.size}px` || height !== `${want.size}px`)
    out.push(`the image ${width}×${height}, not ${want.size}px`);
  for (let node: Element | null = image; node !== null && node !== top; node = node.parentElement) {
    const moved = motionOf(node);
    if (moved !== null)
      out.push(`a drawing ${moved}: ${node.getAttribute('data-testid') ?? node.tagName}`);
  }
  return out;
};

/** The four stages' drawings in the order the welcome and how a verse grows draw them, written apart from the product: seed, blade, ear, full corn as `corn`. */
const FOUR = ['seed', 'blade', 'ear', 'corn'];

/** What each screen before the first verse owes: the welcome its growing seed, four drawings 112 pt in one hidden place; how a verse grows its four stills, 40 pt. */
const INTRO = {
  welcome: { size: 112, place: true },
  grows: { size: 40, place: false },
} as const;

/**
 * What a screen before the first verse (`welcome` or `grows`) draws wrong
 * in `scheme`: its plant assets, read from every image, not exactly the
 * four stages' drawings of the scheme in order; any `plant` wrapper; an
 * image not hidden from the screen reader or not its size square; on the
 * welcome, an image outside its one hidden `growing` place, or text or a
 * control in that place; and on either, a drawing that is animated,
 * transformed or hidden to enter (the growing seed changes opacity alone).
 */
export const introFaults = (
  top: Element,
  screen: keyof typeof INTRO,
  scheme: 'light' | 'dark',
): string[] => {
  const owed = INTRO[screen];
  const want = FOUR.map((name) => `assets/home/${name}-${scheme}.png`);
  const images = [...top.querySelectorAll('img')].filter((image) => isPlantAsset(assetOf(image)));
  const got = images.map(assetOf);
  const out: string[] = [];
  if (got.join() !== want.join()) out.push(`the ${screen} draws ${got.join('|') || 'nothing'}`);
  const plants = top.querySelectorAll('[data-testid="plant"]').length;
  if (plants > 0) out.push(`${plants} plants on the ${screen}`);
  for (const image of images) out.push(...introImageFaults(top, image, screen, owed.size));
  if (!owed.place) return out;
  return [...out, ...growingPlaceFaults(top, images)];
};

/** One drawing of a screen before the first verse: exposed, not `size` square, or moved on its way up to `top`. */
const introImageFaults = (top: Element, image: Element, screen: string, size: number) => {
  const out: string[] = [];
  if (image.closest('[aria-hidden="true"]') === null)
    out.push(`an exposed drawing on the ${screen}`);
  const { width, height } = getComputedStyle(image.parentElement ?? image);
  if (width !== `${size}px` || height !== `${size}px`)
    out.push(`a drawing ${width}×${height} on the ${screen}, not ${size}px`);
  for (let node: Element | null = image; node !== null && node !== top; node = node.parentElement) {
    const moved = motionOf(node);
    if (moved !== null) out.push(`a drawing ${moved} on the ${screen}`);
  }
  return out;
};

/** The welcome's growing place: exactly one, hidden, holding every drawing and no text or control. */
const growingPlaceFaults = (top: Element, images: readonly Element[]) => {
  const out: string[] = [];
  const places = [...top.querySelectorAll('[data-testid="growing"]')];
  const place = places[0];
  if (places.length !== 1 || place === undefined)
    return [...out, `${places.length} growing places`];
  if (place.getAttribute('aria-hidden') !== 'true') out.push('the growing place exposed');
  if (images.some((image) => !place.contains(image)))
    out.push('a drawing outside the growing place');
  if ((place.textContent ?? '').trim() !== '') out.push('text in the growing place');
  if (place.matches(CONTROLS) || place.querySelector(CONTROLS) !== null)
    out.push('a control in the growing place');
  return out;
};

/**
 * What `top` draws wrong against the one plant it owes: `want` an asset
 * and its size in points, or null for none. Owed none, any plant asset or
 * plant wrapper is a fault. Owed one, there is exactly one hidden `plant`
 * wrapper holding exactly one hidden image of exactly that asset, no plant
 * asset outside it, its image's box `size` square, no text and no control
 * in it, and nothing from the image up to `top` animated, transformed or
 * hidden to enter.
 */
export const plantFaults = (
  top: Element,
  want: { readonly asset: string; readonly size: number } | null,
): string[] => {
  const plants = [...top.querySelectorAll('[data-testid="plant"]')];
  if (want === null) return unowedFaults(top, plants.length);
  const plant = plants[0];
  const out: string[] = [];
  if (plants.length !== 1) out.push(`${plants.length} plants`);
  if (plant === undefined) return out;
  return [
    ...out,
    ...wrapperFaults(top, plant),
    ...[...plant.querySelectorAll('img')].flatMap((image) => imageFaults(top, plant, image, want)),
  ];
};
