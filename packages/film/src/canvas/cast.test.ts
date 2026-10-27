import { describe, expect, test } from 'bun:test';
import { type CastProp, type CastView, castDrawOrder } from './cast.ts';
import type { RivePropSpec } from './rive.ts';

const rig = (key: string): RivePropSpec => ({
  source: { riv: '/figures.riv', artboard: key, timelines: [] },
  engine: 'canvas',
  key,
  origin: [0, 0],
});

const prop = (name: string, layer?: CastProp['layer']): CastProp =>
  layer === undefined ? { name, draw: () => {} } : { name, draw: () => {}, layer };

/** A drawing's name: its prop's, the figure's rig's, or the rig drawn with it. */
const named = (view: CastView) =>
  castDrawOrder(view).map((d) =>
    d.kind === 'prop' ? d.prop.name : d.kind === 'figure' ? view.rig.key : d.with.rig.key,
  );

describe('a cast view', () => {
  test('draws a held prop over its figure and under the hands drawn with it', () => {
    const view: CastView = {
      box: [0, 0, 10, 10],
      at: [5, 10],
      rig: rig('lead'),
      pose: { timelines: [] },
      with: [
        { rig: rig('handNear'), pose: { timelines: [] }, at: [0, 0] },
        { rig: rig('handFar'), pose: { timelines: [] }, at: [0, 0] },
      ],
      props: [prop('cup'), prop('bottle', 'held'), prop('stool', 'behind')],
    };
    expect(named(view)).toEqual(['stool', 'lead', 'bottle', 'handNear', 'handFar', 'cup']);
  });
});
