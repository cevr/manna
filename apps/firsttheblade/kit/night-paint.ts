import { PALETTE } from '../src/palette.ts';
import type { Pixels } from './field-paint.ts';

export const SKY_DEPTH = 0.3;
export const SKY_WIDTH = 0.7;
export const HUE_HELD = 40;
export const HUE_REACH = 70;
export const FIELD_FROM = 0.7;
export const FIELD_FEATHER = 0.08;

export const QUALITY = 86;

interface Lab {
  readonly L: number;
  readonly a: number;
  readonly b: number;
}

const linear = (c: number) => {
  if (c <= 0.04045) return c / 12.92;
  return ((c + 0.055) / 1.055) ** 2.4;
};

const encoded = (c: number) => {
  if (c <= 0.0031308) return 12.92 * c;
  return 1.055 * c ** (1 / 2.4) - 0.055;
};

export const oklab = (r8: number, g8: number, b8: number): Lab => {
  const [r, g, b] = [linear(r8 / 255), linear(g8 / 255), linear(b8 / 255)];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
};

export const srgb = ({ L, a, b }: Lab): readonly [number, number, number] => {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const byte = (c: number) => Math.round(Math.min(1, Math.max(0, encoded(c))) * 255);
  return [
    byte(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    byte(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    byte(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
};

export const hueOf = ({ a, b }: Lab) => ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;

export const turnBetween = (from: number, to: number) => ((to - from + 540) % 360) - 180;

export const NIGHT_HUE = hueOf(
  oklab(
    parseInt(PALETTE.night.slice(1, 3), 16),
    parseInt(PALETTE.night.slice(3, 5), 16),
    parseInt(PALETTE.night.slice(5, 7), 16),
  ),
);

export const skyHue = (image: Pixels) => {
  const rows = Math.round(image.height * SKY_DEPTH);
  const columns = Math.round(image.width * SKY_WIDTH);
  let a = 0;
  let b = 0;
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < columns; x++) {
      const at = (y * image.width + x) * 4;
      const lab = oklab(image.data[at] ?? 0, image.data[at + 1] ?? 0, image.data[at + 2] ?? 0);
      a += lab.a;
      b += lab.b;
    }
  return hueOf({ L: 0, a, b });
};

const share = (hue: number, sky: number, row: number) => {
  const apart = Math.abs(turnBetween(hue, sky));
  const byHue = Math.min(1, Math.max(0, (HUE_REACH - apart) / (HUE_REACH - HUE_HELD)));
  const byRow = Math.min(1, Math.max(0, (FIELD_FROM - row) / FIELD_FEATHER));
  return byHue * byRow;
};

export const withNightSky = (image: Pixels): Pixels => {
  const sky = skyHue(image);
  const turn = (turnBetween(sky, NIGHT_HUE) * Math.PI) / 180;
  const data = new Uint8ClampedArray(image.data);
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++) {
      const at = (y * image.width + x) * 4;
      const lab = oklab(data[at] ?? 0, data[at + 1] ?? 0, data[at + 2] ?? 0);
      const angle = turn * share(hueOf(lab), sky, y / image.height);
      if (angle === 0) continue;
      const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
      data.set(srgb({ L: lab.L, a: lab.a * cos - lab.b * sin, b: lab.a * sin + lab.b * cos }), at);
    }
  return { width: image.width, height: image.height, data };
};
