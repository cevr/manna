/**
 * The brand's roles are what their doc comments say they are: each tint is
 * its colour mixed toward white or toward the other colour by the share it
 * names, and the accent reads at WCAG AA on each light ground it names.
 */
import { describe, expect, test } from 'bun:test';

import { PALETTE } from './palette';

const rgb = (hex: string) => [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));

/** `a` mixed `t` of the way toward `b`, per sRGB channel, rounded. */
const mix = (a: string, b: string, t: number) => {
  const to = rgb(b);
  return `#${rgb(a)
    .map((v, i) => Math.round(v + ((to[i] ?? 0) - v) * t))
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`;
};

const linear = (channel: number) => {
  const c = channel / 255;
  if (c <= 0.04045) return c / 12.92;
  return ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => {
  const [r = 0, g = 0, b = 0] = rgb(hex).map(linear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

describe('Moonlit wheat', () => {
  test('the wheat is #ffefae and the night #12354e, the day’s ink and the night’s page', () => {
    expect([
      PALETTE.wheat,
      PALETTE.night,
      PALETTE.ink,
      PALETTE.nightInk,
      PALETTE.nightAccent,
    ]).toEqual(['#ffefae', '#12354e', '#12354e', '#ffefae', '#ffefae']);
  });

  test('each tint is its colour mixed by the share its comment names', () => {
    const white = '#ffffff';
    expect({
      paper: mix(PALETTE.wheat, white, 0.62),
      band: mix(PALETTE.wheat, white, 0.25),
      soft: mix(PALETTE.night, white, 0.25),
      nightSoft: mix(PALETTE.wheat, PALETTE.night, 0.3),
      nightRule: mix(PALETTE.night, PALETTE.wheat, 0.22),
    }).toEqual({
      paper: PALETTE.paper,
      band: PALETTE.band,
      soft: PALETTE.soft,
      nightSoft: PALETTE.nightSoft,
      nightRule: PALETTE.nightRule,
    });
  });

  test('the accent reads at 4.5:1 on the paper, the bands and the wheat', () => {
    const under = [PALETTE.paper, PALETTE.band, PALETTE.wheat].filter(
      (ground) => contrast(PALETTE.accent, ground) < 4.5,
    );
    expect(under).toEqual([]);
  });
});
