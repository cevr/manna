import { describe, expect, test } from 'bun:test';
import { bustCut, bustHidden, bustSkeleton } from './bust.ts';
import { CUT_AWAY, KEEP_REST } from './prompts.ts';
import { FAR, box } from './rules.ts';

describe('bustSkeleton', () => {
  test('leans from the foot below the pivot up to it, and turns the head on the pivot', () => {
    const rooted = bustSkeleton([120, 220], 298);
    expect(rooted.bones).toEqual([
      { name: 'lean', pivot: [120, 298], tip: [120, 220] },
      { name: 'head', parent: 'lean', pivot: [120, 220], tip: [120, 10] },
    ]);
    expect(rooted.root).toEqual([120, 298]);
  });

  test('lays the head part on the head bone and the torso on the lean', () => {
    expect(bustSkeleton([120, 220], 298).skin).toEqual({ head: ['head'], torso: ['lean'] });
  });
});

describe('bustCut', () => {
  const line = [
    [FAR, 230],
    [-1, 230],
  ] as const;

  test('cuts the head above the line, turning at the pivot, over the rest as the torso', () => {
    expect(bustCut({ line, pivot: [120, 220] }).parts).toEqual([
      { name: 'head', take: [{ polygon: [[-1, -1], [FAR, -1], ...line] }], pivot: [120, 220] },
      { name: 'torso', take: [box(-1, -1, FAR, FAR)] },
    ]);
  });

  test('puts a neighbour take first, so the head and torso take only what it leaves', () => {
    const neighbour = [box(-1, 210, 0, 235)];
    expect(bustCut({ line, pivot: [120, 220], neighbour }).parts.map(({ name }) => name)).toEqual([
      'neighbour',
      'head',
      'torso',
    ]);
    expect(bustCut({ line, pivot: [120, 220], neighbour }).parts[0]).toEqual({
      name: 'neighbour',
      take: neighbour,
    });
  });
});

describe('bustHidden', () => {
  const hidden = bustHidden(
    { head: 'his face and beard', behind: ': his neck.' },
    { 'heads-1': ' He faces the viewer.', 'heads-2': ' He is turned to the left.' },
  );

  test('moves only the head in every view, so no neighbour or torso is repainted under', () => {
    expect(Object.keys(hidden)).toEqual(['heads-1', 'heads-2']);
    expect(hidden['heads-1'].moving).toEqual(['head']);
    expect(hidden['heads-2'].moving).toEqual(['head']);
  });

  test("frames the member's words and each view's turn in the shared prompt", () => {
    expect(hidden['heads-2'].prompt).toBe(
      `${CUT_AWAY} his head (his face and beard) was cut away to make a cut-out puppet. He is turned to the left. Repaint ONLY the magenta area, as what lies behind his head: his neck. ${KEEP_REST}`,
    );
  });
});
